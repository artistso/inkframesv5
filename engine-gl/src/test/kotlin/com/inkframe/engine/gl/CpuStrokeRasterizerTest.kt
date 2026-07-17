package com.inkframe.engine.gl

import com.inkframe.core.common.IntRect
import com.inkframe.core.common.Vec2
import com.inkframe.core.model.DefaultBrushes
import com.inkframe.core.model.RgbaColor
import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CpuStrokeRasterizerTest {
    @Test
    fun paintDabWritesVisibleCenterAndLeavesOutsideTransparent() {
        val out = CpuStrokeRasterizer.commit(
            baseBottomUpRgba = ByteBuffer.allocateDirect(10 * 10 * 4),
            topRect = IntRect(0, 0, 10, 10),
            brush = DefaultBrushes.pencil.copy(sizePx = 6f, pressureToSize = false),
            color = RgbaColor.BLACK,
            opacity = 1f,
            erase = false,
            dabs = listOf(Dab(Vec2(5f, 5f), 6f, 0f, 1f)),
        )
        assertTrue(alphaAtTopDown(out, 10, 10, 5, 5) > 0)
        assertEquals(0, alphaAtTopDown(out, 10, 10, 0, 0))
    }

    @Test
    fun eraserDabReducesExistingAlpha() {
        val base = ByteBuffer.allocateDirect(10 * 10 * 4)
        repeat(10 * 10) {
            base.put(0).put(0).put(0).put(0xFF.toByte())
        }
        base.position(0)
        val out = CpuStrokeRasterizer.commit(
            baseBottomUpRgba = base,
            topRect = IntRect(0, 0, 10, 10),
            brush = DefaultBrushes.eraser.copy(sizePx = 6f, pressureToSize = false),
            color = RgbaColor.BLACK,
            opacity = 1f,
            erase = true,
            dabs = listOf(Dab(Vec2(5f, 5f), 6f, 0f, 1f)),
        )
        assertTrue(alphaAtTopDown(out, 10, 10, 5, 5) < 255)
        assertEquals(255, alphaAtTopDown(out, 10, 10, 0, 0))
    }

    private fun alphaAtTopDown(buffer: ByteBuffer, width: Int, height: Int, x: Int, y: Int): Int {
        val bottomRow = height - 1 - y
        return buffer.get((bottomRow * width + x) * 4 + 3).toInt() and 0xFF
    }
}
