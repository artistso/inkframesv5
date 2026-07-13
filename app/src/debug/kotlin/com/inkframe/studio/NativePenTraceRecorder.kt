package com.inkframe.studio

import java.util.Locale

/**
 * Pure Kotlin buffer for the latest native stylus stroke.
 *
 * Android MotionEvent extraction lives in [NativePenMotionCapture]. Keeping the
 * buffer Android-free makes truncation, ordering, markers, and JSON output
 * deterministic under ordinary JVM tests.
 */
internal class NativePenTraceRecorder(
    private val maxSamples: Int = 8192,
    private val maxMarkers: Int = 64,
) {
    init {
        require(maxSamples > 0) { "maxSamples must be positive" }
        require(maxMarkers > 0) { "maxMarkers must be positive" }
    }

    private val dispatches = ArrayDeque<NativePenDispatch>()
    private val markers = ArrayDeque<NativeWebMarker>()
    private var nextStrokeId = 0L
    private var currentStrokeId = 0L
    private var active = false
    private var storedSamples = 0
    private var observedSamples = 0L
    private var truncatedSamples = 0L
    private var duplicateCandidates = 0L
    private var lastFingerprint: String? = null

    @Synchronized
    fun record(dispatch: NativePenDispatch) {
        if (dispatch.samples.isEmpty()) return

        if (dispatch.actionMasked == ACTION_DOWN || currentStrokeId == 0L) {
            resetForNewStroke()
            currentStrokeId = ++nextStrokeId
            active = true
        } else if (!active) {
            // Preserve a diagnostic trace even when Android starts delivering a
            // contact sequence without a visible ACTION_DOWN.
            resetForNewStroke()
            currentStrokeId = ++nextStrokeId
            active = true
        }

        val stamped = dispatch.copy(strokeId = currentStrokeId)
        for (sample in stamped.samples) {
            observedSamples++
            val fingerprint = sample.fingerprint()
            if (fingerprint == lastFingerprint) duplicateCandidates++
            lastFingerprint = fingerprint
        }
        dispatches.addLast(stamped)
        storedSamples += stamped.samples.size
        trimToCapacity()

        if (dispatch.actionMasked == ACTION_UP || dispatch.actionMasked == ACTION_CANCEL) {
            active = false
        }
    }

    @Synchronized
    fun markWebPhase(phase: String?, pointerId: Int, webTimeStamp: Double) {
        val cleanPhase = phase?.take(32)?.ifBlank { "unknown" } ?: "unknown"
        markers.addLast(
            NativeWebMarker(
                phase = cleanPhase,
                pointerId = pointerId,
                webTimeStamp = webTimeStamp,
                nativeStrokeId = currentStrokeId,
            )
        )
        while (markers.size > maxMarkers) markers.removeFirst()
    }

    @Synchronized
    fun clear() {
        dispatches.clear()
        markers.clear()
        currentStrokeId = 0L
        active = false
        storedSamples = 0
        observedSamples = 0L
        truncatedSamples = 0L
        duplicateCandidates = 0L
        lastFingerprint = null
    }

    @Synchronized
    fun snapshotJson(): String = buildString {
        append('{')
        field("schema", 1)
        comma(); field("strokeId", currentStrokeId)
        comma(); field("active", active)
        comma(); field("dispatches", dispatches.size)
        comma(); field("storedSamples", storedSamples)
        comma(); field("observedSamples", observedSamples)
        comma(); field("truncatedSamples", truncatedSamples)
        comma(); field("duplicateCandidates", duplicateCandidates)
        comma(); append("\"webMarkers\":[")
        markers.forEachIndexed { index, marker ->
            if (index > 0) comma()
            markerJson(marker)
        }
        append(']')
        comma(); append("\"nativeDispatches\":[")
        dispatches.forEachIndexed { index, dispatch ->
            if (index > 0) comma()
            dispatchJson(dispatch)
        }
        append(']')
        append('}')
    }

    private fun resetForNewStroke() {
        dispatches.clear()
        markers.clear()
        active = false
        storedSamples = 0
        observedSamples = 0L
        truncatedSamples = 0L
        duplicateCandidates = 0L
        lastFingerprint = null
    }

    private fun trimToCapacity() {
        while (storedSamples > maxSamples && dispatches.isNotEmpty()) {
            val removed = dispatches.removeFirst()
            storedSamples -= removed.samples.size
            truncatedSamples += removed.samples.size
        }
    }

    private fun StringBuilder.dispatchJson(dispatch: NativePenDispatch) {
        append('{')
        field("strokeId", dispatch.strokeId)
        comma(); field("dispatchSequence", dispatch.dispatchSequence)
        comma(); field("actionMasked", dispatch.actionMasked)
        comma(); field("actionIndex", dispatch.actionIndex)
        comma(); field("downTimeMs", dispatch.downTimeMs)
        comma(); field("eventTimeMs", dispatch.eventTimeMs)
        comma(); field("buttonState", dispatch.buttonState)
        comma(); field("source", dispatch.source)
        comma(); field("deviceId", dispatch.deviceId)
        comma(); field("viewWidth", dispatch.viewWidth)
        comma(); field("viewHeight", dispatch.viewHeight)
        comma(); field("density", dispatch.density)
        comma(); field("historySize", dispatch.historySize)
        comma(); append("\"samples\":[")
        dispatch.samples.forEachIndexed { index, sample ->
            if (index > 0) comma()
            sampleJson(sample)
        }
        append(']')
        append('}')
    }

    private fun StringBuilder.sampleJson(sample: NativePenSample) {
        append('{')
        field("pointerId", sample.pointerId)
        comma(); field("toolType", sample.toolType)
        comma(); field("historical", sample.historical)
        comma(); field("historyIndex", sample.historyIndex)
        comma(); field("eventTimeMs", sample.eventTimeMs)
        comma(); field("x", sample.x)
        comma(); field("y", sample.y)
        comma(); field("pressure", sample.pressure)
        comma(); field("tilt", sample.tilt)
        comma(); field("orientation", sample.orientation)
        comma(); field("size", sample.size)
        comma(); field("touchMajor", sample.touchMajor)
        comma(); field("touchMinor", sample.touchMinor)
        comma(); field("toolMajor", sample.toolMajor)
        comma(); field("toolMinor", sample.toolMinor)
        append('}')
    }

    private fun StringBuilder.markerJson(marker: NativeWebMarker) {
        append('{')
        field("phase", marker.phase)
        comma(); field("pointerId", marker.pointerId)
        comma(); field("webTimeStamp", marker.webTimeStamp)
        comma(); field("nativeStrokeId", marker.nativeStrokeId)
        append('}')
    }

    private fun StringBuilder.field(name: String, value: String) {
        append('"').append(jsonEscape(name)).append("\":\"").append(jsonEscape(value)).append('"')
    }

    private fun StringBuilder.field(name: String, value: Boolean) {
        append('"').append(jsonEscape(name)).append("\":").append(value)
    }

    private fun StringBuilder.field(name: String, value: Int) {
        append('"').append(jsonEscape(name)).append("\":").append(value)
    }

    private fun StringBuilder.field(name: String, value: Long) {
        append('"').append(jsonEscape(name)).append("\":").append(value)
    }

    private fun StringBuilder.field(name: String, value: Float) {
        append('"').append(jsonEscape(name)).append("\":").append(jsonNumber(value.toDouble()))
    }

    private fun StringBuilder.field(name: String, value: Double) {
        append('"').append(jsonEscape(name)).append("\":").append(jsonNumber(value))
    }

    private fun StringBuilder.comma() { append(',') }

    private fun jsonNumber(value: Double): String =
        if (value.isFinite()) String.format(Locale.US, "%.7g", value) else "null"

    private fun jsonEscape(value: String): String = buildString(value.length + 8) {
        value.forEach { ch ->
            when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (ch.code < 0x20) append("\\u%04x".format(ch.code)) else append(ch)
            }
        }
    }

    private companion object {
        const val ACTION_DOWN = 0
        const val ACTION_UP = 1
        const val ACTION_CANCEL = 3
    }
}

internal data class NativePenDispatch(
    val strokeId: Long = 0,
    val dispatchSequence: Long,
    val actionMasked: Int,
    val actionIndex: Int,
    val downTimeMs: Long,
    val eventTimeMs: Long,
    val buttonState: Int,
    val source: Int,
    val deviceId: Int,
    val viewWidth: Int,
    val viewHeight: Int,
    val density: Float,
    val historySize: Int,
    val samples: List<NativePenSample>,
)

internal data class NativePenSample(
    val pointerId: Int,
    val toolType: Int,
    val historical: Boolean,
    val historyIndex: Int,
    val eventTimeMs: Long,
    val x: Float,
    val y: Float,
    val pressure: Float,
    val tilt: Float,
    val orientation: Float,
    val size: Float,
    val touchMajor: Float,
    val touchMinor: Float,
    val toolMajor: Float,
    val toolMinor: Float,
) {
    fun fingerprint(): String = buildString {
        append(pointerId).append(':').append(eventTimeMs).append(':')
        append(x.toRawBits()).append(':').append(y.toRawBits()).append(':')
        append(pressure.toRawBits()).append(':').append(toolType)
    }
}

internal data class NativeWebMarker(
    val phase: String,
    val pointerId: Int,
    val webTimeStamp: Double,
    val nativeStrokeId: Long,
)
