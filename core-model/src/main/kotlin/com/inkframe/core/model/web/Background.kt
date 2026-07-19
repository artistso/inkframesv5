package com.inkframe.core.model.web

/**
 * Per-project static background from the injector-era session/v4-archive schema
 * (`background:{visible,opacity,blend,blob|png}`; autosave.js:133-138,
 * tools/inject-static-background-v2.mjs:87). Absent (`null` on [Project]) in canonical v3
 * archives. Pixels use the same straight-alpha ARGB contract as [Layer.pixels]; `null` is
 * a blank background canvas. Equality compares pixels by content (see [Layer]).
 */
data class Background(
    val visible: Boolean = true,
    val opacity: Double = 1.0,
    val blend: BlendMode = BlendMode.SOURCE_OVER,
    val pixels: IntArray? = null,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Background) return false
        return visible == other.visible &&
            opacity == other.opacity &&
            blend == other.blend &&
            pixels.contentEqualsNullable(other.pixels)
    }

    override fun hashCode(): Int {
        var result = visible.hashCode()
        result = 31 * result + opacity.hashCode()
        result = 31 * result + blend.hashCode()
        result = 31 * result + (pixels?.contentHashCode() ?: 0)
        return result
    }
}
