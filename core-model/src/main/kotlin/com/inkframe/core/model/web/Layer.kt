package com.inkframe.core.model.web

/**
 * One frame-local drawing layer: `{id,name,visible,opacity,blend,canvas}` in the web
 * (i.html:1062, factory `newLayer` i.html:1073-1076).
 *
 * Pixels are straight-alpha ARGB (`0xAARRGGBB`) packed row-major at the owning project's
 * `w*h`; `null` is a blank (fully transparent) layer — the JVM stand-in for a web canvas
 * that has never been painted or failed to decode (i.html:4530-4533).
 *
 * Equality: `IntArray` identity would break value semantics, so [equals]/[hashCode] are
 * custom and compare [pixels] by **content** (`contentEquals`/`contentHashCode`). All
 * other properties behave like a regular data class (including [copy]).
 */
data class Layer(
    val id: Long,
    val name: String,
    val visible: Boolean = true,
    val opacity: Double = 1.0,
    val blend: BlendMode = BlendMode.SOURCE_OVER,
    val pixels: IntArray? = null,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Layer) return false
        return id == other.id &&
            name == other.name &&
            visible == other.visible &&
            opacity == other.opacity &&
            blend == other.blend &&
            pixels.contentEqualsNullable(other.pixels)
    }

    override fun hashCode(): Int {
        var result = id.hashCode()
        result = 31 * result + name.hashCode()
        result = 31 * result + visible.hashCode()
        result = 31 * result + opacity.hashCode()
        result = 31 * result + blend.hashCode()
        result = 31 * result + (pixels?.contentHashCode() ?: 0)
        return result
    }
}

/** `contentEquals` that treats two `null` arrays as equal (shared by Layer/Background). */
internal fun IntArray?.contentEqualsNullable(other: IntArray?): Boolean =
    this === other || (this != null && other != null && contentEquals(other))
