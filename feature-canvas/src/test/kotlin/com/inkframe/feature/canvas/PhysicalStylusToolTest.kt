package com.inkframe.feature.canvas

import android.view.MotionEvent
import com.inkframe.core.model.BrushKind
import com.inkframe.core.model.DefaultBrushes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class PhysicalStylusToolTest {
    @Test
    fun eraserToolSelectsTemporaryEraserBrush() {
        val result = brushForStylusTool(DefaultBrushes.ink, MotionEvent.TOOL_TYPE_ERASER)
        assertEquals(BrushKind.ERASER, result.kind)
        assertEquals(DefaultBrushes.eraser.id, result.id)
    }

    @Test
    fun stylusTipKeepsSelectedBrush() {
        val selected = DefaultBrushes.pencil
        val result = brushForStylusTool(selected, MotionEvent.TOOL_TYPE_STYLUS)
        assertSame(selected, result)
    }

    @Test
    fun fingerKeepsSelectedBrush() {
        val selected = DefaultBrushes.marker
        val result = brushForStylusTool(selected, MotionEvent.TOOL_TYPE_FINGER)
        assertSame(selected, result)
    }

    @Test
    fun physicalEraserDetectionIsExact() {
        assertTrue(isPhysicalEraserTool(MotionEvent.TOOL_TYPE_ERASER))
        assertFalse(isPhysicalEraserTool(MotionEvent.TOOL_TYPE_STYLUS))
    }
}
