package com.inkframe.studio.nativeink

import java.util.Locale
import kotlin.math.max
import kotlin.math.min

/** Event-driven telemetry for the native ink laboratory. */
class InkMetrics {
    private var totalSamples = 0L
    private var contactSamples = 0L
    private var hoverSamples = 0L
    private var historicalSamples = 0L
    private var stylusSamples = 0L
    private var eraserSamples = 0L
    private var completedStrokes = 0L
    private var cancelledStrokes = 0L
    private var ignoredTouchEvents = 0L
    private var pressureTotal = 0.0
    private var minimumPressure = Float.POSITIVE_INFINITY
    private var maximumPressure = Float.NEGATIVE_INFINITY
    private var latencyTotalMillis = 0.0
    private var maximumLatencyMillis = 0L
    private var firstContactTimeMillis: Long? = null
    private var lastContactTimeMillis: Long? = null

    fun record(sample: InkSample) {
        totalSamples += 1
        if (sample.historical) historicalSamples += 1
        when (sample.phase) {
            InkPhase.CONTACT -> {
                contactSamples += 1
                val pressure = sample.pressure.coerceIn(0f, 1f)
                pressureTotal += pressure
                minimumPressure = min(minimumPressure, pressure)
                maximumPressure = max(maximumPressure, pressure)
                firstContactTimeMillis = firstContactTimeMillis ?: sample.eventTimeMillis
                lastContactTimeMillis = sample.eventTimeMillis
            }
            InkPhase.HOVER -> hoverSamples += 1
        }
        when (sample.tool) {
            InkTool.STYLUS -> stylusSamples += 1
            InkTool.ERASER -> eraserSamples += 1
            else -> Unit
        }
        val latency = sample.deliveryLatencyMillis
        latencyTotalMillis += latency
        maximumLatencyMillis = max(maximumLatencyMillis, latency)
    }

    fun completeStroke(cancelled: Boolean) {
        if (cancelled) cancelledStrokes += 1 else completedStrokes += 1
    }

    fun ignoreTouchEvent() {
        ignoredTouchEvents += 1
    }

    fun reset() {
        totalSamples = 0
        contactSamples = 0
        hoverSamples = 0
        historicalSamples = 0
        stylusSamples = 0
        eraserSamples = 0
        completedStrokes = 0
        cancelledStrokes = 0
        ignoredTouchEvents = 0
        pressureTotal = 0.0
        minimumPressure = Float.POSITIVE_INFINITY
        maximumPressure = Float.NEGATIVE_INFINITY
        latencyTotalMillis = 0.0
        maximumLatencyMillis = 0
        firstContactTimeMillis = null
        lastContactTimeMillis = null
    }

    fun snapshot(): InkMetricsSnapshot {
        val contactCount = contactSamples.coerceAtLeast(1L)
        val durationMillis = ((lastContactTimeMillis ?: 0L) - (firstContactTimeMillis ?: 0L)).coerceAtLeast(0L)
        val rateHz = if (contactSamples > 1 && durationMillis > 0) {
            (contactSamples - 1).toDouble() * 1000.0 / durationMillis.toDouble()
        } else {
            0.0
        }
        return InkMetricsSnapshot(
            totalSamples = totalSamples,
            contactSamples = contactSamples,
            hoverSamples = hoverSamples,
            historicalSamples = historicalSamples,
            stylusSamples = stylusSamples,
            eraserSamples = eraserSamples,
            completedStrokes = completedStrokes,
            cancelledStrokes = cancelledStrokes,
            ignoredTouchEvents = ignoredTouchEvents,
            minimumPressure = if (minimumPressure.isFinite()) minimumPressure else 0f,
            maximumPressure = if (maximumPressure.isFinite()) maximumPressure else 0f,
            averagePressure = if (contactSamples > 0) (pressureTotal / contactCount).toFloat() else 0f,
            averageDeliveryLatencyMillis = if (totalSamples > 0) latencyTotalMillis / totalSamples else 0.0,
            maximumDeliveryLatencyMillis = maximumLatencyMillis,
            approximateContactRateHz = rateHz,
        )
    }
}

data class InkMetricsSnapshot(
    val totalSamples: Long,
    val contactSamples: Long,
    val hoverSamples: Long,
    val historicalSamples: Long,
    val stylusSamples: Long,
    val eraserSamples: Long,
    val completedStrokes: Long,
    val cancelledStrokes: Long,
    val ignoredTouchEvents: Long,
    val minimumPressure: Float,
    val maximumPressure: Float,
    val averagePressure: Float,
    val averageDeliveryLatencyMillis: Double,
    val maximumDeliveryLatencyMillis: Long,
    val approximateContactRateHz: Double,
) {
    fun compactText(): String = buildString {
        append("Samples ").append(totalSamples)
        append(" · contact ").append(contactSamples)
        append(" · historical ").append(historicalSamples)
        append(" · hover ").append(hoverSamples)
        append('\n')
        append("Strokes ").append(completedStrokes)
        append(" · cancelled ").append(cancelledStrokes)
        append(" · palms ignored ").append(ignoredTouchEvents)
        append('\n')
        append(String.format(Locale.US, "Pressure %.3f avg · %.3f–%.3f", averagePressure, minimumPressure, maximumPressure))
        append('\n')
        append(String.format(Locale.US, "Delivery %.2f ms avg · %d ms max · %.1f Hz", averageDeliveryLatencyMillis, maximumDeliveryLatencyMillis, approximateContactRateHz))
        append('\n')
        append("Stylus ").append(stylusSamples).append(" · eraser ").append(eraserSamples)
    }

    fun reportText(): String = buildString {
        appendLine("InkFrame Native Ink Laboratory")
        appendLine("totalSamples=$totalSamples")
        appendLine("contactSamples=$contactSamples")
        appendLine("historicalSamples=$historicalSamples")
        appendLine("hoverSamples=$hoverSamples")
        appendLine("stylusSamples=$stylusSamples")
        appendLine("eraserSamples=$eraserSamples")
        appendLine("completedStrokes=$completedStrokes")
        appendLine("cancelledStrokes=$cancelledStrokes")
        appendLine("ignoredTouchEvents=$ignoredTouchEvents")
        appendLine(String.format(Locale.US, "minimumPressure=%.5f", minimumPressure))
        appendLine(String.format(Locale.US, "maximumPressure=%.5f", maximumPressure))
        appendLine(String.format(Locale.US, "averagePressure=%.5f", averagePressure))
        appendLine(String.format(Locale.US, "averageDeliveryLatencyMillis=%.3f", averageDeliveryLatencyMillis))
        appendLine("maximumDeliveryLatencyMillis=$maximumDeliveryLatencyMillis")
        appendLine(String.format(Locale.US, "approximateContactRateHz=%.2f", approximateContactRateHz))
    }
}
