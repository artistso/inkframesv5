package com.inkframe.studio.brush

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BrushEngineTest {
    @Test
    fun profileSanitizationClampsUnsafeValues() {
        val profile = BrushEngine.BrushProfile(
            spacing = -1f,
            size = 10_000f,
            minSize = -20f,
            maxSize = 4f,
            opacity = 2f,
            minOpacity = 2f,
            flow = -1f,
            softness = 9f,
            pressureSize = 7f,
            stampCap = 2,
        ).sanitized()

        assertEquals(0.04f, profile.spacing, 0.0001f)
        assertEquals(0.1f, profile.minSize, 0.0001f)
        assertEquals(4f, profile.maxSize, 0.0001f)
        assertEquals(4f, profile.size, 0.0001f)
        assertEquals(1f, profile.opacity, 0.0001f)
        assertEquals(1f, profile.minOpacity, 0.0001f)
        assertEquals(0f, profile.flow, 0.0001f)
        assertEquals(1f, profile.softness, 0.0001f)
        assertEquals(1f, profile.pressureSize, 0.0001f)
        assertEquals(8, profile.stampCap)
    }

    @Test
    fun normalizingPointComputesVelocityAndClampsPressure() {
        val first = BrushEngine.normalizePoint(
            BrushEngine.RawStylusPoint(x = 0f, y = 0f, timeMs = 0f, pressure = 4f)
        )
        val second = BrushEngine.normalizePoint(
            BrushEngine.RawStylusPoint(x = 10f, y = 0f, timeMs = 10f, pressure = -1f),
            previous = first,
        )

        assertEquals(1f, first.pressure, 0.0001f)
        assertEquals(0f, second.pressure, 0.0001f)
        assertEquals(1f, second.velocity, 0.0001f)
    }

    @Test
    fun planStrokeProducesSamplesAndStamps() {
        val plan = BrushEngine.planStroke(
            points = listOf(
                BrushEngine.RawStylusPoint(0f, 0f, timeMs = 0f, pressure = 0.2f),
                BrushEngine.RawStylusPoint(24f, 0f, timeMs = 16f, pressure = 0.8f),
                BrushEngine.RawStylusPoint(48f, 8f, timeMs = 32f, pressure = 1f),
            ),
            profile = BrushEngine.VectorInk,
        )

        assertTrue(plan.sampleCount > 3)
        assertEquals(plan.sampleCount, plan.stampCount)
        assertTrue(plan.distance > 0f)
        assertTrue(plan.samples.all { it.size >= plan.profile.minSize && it.size <= plan.profile.maxSize })
        assertTrue(plan.samples.all { it.opacity >= plan.profile.minOpacity && it.opacity <= plan.profile.opacity })
        assertTrue(plan.stamps.all { it.radius > 0f && it.feather > 0f })
    }

    @Test
    fun pressureChangesStampRadius() {
        val low = BrushEngine.planStroke(
            points = listOf(
                BrushEngine.RawStylusPoint(0f, 0f, timeMs = 0f, pressure = 0.1f),
                BrushEngine.RawStylusPoint(12f, 0f, timeMs = 16f, pressure = 0.1f),
            ),
            profile = BrushEngine.LovelyInk.copy(taperStart = 0f, taperEnd = 0f),
        )
        val high = BrushEngine.planStroke(
            points = listOf(
                BrushEngine.RawStylusPoint(0f, 0f, timeMs = 0f, pressure = 1f),
                BrushEngine.RawStylusPoint(12f, 0f, timeMs = 16f, pressure = 1f),
            ),
            profile = BrushEngine.LovelyInk.copy(taperStart = 0f, taperEnd = 0f),
        )

        val lowAverage = low.stamps.map { it.radius }.average()
        val highAverage = high.stamps.map { it.radius }.average()
        assertTrue("high-pressure stroke should create larger stamps", highAverage > lowAverage)
    }

    @Test
    fun feedPointCarriesStateForward() {
        var state = BrushEngine.newState(BrushEngine.GlassPencil)
        val first = BrushEngine.feedPoint(state, BrushEngine.RawStylusPoint(0f, 0f, timeMs = 0f, pressure = 0.4f))
        state = first.state
        val second = BrushEngine.feedPoint(state, BrushEngine.RawStylusPoint(30f, 4f, timeMs = 20f, pressure = 0.7f))

        assertFalse(first.samples.isEmpty())
        assertFalse(second.samples.isEmpty())
        assertTrue(second.state.distance > first.state.distance)
        assertEquals(first.state.sampleCount + second.samples.size, second.state.sampleCount)
    }

    @Test
    fun kotlinSignatureDocumentsInteropContract() {
        val signature = BrushEngine.kotlinSignature()
        assertTrue(signature.getValue("BrushProfile").contains("spacing:Float"))
        assertTrue(signature.getValue("StylusPoint").contains("pressure:Float"))
        assertTrue(signature.getValue("StrokeSample").contains("distance:Float"))
        assertTrue(signature.getValue("StampPlan").contains("blendMode:BrushBlendMode"))
    }
}
