package com.inkframe.studio.nativeink

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.os.SystemClock
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * Native S Pen preview surface positioned over the original WebView canvas.
 *
 * The overlay owns only the high-frequency stylus stream. Completed samples are replayed through
 * the existing Brush Engine V2 environment, keeping the original frame/layer/history model
 * authoritative while the live stroke is rendered by Android HWUI.
 */
class NativeStudioInkOverlay @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    data class Configuration(
        val enabled: Boolean,
        val contextToken: String,
        val canvasWidth: Int,
        val canvasHeight: Int,
        val brushColor: Int,
        val paperColor: Int,
        val brushSizeDisplayPx: Float,
        val opacity: Float,
        val circularCanvas: Boolean,
    )

    private data class Sample(
        val x: Float,
        val y: Float,
        val pressure: Float,
        val tiltRadians: Float,
        val orientationRadians: Float,
        val eventTimeMillis: Long,
        val historical: Boolean,
    )

    var onStrokeComplete: ((String) -> Unit)? = null

    var studioEnabled: Boolean = false
        private set
    val hasActiveStroke: Boolean
        get() = activePointerId != null || awaitingReplay

    private var configuration = Configuration(
        enabled = false,
        contextToken = "",
        canvasWidth = 1,
        canvasHeight = 1,
        brushColor = DEFAULT_INK_COLOR,
        paperColor = DEFAULT_PAPER_COLOR,
        brushSizeDisplayPx = 10f,
        opacity = 1f,
        circularCanvas = false,
    )
    private val samples = ArrayList<Sample>(512)
    private var activePointerId: Int? = null
    private var activeEraser = false
    private var awaitingReplay = false

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val pointPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val circularClip = Path()

    init {
        setBackgroundColor(android.graphics.Color.TRANSPARENT)
        isClickable = false
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun applyConfiguration(next: Configuration) {
        val contextChanged = configuration.contextToken.isNotEmpty() &&
            configuration.contextToken != next.contextToken
        if (contextChanged && hasActiveStroke) cancelStroke()
        configuration = next.copy(
            canvasWidth = next.canvasWidth.coerceAtLeast(1),
            canvasHeight = next.canvasHeight.coerceAtLeast(1),
            brushSizeDisplayPx = next.brushSizeDisplayPx.coerceAtLeast(0.75f),
            opacity = next.opacity.coerceIn(0f, 1f),
        )
        studioEnabled = configuration.enabled
        if (!studioEnabled && hasActiveStroke) cancelStroke()
        postInvalidateOnAnimation()
    }

    fun finishReplay() {
        samples.clear()
        awaitingReplay = false
        activePointerId = null
        postInvalidateOnAnimation()
    }

    fun cancelStroke() {
        samples.clear()
        activePointerId = null
        awaitingReplay = false
        parent?.requestDisallowInterceptTouchEvent(false)
        postInvalidateOnAnimation()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!studioEnabled) return false
        if (event.actionMasked == MotionEvent.ACTION_CANCEL) {
            cancelStroke()
            return true
        }
        if (awaitingReplay) return true

        val stylusIndex = findStylusPointerIndex(event) ?: return false
        val pointerId = event.getPointerId(stylusIndex)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN,
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (event.actionIndex == stylusIndex || activePointerId == null) {
                    beginStroke(event, stylusIndex, pointerId)
                }
            }

            MotionEvent.ACTION_MOVE -> {
                if (activePointerId == pointerId) appendEventSamples(event, stylusIndex)
            }

            MotionEvent.ACTION_UP,
            MotionEvent.ACTION_POINTER_UP -> {
                if (activePointerId == pointerId && event.actionIndex == stylusIndex) {
                    appendEventSamples(event, stylusIndex)
                    completeStroke(pointerId)
                }
            }
        }
        return true
    }

    override fun onHoverEvent(event: MotionEvent): Boolean = studioEnabled && findStylusPointerIndex(event) != null

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (samples.isEmpty()) return

        val restore = canvas.save()
        if (configuration.circularCanvas) {
            circularClip.reset()
            circularClip.addCircle(
                width / 2f,
                height / 2f,
                minOf(width, height) / 2f,
                Path.Direction.CW,
            )
            canvas.clipPath(circularClip)
        }

        val color = if (activeEraser) configuration.paperColor else configuration.brushColor
        val alpha = (configuration.opacity * 255f).toInt().coerceIn(0, 255)
        strokePaint.color = color
        strokePaint.alpha = alpha
        pointPaint.color = color
        pointPaint.alpha = alpha

        if (samples.size == 1) {
            val sample = samples[0]
            canvas.drawCircle(sample.x, sample.y, widthFor(sample.pressure) / 2f, pointPaint)
        } else {
            var previous = samples[0]
            for (index in 1 until samples.size) {
                val current = samples[index]
                strokePaint.strokeWidth = (widthFor(previous.pressure) + widthFor(current.pressure)) / 2f
                canvas.drawLine(previous.x, previous.y, current.x, current.y, strokePaint)
                previous = current
            }
        }
        canvas.restoreToCount(restore)
    }

    override fun onDetachedFromWindow() {
        cancelStroke()
        onStrokeComplete = null
        super.onDetachedFromWindow()
    }

    private fun beginStroke(event: MotionEvent, pointerIndex: Int, pointerId: Int) {
        cancelStroke()
        requestUnbufferedDispatch(event)
        activePointerId = pointerId
        activeEraser = event.getToolType(pointerIndex) == MotionEvent.TOOL_TYPE_ERASER
        samples.clear()
        parent?.requestDisallowInterceptTouchEvent(true)
        appendEventSamples(event, pointerIndex)
    }

    private fun appendEventSamples(event: MotionEvent, pointerIndex: Int) {
        for (historyIndex in 0 until event.historySize) {
            appendSample(event, pointerIndex, historyIndex)
        }
        appendSample(event, pointerIndex, null)
        postInvalidateOnAnimation()
    }

    private fun appendSample(event: MotionEvent, pointerIndex: Int, historyIndex: Int?) {
        val historical = historyIndex != null
        val x = if (historical) event.getHistoricalX(pointerIndex, historyIndex!!) else event.getX(pointerIndex)
        val y = if (historical) event.getHistoricalY(pointerIndex, historyIndex!!) else event.getY(pointerIndex)
        val pressure = if (historical) {
            event.getHistoricalPressure(pointerIndex, historyIndex!!)
        } else {
            event.getPressure(pointerIndex)
        }
        val eventTime = if (historical) event.getHistoricalEventTime(historyIndex!!) else event.eventTime
        val tilt = axisValue(event, MotionEvent.AXIS_TILT, pointerIndex, historyIndex)
        val orientation = axisValue(event, MotionEvent.AXIS_ORIENTATION, pointerIndex, historyIndex)
        if (x.isFinite() && y.isFinite() && pressure.isFinite() && tilt.isFinite() && orientation.isFinite()) {
            samples += Sample(
                x = x.coerceIn(0f, width.coerceAtLeast(1).toFloat()),
                y = y.coerceIn(0f, height.coerceAtLeast(1).toFloat()),
                pressure = pressure.coerceIn(0f, 1f),
                tiltRadians = tilt,
                orientationRadians = orientation,
                eventTimeMillis = eventTime,
                historical = historical,
            )
        }
    }

    private fun completeStroke(pointerId: Int) {
        if (samples.isEmpty()) {
            cancelStroke()
            return
        }
        activePointerId = null
        awaitingReplay = true
        parent?.requestDisallowInterceptTouchEvent(false)
        val payload = buildPayload(pointerId)
        val callback = onStrokeComplete
        if (callback == null) {
            cancelStroke()
        } else {
            callback(payload)
        }
    }

    private fun buildPayload(pointerId: Int): String {
        val widthValue = width.coerceAtLeast(1).toFloat()
        val heightValue = height.coerceAtLeast(1).toFloat()
        val firstTime = samples.firstOrNull()?.eventTimeMillis ?: SystemClock.uptimeMillis()
        val values = JSONArray()
        samples.forEach { sample ->
            val tiltX = Math.toDegrees((sample.tiltRadians * cos(sample.orientationRadians)).toDouble())
            val tiltY = Math.toDegrees((sample.tiltRadians * sin(sample.orientationRadians)).toDouble())
            values.put(JSONObject().apply {
                put("x", (sample.x / widthValue).coerceIn(0f, 1f).toDouble())
                put("y", (sample.y / heightValue).coerceIn(0f, 1f).toDouble())
                put("pressure", sample.pressure.toDouble())
                put("tiltX", tiltX.coerceIn(-90.0, 90.0))
                put("tiltY", tiltY.coerceIn(-90.0, 90.0))
                put("twist", normalizeDegrees(Math.toDegrees(sample.orientationRadians.toDouble())))
                put("dt", (sample.eventTimeMillis - firstTime).coerceAtLeast(0L))
                put("historical", sample.historical)
            })
        }
        return JSONObject().apply {
            put("schema", 1)
            put("contextToken", configuration.contextToken)
            put("pointerId", pointerId)
            put("eraser", activeEraser)
            put("canvasWidth", configuration.canvasWidth)
            put("canvasHeight", configuration.canvasHeight)
            put("samples", values)
        }.toString()
    }

    private fun widthFor(pressure: Float): Float = max(
        0.75f,
        configuration.brushSizeDisplayPx * (0.18f + pressure.coerceIn(0f, 1f) * 0.82f),
    )

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

    private fun normalizeDegrees(value: Double): Double {
        var normalized = value % 360.0
        if (normalized < 0.0) normalized += 360.0
        return normalized
    }

    private companion object {
        const val DEFAULT_PAPER_COLOR = 0xFFFFF0F3.toInt()
        const val DEFAULT_INK_COLOR = 0xFF100A12.toInt()
    }
}

/**
 * Routes only S Pen contact/hover events to the transparent native overlay. Finger gestures,
 * mouse input and every original control continue directly to the WebView underneath.
 */
class NativeStudioHostLayout(context: Context) : FrameLayout(context) {
    private var webContent: View? = null
    private var inkOverlay: NativeStudioInkOverlay? = null

    fun attachRouting(webContent: View, inkOverlay: NativeStudioInkOverlay) {
        this.webContent = webContent
        this.inkOverlay = inkOverlay
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        val overlay = inkOverlay
        if (overlay != null && overlay.studioEnabled && shouldRouteStylus(event, overlay)) {
            return dispatchOffset(event, overlay, hover = false)
        }
        return webContent?.dispatchTouchEvent(event) ?: super.dispatchTouchEvent(event)
    }

    override fun dispatchHoverEvent(event: MotionEvent): Boolean {
        val overlay = inkOverlay
        if (overlay != null && overlay.studioEnabled && shouldRouteStylus(event, overlay)) {
            return dispatchOffset(event, overlay, hover = true)
        }
        return webContent?.dispatchHoverEvent(event) ?: super.dispatchHoverEvent(event)
    }

    private fun shouldRouteStylus(event: MotionEvent, overlay: NativeStudioInkOverlay): Boolean {
        if (overlay.hasActiveStroke) return true
        for (index in 0 until event.pointerCount) {
            val tool = event.getToolType(index)
            if (tool != MotionEvent.TOOL_TYPE_STYLUS && tool != MotionEvent.TOOL_TYPE_ERASER) continue
            val x = event.getX(index)
            val y = event.getY(index)
            if (x >= overlay.left && x <= overlay.right && y >= overlay.top && y <= overlay.bottom) {
                return true
            }
        }
        return false
    }

    private fun dispatchOffset(event: MotionEvent, overlay: NativeStudioInkOverlay, hover: Boolean): Boolean {
        val copy = MotionEvent.obtain(event)
        copy.offsetLocation(-overlay.left.toFloat(), -overlay.top.toFloat())
        return try {
            if (hover) overlay.dispatchHoverEvent(copy) else overlay.dispatchTouchEvent(copy)
        } finally {
            copy.recycle()
        }
    }
}
