package com.inkframe.studio.brush

import com.inkframe.studio.vector.VectorEngine
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * Advanced brush dynamics on top of BrushEngine.
 *
 * This layer models the kinds of controls artists expect in modern drawing and
 * vector apps: pressure curves, velocity damping, taper response, deterministic
 * jitter, and symmetry-assisted stroke planning. It is pure Kotlin and renderer
 * agnostic; it emits planned dabs that a WebView or native renderer can consume.
 */
object BrushDynamics {
    const val VERSION: String = "v0.1.0-brush-dynamics-curves"

    data class CurvePoint(val input: Float, val output: Float)

    data class ResponseCurve(val points: List<CurvePoint>) {
        private val sorted: List<CurvePoint> = points
            .map { CurvePoint(it.input.coerceIn(0f, 1f), it.output.coerceIn(0f, 2f)) }
            .sortedBy { it.input }
            .ifEmpty { listOf(CurvePoint(0f, 0f), CurvePoint(1f, 1f)) }

        fun evaluate(value: Float): Float {
            val x = value.coerceIn(0f, 1f)
            if (x <= sorted.first().input) return sorted.first().output
            if (x >= sorted.last().input) return sorted.last().output
            for (i in 0 until sorted.lastIndex) {
                val a = sorted[i]
                val b = sorted[i + 1]
                if (x >= a.input && x <= b.input) {
                    val span = max(0.0001f, b.input - a.input)
                    val t = (x - a.input) / span
                    return lerp(a.output, b.output, smoothStep(t))
                }
            }
            return sorted.last().output
        }

        companion object {
            val Linear = ResponseCurve(listOf(CurvePoint(0f, 0f), CurvePoint(1f, 1f)))
            val SoftStart = ResponseCurve(listOf(CurvePoint(0f, 0f), CurvePoint(0.35f, 0.12f), CurvePoint(1f, 1f)))
            val FirmMiddle = ResponseCurve(listOf(CurvePoint(0f, 0f), CurvePoint(0.28f, 0.36f), CurvePoint(0.72f, 0.86f), CurvePoint(1f, 1f)))
            val InkSnap = ResponseCurve(listOf(CurvePoint(0f, 0.04f), CurvePoint(0.18f, 0.18f), CurvePoint(0.58f, 0.84f), CurvePoint(1f, 1f)))
            val ReverseVelocity = ResponseCurve(listOf(CurvePoint(0f, 1f), CurvePoint(1f, 0.62f)))
            fun gamma(gamma: Float): ResponseCurve {
                val g = gamma.coerceIn(0.15f, 4f)
                return ResponseCurve((0..8).map { i ->
                    val x = i / 8f
                    CurvePoint(x, x.pow(g))
                })
            }
        }
    }

    data class DynamicsPreset(
        val id: String,
        val name: String,
        val pressureSize: ResponseCurve = ResponseCurve.Linear,
        val pressureOpacity: ResponseCurve = ResponseCurve.Linear,
        val velocitySize: ResponseCurve = ResponseCurve.ReverseVelocity,
        val velocityOpacity: ResponseCurve = ResponseCurve.ReverseVelocity,
        val taper: ResponseCurve = ResponseCurve.Linear,
        val pressureDeadZone: Float = 0.02f,
        val pressureGain: Float = 1f,
        val velocityScale: Float = 22f,
        val jitterAmount: Float = 0f,
        val jitterSeed: Int = 17,
    ) {
        fun sanitized(): DynamicsPreset = copy(
            pressureDeadZone = pressureDeadZone.coerceIn(0f, 0.55f),
            pressureGain = pressureGain.coerceIn(0.1f, 3f),
            velocityScale = velocityScale.coerceIn(0.1f, 100f),
            jitterAmount = jitterAmount.coerceIn(0f, 1f),
        )
    }

    data class DynamicBrush(
        val brushProfile: BrushEngine.BrushProfile = BrushEngine.LovelyInk,
        val dynamics: DynamicsPreset = SmoothInk,
    ) {
        fun sanitized(): DynamicBrush = copy(
            brushProfile = brushProfile.sanitized(),
            dynamics = dynamics.sanitized(),
        )
    }

    data class DynamicDab(
        val x: Float,
        val y: Float,
        val radius: Float,
        val hardRadius: Float,
        val feather: Float,
        val opacity: Float,
        val angle: Float,
        val grain: Float,
        val pressure: Float,
        val velocity: Float,
        val taper: Float,
        val symmetryIndex: Int = 0,
    )

    data class DynamicStrokePlan(
        val baseStroke: BrushEngine.StrokePlan,
        val dabs: List<DynamicDab>,
        val symmetryMode: VectorEngine.SymmetryMode,
        val symmetryCenter: VectorEngine.Vec2,
        val preset: DynamicsPreset,
    ) {
        val dabCount: Int get() = dabs.size
    }

    val SmoothInk = DynamicsPreset(
        id = "smooth-ink",
        name = "Smooth Ink",
        pressureSize = ResponseCurve.FirmMiddle,
        pressureOpacity = ResponseCurve.InkSnap,
        velocitySize = ResponseCurve.ReverseVelocity,
        velocityOpacity = ResponseCurve.ResponseCurveCompatibility.reverseGentle,
        pressureDeadZone = 0.015f,
        pressureGain = 1.08f,
        velocityScale = 20f,
    )

    val PencilTexture = DynamicsPreset(
        id = "pencil-texture",
        name = "Pencil Texture",
        pressureSize = ResponseCurve.SoftStart,
        pressureOpacity = ResponseCurve.gamma(1.35f),
        velocitySize = ResponseCurve(listOf(CurvePoint(0f, 1f), CurvePoint(1f, 0.78f))),
        velocityOpacity = ResponseCurve(listOf(CurvePoint(0f, 1f), CurvePoint(1f, 0.58f))),
        pressureDeadZone = 0.04f,
        pressureGain = 1.18f,
        velocityScale = 28f,
        jitterAmount = 0.12f,
        jitterSeed = 83,
    )

    val VectorClean = DynamicsPreset(
        id = "vector-clean",
        name = "Vector Clean",
        pressureSize = ResponseCurve(listOf(CurvePoint(0f, 0.84f), CurvePoint(1f, 1f))),
        pressureOpacity = ResponseCurve(listOf(CurvePoint(0f, 0.82f), CurvePoint(1f, 1f))),
        velocitySize = ResponseCurve(listOf(CurvePoint(0f, 1f), CurvePoint(1f, 0.90f))),
        velocityOpacity = ResponseCurve(listOf(CurvePoint(0f, 1f), CurvePoint(1f, 0.92f))),
        pressureDeadZone = 0f,
        pressureGain = 0.92f,
        velocityScale = 16f,
        jitterAmount = 0f,
    )

    val presets: Map<String, DynamicsPreset> = listOf(SmoothInk, PencilTexture, VectorClean).associateBy { it.id }

    fun normalizePressure(rawPressure: Float, preset: DynamicsPreset): Float {
        val p = preset.sanitized()
        val shifted = ((rawPressure.coerceIn(0f, 1f) - p.pressureDeadZone) / max(0.0001f, 1f - p.pressureDeadZone))
        return (shifted * p.pressureGain).coerceIn(0f, 1f)
    }

    fun velocityUnit(rawVelocity: Float, preset: DynamicsPreset): Float {
        val p = preset.sanitized()
        return (rawVelocity.coerceAtLeast(0f) * p.velocityScale).coerceIn(0f, 1f)
    }

    fun dynamicDabFromSample(
        sample: BrushEngine.StrokeSample,
        stamp: BrushEngine.StampPlan,
        brush: DynamicBrush,
        sampleIndex: Int,
        symmetryIndex: Int = 0,
        positionOverride: VectorEngine.Vec2? = null,
    ): DynamicDab {
        val safe = brush.sanitized()
        val p = safe.dynamics
        val pressure = normalizePressure(sample.pressure, p)
        val velocity = velocityUnit(sample.velocity, p)
        val sizePressure = lerp(0.42f, 1.22f, p.pressureSize.evaluate(pressure))
        val sizeVelocity = lerp(0.72f, 1.08f, p.velocitySize.evaluate(velocity))
        val opacityPressure = lerp(0.18f, 1.12f, p.pressureOpacity.evaluate(pressure))
        val opacityVelocity = lerp(0.58f, 1.04f, p.velocityOpacity.evaluate(velocity))
        val taper = p.taper.evaluate(sample.taper.coerceIn(0f, 1f)).coerceIn(0f, 1.35f)
        val jitter = deterministicJitter(sampleIndex + symmetryIndex * 10_007, p)
        val pos = positionOverride ?: VectorEngine.Vec2(sample.x, sample.y)
        val radius = (stamp.radius * sizePressure * sizeVelocity * max(0.25f, taper)).coerceIn(0.25f, safe.brushProfile.maxSize / 2f)
        val hardRadius = (radius * (stamp.hardRadius / max(0.0001f, stamp.radius))).coerceIn(0.05f, radius)
        val feather = max(0.1f, radius - hardRadius)
        val opacity = (stamp.opacity * opacityPressure * opacityVelocity).coerceIn(0f, safe.brushProfile.opacity)
        return DynamicDab(
            x = pos.x + jitter.x * radius,
            y = pos.y + jitter.y * radius,
            radius = radius,
            hardRadius = hardRadius,
            feather = feather,
            opacity = opacity,
            angle = stamp.angle,
            grain = stamp.grain,
            pressure = pressure,
            velocity = velocity,
            taper = taper,
            symmetryIndex = symmetryIndex,
        )
    }

    fun planDynamicStroke(
        rawPoints: List<BrushEngine.RawStylusPoint>,
        brush: DynamicBrush = DynamicBrush(),
        symmetryMode: VectorEngine.SymmetryMode = VectorEngine.SymmetryMode.None,
        symmetryCenter: VectorEngine.Vec2 = VectorEngine.Vec2.Zero,
    ): DynamicStrokePlan {
        val safe = brush.sanitized()
        val base = BrushEngine.planStroke(rawPoints, safe.brushProfile)
        val basePositions = base.samples.map { VectorEngine.Vec2(it.x, it.y) }
        val symmetryPositions = VectorEngine.symmetryCopies(basePositions, symmetryMode, symmetryCenter)
        val dabs = mutableListOf<DynamicDab>()
        symmetryPositions.forEachIndexed { symmetryIndex, points ->
            base.samples.forEachIndexed { sampleIndex, sample ->
                val stamp = base.stamps[sampleIndex]
                val pos = points.getOrNull(sampleIndex) ?: VectorEngine.Vec2(sample.x, sample.y)
                dabs += dynamicDabFromSample(sample, stamp, safe, sampleIndex, symmetryIndex, pos)
            }
        }
        return DynamicStrokePlan(base, dabs, symmetryMode, symmetryCenter, safe.dynamics)
    }

    fun preset(id: String): DynamicsPreset = presets[id]?.sanitized() ?: SmoothInk

    private fun deterministicJitter(index: Int, preset: DynamicsPreset): VectorEngine.Vec2 {
        val amount = preset.sanitized().jitterAmount
        if (amount <= 0f) return VectorEngine.Vec2.Zero
        val n = hash(index + preset.jitterSeed * 31)
        val m = hash(index * 17 + preset.jitterSeed * 101)
        val angle = n * PI.toFloat() * 2f
        val radius = (m - 0.5f) * amount
        return VectorEngine.Vec2(cos(angle) * radius, sin(angle) * radius)
    }

    private fun hash(seed: Int): Float {
        var x = seed
        x = x xor (x shl 13)
        x = x xor (x ushr 17)
        x = x xor (x shl 5)
        return ((x ushr 1) % 10_000) / 10_000f
    }

    private fun smoothStep(t: Float): Float {
        val x = t.coerceIn(0f, 1f)
        return x * x * (3f - 2f * x)
    }

    private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t.coerceIn(0f, 1f)

    private object ResponseCurveCompatibility {
        val reverseGentle = ResponseCurve(listOf(CurvePoint(0f, 1f), CurvePoint(1f, 0.78f)))
    }
}
