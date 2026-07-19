package com.inkframe.engine.gl

import com.inkframe.core.common.Vec2
import com.inkframe.core.common.catmullRom
import com.inkframe.core.common.lerp
import com.inkframe.core.model.Brush
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.max

/** A single sampled point of a stylus stroke. */
data class InputSample(val pos: Vec2, val pressure: Float, val timeMs: Long)

/**
 * One brush dab ready to be stamped: position, diameter, rotation and per-dab [flow].
 * [flow] is the coverage written into the stroke scratch buffer; the brush's overall
 * opacity is applied separately, once, when the finished stroke is composited.
 */
data class Dab(val center: Vec2, val size: Float, val rotationRad: Float, val flow: Float)

/**
 * Converts a noisy stream of stylus samples into a clean run of evenly spaced dabs.
 *
 * This mirrors the reference stroke feel: stabilize input first, fit a Catmull-Rom
 * curve through recent samples, then walk the curve by accumulated arc length so dab
 * spacing remains stable across slow and fast strokes. The final tail is explicitly
 * flushed so strokes reach the pen-up position instead of visually stopping short.
 */
class StrokeProcessor(private val brush: Brush) {
    private val raw = ArrayList<InputSample>()
    private var smoothed: Vec2? = null
    private var distanceSinceLastDab = 0f
    private var lastCurvePoint: Vec2? = null
    private var lastDabPoint: Vec2? = null

    fun reset() {
        raw.clear()
        smoothed = null
        distanceSinceLastDab = 0f
        lastCurvePoint = null
        lastDabPoint = null
    }

    /** Pushes a sample and returns any dabs produced since the previous call. */
    fun add(sample: InputSample): List<Dab> {
        val s = brush.smoothing.coerceIn(0f, 0.95f)
        val prev = smoothed
        val sm = if (prev == null) sample.pos else lerp(prev, sample.pos, 1f - s)
        smoothed = sm
        raw.add(InputSample(sm, sample.pressure.coerceIn(0f, 1f), sample.timeMs))

        if (raw.size == 1) {
            val dab = dabAt(raw.first().pos, raw.first().pressure, 0f)
            lastCurvePoint = raw.first().pos
            lastDabPoint = dab.center
            return listOf(dab)
        }
        if (raw.size < 4) return emptyList()

        val n = raw.size
        return resampleSegment(raw[n - 4], raw[n - 3], raw[n - 2], raw[n - 1], forceEnd = false)
    }

    /** Flushes the final tail so the stroke reaches its last input point. */
    fun finish(): List<Dab> {
        if (raw.isEmpty()) return emptyList()
        if (raw.size == 1) return emptyList() // The initial tap dab was emitted by add().

        val n = raw.size
        val a = raw[max(0, n - 2)]
        val b = raw[n - 1]
        return resampleSegment(a, a, b, b, forceEnd = true)
    }

    private fun resampleSegment(
        s0: InputSample,
        s1: InputSample,
        s2: InputSample,
        s3: InputSample,
        forceEnd: Boolean,
    ): List<Dab> {
        val dabs = ArrayList<Dab>()
        val chord = s1.pos.distanceTo(s2.pos)
        val avgPressure = (s1.pressure + s2.pressure) * 0.5f
        val diameter = brush.diameterForPressure(avgPressure).coerceAtLeast(0.5f)
        val step = max(0.5f, brush.spacing.coerceAtLeast(0.01f) * diameter)

        if (chord <= 0.001f) {
            if (forceEnd) flushForcedEnd(dabs, step)
            return dabs
        }

        val subdivisions = max(4, ceil(chord / max(1f, step * 0.5f)).toInt())

        var previous = lastCurvePoint ?: s1.pos
        for (i in 1..subdivisions) {
            val t = i.toFloat() / subdivisions.toFloat()
            val p = catmullRom(s0.pos, s1.pos, s2.pos, s3.pos, t)
            val pressure = lerp(s1.pressure, s2.pressure, t).coerceIn(0f, 1f)
            val delta = previous.distanceTo(p)
            distanceSinceLastDab += delta

            while (distanceSinceLastDab >= step && delta > 0.0001f) {
                val overshoot = distanceSinceLastDab - step
                val ratio = ((delta - overshoot) / delta).coerceIn(0f, 1f)
                val center = lerp(previous, p, ratio)
                val angle = atan2(p.y - previous.y, p.x - previous.x)
                dabs.add(dabAt(center, pressure, angle))
                lastDabPoint = center
                distanceSinceLastDab = overshoot
            }
            previous = p
        }
        lastCurvePoint = previous

        if (forceEnd) {
            flushForcedEnd(dabs, step)
        }

        return dabs
    }

    private fun flushForcedEnd(dabs: MutableList<Dab>, step: Float) {
        val last = raw.last()
        val lastDab = lastDabPoint
        if (lastDab == null || lastDab.distanceTo(last.pos) > step * 0.45f) {
            val prevPoint = if (raw.size >= 2) raw[raw.size - 2].pos else last.pos
            dabs.add(dabAt(last.pos, last.pressure, atan2(last.pos.y - prevPoint.y, last.pos.x - prevPoint.x)))
            lastDabPoint = last.pos
            lastCurvePoint = last.pos
            distanceSinceLastDab = 0f
        }
    }

    private fun dabAt(p: Vec2, pressure: Float, rotationRad: Float): Dab = Dab(
        center = p,
        size = brush.diameterForPressure(pressure.coerceIn(0f, 1f)),
        rotationRad = rotationRad,
        flow = brush.flowForPressure(pressure.coerceIn(0f, 1f)),
    )
}
