package com.inkframe.studio.nativeink

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.os.SystemClock
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View

/**
 * Production native artist canvas using Android's hardware-accelerated View/HWUI pipeline.
 *
 * This is the physically accepted renderer path from the native laboratory. The high-frequency
 * sample stream remains entirely Kotlin/Android and requests unbuffered stylus dispatch.
 */
class NativeArtistCanvasView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    data class State(
        val rendererLabel: String,
        val strokeCount: Int,
        val sampleCount: Int,
        val canUndo: Boolean,
        val canRedo: Boolean,
        val brushSizePx: Float,
        val inkColor: Int,
        val paperColor: Int,
    )

    private val document = NativeCanvasDocument()
    private val painter = NativeStrokePainter()
    private val activeSamples = ArrayList<InkSample>()
    private var activePointerId: Int? = null
    private var activeStyle = NativeBrushStyle(DEFAULT_INK_COLOR, dp(DEFAULT_BRUSH_DP))
    private var activeEraser = false
    private var hoverSample: InkSample? = null

    private val hoverPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(1.5f)
        color = HOVER_COLOR
    }

    var stateListener: ((State) -> Unit)? = null

    var inkColor: Int = DEFAULT_INK_COLOR
        private set
    var paperColor: Int = DEFAULT_PAPER_COLOR
        private set
    var brushSizePx: Float = dp(DEFAULT_BRUSH_DP)
        private set

    init {
        setBackgroundColor(paperColor)
        isFocusable = true
        isFocusableInTouchMode = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = "InkFrame Native Canvas Beta"
    }

    fun setInkColor(color: Int) {
        inkColor = color
        dispatchState()
    }

    fun setPaperColor(color: Int) {
        if (paperColor == color) return
        cancelActiveInput()
        paperColor = color
        setBackgroundColor(color)
        postInvalidateOnAnimation()
        dispatchState()
    }

    fun setBrushSizePx(sizePx: Float) {
        brushSizePx = sizePx.coerceIn(dp(1f), dp(96f))
        dispatchState()
    }

    fun undo(): Boolean {
        cancelActiveInput()
        val changed = document.undo()
        if (changed) postInvalidateOnAnimation()
        dispatchState()
        return changed
    }

    fun redo(): Boolean {
        cancelActiveInput()
        val changed = document.redo()
        if (changed) postInvalidateOnAnimation()
        dispatchState()
        return changed
    }

    fun clearCanvas() {
        cancelActiveInput()
        document.clear()
        hoverSample = null
        postInvalidateOnAnimation()
        dispatchState()
    }

    fun cancelActiveInput() {
        if (activePointerId == null && activeSamples.isEmpty()) return
        activePointerId = null
        activeSamples.clear()
        parent?.requestDisallowInterceptTouchEvent(false)
        postInvalidateOnAnimation()
        dispatchState()
    }

    fun snapshotState(): State = buildState()

    fun renderBitmap(): Bitmap {
        val bitmapWidth = width.coerceAtLeast(1)
        val bitmapHeight = height.coerceAtLeast(1)
        return Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888).also { bitmap ->
            val canvas = Canvas(bitmap)
            canvas.drawColor(paperColor)
            document.snapshot().strokes.forEach { stroke ->
                painter.drawStroke(canvas, stroke, paperColor)
            }
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_CANCEL) {
            cancelActiveInput()
            return true
        }

        val stylusIndex = findStylusPointerIndex(event)
        if (stylusIndex == null) {
            // Finger contacts are consumed as palm input and never create ink.
            return true
        }

        val pointerId = event.getPointerId(stylusIndex)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN,
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (event.actionIndex == stylusIndex || activePointerId == null) {
                    beginStroke(event, stylusIndex, pointerId)
                }
            }

            MotionEvent.ACTION_MOVE -> {
                if (activePointerId == pointerId) {
                    appendHistoricalSamples(event, stylusIndex)
                    appendCurrentSample(event, stylusIndex)
                }
            }

            MotionEvent.ACTION_UP,
            MotionEvent.ACTION_POINTER_UP -> {
                if (activePointerId == pointerId && event.actionIndex == stylusIndex) {
                    appendHistoricalSamples(event, stylusIndex)
                    appendCurrentSample(event, stylusIndex)
                    finishStroke()
                    performClick()
                }
            }
        }
        return true
    }

    override fun onHoverEvent(event: MotionEvent): Boolean {
        val stylusIndex = findStylusPointerIndex(event) ?: return super.onHoverEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_HOVER_ENTER,
            MotionEvent.ACTION_HOVER_MOVE -> {
                hoverSample = sampleAt(event, stylusIndex, null, InkPhase.HOVER)
                postInvalidateOnAnimation()
            }

            MotionEvent.ACTION_HOVER_EXIT -> {
                hoverSample = null
                postInvalidateOnAnimation()
            }
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawColor(paperColor)
        document.snapshot().strokes.forEach { stroke ->
            painter.drawStroke(canvas, stroke, paperColor)
        }
        if (activeSamples.isNotEmpty()) {
            painter.drawStroke(
                canvas,
                NativeStroke(activeSamples, activeStyle, activeEraser),
                paperColor,
            )
        }
        hoverSample?.let { drawHover(canvas, it) }
    }

    override fun onDetachedFromWindow() {
        cancelActiveInput()
        stateListener = null
        super.onDetachedFromWindow()
    }

    private fun beginStroke(
        event: MotionEvent,
        pointerIndex: Int,
        pointerId: Int,
    ) {
        cancelActiveInput()
        requestUnbufferedDispatch(event)
        activePointerId = pointerId
        activeStyle = NativeBrushStyle(inkColor, brushSizePx)
        activeEraser = event.getToolType(pointerIndex) == MotionEvent.TOOL_TYPE_ERASER
        activeSamples.clear()
        parent?.requestDisallowInterceptTouchEvent(true)
        appendHistoricalSamples(event, pointerIndex)
        appendCurrentSample(event, pointerIndex)
    }

    private fun appendHistoricalSamples(event: MotionEvent, pointerIndex: Int) {
        for (historyIndex in 0 until event.historySize) {
            activeSamples += sampleAt(event, pointerIndex, historyIndex, InkPhase.CONTACT)
        }
    }

    private fun appendCurrentSample(event: MotionEvent, pointerIndex: Int) {
        activeSamples += sampleAt(event, pointerIndex, null, InkPhase.CONTACT)
        postInvalidateOnAnimation()
    }

    private fun finishStroke() {
        if (activePointerId == null) return
        document.commit(activeSamples, activeStyle, activeEraser)
        activeSamples.clear()
        activePointerId = null
        parent?.requestDisallowInterceptTouchEvent(false)
        postInvalidateOnAnimation()
        dispatchState()
    }

    private fun sampleAt(
        event: MotionEvent,
        pointerIndex: Int,
        historyIndex: Int?,
        phase: InkPhase,
    ): InkSample {
        val historical = historyIndex != null
        val x = if (historical) {
            event.getHistoricalX(pointerIndex, historyIndex!!)
        } else {
            event.getX(pointerIndex)
        }
        val y = if (historical) {
            event.getHistoricalY(pointerIndex, historyIndex!!)
        } else {
            event.getY(pointerIndex)
        }
        val pressure = if (historical) {
            event.getHistoricalPressure(pointerIndex, historyIndex!!)
        } else {
            event.getPressure(pointerIndex)
        }
        val eventTime = if (historical) event.getHistoricalEventTime(historyIndex!!) else event.eventTime
        return InkSample(
            x = x,
            y = y,
            pressure = pressure.coerceIn(0f, 1f),
            tiltRadians = axisValue(event, MotionEvent.AXIS_TILT, pointerIndex, historyIndex),
            orientationRadians = axisValue(event, MotionEvent.AXIS_ORIENTATION, pointerIndex, historyIndex),
            distance = axisValue(event, MotionEvent.AXIS_DISTANCE, pointerIndex, historyIndex),
            eventTimeMillis = eventTime,
            receivedUptimeMillis = SystemClock.uptimeMillis(),
            tool = toolFrom(event.getToolType(pointerIndex)),
            phase = phase,
            historical = historical,
            buttonState = event.buttonState,
        )
    }

    private fun axisValue(
        event: MotionEvent,
        axis: Int,
        pointerIndex: Int,
        historyIndex: Int?,
    ): Float = if (historyIndex == null) {
        event.getAxisValue(axis, pointerIndex)
    } else {
        event.getHistoricalAxisValue(axis, pointerIndex, historyIndex)
    }

    private fun findStylusPointerIndex(event: MotionEvent): Int? {
        for (index in 0 until event.pointerCount) {
            when (event.getToolType(index)) {
                MotionEvent.TOOL_TYPE_STYLUS,
                MotionEvent.TOOL_TYPE_ERASER -> return index
            }
        }
        return null
    }

    private fun toolFrom(toolType: Int): InkTool = when (toolType) {
        MotionEvent.TOOL_TYPE_STYLUS -> InkTool.STYLUS
        MotionEvent.TOOL_TYPE_ERASER -> InkTool.ERASER
        MotionEvent.TOOL_TYPE_FINGER -> InkTool.TOUCH
        MotionEvent.TOOL_TYPE_MOUSE -> InkTool.MOUSE
        else -> InkTool.UNKNOWN
    }

    private fun drawHover(canvas: Canvas, sample: InkSample) {
        val radius = dp(8f) + sample.distance.coerceAtLeast(0f) * dp(2f)
        canvas.drawCircle(sample.x, sample.y, radius, hoverPaint)
        canvas.drawLine(sample.x - radius, sample.y, sample.x + radius, sample.y, hoverPaint)
        canvas.drawLine(sample.x, sample.y - radius, sample.x, sample.y + radius, hoverPaint)
    }

    private fun dispatchState() {
        stateListener?.invoke(buildState())
    }

    private fun buildState(): State {
        val snapshot = document.snapshot()
        return State(
            rendererLabel = RENDERER_LABEL,
            strokeCount = snapshot.strokeCount,
            sampleCount = snapshot.sampleCount,
            canUndo = snapshot.canUndo,
            canRedo = snapshot.canRedo,
            brushSizePx = brushSizePx,
            inkColor = inkColor,
            paperColor = paperColor,
        )
    }

    private fun dp(value: Float): Float = value * resources.displayMetrics.density

    private companion object {
        const val RENDERER_LABEL = "NATIVE VIEW · HWUI"
        const val DEFAULT_BRUSH_DP = 10f
        const val DEFAULT_PAPER_COLOR = 0xFF100A12.toInt()
        const val DEFAULT_INK_COLOR = 0xFFFFE9F0.toInt()
        const val HOVER_COLOR = 0xFF71E6FF.toInt()
    }
}
