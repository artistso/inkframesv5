package com.inkframe.studio.nativeink

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeCanvasDocumentTest {
    private val style = NativeBrushStyle(color = 0xFF112233.toInt(), sizePx = 12f)

    @Test
    fun commitUndoAndRedoPreserveStrokeContent() {
        val document = NativeCanvasDocument()
        val stroke = listOf(sample(1f), sample(2f), sample(3f))

        assertTrue(document.commit(stroke, style, eraser = false))
        assertEquals(1, document.snapshot().strokeCount)
        assertEquals(3, document.snapshot().sampleCount)

        assertTrue(document.undo())
        assertEquals(0, document.snapshot().strokeCount)
        assertTrue(document.snapshot().canRedo)

        assertTrue(document.redo())
        assertEquals(stroke, document.snapshot().strokes.single().samples)
        assertFalse(document.snapshot().canRedo)
    }

    @Test
    fun newStrokeAfterUndoClearsRedoBranch() {
        val document = NativeCanvasDocument()
        document.commit(listOf(sample(1f)), style, eraser = false)
        document.commit(listOf(sample(2f)), style, eraser = false)
        assertTrue(document.undo())
        assertTrue(document.snapshot().canRedo)

        document.commit(listOf(sample(3f)), style, eraser = true)

        assertFalse(document.snapshot().canRedo)
        assertEquals(2, document.snapshot().strokeCount)
        assertTrue(document.snapshot().strokes.last().eraser)
    }

    @Test
    fun emptyStrokeIsRejected() {
        val document = NativeCanvasDocument()

        assertFalse(document.commit(emptyList(), style, eraser = false))
        assertEquals(0, document.snapshot().strokeCount)
    }

    @Test
    fun oldestCommittedGeometryIsTrimmedToBounds() {
        val document = NativeCanvasDocument(maximumStrokes = 2, maximumSamples = 4)
        document.commit(listOf(sample(1f), sample(2f)), style, eraser = false)
        document.commit(listOf(sample(3f), sample(4f)), style, eraser = false)
        document.commit(listOf(sample(5f), sample(6f)), style, eraser = false)

        val snapshot = document.snapshot()
        assertEquals(2, snapshot.strokeCount)
        assertEquals(4, snapshot.sampleCount)
        assertEquals(3f, snapshot.strokes.first().samples.first().x)
    }

    @Test
    fun clearResetsUndoAndRedo() {
        val document = NativeCanvasDocument()
        document.commit(listOf(sample(1f)), style, eraser = false)
        document.undo()

        document.clear()

        val snapshot = document.snapshot()
        assertEquals(0, snapshot.strokeCount)
        assertFalse(snapshot.canUndo)
        assertFalse(snapshot.canRedo)
    }

    private fun sample(x: Float): InkSample = InkSample(
        x = x,
        y = x + 1f,
        pressure = 0.5f,
        tiltRadians = 0f,
        orientationRadians = 0f,
        distance = 0f,
        eventTimeMillis = x.toLong(),
        receivedUptimeMillis = x.toLong(),
        tool = InkTool.STYLUS,
        phase = InkPhase.CONTACT,
        historical = false,
        buttonState = 0,
    )
}
