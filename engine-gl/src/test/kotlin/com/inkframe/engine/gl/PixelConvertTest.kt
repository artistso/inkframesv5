package com.inkframe.engine.gl

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Verifies the ARGB(top-down) <-> RGBA(bottom-up) conversions used by save/load, export,
 * and — critically — GL-context-loss backup/restore. The two functions must be exact
 * inverses, otherwise artwork would flip or shift colors after a display reset.
 */
class PixelConvertTest {

    private fun argb(a: Int, r: Int, g: Int, b: Int): Int =
        (a shl 24) or (r shl 16) or (g shl 8) or b

    @Test
    fun roundTrip_argbToRgbaAndBack_isIdentity() {
        val w = 5; val h = 3
        val src = IntArray(w * h) { i ->
            argb(a = (i * 7) and 0xFF, r = (i * 13) and 0xFF, g = (i * 17) and 0xFF, b = (i * 23) and 0xFF)
        }
        val rgba = PixelConvert.argbTopDownToRgbaBottomUp(src, w, h)
        val back = IntArray(w * h)
        PixelConvert.rgbaBottomUpToArgbTopDown(rgba, w, h, back)
        assertArrayEquals(src, back)
    }

    @Test
    fun bottomUpOrdering_isCorrect() {
        // 1x2 image: top row red, bottom row blue. After conversion to GL bottom-up, the
        // first row of bytes must be the BLUE (bottom) pixel.
        val w = 1; val h = 2
        val top = argb(0xFF, 0xFF, 0, 0)   // red
        val bottom = argb(0xFF, 0, 0, 0xFF) // blue
        val src = intArrayOf(top, bottom)   // index 0 = top row
        val rgba = PixelConvert.argbTopDownToRgbaBottomUp(src, w, h)
        // First emitted pixel (GL row 0 = bottom) should be blue: R=0,G=0,B=255,A=255
        assertEquals(0, rgba.get(0).toInt() and 0xFF)   // R
        assertEquals(0, rgba.get(1).toInt() and 0xFF)   // G
        assertEquals(255, rgba.get(2).toInt() and 0xFF) // B
        assertEquals(255, rgba.get(3).toInt() and 0xFF) // A
    }

    @Test
    fun preservesAlphaIncludingTransparent() {
        val w = 2; val h = 2
        val src = intArrayOf(
            argb(0, 10, 20, 30),      // fully transparent
            argb(128, 40, 50, 60),    // half alpha
            argb(255, 70, 80, 90),    // opaque
            argb(64, 100, 110, 120),
        )
        val rgba = PixelConvert.argbTopDownToRgbaBottomUp(src, w, h)
        val back = IntArray(w * h)
        PixelConvert.rgbaBottomUpToArgbTopDown(rgba, w, h, back)
        assertArrayEquals(src, back)
    }

    @Test
    fun simulatedReadPixelsRoundTrip() {
        // Simulate a GL surface: build an RGBA bottom-up buffer, convert to ARGB
        // (as backup does), then back to RGBA (as restore does), and confirm stability.
        val w = 4; val h = 4
        val rowBytes = w * 4
        val rgbaIn = ByteBuffer.allocateDirect(rowBytes * h).order(ByteOrder.nativeOrder())
        for (i in 0 until w * h * 4) rgbaIn.put((i % 256).toByte())
        rgbaIn.position(0)

        val argb = IntArray(w * h)
        PixelConvert.rgbaBottomUpToArgbTopDown(rgbaIn, w, h, argb)
        val rgbaOut = PixelConvert.argbTopDownToRgbaBottomUp(argb, w, h)

        val a = ByteArray(rowBytes * h).also { rgbaIn.position(0); rgbaIn.get(it) }
        val b = ByteArray(rowBytes * h).also { rgbaOut.position(0); rgbaOut.get(it) }
        assertArrayEquals(a, b)
    }
}
