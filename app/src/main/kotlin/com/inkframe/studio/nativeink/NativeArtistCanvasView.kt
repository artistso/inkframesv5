package com.inkframe.studio.nativeink

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.os.SystemClock
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.min

/**
 * Production native artist canvas using Android's hardware-accelerated View/HWUI pipeline.
 *
 * Ink is stored in fixed project-pixel coordinates. The View applies a fit transform for display
 * and maps S Pen input back into project space, keeping persisted geometry device-independent.
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
        val projectWidth: Int,
        val projectHeight: Int,
    )

    private data class ProjectTransform(
        val scale: Float,
        val offsetX: Float,
        val offsetY: Float,
    )

    private val document = NativeCanvasDocument()
    private val painter = NativeStrokePainter()
    private val activeSamples = ArrayList<InkSample>()
    private var activePointerId: Int? = null
    private var activeStyle = NativeBrushStyle(DEFAULT_INK_COLOR, dp(DEFAULT_BRUSH_DP))
    private var activeEraser = false
    private var hoverSample: InkSample? = null
    private var projectWidth = DEFAULT_PROJECT_WIDTH
    private var projectHeight = DEFAULT_PROJECT_HEIGHT

    private val hoverPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(1.5f)
        color = HOVER_COLOR
    }

    var stateListener: ((State) -> Unit)? = null
    var documentMutationListener: (() -> Unit)? = null

    var inkColor: Int = DEFAULT_INK_COLOR
        private set
    var paperColor: Int = DEFAULT_PAPER_COLOR
        private set
    var brushSizePx: Float = dp(DEFAULT_BRUSH_DP)
        private set

    init {
        setBackgroundColor(OUTSIDE_COLOR)
        isFocusable = true
        isFocusableInTouchMode = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = "InkFrame Native Canvas Beta"
    }

    fun setInkColor(color: Int) {
        if (inkColor == color) return
        inkColor = color
        dispatchState()
        notifyMutation()
    }

    fun setPaperColor(color: Int) {
        if (paperColor == color) return
        cancelActiveInput()
        paperColor = color
        postInvalidateOnAnimation()
        dispatchState()
        notifyMutation()
    }

    fun setBrushSizePx(sizePx: Float) {
        val bounded = sizePx.coerceIn(0.5f, NativeProject.MAX_BRUSH_SIZE_PX)
        if (brushSizePx == bounded) return
        brushSizePx = bounded
        dispatchState()
        notifyMutation()
    }

    fun loadProject(project: NativeProject) {
        cancelActiveInput()
        projectWidth = project.width
        projectHeight = project.height
        paperColor = project.paperColor
        inkColor = project.inkColor
        brushSizePx = project.brushSizePx
        document.replaceAll(project.strokes)
        hoverSample = null
        postInvalidateOnAnimation()
        dispatchState()
    }

    fun startBlankProject(
        width: Int,
        height: Int,
        paperColor: Int = DEFAULT_PAPER_COLOR,
        inkColor: Int = DEFAULT_INK_COLOR,
        brushSizePx: Float = dp(DEFAULT_BRUSH_DP),
    ) {
        require(width in NativeProject.MIN_DIMENSION..NativeProject.MAX_DIMENSION)
        require(height in NativeProject.MIN_DIMENSION..NativeProject.MAX_DIMENSION)
        cancelActiveInput()
        projectWidth = width
        projectHeight = height
        this.paperColor = paperColor
        this.inkColor = inkColor
        this.brushSizePx = brushSizePx.coerceIn(0.5f, NativeProject.MAX_BRUSH_SIZE_PX)
        document.clear()
        hoverSample = null
        postInvalidateOnAnimation()
        dispatchState()
    }

    fun createProjectSnapshot(
        id: String,
        name: String,
        updatedAtMillis: Long,
    ): NativeProject {
        val snapshot = document.snapshot()
        return NativeProject(
            id = id,
            name = name,
            width = projectWidth,
            height = projectHeight,
            paperColor = paperColor,
            inkColor = inkColor,
            brushSizePx = brushSizePx,
            updatedAtMillis = updatedAtMillis,
            strokes = snapshot.strokes,
        )
    }

    fun undo(): Boolean {
        cancelActiveInput()
        val changed = document.undo()
        if (changed) {
            postInvalidateOnAnimation()
            notifyMutation()
        }
        dispatchState()
        return changed
    }

    fun redo(): Boolean {
        cancelActiveInput()
        val changed = document.redo()
        if (changed) {
            postInvalidateOnAnimation()
            notifyMutation()
        }
        dispatchState()
        return changed
    }

    fun clearCanvas() {
        cancelActiveInput()
        if (document.snapshot().strokeCount == 0) return
        document.clear()
        hoverSample = null
        postInvalidateOnAnimation()
        dispatchState()
        notifyMutation()
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

    fun renderBitmap(): Bitmap =
        Bitmap.createBitmap(projectWidth, projectHeight, Bitmap.Config.ARGB_8888).also { bitmap ->
            val canvas = Canvas(bitmap)
            canvas.drawColor(paperColor)
            document.snapshot().strokes.forEach { stroke ->
                painter.drawStroke(canvas, stroke, paperColor)
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
                if ((event.actionIndex == stylusIndex || activePointerId == null) &&
                    isInsideProject(event.getX(stylusIndex), event.getY(stylusIndex))
                ) {
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
                hoverSample = if (isInsideProject(event.getX(stylusIndex), event.getY(stylusIndex))) {
                    sampleAt(event, stylusIndex, null, InkPhase.HOVER, clampToProject = false)
                } else {
                    null
                }
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
        canvas.drawColor(OUTSIDE_COLOR)
        val transform = projectTransform()
        val checkpoint = canvas.save()
        canvas.translate(transform.offsetX, transform.offsetY)
        canvas.scale(transform.scale, transform.scale)
        canvas.clipRect(0f, 0f, projectWidth.toFloat(), projectHeight.toFloat())
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
        canvas.restoreToCount(checkpoint)
        hoverSample?.let { drawHover(canvas, it, transform) }
    }

    override fun onDetachedFromWindow() {
        cancelActiveInput()
        stateListener = null
        documentMutationListener = null
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
        val changed = document.commit(activeSamples, activeStyle, activeEraser)
        activeSamples.clear()
        activePointerId = null
        parent?.requestDisallowInterceptTouchEvent(false)
        postInvalidateOnAnimation()
        dispatchState()
        if (changed) notifyMutation()
    }

    private fun sampleAt(
        event: MotionEvent,
        pointerIndex: Int,
        historyIndex: Int?,
        phase: InkPhase,
        clampToProject: Boolean = true,
    ): InkSample {
        val historical = historyIndex != null
        val viewX = if (historical) {
            event.getHistoricalX(pointerIndex, historyIndex!!)
        } else {
            event.getX(pointerIndex)
        }
        val viewY = if (historical) {
            event.getHistoricalY(pointerIndex, historyIndex!!)
        } else {
            event.getY(pointerIndex)
        }
        val projectPoint = viewToProject(viewX, viewY, clampToProject)
        val pressure = if (historical) {
            event.getHistoricalPressure(pointerIndex, historyIndex!!)
        } else {
            event.getPressure(pointerIndex)
        }
        val eventTime = if (historical) event.getHistoricalEventTime(historyIndex!!) else event.eventTime
        return InkSample(
            x = projectPoint.first,
            y = projectPoint.second,
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

    private fun projectTransform(): ProjectTransform {
        val availableWidth = width.coerceAtLeast(1).toFloat()
        val availableHeight = height.coerceAtLeast(1).toFloat()
        val scale = min(
            availableWidth / projectWidth.toFloat(),
            availableHeight / projectHeight.toFloat(),
        ).coerceAtLeast(0.0001f)
        return ProjectTransform(
            scale = scale,
            offsetX = (availableWidth - projectWidth * scale) / 2f,
            offsetY = (availableHeight - projectHeight * scale) / 2f,
        )
    }

    private fun isInsideProject(viewX: Float, viewY: Float): Boolean {
        val transform = projectTransform()
        val right = transform.offsetX + projectWidth * transform.scale
        val bottom = transform.offsetY + projectHeight * transform.scale
        return viewX >= transform.offsetX && viewX <= right &&
            viewY >= transform.offsetY && viewY <= bottom
    }

    private fun viewToProject(viewX: Float, viewY: Float, clamp: Boolean): Pair<Float, Float> {
        val transform = projectTransform()
        val x = (viewX - transform.offsetX) / transform.scale
        val y = (viewY - transform.offsetY) / transform.scale
        return if (clamp) {
            x.coerceIn(0f, projectWidth.toFloat()) to y.coerceIn(0f, projectHeight.toFloat())
        } else {
            x to y
        }
    }

    private fun drawHover(canvas: Canvas, sample: InkSample, transform: ProjectTransform) {
        val x = transform.offsetX + sample.x * transform.scale
        val y = transform.offsetY + sample.y * transform.scale
        val radius = dp(8f) + sample.distance.coerceAtLeast(0f) * dp(2f)
        canvas.drawCircle(x, y, radius, hoverPaint)
        canvas.drawLine(x - radius, y, x + radius, y, hoverPaint)
        canvas.drawLine(x, y - radius, x, y + radius, hoverPaint)
    }

    private fun notifyMutation() {
        documentMutationListener?.invoke()
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
            projectWidth = projectWidth,
            projectHeight = projectHeight,
        )
    }

    private fun dp(value: Float): Float = value * resources.displayMetrics.density

    private companion object {
        const val RENDERER_LABEL = "NATIVE VIEW · HWUI"
        const val DEFAULT_BRUSH_DP = 10f
        const val DEFAULT_PROJECT_WIDTH = 2560
        const val DEFAULT_PROJECT_HEIGHT = 1600
        const val DEFAULT_PAPER_COLOR = 0xFF100A12.toInt()
        const val DEFAULT_INK_COLOR = 0xFFFFE9F0.toInt()
        const val HOVER_COLOR = 0xFF71E6FF.toInt()
        const val OUTSIDE_COLOR = 0xFF09070B.toInt()
    }
}
