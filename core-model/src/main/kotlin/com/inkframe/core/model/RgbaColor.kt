package com.inkframe.core.model

/** Linear-friendly RGBA color with components in 0..1. */
data class RgbaColor(
    val r: Float,
    val g: Float,
    val b: Float,
    val a: Float = 1f,
) {
    init {
        require(r in 0f..1f && g in 0f..1f && b in 0f..1f && a in 0f..1f) {
            "RGBA components must be 0..1 (got $r,$g,$b,$a)"
        }
    }

    /** Packs to 0xAARRGGBB int. */
    fun toArgb(): Int {
        val ai = (a * 255f + 0.5f).toInt() and 0xFF
        val ri = (r * 255f + 0.5f).toInt() and 0xFF
        val gi = (g * 255f + 0.5f).toInt() and 0xFF
        val bi = (b * 255f + 0.5f).toInt() and 0xFF
        return (ai shl 24) or (ri shl 16) or (gi shl 8) or bi
    }

    fun withAlpha(alpha: Float): RgbaColor = copy(a = alpha.coerceIn(0f, 1f))

    companion object {
        val BLACK = RgbaColor(0f, 0f, 0f)
        val WHITE = RgbaColor(1f, 1f, 1f)
        val TRANSPARENT = RgbaColor(0f, 0f, 0f, 0f)

        fun fromArgb(argb: Int): RgbaColor = RgbaColor(
            r = ((argb shr 16) and 0xFF) / 255f,
            g = ((argb shr 8) and 0xFF) / 255f,
            b = (argb and 0xFF) / 255f,
            a = ((argb shr 24) and 0xFF) / 255f,
        )
    }
}
