package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class ColorAndBrushTest {

    @Test
    fun rgba_argbRoundTrip() {
        val c = RgbaColor(0.2f, 0.4f, 0.6f, 0.8f)
        val back = RgbaColor.fromArgb(c.toArgb())
        assertTrue(abs(back.r - c.r) < 0.01f)
        assertTrue(abs(back.g - c.g) < 0.01f)
        assertTrue(abs(back.b - c.b) < 0.01f)
        assertTrue(abs(back.a - c.a) < 0.01f)
    }

    @Test
    fun rgba_knownArgbValues() {
        assertEquals(0xFF000000.toInt(), RgbaColor.BLACK.toArgb())
        assertEquals(0xFFFFFFFF.toInt(), RgbaColor.WHITE.toArgb())
        assertEquals(0x00000000, RgbaColor.TRANSPARENT.toArgb())
    }

    @Test
    fun rgba_withAlphaClamps() {
        assertEquals(1f, RgbaColor.BLACK.withAlpha(5f).a)
        assertEquals(0f, RgbaColor.BLACK.withAlpha(-1f).a)
        assertEquals(0.5f, RgbaColor.BLACK.withAlpha(0.5f).a)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rgba_rejectsOutOfRange() {
        RgbaColor(1.2f, 0f, 0f)
    }

    @Test
    fun brush_pressureScalesSizeWithinBounds() {
        val b = Brush(id = "b", name = "B", sizePx = 100f, minSizePx = 10f, pressureToSize = true)
        assertEquals(10f, b.diameterForPressure(0f), 1e-3f)
        assertEquals(100f, b.diameterForPressure(1f), 1e-3f)
        assertEquals(55f, b.diameterForPressure(0.5f), 1e-3f)
        // Pressure outside 0..1 is clamped.
        assertEquals(100f, b.diameterForPressure(2f), 1e-3f)
    }

    @Test
    fun brush_pressureToSizeDisabledReturnsConstant() {
        val b = Brush(id = "b", name = "B", sizePx = 42f, pressureToSize = false)
        assertEquals(42f, b.diameterForPressure(0.1f), 1e-3f)
        assertEquals(42f, b.diameterForPressure(0.9f), 1e-3f)
    }

    @Test
    fun brush_flowFollowsPressureWhenEnabled() {
        // With pressureToOpacity, per-dab flow scales with pressure (whole-stroke
        // opacity is applied separately at composite time).
        val b = Brush(id = "b", name = "B", flow = 0.8f, pressureToOpacity = true)
        assertEquals(0.4f, b.flowForPressure(0.5f), 1e-3f)
        assertEquals(0.8f, b.flowForPressure(1f), 1e-3f)
    }

    @Test
    fun brush_flowConstantWhenPressureToOpacityDisabled() {
        val b = Brush(id = "b", name = "B", flow = 0.8f, pressureToOpacity = false)
        assertEquals(0.8f, b.flowForPressure(0.5f), 1e-3f)
        assertEquals(0.8f, b.flowForPressure(0.1f), 1e-3f)
    }

    @Test
    fun airbrush_isBuildUpButOthersAreNot() {
        assertTrue(DefaultBrushes.airbrush.buildUp)
        assertTrue(!DefaultBrushes.ink.buildUp)
        assertTrue(!DefaultBrushes.round.buildUp)
    }

    @Test
    fun defaultBrushes_allHaveUniqueIds() {
        val ids = DefaultBrushes.all.map { it.id }
        assertEquals(ids.size, ids.toSet().size)
    }
}
