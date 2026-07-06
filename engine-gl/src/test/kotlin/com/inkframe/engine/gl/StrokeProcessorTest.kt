package com.inkframe.engine.gl

import com.inkframe.core.common.Vec2
import com.inkframe.core.model.Brush
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
}
