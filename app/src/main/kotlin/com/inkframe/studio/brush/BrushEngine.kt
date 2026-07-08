package com.inkframe.studio.brush

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Native InkFrame brush-engine core.
 *
 * This intentionally mirrors web/brush-engine.js without depending on Android UI,
 * Canvas, Compose, WebView, or input APIs. It is pure Kotlin so it can be tested
 * on the JVM today and moved behind Android stylus/rendering adapters later.
 */
object BrushEngine {
    const val VERSION: String = "v0.2.0-kotlin-ready-core"

    private const val EPSILON = 1e-6f
    private const val DEFAULT_FRAME_MS = 16.67f

    enum class BrushShape { Round, Flat, Marker, Smudge, Eraser }
    enum class BrushBlendMode { SourceOver, Multiply, Screen, Erase, Smudge }

    data class BrushProfile(
        val id: String = "lovely-ink",
        val name: String = "Lovely Ink",
        val shape: BrushShape = BrushShape.Round,
        val blendMode: BrushBlendMode = BrushBlendMode.SourceOver,
        val spacing: Float = 0.18f,
        val size: Float = 8f,
        val minSize: Float = 1.25f,
        val maxSize: Float = 96f,
        val opacity: Float = 0.92f,
        val minOpacity: Float = 0.12f,
        val flow: Float = 0.72f,
        val softness: Float = 0.42f,
        val jitter: Float = 0f,
        val grain: Float = 0.10f,
        val taperStart: Float = 0.08f,
        val taperEnd: Float = 0.12f,
        val pressureSize: Float = 0.78f,
        val pressureOpacity: Float = 0.42f,
        val velocitySize: Float = 0.18f,
        val velocityOpacity: Float = 0.08f,
        val tiltSize: Float = 0.14f,
        val tiltAngle: Float = 0.24f,
        val smoothing: Float = 0.52f,
        val stabilization: Float = 0.22f,
        val stampCap: Int = 512,
    ) {
        fun sanitized(): BrushProfile {
            val safeMin = minSize.coerceIn(0.1f, 512f)
            val safeMax = max(maxSize.coerceIn(0.25f, 1024f), safeMin)
            val safeOpacity = opacity.coerceIn(0f, 1f)
            return copy(
                spacing = spacing.coerceIn(0.04f, 1f),
                minSize = safeMin,
                maxSize = safeMax,
                size = size.coerceIn(safeMin, safeMax),
                opacity = safeOpacity,
                minOpacity = minOpacity.coerceIn(0f, safeOpacity),
                flow = flow.coerceIn(0f, 1f),
                softness = softness.coerceIn(0f, 1f),
                jitter = jitter.coerceIn(0f, 1f),
                grain = grain.coerceIn(0f, 1f),
                taperStart = taperStart.coerceIn(0f, 0.5f),
                taperEnd = taperEnd.coerceIn(0f, 0.5f),
                pressureSize = pressureSize.coerceIn(0f, 1f),
                pressureOpacity = pressureOpacity.coerceIn(0f, 1f),
                velocitySize = velocitySize.coerceIn(0f, 1f),
                velocityOpacity = velocityOpacity.coerceIn(0f, 1f),
                tiltSize = tiltSize.coerceIn(0f, 1f),
                tiltAngle = tiltAngle.coerceIn(0f, 1f),
                smoothing = smoothing.coerceIn(0f, 0.98f),
                stabilization = stabilization.coerceIn(0f, 0.95f),
                stampCap = stampCap.coerceIn(8, 4096),
            )
        }
    }

    data class RawStylusPoint(
        val x: Float,
        val y: Float,
        val timeMs: Float? = null,
        val pressure: Float? = null,
        val tiltX: Float? = null,
        val tiltY: Float? = null,
        val altitudeAngle: Float? = null,
        val azimuthAngle: Float? = null,
    )

    data class StylusPoint(
        val x: Float,
        val y: Float,
        val timeMs: Float,
        val pressure: Float,
        val tiltX: Float,
        val tiltY: Float,
        val altitudeAngle: Float,
        val azimuthAngle: Float,
        val velocity: Float,
    )

    data class StrokeSample(
        val x: Float,
        val y: Float,
        val timeMs: Float,
        val pressure: Float,
        val distance: Float,
        val size: Float,
        val opacity: Float,
        val angle: Float,
        val softness: Float,
        val grain: Float,
        val taper: Float,
        val velocity: Float,
    )

    data class StampPlan(
        val x: Float,
        val y: Float,
        val radius: Float,
        val hardRadius: Float,
        val feather: Float,
        val opacity: Float,
        val angle: Float,
        val grain: Float,
        val blendMode: BrushBlendMode,
        val shape: BrushShape,
    )

    data class StrokePlan(
        val profile: BrushProfile,
        val samples: List<StrokeSample>,
        val stamps: List<StampPlan>,
        val distance: Float,
    ) {
        val sampleCount: Int get() = samples.size
        val stampCount: Int get() = stamps.size
    }

    data class StrokeState(
        val profile: BrushProfile,
        val lastPoint: StylusPoint? = null,
        val smoothedPoint: StylusPoint? = null,
        val distance: Float = 0f,
        val sampleCount: Int = 0,
        val startedAtMs: Float = 0f,
    )

    data class FeedResult(
        val state: StrokeState,
        val samples: List<StrokeSample>,
        val stamps: List<StampPlan>,
    )

    val LovelyInk = BrushProfile()
    val GlassPencil = BrushProfile(
        id = "glass-pencil",
        name = "Glass Pencil",
        size = 4.5f,
        minSize = 0.8f,
        opacity = 0.72f,
        flow = 0.48f,
        softness = 0.18f,
        grain = 0.34f,
        pressureSize = 0.62f,
        pressureOpacity = 0.24f,
        velocitySize = 0.26f,
        spacing = 0.12f,
    )
    val RoseBrush = BrushProfile(
        id = "rose-brush",
        name = "Rose Brush",
        size = 18f,
        minSize = 2.5f,
        opacity = 0.64f,
        flow = 0.42f,
        softness = 0.72f,
        grain = 0.18f,
        pressureSize = 0.88f,
        pressureOpacity = 0.56f,
        tiltSize = 0.22f,
        spacing = 0.20f,
    )
    val VectorInk = BrushProfile(
        id = "vector-ink",
        name = "Vector Ink",
        size = 6f,
        minSize = 1.1f,
        opacity = 0.98f,
        flow = 0.88f,
        softness = 0.10f,
        grain = 0f,
        pressureSize = 0.72f,
        pressureOpacity = 0.16f,
        velocitySize = 0.10f,
        spacing = 0.10f,
    )

    val presets: Map<String, BrushProfile> = listOf(LovelyInk, GlassPencil, RoseBrush, VectorInk).associateBy { it.id }

    fun newState(profile: BrushProfile = LovelyInk): StrokeState = StrokeState(profile = profile.sanitized())

    fun preset(id: String): BrushProfile = presets[id]?.sanitized() ?: LovelyInk

    fun normalizePoint(raw: RawStylusPoint, previous: StylusPoint? = null): StylusPoint {
        val time = raw.timeMs ?: ((previous?.timeMs ?: 0f) + DEFAULT_FRAME_MS)
        val pressure = (raw.pressure ?: 0.5f).coerceIn(0f, 1f)
        val tiltX = (raw.tiltX ?: 0f).coerceIn(-90f, 90f)
        val tiltY = (raw.tiltY ?: 0f).coerceIn(-90f, 90f)
        val altitude = (raw.altitudeAngle ?: (PI.toFloat() / 2f)).coerceIn(0f, PI.toFloat() / 2f)
        val azimuth = raw.azimuthAngle ?: atan2(tiltY, if (kotlin.math.abs(tiltX) < EPSILON) EPSILON else tiltX)
        val previousTime = previous?.timeMs ?: (time - DEFAULT_FRAME_MS)
        val dt = max(1f, time - previousTime)
        val dx = raw.x - (previous?.x ?: raw.x)
        val dy = raw.y - (previous?.y ?: raw.y)
        val velocity = hypot(dx, dy) / dt
        return StylusPoint(raw.x, raw.y, time, pressure, tiltX, tiltY, altitude, azimuth, velocity)
    }

    fun feedPoint(state: StrokeState, rawPoint: RawStylusPoint): FeedResult {
        val profile = state.profile.sanitized()
        val normalized = normalizePoint(rawPoint, state.lastPoint)
        val smoothed = smoothPoint(state, normalized)
        val samples = if (state.lastPoint == null) {
            sampleSegment(smoothed, smoothed, profile, 0f)
        } else {
            sampleSegment(state.smoothedPoint ?: state.lastPoint, smoothed, profile, state.distance)
        }
        val stamps = samples.map { planStamp(it, profile) }
        val nextDistance = samples.lastOrNull()?.distance ?: state.distance
        val nextState = state.copy(
            profile = profile,
            lastPoint = normalized,
            smoothedPoint = smoothed,
            distance = nextDistance,
            sampleCount = state.sampleCount + samples.size,
            startedAtMs = if (state.lastPoint == null) smoothed.timeMs else state.startedAtMs,
        )
        return FeedResult(nextState, samples, stamps)
    }

    fun planStroke(points: List<RawStylusPoint>, profile: BrushProfile = LovelyInk): StrokePlan {
        var state = newState(profile)
        val samples = mutableListOf<StrokeSample>()
        val stamps = mutableListOf<StampPlan>()
        points.forEach { point ->
            val result = feedPoint(state, point)
            state = result.state
            samples += result.samples
            stamps += result.stamps
        }
        return StrokePlan(state.profile, samples, stamps, state.distance)
    }

    fun sampleSegment(a: StylusPoint, b: StylusPoint, profile: BrushProfile, distanceOffset: Float): List<StrokeSample> {
        val p = profile.sanitized()
        val dx = b.x - a.x
        val dy = b.y - a.y
        val length = hypot(dx, dy)
        if (length < EPSILON) {
            val metrics = pointMetrics(b, p, distanceOffset, max(distanceOffset, 1f))
            return listOf(metrics.toSample(b, distanceOffset))
        }
        val spacingPx = (p.size * p.spacing).coerceIn(0.5f, 64f)
        val count = ceil(length / spacingPx).toInt().coerceIn(1, p.stampCap)
        val total = distanceOffset + length
        return (1..count).map { i ->
            val u = i.toFloat() / count.toFloat()
            val point = interpolate(a, b, u)
            val distance = distanceOffset + length * u
            pointMetrics(point, p, distance, total).toSample(point, distance)
        }
    }

    fun pointMetrics(point: StylusPoint, profile: BrushProfile, distance: Float, totalDistance: Float): PointMetrics {
        val p = profile.sanitized()
        val pressureSize = lerp(1f - p.pressureSize, 1f, point.pressure)
        val pressureOpacity = lerp(1f - p.pressureOpacity, 1f, point.pressure)
        val velocitySize = lerp(1f, 1f - p.velocitySize, (point.velocity * 24f).coerceIn(0f, 1f))
        val velocityOpacity = lerp(1f, 1f - p.velocityOpacity, (point.velocity * 18f).coerceIn(0f, 1f))
        val tiltMag = (hypot(point.tiltX, point.tiltY) / 90f).coerceIn(0f, 1f)
        val tiltSize = lerp(1f, 1f + p.tiltSize, tiltMag)
        val taper = taperFor(distance, totalDistance, p)
        val size = (p.size * pressureSize * velocitySize * tiltSize * taper).coerceIn(p.minSize, p.maxSize)
        val opacity = (p.opacity * p.flow * pressureOpacity * velocityOpacity * taper).coerceIn(p.minOpacity, p.opacity)
        val angle = point.azimuthAngle + p.tiltAngle * tiltMag * PI.toFloat()
        return PointMetrics(size, opacity, angle, p.softness, p.grain, taper, point.velocity)
    }

    data class PointMetrics(
        val size: Float,
        val opacity: Float,
        val angle: Float,
        val softness: Float,
        val grain: Float,
        val taper: Float,
        val velocity: Float,
    ) {
        fun toSample(point: StylusPoint, distance: Float): StrokeSample = StrokeSample(
            x = point.x,
            y = point.y,
            timeMs = point.timeMs,
            pressure = point.pressure,
            distance = distance,
            size = size,
            opacity = opacity,
            angle = angle,
            softness = softness,
            grain = grain,
            taper = taper,
            velocity = velocity,
        )
    }

    fun planStamp(sample: StrokeSample, profile: BrushProfile): StampPlan {
        val p = profile.sanitized()
        val radius = max(0.5f, sample.size / 2f)
        val hardRadius = radius * lerp(0.36f, 0.86f, 1f - sample.softness.coerceIn(0f, 1f))
        val feather = max(0.25f, radius - hardRadius)
        return StampPlan(
            x = sample.x,
            y = sample.y,
            radius = radius,
            hardRadius = hardRadius,
            feather = feather,
            opacity = sample.opacity.coerceIn(0f, 1f),
            angle = sample.angle,
            grain = sample.grain.coerceIn(0f, 1f),
            blendMode = p.blendMode,
            shape = p.shape,
        )
    }

    fun kotlinSignature(): Map<String, List<String>> = mapOf(
        "BrushProfile" to listOf("id:String", "name:String", "shape:BrushShape", "blendMode:BrushBlendMode", "spacing:Float", "size:Float", "minSize:Float", "maxSize:Float", "opacity:Float", "flow:Float", "softness:Float"),
        "StylusPoint" to listOf("x:Float", "y:Float", "timeMs:Float", "pressure:Float", "tiltX:Float", "tiltY:Float", "altitudeAngle:Float", "azimuthAngle:Float", "velocity:Float"),
        "StrokeSample" to listOf("x:Float", "y:Float", "timeMs:Float", "pressure:Float", "distance:Float", "size:Float", "opacity:Float", "angle:Float"),
        "StampPlan" to listOf("x:Float", "y:Float", "radius:Float", "hardRadius:Float", "feather:Float", "opacity:Float", "angle:Float", "grain:Float", "blendMode:BrushBlendMode", "shape:BrushShape"),
    )

    private fun smoothPoint(state: StrokeState, point: StylusPoint): StylusPoint {
        val previous = state.smoothedPoint ?: return point
        val p = state.profile.sanitized()
        val velocityBias = (point.velocity * 20f).coerceIn(0f, 0.28f)
        val alpha = (1f - p.smoothing + velocityBias - p.stabilization * 0.18f).coerceIn(0.02f, 1f)
        val pressureAlpha = (alpha + 0.10f).coerceIn(0.12f, 1f)
        val velocityAlpha = (alpha + 0.08f).coerceIn(0.10f, 1f)
        return point.copy(
            x = lerp(previous.x, point.x, alpha),
            y = lerp(previous.y, point.y, alpha),
            pressure = lerp(previous.pressure, point.pressure, pressureAlpha),
            velocity = lerp(previous.velocity, point.velocity, velocityAlpha),
        )
    }

    private fun taperFor(distance: Float, totalDistance: Float, profile: BrushProfile): Float {
        if (totalDistance < EPSILON) return 1f
        val u = (distance / totalDistance).coerceIn(0f, 1f)
        val start = if (profile.taperStart > EPSILON) (u / profile.taperStart).coerceIn(0f, 1f) else 1f
        val end = if (profile.taperEnd > EPSILON) ((1f - u) / profile.taperEnd).coerceIn(0f, 1f) else 1f
        return sin(min(start, end) * PI.toFloat() / 2f)
    }

    private fun interpolate(a: StylusPoint, b: StylusPoint, u: Float): StylusPoint = StylusPoint(
        x = lerp(a.x, b.x, u),
        y = lerp(a.y, b.y, u),
        timeMs = lerp(a.timeMs, b.timeMs, u),
        pressure = lerp(a.pressure, b.pressure, u),
        tiltX = lerp(a.tiltX, b.tiltX, u),
        tiltY = lerp(a.tiltY, b.tiltY, u),
        altitudeAngle = lerp(a.altitudeAngle, b.altitudeAngle, u),
        azimuthAngle = lerp(a.azimuthAngle, b.azimuthAngle, u),
        velocity = lerp(a.velocity, b.velocity, u),
    )

    private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t.coerceIn(0f, 1f)
}
