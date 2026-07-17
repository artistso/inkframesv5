package com.inkframe.engine.gl

import com.inkframe.core.common.Vec2
import com.inkframe.core.common.catmullRom
import com.inkframe.core.common.lerp
import com.inkframe.core.model.Brush
import com.inkframe.core.model.BrushKind
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/** A single sampled point of a stylus stroke. */
data class InputSample(
    val pos: Vec2,
    val pressure: Float,
    val timeMs: Long,
    /** Android stylus tilt: 0 = perpendicular, PI/2 = parallel to the surface. */
    val tiltRad: Float = 0f,
    /** Stylus azimuth/orientation in radians around the screen normal. */
    val orientationRad: Float = 0f,
)

/**
 * One brush dab ready to be stamped: position, major diameter, rotation, per-dab [flow],
 * and [aspectRatio] (1 = round, >1 = elongated along the rotated major axis).
 */
data class Dab(
    val center: Vec2,
    val size: Float,
    val rotationRad: Float,
    val flow: Float,
    val aspectRatio: Float = 1f,
)

/**
 * Converts a noisy stream of stylus samples into a clean run of evenly spaced dabs.
 * Pressure controls size/flow. Pencil, ink and marker tips also consume S Pen tilt and
 * orientation so the actual stroke—not only the UI lens—responds to the physical stylus.
 */
class StrokeProcessor(private val brush: Brush) {
    private val raw = ArrayList<InputSample>()
    private var smoothed: Vec2? = null
    private var carry = 0f

    fun reset() {
        raw.clear(); smoothed = null; carry = 0f
    }

    fun add(sample: InputSample): List<Dab> {
        val s = brush.smoothing.coerceIn(0f, 0.95f)
        val prev = smoothed
        val sm = if (prev == null) sample.pos else lerp(prev, sample.pos, 1f - s)
        smoothed = sm
        raw.add(sample.copy(pos = sm))

        if (raw.size < 4) return emptyList()
        val n = raw.size
        return resampleSegment(raw[n - 4], raw[n - 3], raw[n - 2], raw[n - 1])
    }

    fun finish(): List<Dab> {
        if (raw.size < 2) {
  val only = raw.firstOrNull() ?: return emptyList()
  return listOf(dabAt(only.pos, only.pressure, only.tiltRad, only.orientationRad))
        }
        val n = raw.size
        val a = raw[max(0, n - 2)]
        val b = raw[n - 1]
        return resampleSegment(a, a, b, b)
    }

    private fun resampleSegment(
        s0: InputSample,
        s1: InputSample,
        s2: InputSample,
        s3: InputSample,
    ): List<Dab> {
        val dabs = ArrayList<Dab>()
        val approxLen = s1.pos.distanceTo(s2.pos)
        val avgPressure = (s1.pressure + s2.pressure) * 0.5f
        val avgTilt = (s1.tiltRad + s2.tiltRad) * 0.5f
        val stepDiameter = majorDiameter(avgPressure, avgTilt)
        val step = max(1f, brush.spacing * stepDiameter)
        val subdiv = max(1, (approxLen / step).toInt() * 2)

        var t = 0f
        val dt = 1f / subdiv
        var i = 0
        while (i <= subdiv) {
  val p = catmullRom(s0.pos, s1.pos, s2.pos, s3.pos, t)
  val pressure = lerp(s1.pressure, s2.pressure, t)
  val tilt = lerp(s1.tiltRad, s2.tiltRad, t)
  val orientation = lerpAngle(s1.orientationRad, s2.orientationRad, t)
  t += dt
  i++

  if (dabs.isEmpty()) {
      dabs.add(dabAt(p, pressure, tilt, orientation))
      continue
  }
  val last = dabs.last().center
  carry += p.distanceTo(last)
  if (carry >= step) {
      carry = 0f
      dabs.add(dabAt(p, pressure, tilt, orientation))
  }
        }
        return dabs
    }

    private fun dabAt(
        p: Vec2,
        pressure: Float,
        tiltRad: Float,
        orientationRad: Float,
    ): Dab {
        val tiltEnabled = brush.kind == BrushKind.PENCIL ||
  brush.kind == BrushKind.INK ||
  brush.kind == BrushKind.MARKER
        val normalizedTilt = (tiltRad / (PI.toFloat() * 0.5f)).coerceIn(0f, 1f)
        val aspect = if (tiltEnabled) 1f + normalizedTilt * 2.4f else 1f
        return Dab(
  center = p,
  size = majorDiameter(pressure, tiltRad),
  rotationRad = if (tiltEnabled) orientationRad else 0f,
  flow = brush.flowForPressure(pressure),
  aspectRatio = aspect,
        )
    }

    private fun majorDiameter(pressure: Float, tiltRad: Float): Float {
        val base = brush.diameterForPressure(pressure)
        val tiltEnabled = brush.kind == BrushKind.PENCIL ||
  brush.kind == BrushKind.INK ||
  brush.kind == BrushKind.MARKER
        if (!tiltEnabled) return base
        val normalizedTilt = (tiltRad / (PI.toFloat() * 0.5f)).coerceIn(0f, 1f)
        return base * (1f + normalizedTilt * 0.30f)
    }

    private fun lerpAngle(from: Float, to: Float, t: Float): Float {
        val delta = atan2(sin(to - from), cos(to - from))
        return from + delta * t
    }
}
