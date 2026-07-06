package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BrushAdjustmentsTest {

    private val base = DefaultBrushes.round

    @Test
    fun withSize_clampsToRange() {
        assertEquals(512f, BrushAdjustments.withSize(base, 9999f).sizePx, 0f)
        assertEquals(1f, BrushAdjustments.withSize(base, -5f).sizePx, 0f)
        assertEquals(50f, BrushAdjustments.withSize(base, 50f).sizePx, 0f)
    }

    @Test
    fun withSize_lowersMinSizeWhenItWouldExceedNewSize() {
        val big = base.copy(sizePx = 100f, minSizePx = 80f)
        val shrunk = BrushAdjustments.withSize(big, 40f)
        assertEquals(40f, shrunk.sizePx, 0f)
        assertEquals("minSize must not exceed size", 40f, shrunk.minSizePx, 0f)
    }

    @Test
    fun withSize_keepsMinSizeWhenStillValid() {
        val b = base.copy(sizePx = 50f, minSizePx = 10f)
        val grown = BrushAdjustments.withSize(b, 80f)
        assertEquals(10f, grown.minSizePx, 0f)
    }

    @Test
    fun withMinSize_neverExceedsSize() {
        val b = base.copy(sizePx = 30f, minSizePx = 2f)
        val r = BrushAdjustments.withMinSize(b, 100f)
        assertEquals(30f, r.minSizePx, 0f)
    }

    @Test
    fun opacityFlowHardness_clampZeroToOne() {
        assertEquals(1f, BrushAdjustments.withOpacity(base, 5f).opacity, 0f)
        assertEquals(0f, BrushAdjustments.withOpacity(base, -1f).opacity, 0f)
        assertEquals(0.5f, BrushAdjustments.withFlow(base, 0.5f).flow, 0f)
        assertEquals(1f, BrushAdjustments.withHardness(base, 2f).hardness, 0f)
    }

    @Test
    fun spacing_clampsToMinimumNonZero() {
        // Spacing of 0 would mean infinite dabs; floor protects the engine.
        val r = BrushAdjustments.withSpacing(base, 0f)
        assertTrue(r.spacing >= BrushAdjustments.SPACING_RANGE.start)
        assertEquals(0.01f, r.spacing, 1e-6f)
        assertEquals(1f, BrushAdjustments.withSpacing(base, 9f).spacing, 0f)
    }

    @Test
    fun smoothing_clampsToMax() {
        assertEquals(0.95f, BrushAdjustments.withSmoothing(base, 1f).smoothing, 0f)
        assertEquals(0f, BrushAdjustments.withSmoothing(base, -1f).smoothing, 0f)
    }

    @Test
    fun toggleFlags() {
        assertTrue(BrushAdjustments.withPressureToSize(base, true).pressureToSize)
        assertFalse(BrushAdjustments.withPressureToSize(base, false).pressureToSize)
        assertTrue(BrushAdjustments.withPressureToOpacity(base, true).pressureToOpacity)
        assertTrue(BrushAdjustments.withBuildUp(base, true).buildUp)
    }

    @Test
    fun resetToDefault_restoresFactoryParams() {
        val tweaked = base.copy(sizePx = 200f, opacity = 0.1f, hardness = 0.05f)
        val reset = BrushAdjustments.resetToDefault(tweaked)
        assertEquals(DefaultBrushes.round, reset)
    }

    @Test
    fun resetToDefault_unknownIdReturnsSame() {
        val custom = base.copy(id = "custom-123", sizePx = 99f)
        assertEquals(custom, BrushAdjustments.resetToDefault(custom))
    }

    @Test
    fun adjustments_preserveIdentityFields() {
        val r = BrushAdjustments.withOpacity(base, 0.3f)
        assertEquals(base.id, r.id)
        assertEquals(base.name, r.name)
        assertEquals(base.kind, r.kind)
    }

    @Test
    fun chainedEdits_produceValidBrush() {
        var b = base
        b = BrushAdjustments.withSize(b, 300f)
        b = BrushAdjustments.withMinSize(b, 250f)
        b = BrushAdjustments.withOpacity(b, 0.6f)
        b = BrushAdjustments.withSpacing(b, 0.2f)
        b = BrushAdjustments.withSmoothing(b, 0.5f)
        assertTrue(b.minSizePx <= b.sizePx)
        assertTrue(b.opacity in 0f..1f)
        assertTrue(b.spacing in BrushAdjustments.SPACING_RANGE)
        // diameterForPressure stays within [min, size] across pressures.
        for (p in listOf(0f, 0.5f, 1f)) {
            val d = b.diameterForPressure(p)
            assertTrue(d in b.minSizePx..b.sizePx)
        }
    }
}
