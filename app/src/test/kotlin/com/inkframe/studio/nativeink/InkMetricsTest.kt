package com.inkframe.studio.nativeink

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InkMetricsTest {
    @Test
    fun recordsPressureHistoryLatencyAndRate() {
        val metrics = InkMetrics()
        metrics.record(sample(time = 1000, received = 1004, pressure = 0.25f, historical = true))
        metrics.record(sample(time = 1004, received = 1009, pressure = 0.75f, historical = false))
        metrics.completeStroke(cancelled = false)
        metrics.ignoreTouchEvent()

        val snapshot = metrics.snapshot()
        assertEquals(2, snapshot.totalSamples)
        assertEquals(2, snapshot.contactSamples)
        assertEquals(1, snapshot.historicalSamples)
        assertEquals(1, snapshot.completedStrokes)
        assertEquals(1, snapshot.ignoredTouchEvents)
        assertEquals(0.25f, snapshot.minimumPressure, 0.0001f)
        assertEquals(0.75f, snapshot.maximumPressure, 0.0001f)
        assertEquals(0.5f, snapshot.averagePressure, 0.0001f)
        assertEquals(4.5, snapshot.averageDeliveryLatencyMillis, 0.0001)
        assertEquals(5, snapshot.maximumDeliveryLatencyMillis)
        assertEquals(250.0, snapshot.approximateContactRateHz, 0.001)
        assertTrue(snapshot.reportText().contains("historicalSamples=1"))
    }

    @Test
    fun separatesHoverEraserAndCancellation() {
        val metrics = InkMetrics()
        metrics.record(sample(time = 20, received = 20, pressure = 0f, phase = InkPhase.HOVER))
        metrics.record(sample(time = 30, received = 31, pressure = 0.4f, tool = InkTool.ERASER))
        metrics.completeStroke(cancelled = true)

        val snapshot = metrics.snapshot()
        assertEquals(1, snapshot.hoverSamples)
        assertEquals(1, snapshot.contactSamples)
        assertEquals(1, snapshot.eraserSamples)
        assertEquals(1, snapshot.cancelledStrokes)
        assertEquals(0, snapshot.completedStrokes)
    }

    @Test
    fun resetRemovesAllAccumulatedState() {
        val metrics = InkMetrics()
        metrics.record(sample(time = 1, received = 3, pressure = 1f))
        metrics.completeStroke(cancelled = false)
        metrics.ignoreTouchEvent()
        metrics.reset()

        val snapshot = metrics.snapshot()
        assertEquals(0, snapshot.totalSamples)
        assertEquals(0, snapshot.completedStrokes)
        assertEquals(0, snapshot.ignoredTouchEvents)
        assertEquals(0f, snapshot.averagePressure, 0f)
        assertEquals(0.0, snapshot.approximateContactRateHz, 0.0)
    }

    private fun sample(
        time: Long,
        received: Long,
        pressure: Float,
        historical: Boolean = false,
        tool: InkTool = InkTool.STYLUS,
        phase: InkPhase = InkPhase.CONTACT,
    ) = InkSample(
        x = 10f,
        y = 20f,
        pressure = pressure,
        tiltRadians = 0.1f,
        orientationRadians = 0.2f,
        distance = 0f,
        eventTimeMillis = time,
        receivedUptimeMillis = received,
        tool = tool,
        phase = phase,
        historical = historical,
        buttonState = 0,
    )
}
