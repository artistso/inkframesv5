package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HsvTest {

    private val eps = 1e-3f
    private fun assertRgb(r: Float, g: Float, b: Float, c: RgbaColor) {
        assertEquals("r", r, c.r, eps)
        assertEquals("g", g, c.g, eps)
        assertEquals("b", b, c.b, eps)
    }

    @Test
    fun primaries_toRgb() {
        assertRgb(1f, 0f, 0f, Hsv(0f, 1f, 1f).toRgba())     // red
        assertRgb(0f, 1f, 0f, Hsv(120f, 1f, 1f).toRgba())   // green
        assertRgb(0f, 0f, 1f, Hsv(240f, 1f, 1f).toRgba())   // blue
        assertRgb(1f, 1f, 0f, Hsv(60f, 1f, 1f).toRgba())    // yellow
        assertRgb(0f, 1f, 1f, Hsv(180f, 1f, 1f).toRgba())   // cyan
        assertRgb(1f, 0f, 1f, Hsv(300f, 1f, 1f).toRgba())   // magenta
    }

    @Test
    fun greys_toRgb() {
        assertRgb(0f, 0f, 0f, Hsv(0f, 0f, 0f).toRgba())     // black
        assertRgb(1f, 1f, 1f, Hsv(0f, 0f, 1f).toRgba())     // white
        assertRgb(0.5f, 0.5f, 0.5f, Hsv(0f, 0f, 0.5f).toRgba()) // mid grey
    }

    @Test
    fun valueAndSaturationScaleColor() {
        // Half-value pure red -> (0.5, 0, 0)
        assertRgb(0.5f, 0f, 0f, Hsv(0f, 1f, 0.5f).toRgba())
        // Half-saturation full-value red -> (1, 0.5, 0.5)
        assertRgb(1f, 0.5f, 0.5f, Hsv(0f, 0.5f, 1f).toRgba())
    }

    @Test
    fun fromRgb_primaries() {
        val red = Hsv.fromRgba(RgbaColor(1f, 0f, 0f))
        assertEquals(0f, red.h, eps); assertEquals(1f, red.s, eps); assertEquals(1f, red.v, eps)
        val green = Hsv.fromRgba(RgbaColor(0f, 1f, 0f))
        assertEquals(120f, green.h, eps)
        val blue = Hsv.fromRgba(RgbaColor(0f, 0f, 1f))
        assertEquals(240f, blue.h, eps)
    }

    @Test
    fun fromRgb_greyHasZeroSaturation() {
        val grey = Hsv.fromRgba(RgbaColor(0.4f, 0.4f, 0.4f))
        assertEquals(0f, grey.s, eps)
        assertEquals(0.4f, grey.v, eps)
    }

    @Test
    fun roundTrip_rgbToHsvToRgb() {
        val samples = listOf(
            RgbaColor(0.2f, 0.7f, 0.5f),
            RgbaColor(0.9f, 0.1f, 0.6f),
            RgbaColor(0.13f, 0.55f, 0.95f),
            RgbaColor(0.98f, 0.75f, 0.18f),
            RgbaColor(0f, 0f, 0f),
            RgbaColor(1f, 1f, 1f),
        )
        for (c in samples) {
            val back = Hsv.fromRgba(c).toRgba()
            assertRgb(c.r, c.g, c.b, back)
        }
    }

    @Test
    fun roundTrip_preservesAlpha() {
        val c = RgbaColor(0.3f, 0.6f, 0.9f, 0.42f)
        assertEquals(0.42f, Hsv.fromRgba(c).a, eps)
        assertEquals(0.42f, Hsv.fromRgba(c).toRgba().a, eps)
    }

    @Test
    fun hueWraps() {
        assertEquals(10f, Hsv.wrapHue(370f), eps)
        assertEquals(350f, Hsv.wrapHue(-10f), eps)
        assertEquals(0f, Hsv.wrapHue(360f), eps)
        // 360 and 0 produce the same colour.
        assertRgb(1f, 0f, 0f, Hsv(360f, 1f, 1f).toRgba())
    }

    @Test
    fun mutatorsClampAndWrap() {
        val base = Hsv(180f, 0.5f, 0.5f)
        assertEquals(1f, base.withSaturation(5f).s, eps)
        assertEquals(0f, base.withValue(-1f).v, eps)
        assertEquals(30f, base.withHue(390f).h, eps)
        assertEquals(1f, base.withAlpha(2f).a, eps)
    }

    @Test
    fun normalized_clampsEverything() {
        val n = Hsv(400f, 2f, -1f, 5f).normalized()
        assertEquals(40f, n.h, eps)
        assertEquals(1f, n.s, eps)
        assertEquals(0f, n.v, eps)
        assertEquals(1f, n.a, eps)
    }

    @Test
    fun toArgbConsistencyWithRgba() {
        // HSV -> RGBA -> ARGB should match a hand-computed packed value for pure blue.
        val argb = Hsv(240f, 1f, 1f).toRgba().toArgb()
        assertEquals(0xFF0000FF.toInt(), argb)
    }
}
