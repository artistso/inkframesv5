package com.inkframe.core.common

import kotlin.math.hypot

/** Lightweight 2D point in canvas space. */
data class Vec2(val x: Float, val y: Float) {
    operator fun plus(o: Vec2) = Vec2(x + o.x, y + o.y)
    operator fun minus(o: Vec2) = Vec2(x - o.x, y - o.y)
    operator fun times(s: Float) = Vec2(x * s, y * s)
    fun distanceTo(o: Vec2): Float = hypot(x - o.x, y - o.y)
}

fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t

fun lerp(a: Vec2, b: Vec2, t: Float): Vec2 = Vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t))

fun Float.clamp(min: Float, max: Float): Float = when {
    this < min -> min
    this > max -> max
    else -> this
}

/**
 * Catmull-Rom interpolation, used to smooth raw stylus samples before they are
 * resampled into evenly spaced brush dabs.
 */
fun catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: Float): Vec2 {
    val t2 = t * t
    val t3 = t2 * t
    fun comp(a: Float, b: Float, c: Float, d: Float): Float = 0.5f * (
        (2f * b) +
            (-a + c) * t +
            (2f * a - 5f * b + 4f * c - d) * t2 +
            (-a + 3f * b - 3f * c + d) * t3
        )
    return Vec2(comp(p0.x, p1.x, p2.x, p3.x), comp(p0.y, p1.y, p2.y, p3.y))
}
