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
    fun twoFingerRotate_producesExpectedAngle() {
        // Rotate the finger vector 90 degrees about midpoint (0,0).
        val prevA = Vec2(-10f, 0f); val prevB = Vec2(10f, 0f)
        val curA = Vec2(0f, -10f); val curB = Vec2(0f, 10f)
        val t = ViewportTransform.IDENTITY.applyGesture(prevA, prevB, curA, curB)
        assertEquals(1f, t.scale, eps)              // no zoom
        assertEquals((PI / 2).toFloat(), t.rotation, eps)
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
    fun gesture_combinedZoomRotatePan() {
        // Arbitrary correspondence; verify the resulting transform reproduces both
        // finger positions exactly (defining property of the 2-point similarity).
        val prevA = Vec2(20f, 30f); val prevB = Vec2(60f, 30f)
        val curA = Vec2(50f, 50f); val curB = Vec2(50f, 120f)
        val t = ViewportTransform(ax = 1.1f, ay = 0.2f, bx = 4f, by = -3f)
        val moved = t.applyGesture(prevA, prevB, curA, curB)
        // Points that were at prevA/prevB (in view space) must now be at curA/curB.
        val canvasA = t.viewToCanvas(prevA)
        val canvasB = t.viewToCanvas(prevB)
        assertVec(curA, moved.canvasToView(canvasA), 1e-2f)
        assertVec(curB, moved.canvasToView(canvasB), 1e-2f)
    }

    @Test
    fun degenerateGesture_returnsUnchanged() {
        val t = ViewportTransform(ax = 2f, ay = 0f, bx = 1f, by = 1f)
        // Both fingers at same point -> zero-length vector -> no-op.
        val same = Vec2(5f, 5f)
        assertEquals(t, t.applyGesture(same, same, Vec2(9f, 9f), Vec2(9f, 9f)))
    }
}
