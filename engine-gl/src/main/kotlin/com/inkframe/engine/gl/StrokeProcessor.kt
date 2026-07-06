package com.inkframe.engine.gl

import com.inkframe.core.common.Vec2
import com.inkframe.core.common.catmullRom
import com.inkframe.core.common.lerp
import com.inkframe.core.model.Brush
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
 * Pipeline per added sample:
 *   1. Exponential smoothing of position (brush.smoothing) to reduce jitter.
 *   2. Catmull-Rom interpolation between the last control points for smooth curves.
 *   3. Arc-length resampling at `spacing * diameter` so coverage is uniform
 *      regardless of stroke speed.
 *
 * The processor is stateful per stroke; create one (or call [reset]) per stroke.
 */
class StrokeProcessor(private val brush: Brush) {
    private val raw = ArrayList<InputSample>()
    private var smoothed: Vec2? = null
    private var carry = 0f // leftover distance from previous segment

    fun reset() {
        raw.clear(); smoothed = null; carry = 0f
    }

    /** Pushes a sample and returns any dabs produced since the previous call. */
    fun add(sample: InputSample): List<Dab> {
        val s = brush.smoothing.coerceIn(0f, 0.95f)
        val prev = smoothed
        val sm = if (prev == null) sample.pos else lerp(prev, sample.pos, 1f - s)
        smoothed = sm
        raw.add(InputSample(sm, sample.pressure, sample.timeMs))

        if (raw.size < 4) return emptyList()
        val n = raw.size
        return resampleSegment(raw[n - 4], raw[n - 3], raw[n - 2], raw[n - 1])
    }

    /** Flushes the final tail so the stroke reaches its last input point. */
    fun finish(): List<Dab> {
        if (raw.size < 2) {
            // Single tap -> one dab.
            val only = raw.firstOrNull() ?: return emptyList()
            return listOf(dabAt(only.pos, only.pressure))
        }
        val n = raw.size
        val a = raw[max(0, n - 2)]
        val b = raw[n - 1]
        return resampleSegment(a, a, b, b)
    }

    private fun resampleSegment(s0: InputSample, s1: InputSample, s2: InputSample, s3: InputSample): List<Dab> {
        val dabs = ArrayList<Dab>()
        val approxLen = s1.pos.distanceTo(s2.pos)
        val avgPressure = (s1.pressure + s2.pressure) * 0.5f
        val diameter = brush.diameterForPressure(avgPressure)
        val step = max(1f, brush.spacing * diameter)
        val subdiv = max(1, (approxLen / step).toInt() * 2)

        var t = 0f
        val dt = 1f / subdiv
        var i = 0
        while (i <= subdiv) {
            val p = catmullRom(s0.pos, s1.pos, s2.pos, s3.pos, t)
            val pressure = lerp(s1.pressure, s2.pressure, t)
            carry += if (i == 0) 0f else step / subdiv * 0f // placeholder; arc-length below
            t += dt; i++
            // Accumulate by true inter-point distance for even spacing.
            if (dabs.isEmpty()) {
                dabs.add(dabAt(p, pressure)); continue
            }
            val last = dabs.last().center
            carry += p.distanceTo(last)
            if (carry >= step) {
                carry = 0f
                dabs.add(dabAt(p, pressure))
            }
        }
        return dabs
    }

    private fun dabAt(p: Vec2, pressure: Float): Dab = Dab(
        center = p,
        size = brush.diameterForPressure(pressure),
        rotationRad = 0f,
        flow = brush.flowForPressure(pressure),
    )
}
