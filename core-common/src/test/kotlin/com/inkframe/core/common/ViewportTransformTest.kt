package com.inkframe.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

class ViewportTransformTest {

    private val eps = 1e-3f
    private fun assertVec(expected: Vec2, actual: Vec2, e: Float = eps) {
        assertEquals("x", expected.x, actual.x, e)
        assertEquals("y", expected.y, actual.y, e)
    }

    @Test
    fun identity_mapsPointsUnchanged() {
        val t = ViewportTransform.IDENTITY
        assertVec(Vec2(5f, 7f), t.canvasToView(Vec2(5f, 7f)))
        assertVec(Vec2(5f, 7f), t.viewToCanvas(Vec2(5f, 7f)))
        assertEquals(1f, t.scale, eps)
        assertEquals(0f, t.rotation, eps)
    }

    @Test
    fun forwardThenInverse_isRoundTrip() {
        val t = ViewportTransform(ax = 1.5f, ay = 0.7f, bx = 30f, by = -12f)
        for (p in listOf(Vec2(0f, 0f), Vec2(100f, 50f), Vec2(-20f, 80f))) {
            assertVec(p, t.viewToCanvas(t.canvasToView(p)))
        }
    }

    @Test
    fun fit_centersAndScalesCanvas() {
        // 100x100 canvas into a 400x200 view -> scale 2, centered horizontally.
        val t = ViewportTransform.fit(100f, 100f, 400f, 200f)
        assertEquals(2f, t.scale, eps)
        // Canvas center maps to view center.
        assertVec(Vec2(200f, 100f), t.canvasToView(Vec2(50f, 50f)))
        // Top-left corner of canvas sits at x offset (400-200)/2 = 100, y = 0.
        assertVec(Vec2(100f, 0f), t.canvasToView(Vec2(0f, 0f)))
    }

    @Test
    fun pan_shiftsInViewSpace() {
        val t = ViewportTransform.fit(100f, 100f, 200f, 200f).pan(25f, -10f)
        val before = ViewportTransform.fit(100f, 100f, 200f, 200f).canvasToView(Vec2(10f, 10f))
        val after = t.canvasToView(Vec2(10f, 10f))
        assertEquals(before.x + 25f, after.x, eps)
        assertEquals(before.y - 10f, after.y, eps)
    }

    @Test
    fun pinchZoom_aboutPivot_keepsPivotFixed() {
        // Two fingers move apart symmetrically about (100,100): pure 2x zoom.
        val t0 = ViewportTransform.IDENTITY
        val prevA = Vec2(90f, 100f); val prevB = Vec2(110f, 100f)
        val curA = Vec2(80f, 100f); val curB = Vec2(120f, 100f) // distance doubled
        val t1 = t0.applyGesture(prevA, prevB, curA, curB)
        assertEquals(2f, t1.scale, eps)
        // The pivot (midpoint 100,100) maps to itself.
        assertVec(Vec2(100f, 100f), t1.canvasToView(t0.viewToCanvas(Vec2(100f, 100f))))
    }

    @Test
    fun fingerAngleChange_doesNotRotateCanvas() {
        // Real pinches rarely maintain an exact finger angle. Rotating the finger vector
        // with the same span and centroid must not rotate or wobble the artwork.
        val prevA = Vec2(-10f, 0f); val prevB = Vec2(10f, 0f)
        val curA = Vec2(0f, -10f); val curB = Vec2(0f, 10f)
        val t = ViewportTransform.IDENTITY.applyGesture(prevA, prevB, curA, curB)
        assertEquals(1f, t.scale, eps)
        assertEquals(0f, t.rotation, eps)
        assertEquals(ViewportTransform.IDENTITY, t)
    }

    @Test
    fun rotation_mapsPointsByMatrix() {
        val theta = (PI / 6).toFloat() // 30 deg
        val t = ViewportTransform(ax = cos(theta), ay = sin(theta), bx = 0f, by = 0f)
        val p = Vec2(1f, 0f)
        assertVec(Vec2(cos(theta), sin(theta)), t.canvasToView(p))
        assertEquals(theta, t.rotation, eps)
    }

    @Test
    fun inverseCoeffs_matchViewToCanvas() {
        val t = ViewportTransform(ax = 1.3f, ay = -0.4f, bx = 15f, by = 22f)
        val (iax, iay, ibx, iby) = t.inverseCoeffs().let { arrayOf(it[0], it[1], it[2], it[3]) }
        val v = Vec2(60f, 45f)
        // Apply the packed inverse exactly as the shader would.
        val cx = iax * v.x - iay * v.y + ibx
        val cy = iay * v.x + iax * v.y + iby
        assertVec(t.viewToCanvas(v), Vec2(cx, cy))
    }

    @Test
    fun scaleClamp_limitsZoomAboutPivot() {
        val t = ViewportTransform(ax = 50f, ay = 0f, bx = 0f, by = 0f) // scale 50
        val clamped = t.withScaleClamped(min = 0.1f, max = 16f, pivotX = 30f, pivotY = 30f)
        assertEquals(16f, clamped.scale, eps)
        // Pivot stays put under the clamp.
        assertVec(Vec2(30f, 30f), clamped.preComposePivotCheck(30f, 30f, t))
    }

    @Test
    fun scaleClamp_noopWhenWithinRange() {
        val t = ViewportTransform(ax = 2f, ay = 0f, bx = 5f, by = 5f)
        val clamped = t.withScaleClamped(0.1f, 16f, 10f, 10f)
        assertEquals(t, clamped)
    }

    // Helper: verify a view-space pivot is unchanged between two transforms that should
    // agree at that pivot (used by the clamp test).
    private fun ViewportTransform.preComposePivotCheck(px: Float, py: Float, original: ViewportTransform): Vec2 {
        // Map pivot view->canvas via original, then canvas->view via clamped; expect pivot.
        val canvas = original.viewToCanvas(Vec2(px, py))
        return this.canvasToView(canvas)
    }

    @Test
    fun gesture_combinesZoomAndPan_withoutChangingRotation() {
        val prevA = Vec2(20f, 30f); val prevB = Vec2(60f, 30f)
        val curA = Vec2(50f, 50f); val curB = Vec2(50f, 120f)
        val previousCenter = Vec2(40f, 30f)
        val currentCenter = Vec2(50f, 85f)
        val expectedScaleFactor = 70f / 40f

        val t = ViewportTransform(ax = 1.1f, ay = 0.2f, bx = 4f, by = -3f)
        val moved = t.applyGesture(prevA, prevB, curA, curB)

        assertEquals(t.scale * expectedScaleFactor, moved.scale, eps)
        assertEquals(t.rotation, moved.rotation, eps)
        val canvasAtPreviousCenter = t.viewToCanvas(previousCenter)
        assertVec(currentCenter, moved.canvasToView(canvasAtPreviousCenter), 1e-2f)
    }

    @Test
    fun degenerateGesture_keepsZoomFiniteAndStillPans() {
        val t = ViewportTransform(ax = 2f, ay = 0f, bx = 1f, by = 1f)
        val previous = Vec2(5f, 5f)
        val current = Vec2(9f, 9f)
        val moved = t.applyGesture(previous, previous, current, current)

        assertTrue(moved.scale.isFinite())
        assertEquals(t.scale, moved.scale, eps)
        assertEquals(t.rotation, moved.rotation, eps)
        assertEquals(t.pan(4f, 4f), moved)
    }
}
