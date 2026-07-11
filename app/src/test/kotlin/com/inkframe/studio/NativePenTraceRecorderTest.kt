package com.inkframe.studio

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativePenTraceRecorderTest {
    @Test
    fun recordsLatestStrokeMarkersAndTerminalState() {
        val recorder = NativePenTraceRecorder(maxSamples = 16, maxMarkers = 8)
        recorder.record(dispatch(action = 0, sequence = 1, sample = sample(time = 100, x = 10f)))
        recorder.markWebPhase("begin", 7, 4.5)
        recorder.record(dispatch(action = 2, sequence = 2, sample = sample(time = 108, x = 20f)))
        recorder.markWebPhase("pointerup", 7, 12.5)
        recorder.record(dispatch(action = 1, sequence = 3, sample = sample(time = 116, x = 24f)))

        val json = recorder.snapshotJson()
        assertTrue(json.contains("\"schema\":1"))
        assertTrue(json.contains("\"strokeId\":1"))
        assertTrue(json.contains("\"active\":false"))
        assertTrue(json.contains("\"dispatches\":3"))
        assertTrue(json.contains("\"storedSamples\":3"))
        assertTrue(json.contains("\"phase\":\"begin\""))
        assertTrue(json.contains("\"phase\":\"pointerup\""))
        assertTrue(json.contains("\"x\":24"))
    }

    @Test
    fun truncatesWholeDispatchesAndCountsDuplicateCandidates() {
        val recorder = NativePenTraceRecorder(maxSamples = 2, maxMarkers = 4)
        val repeated = sample(time = 100, x = 10f)
        recorder.record(dispatch(action = 0, sequence = 1, sample = repeated))
        recorder.record(dispatch(action = 2, sequence = 2, sample = repeated))
        recorder.record(dispatch(action = 2, sequence = 3, sample = sample(time = 108, x = 30f)))

        val json = recorder.snapshotJson()
        assertTrue(json.contains("\"storedSamples\":2"))
        assertTrue(json.contains("\"observedSamples\":3"))
        assertTrue(json.contains("\"truncatedSamples\":1"))
        assertTrue(json.contains("\"duplicateCandidates\":1"))
        assertFalse(json.contains("\"dispatchSequence\":1"))
    }

    @Test
    fun newDownReplacesThePreviousStroke() {
        val recorder = NativePenTraceRecorder()
        recorder.record(dispatch(action = 0, sequence = 1, sample = sample(time = 10, x = 1f)))
        recorder.record(dispatch(action = 1, sequence = 2, sample = sample(time = 20, x = 2f)))
        recorder.record(dispatch(action = 0, sequence = 3, sample = sample(time = 30, x = 99f)))

        val json = recorder.snapshotJson()
        assertTrue(json.contains("\"strokeId\":2"))
        assertTrue(json.contains("\"dispatches\":1"))
        assertTrue(json.contains("\"x\":99"))
        assertFalse(json.contains("\"x\":1,"))
    }

    private fun dispatch(
        action: Int,
        sequence: Long,
        sample: NativePenSample,
    ) = NativePenDispatch(
        dispatchSequence = sequence,
        actionMasked = action,
        actionIndex = 0,
        downTimeMs = 100,
        eventTimeMs = sample.eventTimeMs,
        buttonState = 0,
        source = 0x4002,
        deviceId = 4,
        viewWidth = 1600,
        viewHeight = 1000,
        density = 2f,
        historySize = if (sample.historical) 1 else 0,
        samples = listOf(sample),
    )

    private fun sample(
        time: Long,
        x: Float,
        historical: Boolean = false,
    ) = NativePenSample(
        pointerId = 7,
        toolType = 2,
        historical = historical,
        historyIndex = if (historical) 0 else -1,
        eventTimeMs = time,
        x = x,
        y = 20f,
        pressure = 0.5f,
        tilt = 0.2f,
        orientation = 0.1f,
        size = 0.01f,
        touchMajor = 2f,
        touchMinor = 1f,
        toolMajor = 3f,
        toolMinor = 1.5f,
    )
}
