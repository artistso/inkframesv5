package com.inkframe.studio.vector

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Pure Kotlin vector geometry core for InkFrame.
 *
 * This is renderer-agnostic: no Android Canvas, no Compose, no WebView. It gives
 * the app a native vector foundation inspired by professional vector workflows:
 * editable anchors, cubic Bézier paths, simplification, snapping, symmetry, and
 * stroke-outline planning.
 */
object VectorEngine {
    const val VERSION: String = "v0.1.0-vector-path-core"

    private const val EPSILON = 1e-5f

    enum class AnchorKind { Corner, Smooth, Symmetric }
    enum class PathFillRule { NonZero, EvenOdd }
    enum class SnapMode { None, Grid, Angle, GridAndAngle }
    enum class SymmetryMode { None, Horizontal, Vertical, Quad }

    data class Vec2(val x: Float, val y: Float) {
        operator fun plus(other: Vec2): Vec2 = Vec2(x + other.x, y + other.y)
        operator fun minus(other: Vec2): Vec2 = Vec2(x - other.x, y - other.y)
        operator fun times(scale: Float): Vec2 = Vec2(x * scale, y * scale)
        operator fun div(scale: Float): Vec2 = Vec2(x / scale, y / scale)
        fun dot(other: Vec2): Float = x * other.x + y * other.y
        fun cross(other: Vec2): Float = x * other.y - y * other.x
        fun length(): Float = sqrt(x * x + y * y)
        fun distanceTo(other: Vec2): Float = (this - other).length()
        fun normalized(): Vec2 {
            val len = length()
            return if (len < EPSILON) Zero else this / len
        }
        fun perpendicularLeft(): Vec2 = Vec2(-y, x)
        fun lerp(to: Vec2, t: Float): Vec2 = this + (to - this) * t.coerceIn(0f, 1f)
        fun mirrorX(centerX: Float): Vec2 = Vec2(centerX * 2f - x, y)
        fun mirrorY(centerY: Float): Vec2 = Vec2(x, centerY * 2f - y)

        companion object {
            val Zero = Vec2(0f, 0f)
        }
    }

    data class Bounds(val minX: Float, val minY: Float, val maxX: Float, val maxY: Float) {
        val width: Float get() = maxX - minX
        val height: Float get() = maxY - minY
        val center: Vec2 get() = Vec2((minX + maxX) / 2f, (minY + maxY) / 2f)
        fun include(point: Vec2): Bounds = Bounds(
            min(minX, point.x),
            min(minY, point.y),
            max(maxX, point.x),
            max(maxY, point.y),
        )

        companion object {
            fun from(points: List<Vec2>): Bounds {
                if (points.isEmpty()) return Bounds(0f, 0f, 0f, 0f)
                var out = Bounds(points.first().x, points.first().y, points.first().x, points.first().y)
                points.drop(1).forEach { out = out.include(it) }
                return out
            }
        }
    }

    data class AnchorNode(
        val point: Vec2,
        val handleIn: Vec2? = null,
        val handleOut: Vec2? = null,
        val kind: AnchorKind = AnchorKind.Smooth,
    )

    data class CubicBezier(
        val start: Vec2,
        val control1: Vec2,
        val control2: Vec2,
        val end: Vec2,
    )

    data class VectorStyle(
        val strokeColor: Int = 0xFF111111.toInt(),
        val fillColor: Int? = null,
        val strokeWidth: Float = 4f,
        val opacity: Float = 1f,
        val fillRule: PathFillRule = PathFillRule.NonZero,
    ) {
        fun sanitized(): VectorStyle = copy(
            strokeWidth = strokeWidth.coerceIn(0f, 2048f),
            opacity = opacity.coerceIn(0f, 1f),
        )
    }

    data class VectorPath(
        val anchors: List<AnchorNode>,
        val closed: Boolean = false,
        val style: VectorStyle = VectorStyle(),
        val name: String = "Path",
    ) {
        val isRenderable: Boolean get() = anchors.size >= 2
    }

    data class SnapConfig(
        val mode: SnapMode = SnapMode.None,
        val gridSize: Float = 16f,
        val angleStepDegrees: Float = 15f,
        val origin: Vec2 = Vec2.Zero,
    )

    data class StrokeOutline(val left: List<Vec2>, val right: List<Vec2>) {
        val polygon: List<Vec2> get() = left + right.asReversed()
    }

    data class VectorPlan(
        val rawPoints: List<Vec2>,
        val simplifiedPoints: List<Vec2>,
        val anchors: List<AnchorNode>,
        val cubics: List<CubicBezier>,
        val samples: List<Vec2>,
        val outline: StrokeOutline,
        val bounds: Bounds,
    )

    fun planVectorStroke(
        rawPoints: List<Vec2>,
        simplificationTolerance: Float = 1.25f,
        closed: Boolean = false,
        style: VectorStyle = VectorStyle(),
        sampleStep: Float = 0.08f,
    ): VectorPlan {
        val clean = rawPoints.filterFinite().dedupeNear()
        val simplified = simplify(clean, simplificationTolerance)
        val cubics = catmullRomToCubics(simplified, closed = closed)
        val anchors = anchorsFromCubics(cubics, fallback = simplified)
        val samples = sampleCubics(cubics, sampleStep).ifEmpty { simplified }
        val outline = outlinePolyline(samples, style.sanitized().strokeWidth)
        val bounds = Bounds.from(samples + outline.polygon)
        return VectorPlan(clean, simplified, anchors, cubics, samples, outline, bounds)
    }

    fun simplify(points: List<Vec2>, tolerance: Float): List<Vec2> {
        if (points.size <= 2 || tolerance <= 0f) return points
        return rdp(points, tolerance.coerceAtLeast(0f))
    }

    fun catmullRomToCubics(points: List<Vec2>, closed: Boolean = false, tension: Float = 1f): List<CubicBezier> {
        if (points.size < 2) return emptyList()
        val t = tension.coerceIn(0f, 2f)
        val out = mutableListOf<CubicBezier>()
        val count = if (closed) points.size else points.size - 1
        for (i in 0 until count) {
            val p0 = points.getLooped(i - 1, closed) ?: points[i]
            val p1 = points.getLooped(i, closed) ?: points[i]
            val p2 = points.getLooped(i + 1, closed) ?: points[min(i + 1, points.lastIndex)]
            val p3 = points.getLooped(i + 2, closed) ?: p2
            val c1 = p1 + (p2 - p0) * (t / 6f)
            val c2 = p2 - (p3 - p1) * (t / 6f)
            out += CubicBezier(p1, c1, c2, p2)
        }
        return out
    }

    fun anchorsFromCubics(cubics: List<CubicBezier>, fallback: List<Vec2> = emptyList()): List<AnchorNode> {
        if (cubics.isEmpty()) return fallback.map { AnchorNode(it, kind = AnchorKind.Corner) }
        val anchors = mutableListOf<AnchorNode>()
        anchors += AnchorNode(cubics.first().start, handleOut = cubics.first().control1, kind = AnchorKind.Smooth)
        cubics.forEachIndexed { index, cubic ->
            val next = cubics.getOrNull(index + 1)
            anchors += AnchorNode(
                point = cubic.end,
                handleIn = cubic.control2,
                handleOut = next?.control1,
                kind = AnchorKind.Smooth,
            )
        }
        return anchors
    }

    fun sampleCubic(cubic: CubicBezier, t: Float): Vec2 {
        val u = t.coerceIn(0f, 1f)
        val inv = 1f - u
        val a = inv * inv * inv
        val b = 3f * inv * inv * u
        val c = 3f * inv * u * u
        val d = u * u * u
        return cubic.start * a + cubic.control1 * b + cubic.control2 * c + cubic.end * d
    }

    fun sampleCubics(cubics: List<CubicBezier>, step: Float = 0.08f): List<Vec2> {
        if (cubics.isEmpty()) return emptyList()
        val safeStep = step.coerceIn(0.01f, 1f)
        val perSegment = ceil(1f / safeStep).toInt().coerceIn(1, 512)
        val out = mutableListOf<Vec2>()
        cubics.forEachIndexed { index, cubic ->
            if (index == 0) out += cubic.start
            for (i in 1..perSegment) out += sampleCubic(cubic, i.toFloat() / perSegment)
        }
        return out.dedupeNear()
    }

    fun outlinePolyline(points: List<Vec2>, width: Float): StrokeOutline {
        if (points.isEmpty()) return StrokeOutline(emptyList(), emptyList())
        val half = max(0f, width) / 2f
        if (points.size == 1 || half <= EPSILON) return StrokeOutline(points, points)
        val left = mutableListOf<Vec2>()
        val right = mutableListOf<Vec2>()
        points.forEachIndexed { i, p ->
            val prev = points.getOrNull(i - 1) ?: p
            val next = points.getOrNull(i + 1) ?: p
            val tangent = (next - prev).normalized()
            val normal = tangent.perpendicularLeft()
            left += p + normal * half
            right += p - normal * half
        }
        return StrokeOutline(left, right)
    }

    fun snapPoint(point: Vec2, previous: Vec2? = null, config: SnapConfig): Vec2 {
        var out = point
        if (config.mode == SnapMode.Grid || config.mode == SnapMode.GridAndAngle) {
            val grid = max(EPSILON, config.gridSize)
            out = Vec2(
                config.origin.x + round((out.x - config.origin.x) / grid) * grid,
                config.origin.y + round((out.y - config.origin.y) / grid) * grid,
            )
        }
        if ((config.mode == SnapMode.Angle || config.mode == SnapMode.GridAndAngle) && previous != null) {
            val delta = out - previous
            val len = delta.length()
            if (len > EPSILON) {
                val step = (config.angleStepDegrees.coerceIn(1f, 90f) * PI.toFloat()) / 180f
                val angle = atan2(delta.y, delta.x)
                val snapped = round(angle / step) * step
                out = previous + Vec2(cos(snapped), sin(snapped)) * len
            }
        }
        return out
    }

    fun symmetryCopies(points: List<Vec2>, mode: SymmetryMode, center: Vec2): List<List<Vec2>> = when (mode) {
        SymmetryMode.None -> listOf(points)
        SymmetryMode.Horizontal -> listOf(points, points.map { it.mirrorY(center.y) })
        SymmetryMode.Vertical -> listOf(points, points.map { it.mirrorX(center.x) })
        SymmetryMode.Quad -> listOf(
            points,
            points.map { it.mirrorX(center.x) },
            points.map { it.mirrorY(center.y) },
            points.map { it.mirrorX(center.x).mirrorY(center.y) },
        )
    }

    fun svgPathData(cubics: List<CubicBezier>, closed: Boolean = false): String {
        if (cubics.isEmpty()) return ""
        val b = StringBuilder()
        b.append("M ").append(fmt(cubics.first().start.x)).append(' ').append(fmt(cubics.first().start.y))
        cubics.forEach { c ->
            b.append(" C ")
                .append(fmt(c.control1.x)).append(' ').append(fmt(c.control1.y)).append(", ")
                .append(fmt(c.control2.x)).append(' ').append(fmt(c.control2.y)).append(", ")
                .append(fmt(c.end.x)).append(' ').append(fmt(c.end.y))
        }
        if (closed) b.append(" Z")
        return b.toString()
    }

    private fun List<Vec2>.filterFinite(): List<Vec2> = filter { it.x.isFinite() && it.y.isFinite() }

    private fun List<Vec2>.dedupeNear(threshold: Float = 0.05f): List<Vec2> {
        if (isEmpty()) return this
        val out = mutableListOf(first())
        drop(1).forEach { if (it.distanceTo(out.last()) > threshold) out += it }
        return out
    }

    private fun rdp(points: List<Vec2>, tolerance: Float): List<Vec2> {
        if (points.size <= 2) return points
        var maxDistance = -1f
        var index = -1
        val start = points.first()
        val end = points.last()
        for (i in 1 until points.lastIndex) {
            val distance = perpendicularDistance(points[i], start, end)
            if (distance > maxDistance) {
                maxDistance = distance
                index = i
            }
        }
        return if (maxDistance > tolerance && index > 0) {
            val left = rdp(points.subList(0, index + 1), tolerance)
            val right = rdp(points.subList(index, points.size), tolerance)
            left.dropLast(1) + right
        } else {
            listOf(start, end)
        }
    }

    private fun perpendicularDistance(p: Vec2, a: Vec2, b: Vec2): Float {
        val ab = b - a
        val len = ab.length()
        if (len < EPSILON) return p.distanceTo(a)
        return abs((p - a).cross(ab)) / len
    }

    private fun List<Vec2>.getLooped(index: Int, closed: Boolean): Vec2? {
        if (isEmpty()) return null
        if (!closed && index !in indices) return null
        val wrapped = ((index % size) + size) % size
        return this[wrapped]
    }

    private fun fmt(value: Float): String {
        val rounded = floor(value * 1000f + 0.5f) / 1000f
        return rounded.toString().trimEnd('0').trimEnd('.')
    }
}
