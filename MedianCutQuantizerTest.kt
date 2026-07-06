package com.inkframe.core.common.gif

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MedianCutQuantizerTest {

    private fun opaque(rgb: Int) = 0xFF000000.toInt() or rgb

    @Test
    fun fewColors_paletteCoversThemExactly() {
        val px = intArrayOf(
            opaque(0xFF0000), opaque(0x00FF00), opaque(0x0000FF), opaque(0xFF0000),
        )
        val r = MedianCutQuantizer.quantize(px, maxColors = 16)
        assertTrue("expected <= 16 colors", r.colorCount <= 16)
        // Every pixel maps to a palette entry close to its original color.
        for (i in px.indices) {
            val idx = r.indices[i].toInt() and 0xFF
            val pc = r.palette[idx]
            assertTrue(colorDist(px[i] and 0xFFFFFF, pc) < 16)
        }
    }

    @Test
    fun respectsMaxColorBudget() {
        // 300 distinct colors must be reduced to <= 64.
        val px = IntArray(300) { opaque((it * 0x010101) and 0xFFFFFF) }
        val r = MedianCutQuantizer.quantize(px, maxColors = 64)
        assertTrue("palette ${r.colorCount} exceeds budget", r.colorCount <= 64)
        assertEquals(px.size, r.indices.size)
    }

    @Test
    fun transparencyGetsReservedIndex() {
        val px = intArrayOf(0x00000000, opaque(0xFF0000), opaque(0x00FF00))
        val r = MedianCutQuantizer.quantize(px, maxColors = 8)
        assertEquals("transparent pixel -> transparent index", r.transparentIndex.toByte(), r.indices[0])
        assertTrue(r.transparentIndex >= 0)
    }

    @Test
    fun noTransparency_whenAllOpaque() {
        val px = intArrayOf(opaque(0x112233), opaque(0x445566))
        val r = MedianCutQuantizer.quantize(px, maxColors = 8)
        assertEquals(-1, r.transparentIndex)
    }

    @Test
    fun bitsPerPixel_isCeilLog2() {
        val twoColor = MedianCutQuantizer.quantize(intArrayOf(opaque(0), opaque(0xFFFFFF)), 2)
        assertTrue(twoColor.bitsPerPixel >= 1)
        val many = MedianCutQuantizer.quantize(IntArray(64) { opaque(it * 0x040404) }, 64)
        assertTrue("bpp should cover palette", (1 shl many.bitsPerPixel) >= many.colorCount)
    }

    @Test
    fun singleColorImage_quantizesToOneEntry() {
        val px = IntArray(100) { opaque(0x8040C0) }
        val r = MedianCutQuantizer.quantize(px, 256)
        // All indices identical; palette color near the source.
        val first = r.indices[0]
        assertTrue(r.indices.all { it == first })
        assertTrue(colorDist(0x8040C0, r.palette[first.toInt() and 0xFF]) < 8)
    }

    private fun colorDist(a: Int, b: Int): Int {
        val dr = ((a shr 16) and 0xFF) - ((b shr 16) and 0xFF)
        val dg = ((a shr 8) and 0xFF) - ((b shr 8) and 0xFF)
        val db = (a and 0xFF) - (b and 0xFF)
        return dr * dr + dg * dg + db * db
    }
}
