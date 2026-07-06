package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ColorSamplerTest {

    private fun argb(a: Int, r: Int, g: Int, b: Int) = (a shl 24) or (r shl 16) or (g shl 8) or b

    // 2x2 image: TL red, TR green, BL blue, BR white (all opaque).
    private val w = 2
    private val h = 2
    private val img = intArrayOf(
        argb(255, 255, 0, 0), argb(255, 0, 255, 0),
        argb(255, 0, 0, 255), argb(255, 255, 255, 255),
    )

    @Test
    fun sampleAt_returnsExactPixel() {
        assertEquals(RgbaColor(1f, 0f, 0f), ColorSampler.sampleAt(img, w, h, 0, 0))
        assertEquals(RgbaColor(0f, 1f, 0f), ColorSampler.sampleAt(img, w, h, 1, 0))
        assertEquals(RgbaColor(0f, 0f, 1f), ColorSampler.sampleAt(img, w, h, 0, 1))
        assertEquals(RgbaColor(1f, 1f, 1f), ColorSampler.sampleAt(img, w, h, 1, 1))
    }

    @Test
    fun sampleAt_outOfBoundsReturnsNull() {
        assertNull(ColorSampler.sampleAt(img, w, h, -1, 0))
        assertNull(ColorSampler.sampleAt(img, w, h, 0, -1))
        assertNull(ColorSampler.sampleAt(img, w, h, 2, 0))
        assertNull(ColorSampler.sampleAt(img, w, h, 0, 2))
    }

    @Test
    fun sampleAt_preservesAlpha() {
        val withAlpha = intArrayOf(argb(128, 10, 20, 30))
        val c = ColorSampler.sampleAt(withAlpha, 1, 1, 0, 0)!!
        assertEquals(128 / 255f, c.a, 1e-3f)
    }

    @Test
    fun sampleAverage_radiusZeroEqualsSinglePixel() {
        val c = ColorSampler.sampleAverage(img, w, h, 1, 1, radius = 0)!!
        assertEquals(RgbaColor(1f, 1f, 1f), c)
    }

    @Test
    fun sampleAverage_blendsNeighbourhood() {
        // Whole 2x2 averaged: R=(255+0+0+255)/4=127.5, G=(0+255+0+255)/4=127.5, B likewise.
        val c = ColorSampler.sampleAverage(img, w, h, 0, 0, radius = 1)!!
        assertEquals(127.5f / 255f, c.r, 2e-3f)
        assertEquals(127.5f / 255f, c.g, 2e-3f)
        assertEquals(127.5f / 255f, c.b, 2e-3f)
    }

    @Test
    fun sampleAverage_skipsTransparentPixels() {
        // One opaque red surrounded by transparent: average should be pure red.
        val px = intArrayOf(
            argb(0, 0, 0, 0), argb(0, 0, 0, 0), argb(0, 0, 0, 0),
            argb(0, 0, 0, 0), argb(255, 200, 50, 25), argb(0, 0, 0, 0),
            argb(0, 0, 0, 0), argb(0, 0, 0, 0), argb(0, 0, 0, 0),
        )
        val c = ColorSampler.sampleAverage(px, 3, 3, 1, 1, radius = 1)!!
        assertEquals(200 / 255f, c.r, 1e-3f)
        assertEquals(50 / 255f, c.g, 1e-3f)
        assertEquals(25 / 255f, c.b, 1e-3f)
    }

    @Test
    fun sampleAverage_allTransparentReturnsNull() {
        val px = IntArray(9) { argb(0, 0, 0, 0) }
        assertNull(ColorSampler.sampleAverage(px, 3, 3, 1, 1, radius = 1))
    }

    @Test
    fun sampleAverage_clampsAtEdges() {
        // Near a corner the neighbourhood is partly off-canvas; still returns a value.
        val c = ColorSampler.sampleAverage(img, w, h, 0, 0, radius = 5)
        assertTrue(c != null)
    }

    @Test(expected = IllegalArgumentException::class)
    fun sampleAt_rejectsUndersizedArray() {
        ColorSampler.sampleAt(IntArray(2), 4, 4, 0, 0)
    }
}
