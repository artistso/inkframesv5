package com.inkframe.core.model.web

/**
 * One animation frame: `{layers[], active, _v}` in the web (i.html:1062, factory
 * `newFrame` i.html:1077-1078). [layers] index 0 is the bottom of the stack.
 *
 * [active] invariant: the web clamps it at every construction/import boundary
 * (`Math.min(item.active|0, layers.length-1)`, i.html:4510, 4565 — note the web applies
 * **no lower clamp** there) and tolerates transient out-of-range values at read time via
 * `frameActive(fr)=fr.layers[fr.active]||fr.layers[0]` (i.html:1079). This class mirrors
 * both halves exactly: factories/codecs clamp on construction, and [activeLayer] provides
 * the web's read-time fallback, so the raw constructor never throws on a foreign `active`.
 *
 * [version] is the web `_v` cache counter bumped on any pixel/prop change
 * (`bumpFrame`, i.html:1081); codecs never persist it.
 */
data class Frame(
    val layers: List<Layer>,
    val active: Int = 0,
    val version: Long = 0,
) {
    init {
        // Web frames always carry at least one layer (newFrame i.html:1077; import
        // substitutes a "Layer 1" placeholder for empty stacks, i.html:4556).
        require(layers.isNotEmpty()) { "Frame requires at least one layer" }
    }

    /** `frameActive(fr)` (i.html:1079): the active layer, falling back to the bottom layer. */
    val activeLayer: Layer
        get() = layers.getOrElse(active) { layers[0] }

    companion object {
        /** `newFrame(w,h)`: one layer named "Layer 1", active 0, version 0 (i.html:1077-1078). */
        fun blank(ids: LayerIdGenerator): Frame = Frame(
            layers = listOf(Layer(id = ids.next(), name = Caps.FIRST_LAYER_NAME)),
            active = 0,
            version = 0,
        )
    }
}
