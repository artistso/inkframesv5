package com.inkframe.engine.gl

import com.inkframe.core.common.Vec2
import com.inkframe.core.model.Brush
import com.inkframe.core.model.PressureCurve
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StrokeProcessorTest {

    private fun brush() = Brush(
        id = "t", name = "Test",
        sizePx = 20f, minSizePx = 20f, spacing = 0.1f,
        pressureToSize = false, smoothing = 0f,
    )

    private fun sample(x: Float, y: Float, t: Long = 0L) = InputSample(Vec2(x, y), 0.8f, t)

    @Test
    fun singleTap_producesOneDab() {
        val sp = StrokeProcessor(brush())
        sp.add(sample(50f, 50f))
        val dabs = sp.finish()
        assertEquals(1, dabs.size)
        assertEquals(50f, dabs[0].center.x, 0.5f)
        assertEquals(50f, dabs[0].center.y, 0.5f)
    }

    @Test
    fun straightLine_producesEvenlySpacedDabs() {
        val sp = StrokeProcessor(brush())
        val all = ArrayList<Dab>()
        for (i in 0..30) all += sp.add(sample(i * 10f, 0f, i * 8L))
        all += sp.finish()

        assertTrue("expected many dabs, got ${all.size}", all.size > 10)

        // Target spacing = spacing(0.1) * diameter(20) = 2px.
        val gaps = all.zipWithNext { a, b -> a.center.distanceTo(b.center) }
            .filter { it > 0.01f }
        val avg = gaps.average()
        assertTrue("avg gap $avg not close to 2px", avg in 1.0..3.5)
    }

    @Test
    fun dabSize_followsBrushDiameter() {
        val sp = StrokeProcessor(brush())
        val all = ArrayList<Dab>()
        for (i in 0..10) all += sp.add(sample(i * 10f, 0f))
        all += sp.finish()
        all.forEach { assertEquals(20f, it.size, 1e-3f) }
    }

    @Test
    fun reset_clearsState() {
        val sp = StrokeProcessor(brush())
        for (i in 0..10) sp.add(sample(i * 10f, 0f))
        sp.reset()
        // After reset, a single sample + finish behaves like a fresh single tap.
        sp.add(sample(5f, 5f))
        val dabs = sp.finish()
        assertEquals(1, dabs.size)
    }

    @Test
    fun smoothing_keepsDabsNearInputPath() {
        val smoothBrush = brush().copy(smoothing = 0.5f)
        val sp = StrokeProcessor(smoothBrush)
        val all = ArrayList<Dab>()
        for (i in 0..30) all += sp.add(sample(i * 10f, 0f, i * 8L))
        all += sp.finish()
        // All dabs should remain on/near the horizontal line (y ~ 0).
        all.forEach { assertTrue("dab strayed: ${it.center.y}", kotlin.math.abs(it.center.y) < 5f) }
    }

    @Test
    fun pressureCurvesAffectGeneratedDabSizeAndFlow() {
        val curved = brush().copy(
            sizePx = 100f,
            minSizePx = 20f,
            flow = 0.8f,
            pressureToSize = true,
            pressureToOpacity = true,
            sizePressureCurve = PressureCurve.FIRM,
            opacityPressureCurve = PressureCurve.SOFT,
        )
        val sp = StrokeProcessor(curved)
        val all = ArrayList<Dab>()
        for (i in 0..12) all += sp.add(InputSample(Vec2(i * 8f, 0f), 0.5f, i * 8L))
        all += sp.finish()

        assertTrue("expected dabs", all.isNotEmpty())
        all.forEach { dab ->
            assertEquals(40f, dab.size, 1e-3f)
            assertEquals(0.6f, dab.flow, 1e-3f)
        }
    }

    @Test
    fun resetClearsResampleCarryBetweenStrokes() {
        val sp = StrokeProcessor(brush())
        val first = ArrayList<Dab>()
        for (i in 0..8) first += sp.add(sample(i * 5f, 0f))
        first += sp.finish()

        sp.reset()
        sp.add(sample(100f, 100f))
        val tap = sp.finish()

        assertEquals(1, tap.size)
        assertEquals(100f, tap[0].center.x, 0.5f)
        assertEquals(100f, tap[0].center.y, 0.5f)
    }

    @Test
    fun shortDragStillReachesFinalPoint() {
        val sp = StrokeProcessor(brush())
        sp.add(sample(0f, 0f))
        sp.add(sample(1f, 1f))
        val dabs = sp.finish()

        assertTrue("expected at least one dab", dabs.isNotEmpty())
        val last = dabs.last()
        assertEquals(1f, last.center.x, 0.5f)
        assertEquals(1f, last.center.y, 0.5f)
    }

}
