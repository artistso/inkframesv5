package com.inkframe.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class MathUtilTest {

    @Test
    fun lerp_interpolatesLinearly() {
        assertEquals(0f, lerp(0f, 10f, 0f), EPS)
        assertEquals(10f, lerp(0f, 10f, 1f), EPS)
        assertEquals(5f, lerp(0f, 10f, 0.5f), EPS)
        assertEquals(-5f, lerp(0f, -10f, 0.5f), EPS)
    }

    @Test
    fun lerpVec2_interpolatesBothComponents() {
        val r = lerp(Vec2(0f, 0f), Vec2(10f, 20f), 0.25f)
        assertEquals(2.5f, r.x, EPS)
        assertEquals(5f, r.y, EPS)
    }

    @Test
    fun clamp_boundsValue() {
        assertEquals(0f, (-3f).clamp(0f, 1f), EPS)
        assertEquals(1f, 5f.clamp(0f, 1f), EPS)
        assertEquals(0.4f, 0.4f.clamp(0f, 1f), EPS)
    }

    @Test
    fun vec2_distanceIsEuclidean() {
        assertEquals(5f, Vec2(0f, 0f).distanceTo(Vec2(3f, 4f)), EPS)
    }

    @Test
    fun vec2_arithmeticOperators() {
        val a = Vec2(1f, 2f)
        val b = Vec2(3f, 4f)
        assertEquals(Vec2(4f, 6f), a + b)
        assertEquals(Vec2(-2f, -2f), a - b)
        assertEquals(Vec2(2f, 4f), a * 2f)
    }

    @Test
    fun catmullRom_passesThroughControlPoints() {
        // At t=0 the spline equals p1, at t=1 it equals p2.
        val p0 = Vec2(0f, 0f)
        val p1 = Vec2(1f, 1f)
        val p2 = Vec2(2f, 0f)
        val p3 = Vec2(3f, 1f)
        val start = catmullRom(p0, p1, p2, p3, 0f)
        val end = catmullRom(p0, p1, p2, p3, 1f)
        assertTrue(abs(start.x - p1.x) < EPS && abs(start.y - p1.y) < EPS)
        assertTrue(abs(end.x - p2.x) < EPS && abs(end.y - p2.y) < EPS)
    }

    @Test
    fun catmullRom_midpointIsBetweenEndpoints() {
        val mid = catmullRom(Vec2(0f, 0f), Vec2(0f, 0f), Vec2(10f, 0f), Vec2(10f, 0f), 0.5f)
        // Symmetric control points -> midpoint near geometric center.
        assertEquals(5f, mid.x, 0.5f)
    }

    private companion object {
        const val EPS = 1e-4f
    }
}
