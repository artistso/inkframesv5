package com.inkframe.core.model

/**
 * A colour in HSV (hue-saturation-value) space — the natural space for a colour picker.
 *
 *  - [h] hue in degrees, 0..360 (wraps)
 *  - [s] saturation, 0..1
 *  - [v] value/brightness, 0..1
 *  - [a] alpha, 0..1
 *
 * Conversions to/from [RgbaColor] follow the standard HSV algorithm and are unit-tested
 * against well-known reference values. Pure Kotlin — no Android.
 */
data class Hsv(
    val h: Float,
    val s: Float,
    val v: Float,
    val a: Float = 1f,
) {
    /** Returns a normalized copy: hue wrapped to [0,360), s/v/a clamped to [0,1]. */
    fun normalized(): Hsv = Hsv(
        h = wrapHue(h),
        s = s.coerceIn(0f, 1f),
        v = v.coerceIn(0f, 1f),
        a = a.coerceIn(0f, 1f),
    )

    fun withHue(hue: Float) = copy(h = wrapHue(hue))
    fun withSaturation(sat: Float) = copy(s = sat.coerceIn(0f, 1f))
    fun withValue(value: Float) = copy(v = value.coerceIn(0f, 1f))
    fun withAlpha(alpha: Float) = copy(a = alpha.coerceIn(0f, 1f))

    /** Converts to RGBA in 0..1. */
    fun toRgba(): RgbaColor {
        val hh = wrapHue(h)
        val ss = s.coerceIn(0f, 1f)
        val vv = v.coerceIn(0f, 1f)
        val aa = a.coerceIn(0f, 1f)

        val c = vv * ss
        val x = c * (1f - kotlin.math.abs((hh / 60f) % 2f - 1f))
        val m = vv - c
        val (r1, g1, b1) = when {
            hh < 60f -> Triple(c, x, 0f)
            hh < 120f -> Triple(x, c, 0f)
            hh < 180f -> Triple(0f, c, x)
            hh < 240f -> Triple(0f, x, c)
            hh < 300f -> Triple(x, 0f, c)
            else -> Triple(c, 0f, x)
        }
        return RgbaColor(
            r = (r1 + m).coerceIn(0f, 1f),
            g = (g1 + m).coerceIn(0f, 1f),
            b = (b1 + m).coerceIn(0f, 1f),
            a = aa,
        )
    }

    companion object {
        fun wrapHue(h: Float): Float {
            val m = h % 360f
            return if (m < 0f) m + 360f else m
        }

        /**
         * Converts an [RgbaColor] to HSV. For greys (s=0) hue is undefined and reported as
         * 0. Preserves alpha.
         */
        fun fromRgba(c: RgbaColor): Hsv {
            val r = c.r; val g = c.g; val b = c.b
            val max = maxOf(r, g, b)
            val min = minOf(r, g, b)
            val delta = max - min

            val h = when {
                delta < 1e-6f -> 0f
                max == r -> 60f * (((g - b) / delta) % 6f)
                max == g -> 60f * (((b - r) / delta) + 2f)
                else -> 60f * (((r - g) / delta) + 4f)
            }
            val s = if (max < 1e-6f) 0f else delta / max
            return Hsv(wrapHue(h), s.coerceIn(0f, 1f), max.coerceIn(0f, 1f), c.a)
        }
    }
}
