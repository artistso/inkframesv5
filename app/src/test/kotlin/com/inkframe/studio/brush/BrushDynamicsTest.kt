package com.inkframe.studio.brush

import com.inkframe.studio.vector.VectorEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BrushDynamicsTest {
    @Test
    fun responseCurveInterpolatesBetweenControlPoints() {
        val curve = BrushDynamics.ResponseCurve(
            listOf(
                BrushDynamics.CurvePoint(0f, 0f),
                BrushDynamics.CurvePoint(0.5f, 0.25f),
                BrushDynamics.CurvePoint(1f, 1f),
            )
        )

        assertEquals(0f, curve.evaluate(-1f), 0.0001f)
        assertEquals(1f, curve.evaluate(2f), 0.0001f)
        assertTrue(curve.evaluate(0.5f) in 0.24f..0.26f)
        assertTrue(curve.evaluate(0.75f) > curve.evaluate(0.5f))
    }

    @Test
    fun pressureNormalizationUsesDeadZoneAndGain() {
        val preset = BrushDynamics.SmoothInk.copy(pressureDeadZone = 0.2f, pressureGain = 2f)

        assertEquals(0f, BrushDynamics.normalizePressure(0.1f, preset), 0.0001f)
        assertTrue(BrushDynamics.normalizePressure(0.4f, preset) > 0.45f)
        assertEquals(1f, BrushDynamics.normalizePressure(1f, preset), 0.0001f)
    }

    @Test
    fun dynamicStrokeProducesOneDabPerBaseStamp() {
        val points = listOf(
            BrushEngine.RawStylusPoint(0f, 0f, timeMs = 0f, pressure = 0.2f),
            BrushEngine.RawStylusPoint(20f, 4f, timeMs = 16f, pressure = 0.7f),
            BrushEngine.RawStylusPoint(42f, 0f, timeMs = 32f, pressure = 1f),
        )

        val plan = BrushDynamics.planDynamicStroke(
            rawPoints = points,
            brush = BrushDynamics.DynamicBrush(BrushEngine.VectorInk, BrushDynamics.VectorClean),
        )

        assertFalse(plan.baseStroke.stamps.isEmpty())
        assertEquals(plan.baseStroke.stampCount, plan.dabCount)
        assertTrue(plan.dabs.all { it.radius > 0f && it.feather > 0f })
        assertTrue(plan.dabs.all { it.opacity in 0f..1f })
    }

    @Test
    fun symmetryPlanningDuplicatesDabs() {
        val points = listOf(
            BrushEngine.RawStylusPoint(2f, 3f, timeMs = 0f, pressure = 0.6f),
            BrushEngine.RawStylusPoint(8f, 9f, timeMs = 16f, pressure = 0.8f),
        )

        val single = BrushDynamics.planDynamicStroke(points)
        val quad = BrushDynamics.planDynamicStroke(
            rawPoints = points,
            symmetryMode = VectorEngine.SymmetryMode.Quad,
            symmetryCenter = VectorEngine.Vec2(10f, 10f),
        )

        assertEquals(single.dabCount * 4, quad.dabCount)
        assertEquals(setOf(0, 1, 2, 3), quad.dabs.map { it.symmetryIndex }.toSet())
    }

    @Test
    fun pencilTexturePresetAddsDeterministicJitter() {
        val points = listOf(
            BrushEngine.RawStylusPoint(0f, 0f, timeMs = 0f, pressure = 0.8f),
            BrushEngine.RawStylusPoint(20f, 0f, timeMs = 16f, pressure = 0.8f),
        )
        val brush = BrushDynamics.DynamicBrush(BrushEngine.GlassPencil, BrushDynamics.PencilTexture)

        val first = BrushDynamics.planDynamicStroke(points, brush)
        val second = BrushDynamics.planDynamicStroke(points, brush)

        assertEquals(first.dabCount, second.dabCount)
        first.dabs.zip(second.dabs).forEach { (a, b) ->
            assertEquals(a.x, b.x, 0.0001f)
            assertEquals(a.y, b.y, 0.0001f)
        }
        assertTrue(first.dabs.zip(first.baseStroke.samples).any { (dab, sample) ->
            kotlin.math.abs(dab.x - sample.x) > 0.0001f || kotlin.math.abs(dab.y - sample.y) > 0.0001f
        })
    }

    @Test
    fun vectorCleanPresetKeepsDabsStable() {
        val points = listOf(
            BrushEngine.RawStylusPoint(0f, 0f, timeMs = 0f, pressure = 0.6f),
            BrushEngine.RawStylusPoint(18f, 0f, timeMs = 16f, pressure = 0.6f),
        )
        val brush = BrushDynamics.DynamicBrush(BrushEngine.VectorInk, BrushDynamics.VectorClean)
        val plan = BrushDynamics.planDynamicStroke(points, brush)

        plan.dabs.zip(plan.baseStroke.samples).forEach { (dab, sample) ->
            assertEquals(sample.x, dab.x, 0.0001f)
            assertEquals(sample.y, dab.y, 0.0001f)
        }
    }
}
