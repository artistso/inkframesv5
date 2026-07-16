package com.inkframe.studio.nativeink

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.os.SystemClock
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View

/**
 * Debug-only native S Pen surface using the ordinary hardware-accelerated View pipeline.
 *
 * The high-frequency path consumes MotionEvent samples directly. No sample is sent through
 * WebView or a JavaScript bridge. Historical samples are retained so this renderer can be compared
 * against the front-buffered experiment with the same input and telemetry model.
 */
internal class NativeInkSurfaceView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr), InkLabSurface {

    private data class Stroke(
        val tool: InkTool,
        val samples: MutableList<InkSample> = ArrayList(),
    )

    override val displayView: View
        get() = this
    override val rendererLabel: String = "BUFFERED VIEW · HWUI"

    private val metrics = InkMetrics()
    private val completedStrokes = ArrayDeque<Stroke>()
    private var activeStroke: Stroke? = null
    private var activePointerId: Int? = null
    private var hoverSample: InkSample? = null
    private var storedSampleCount = 0
    private var lastMetricsDispatchMillis = 0L

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val pointPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val hoverPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(1.5f)
        color = HOVER_COLOR
    }

    override var metricsListener: ((InkMetricsSnapshot) -> Unit)? = null
    override var showSamplePoints: Boolean = false
        set(value) {
            field = value
            postInvalidateOnAnimation()
        }

    init {
        setBackgroundColor(BACKGROUND_COLOR)
        isFocusable = true
        isFocusableInTouchMode = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = "Buffered native S Pen drawing laboratory"
    }

    override fun clearInk() {
        completedStrokes.clear()
        activeStroke = null
        activePointerId = null
        hoverSample = null
        storedSampleCount = 0
        metrics.reset()
        dispatchMetrics(force = true)
        postInvalidateOnAnimation()
    }

    override fun cancelActiveInput() {
        cancelActiveStroke()
    }

    override fun metricsSnapshot(): InkMetricsSnapshot = metrics.snapshot()

    override fun rendererReport(): String = buildString {
        appendLine("renderer=buffered-view")
        appendLine("pipeline=hardware-accelerated-hwui")
        appendLine("requestUnbufferedDispatch=true")
        appendLine("framePresentation=postInvalidateOnAnimation")
    }

    override fun release() {
        cancelActiveStroke()
        metricsListener = null
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val action = event.actionMasked
        if (action == MotionEvent.ACTION_CANCEL) {
            cancelActiveStroke()
            return true
        }

        val stylusIndex = findStylusPointerIndex(event)
        if (stylusIndex == null) {
            if (containsTouchPointer(event)) {
                metrics.ignoreTouchEvent()
                dispatchMetrics()
            }
            return true
        }

        val pointerId = event.getPointerId(stylusIndex)
        when (action) {
            MotionEvent.ACTION_DOWN,
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (event.actionIndex == stylusIndex || activeStroke == null) {
                    beginStroke(event, stylusIndex, pointerId)
                }
            }

            MotionEvent.ACTION_MOVE -> {
                if (activePointerId == pointerId && activeStroke != null) {
                    appendHistoricalSamples(event, stylusIndex, InkPhase.CONTACT)
                    appendCurrentSample(event, stylusIndex, InkPhase.CONTACT)
                }
            }

            MotionEvent.ACTION_UP,
            MotionEvent.ACTION_POINTER_UP -> {
                if (activePointerId == pointerId && event.actionIndex == stylusIndex) {
                    appendHistoricalSamples(event, stylusIndex, InkPhase.CONTACT)
                    appendCurrentSample(event, stylusIndex, InkPhase.CONTACT)
                    finishStroke(cancelled = false)
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
                appendHistoricalSamples(event, stylusIndex, InkPhase.HOVER, retainInStroke = false)
                hoverSample = sampleAt(event, stylusIndex, null, InkPhase.HOVER).also(metrics::record)
                dispatchMetrics()
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
        canvas.drawColor(BACKGROUND_COLOR)
        completedStrokes.forEach { drawStroke(canvas, it) }
        activeStroke?.let { drawStroke(canvas, it) }
        hoverSample?.let { drawHover(canvas, it) }
    }

    private fun beginStroke(event: MotionEvent, pointerIndex: Int, pointerId: Int) {
        if (activeStroke != null) cancelActiveStroke()
        requestUnbufferedDispatch(event)
        val tool = toolFrom(event.getToolType(pointerIndex))
        activeStroke = Stroke(tool)
        activePointerId = pointerId
        parent?.requestDisallowInterceptTouchEvent(true)
        appendHistoricalSamples(event, pointerIndex, InkPhase.CONTACT)
        appendCurrentSample(event, pointerIndex, InkPhase.CONTACT)
    }

    private fun appendHistoricalSamples(
        event: MotionEvent,
        pointerIndex: Int,
        phase: InkPhase,
        retainInStroke: Boolean = true,
    ) {
        for (historyIndex in 0 until event.historySize) {
            val sample = sampleAt(event, pointerIndex, historyIndex, phase)
            metrics.record(sample)
            if (retainInStroke) retainSample(sample)
        }
        dispatchMetrics()
    }

    private fun appendCurrentSample(event: MotionEvent, pointerIndex: Int, phase: InkPhase) {
        val sample = sampleAt(event, pointerIndex, null, phase)
        metrics.record(sample)
        retainSample(sample)
        dispatchMetrics()
        postInvalidateOnAnimation()
    }

    private fun retainSample(sample: InkSample) {
        val stroke = activeStroke ?: return
        stroke.samples += sample
        storedSampleCount += 1
    }

    private fun finishStroke(cancelled: Boolean) {
        val stroke = activeStroke
        activeStroke = null
        activePointerId = null
        parent?.requestDisallowInterceptTouchEvent(false)
        metrics.completeStroke(cancelled)
        if (!cancelled && stroke != null && stroke.samples.isNotEmpty()) {
            completedStrokes.addLast(stroke)
            trimStoredInk()
        } else if (stroke != null) {
            storedSampleCount -= stroke.samples.size
        }
        dispatchMetrics(force = true)
        postInvalidateOnAnimation()
    }

    private fun cancelActiveStroke() {
        if (activeStroke == null) return
        finishStroke(cancelled = true)
    }

    private fun trimStoredInk() {
        while (completedStrokes.size > MAX_STROKES || storedSampleCount > MAX_STORED_SAMPLES) {
            val removed = completedStrokes.removeFirstOrNull() ?: break
            storedSampleCount -= removed.samples.size
        }
    }

    private fun sampleAt(
        event: MotionEvent,
        pointerIndex: Int,
        historyIndex: Int?,
        phase: InkPhase,
    ): InkSample {
        val historical = historyIndex != null
        val x = if (historical) event.getHistoricalX(pointerIndex, historyIndex!!) else event.getX(pointerIndex)
        val y = if (historical) event.getHistoricalY(pointerIndex, historyIndex!!) else event.getY(pointerIndex)
        val pressure = if (historical) event.getHistoricalPressure(pointerIndex, historyIndex!!) else event.getPressure(pointerIndex)
        val tilt = axisValue(event, MotionEvent.AXIS_TILT, pointerIndex, historyIndex)
        val orientation = axisValue(event, MotionEvent.AXIS_ORIENTATION, pointerIndex, historyIndex)
        val distance = axisValue(event, MotionEvent.AXIS_DISTANCE, pointerIndex, historyIndex)
        val eventTime = if (historical) event.getHistoricalEventTime(historyIndex!!) else event.eventTime
        return InkSample(
            x = x,
            y = y,
            pressure = pressure.coerceIn(0f, 1f),
            tiltRadians = tilt,
            orientationRadians = orientation,
            distance = distance,
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

    private fun containsTouchPointer(event: MotionEvent): Boolean {
        for (index in 0 until event.pointerCount) {
            if (event.getToolType(index) == MotionEvent.TOOL_TYPE_FINGER) return true
        }
        return false
    }

    private fun toolFrom(toolType: Int): InkTool = when (toolType) {
        MotionEvent.TOOL_TYPE_STYLUS -> InkTool.STYLUS
        MotionEvent.TOOL_TYPE_ERASER -> InkTool.ERASER
        MotionEvent.TOOL_TYPE_FINGER -> InkTool.TOUCH
        MotionEvent.TOOL_TYPE_MOUSE -> InkTool.MOUSE
        else -> InkTool.UNKNOWN
    }

    private fun drawStroke(canvas: Canvas, stroke: Stroke) {
        val samples = stroke.samples
        if (samples.isEmpty()) return
        val color = if (stroke.tool == InkTool.ERASER) BACKGROUND_COLOR else INK_COLOR
        strokePaint.color = color
        pointPaint.color = if (stroke.tool == InkTool.ERASER) BACKGROUND_COLOR else SAMPLE_COLOR

        if (samples.size == 1) {
            val sample = samples[0]
            canvas.drawCircle(sample.x, sample.y, strokeWidth(sample.pressure) / 2f, pointPaint)
            return
        }

        var previous = samples[0]
        for (index in 1 until samples.size) {
            val current = samples[index]
            strokePaint.strokeWidth = (strokeWidth(previous.pressure) + strokeWidth(current.pressure)) / 2f
            canvas.drawLine(previous.x, previous.y, current.x, current.y, strokePaint)
            if (showSamplePoints && stroke.tool != InkTool.ERASER) {
                pointPaint.color = if (current.historical) HISTORICAL_SAMPLE_COLOR else SAMPLE_COLOR
                canvas.drawCircle(current.x, current.y, dp(1.25f), pointPaint)
            }
            previous = current
        }
    }

    private fun drawHover(canvas: Canvas, sample: InkSample) {
        val radius = dp(8f) + sample.distance.coerceAtLeast(0f) * dp(2f)
        canvas.drawCircle(sample.x, sample.y, radius, hoverPaint)
        canvas.drawLine(sample.x - radius, sample.y, sample.x + radius, sample.y, hoverPaint)
        canvas.drawLine(sample.x, sample.y - radius, sample.x, sample.y + radius, hoverPaint)
    }

    private fun strokeWidth(pressure: Float): Float = dp(1.5f + pressure.coerceIn(0f, 1f) * 13.5f)

    private fun dispatchMetrics(force: Boolean = false) {
        val now = SystemClock.uptimeMillis()
        if (!force && now - lastMetricsDispatchMillis < METRICS_INTERVAL_MILLIS) return
        lastMetricsDispatchMillis = now
        metricsListener?.invoke(metrics.snapshot())
    }

    private fun dp(value: Float): Float = value * resources.displayMetrics.density

    private companion object {
        const val MAX_STROKES = 128
        const val MAX_STORED_SAMPLES = 65_536
        const val METRICS_INTERVAL_MILLIS = 100L
        const val BACKGROUND_COLOR = 0xFF100A12.toInt()
        const val INK_COLOR = 0xFFFFE9F0.toInt()
        const val SAMPLE_COLOR = 0xFFFF4F91.toInt()
        const val HISTORICAL_SAMPLE_COLOR = 0xFFFFA6C5.toInt()
        const val HOVER_COLOR = 0xFF71E6FF.toInt()
    }
}
