package com.inkframe.studio.nativeink

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Build
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import androidx.annotation.RequiresApi
import androidx.annotation.WorkerThread
import androidx.graphics.lowlatency.LowLatencyCanvasView
import java.util.ArrayDeque
import java.util.concurrent.atomic.AtomicLong

/** Common controls used by the native ink laboratory's buffered and front-buffered renderers. */
internal interface InkLabSurface {
    val rootView: View
    val rendererLabel: String
    var metricsListener: ((InkMetricsSnapshot) -> Unit)?
    var showSamplePoints: Boolean

    fun clearInk()
    fun cancelActiveInput()
    fun metricsSnapshot(): InkMetricsSnapshot
    fun rendererReport(): String
    fun release()
}

/**
 * Debug-only low-latency S Pen surface backed by AndroidX [LowLatencyCanvasView].
 *
 * MotionEvent normalization and telemetry intentionally match [NativeInkSurfaceView]. The only
 * experimental variable is presentation: active segments are rendered into a front buffer and
 * completed strokes are committed back into the normal View hierarchy.
 */
@RequiresApi(Build.VERSION_CODES.Q)
internal class FrontBufferedInkSurfaceView(context: Context) : FrameLayout(context), InkLabSurface {
    private data class Segment(
        val x1: Float,
        val y1: Float,
        val x2: Float,
        val y2: Float,
        val startPressure: Float,
        val endPressure: Float,
        val tool: InkTool,
        val historicalEnd: Boolean,
        val point: Boolean,
    )

    override val rootView: View
        get() = this
    override val rendererLabel: String = "FRONT BUFFER · GRAPHICS-CORE 1.0.4"
    override var metricsListener: ((InkMetricsSnapshot) -> Unit)? = null

    @Volatile
    private var samplePointsVisible = false
    override var showSamplePoints: Boolean
        get() = samplePointsVisible
        set(value) {
            if (samplePointsVisible == value) return
            samplePointsVisible = value
            rebuildCommittedScene()
        }

    private val metrics = InkMetrics()
    private val stateLock = Any()
    private val pendingSegments = ArrayDeque<Segment>()
    private val committedSegments = ArrayDeque<Segment>()
    private val activeStrokeSegments = ArrayList<Segment>()
    private var activePointerId: Int? = null
    private var previousSample: InkSample? = null
    private var storedSegmentCount = 0
    private var lastMetricsDispatchMillis = 0L
    private var rebuildGeneration = 0L
    private var released = false

    private val renderRequests = AtomicLong(0)
    private val renderCallbacks = AtomicLong(0)
    private val commits = AtomicLong(0)
    private val cancels = AtomicLong(0)
    private val rebuilds = AtomicLong(0)
    private val maximumPendingSegments = AtomicLong(0)

    private val density = resources.displayMetrics.density
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val pointPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    private val canvasView = LowLatencyCanvasView(context).apply {
        setBackgroundColor(BACKGROUND_COLOR)
        isFocusable = true
        isFocusableInTouchMode = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = "Front-buffered native S Pen drawing laboratory"
        setRenderCallback(object : LowLatencyCanvasView.Callback {
            @WorkerThread
            override fun onRedrawRequested(canvas: Canvas, width: Int, height: Int) {
                canvas.drawColor(BACKGROUND_COLOR)
                val snapshot = synchronized(stateLock) { committedSegments.toList() }
                snapshot.forEach { drawSegment(canvas, it) }
            }

            @WorkerThread
            override fun onDrawFrontBufferedLayer(canvas: Canvas, width: Int, height: Int) {
                val segment = synchronized(stateLock) { pendingSegments.removeFirstOrNull() }
                if (segment != null) {
                    drawSegment(canvas, segment)
                    renderCallbacks.incrementAndGet()
                }
            }
        })
        setOnTouchListener { _, event -> handleTouch(event) }
        setOnHoverListener { _, event -> handleHover(event) }
    }

    private val hoverOverlay = HoverOverlayView(context).apply {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        isClickable = false
        isFocusable = false
    }

    init {
        setBackgroundColor(BACKGROUND_COLOR)
        addView(canvasView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(hoverOverlay, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    override fun clearInk() {
        activePointerId = null
        previousSample = null
        activeStrokeSegments.clear()
        synchronized(stateLock) {
            pendingSegments.clear()
            committedSegments.clear()
            storedSegmentCount = 0
        }
        rebuildGeneration += 1
        canvasView.cancel()
        canvasView.clear()
        hoverOverlay.sample = null
        metrics.reset()
        renderRequests.set(0)
        renderCallbacks.set(0)
        commits.set(0)
        cancels.set(0)
        rebuilds.set(0)
        maximumPendingSegments.set(0)
        dispatchMetrics(force = true)
    }

    override fun cancelActiveInput() {
        if (activePointerId == null && activeStrokeSegments.isEmpty()) return
        activePointerId = null
        previousSample = null
        activeStrokeSegments.clear()
        synchronized(stateLock) { pendingSegments.clear() }
        metrics.completeStroke(cancelled = true)
        cancels.incrementAndGet()
        canvasView.cancel()
        rebuildCommittedScene()
        dispatchMetrics(force = true)
        parent?.requestDisallowInterceptTouchEvent(false)
    }

    override fun metricsSnapshot(): InkMetricsSnapshot = metrics.snapshot()

    override fun rendererReport(): String = buildString {
        appendLine("renderer=front-buffer")
        appendLine("graphicsCoreVersion=1.0.4")
        appendLine("minimumApi=29")
        appendLine("requestUnbufferedDispatch=true")
        appendLine("frontBufferRenderRequests=${renderRequests.get()}")
        appendLine("frontBufferRenderCallbacks=${renderCallbacks.get()}")
        appendLine("frontBufferCommits=${commits.get()}")
        appendLine("frontBufferCancels=${cancels.get()}")
        appendLine("frontBufferRebuilds=${rebuilds.get()}")
        appendLine("maximumPendingSegments=${maximumPendingSegments.get()}")
    }

    override fun release() {
        if (released) return
        released = true
        rebuildGeneration += 1
        cancelActiveInput()
        synchronized(stateLock) { pendingSegments.clear() }
        canvasView.setOnTouchListener(null)
        canvasView.setOnHoverListener(null)
        canvasView.setRenderCallback(null)
        canvasView.cancel()
        hoverOverlay.sample = null
    }

    private fun handleTouch(event: MotionEvent): Boolean {
        if (released) return true
        if (event.actionMasked == MotionEvent.ACTION_CANCEL) {
            cancelActiveInput()
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
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN,
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (event.actionIndex == stylusIndex || activePointerId == null) {
                    beginStroke(event, stylusIndex, pointerId)
                }
            }

            MotionEvent.ACTION_MOVE -> {
                if (activePointerId == pointerId) {
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

    private fun handleHover(event: MotionEvent): Boolean {
        if (released) return true
        val stylusIndex = findStylusPointerIndex(event) ?: return false
        when (event.actionMasked) {
            MotionEvent.ACTION_HOVER_ENTER,
            MotionEvent.ACTION_HOVER_MOVE -> {
                appendHistoricalSamples(event, stylusIndex, InkPhase.HOVER, render = false)
                hoverOverlay.sample = sampleAt(event, stylusIndex, null, InkPhase.HOVER).also(metrics::record)
                dispatchMetrics()
            }

            MotionEvent.ACTION_HOVER_EXIT -> hoverOverlay.sample = null
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    private fun beginStroke(event: MotionEvent, pointerIndex: Int, pointerId: Int) {
        if (activePointerId != null) cancelActiveInput()
        canvasView.requestUnbufferedDispatch(event)
        activePointerId = pointerId
        previousSample = null
        activeStrokeSegments.clear()
        parent?.requestDisallowInterceptTouchEvent(true)
        appendHistoricalSamples(event, pointerIndex, InkPhase.CONTACT)
        appendCurrentSample(event, pointerIndex, InkPhase.CONTACT)
    }

    private fun appendHistoricalSamples(
        event: MotionEvent,
        pointerIndex: Int,
        phase: InkPhase,
        render: Boolean = true,
    ) {
        for (historyIndex in 0 until event.historySize) {
            val sample = sampleAt(event, pointerIndex, historyIndex, phase)
            metrics.record(sample)
            if (render && phase == InkPhase.CONTACT) appendContactSample(sample)
        }
        dispatchMetrics()
    }

    private fun appendCurrentSample(event: MotionEvent, pointerIndex: Int, phase: InkPhase) {
        val sample = sampleAt(event, pointerIndex, null, phase)
        metrics.record(sample)
        if (phase == InkPhase.CONTACT) appendContactSample(sample)
        dispatchMetrics()
    }

    private fun appendContactSample(sample: InkSample) {
        val previous = previousSample
        val segment = if (previous == null) {
            Segment(
                x1 = sample.x,
                y1 = sample.y,
                x2 = sample.x,
                y2 = sample.y,
                startPressure = sample.pressure,
                endPressure = sample.pressure,
                tool = sample.tool,
                historicalEnd = sample.historical,
                point = true,
            )
        } else {
            Segment(
                x1 = previous.x,
                y1 = previous.y,
                x2 = sample.x,
                y2 = sample.y,
                startPressure = previous.pressure,
                endPressure = sample.pressure,
                tool = sample.tool,
                historicalEnd = sample.historical,
                point = false,
            )
        }
        previousSample = sample
        activeStrokeSegments += segment
        enqueueFrontBufferSegment(segment)
    }

    private fun enqueueFrontBufferSegment(segment: Segment) {
        val depth = synchronized(stateLock) {
            pendingSegments.addLast(segment)
            pendingSegments.size.toLong()
        }
        maximumPendingSegments.accumulateAndGet(depth, ::maxOf)
        renderRequests.incrementAndGet()
        canvasView.renderFrontBufferedLayer()
    }

    private fun finishStroke(cancelled: Boolean) {
        if (activePointerId == null) return
        if (cancelled) {
            cancelActiveInput()
            return
        }

        synchronized(stateLock) {
            activeStrokeSegments.forEach(committedSegments::addLast)
            storedSegmentCount += activeStrokeSegments.size
            while (storedSegmentCount > MAX_STORED_SEGMENTS) {
                if (committedSegments.removeFirstOrNull() == null) break
                storedSegmentCount -= 1
            }
        }
        activeStrokeSegments.clear()
        activePointerId = null
        previousSample = null
        metrics.completeStroke(cancelled = false)
        commits.incrementAndGet()
        canvasView.commit()
        dispatchMetrics(force = true)
        parent?.requestDisallowInterceptTouchEvent(false)
    }

    private fun rebuildCommittedScene() {
        if (released) return
        val generation = ++rebuildGeneration
        rebuilds.incrementAndGet()
        synchronized(stateLock) { pendingSegments.clear() }
        canvasView.cancel()
        canvasView.clear()
        canvasView.execute {
            post {
                if (released || generation != rebuildGeneration) return@post
                val snapshot = synchronized(stateLock) { committedSegments.toList() }
                snapshot.forEach(::enqueueFrontBufferSegment)
                canvasView.commit()
            }
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

    @WorkerThread
    private fun drawSegment(canvas: Canvas, segment: Segment) {
        val color = if (segment.tool == InkTool.ERASER) BACKGROUND_COLOR else INK_COLOR
        strokePaint.color = color
        pointPaint.color = if (segment.tool == InkTool.ERASER) BACKGROUND_COLOR else SAMPLE_COLOR
        val width = (strokeWidth(segment.startPressure) + strokeWidth(segment.endPressure)) / 2f
        if (segment.point) {
            canvas.drawCircle(segment.x2, segment.y2, width / 2f, pointPaint)
        } else {
            strokePaint.strokeWidth = width
            canvas.drawLine(segment.x1, segment.y1, segment.x2, segment.y2, strokePaint)
        }
        if (samplePointsVisible && segment.tool != InkTool.ERASER) {
            pointPaint.color = if (segment.historicalEnd) HISTORICAL_SAMPLE_COLOR else SAMPLE_COLOR
            canvas.drawCircle(segment.x2, segment.y2, 1.25f * density, pointPaint)
        }
    }

    private fun strokeWidth(pressure: Float): Float =
        (1.5f + pressure.coerceIn(0f, 1f) * 13.5f) * density

    private fun dispatchMetrics(force: Boolean = false) {
        val now = SystemClock.uptimeMillis()
        if (!force && now - lastMetricsDispatchMillis < METRICS_INTERVAL_MILLIS) return
        lastMetricsDispatchMillis = now
        metricsListener?.invoke(metrics.snapshot())
    }

    private class HoverOverlayView(context: Context) : View(context) {
        private val density = resources.displayMetrics.density
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.5f * density
            color = HOVER_COLOR
        }

        var sample: InkSample? = null
            set(value) {
                field = value
                postInvalidateOnAnimation()
            }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val current = sample ?: return
            val radius = 8f * density + current.distance.coerceAtLeast(0f) * 2f * density
            canvas.drawCircle(current.x, current.y, radius, paint)
            canvas.drawLine(current.x - radius, current.y, current.x + radius, current.y, paint)
            canvas.drawLine(current.x, current.y - radius, current.x, current.y + radius, paint)
        }
    }

    private companion object {
        const val MAX_STORED_SEGMENTS = 65_536
        const val METRICS_INTERVAL_MILLIS = 100L
        const val BACKGROUND_COLOR = 0xFF100A12.toInt()
        const val INK_COLOR = 0xFFFFE9F0.toInt()
        const val SAMPLE_COLOR = 0xFFFF4F91.toInt()
        const val HISTORICAL_SAMPLE_COLOR = 0xFFFFA6C5.toInt()
        const val HOVER_COLOR = 0xFF71E6FF.toInt()
    }
}
