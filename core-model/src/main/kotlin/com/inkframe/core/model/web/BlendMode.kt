package com.inkframe.core.model.web

/**
 * The 11 Canvas2D `globalCompositeOperation` strings persisted per layer, in the exact
 * order of `BLEND_MODES` (i.html:1067-1068) with UI labels from `BLEND_LABEL`
 * (i.html:1069-1071). File compatibility: archives and sessions store [key], never the
 * enum name.
 */
enum class BlendMode(val key: String, val label: String) {
    SOURCE_OVER("source-over", "Normal"),
    MULTIPLY("multiply", "Multiply"),
    SCREEN("screen", "Screen"),
    OVERLAY("overlay", "Overlay"),
    DARKEN("darken", "Darken"),
    LIGHTEN("lighten", "Lighten"),
    COLOR_DODGE("color-dodge", "Dodge"),
    COLOR_BURN("color-burn", "Burn"),
    HARD_LIGHT("hard-light", "Hard"),
    SOFT_LIGHT("soft-light", "Soft"),
    DIFFERENCE("difference", "Diff");

    companion object {
        /**
         * Maps a persisted Canvas2D string back to a mode. `null`/empty/unknown keys map to
         * [SOURCE_OVER]: the web import falls back via `L.blend||'source-over'`
         * (i.html:4505, 4560) and the JVM enum cannot represent foreign strings, so unknown
         * values degrade to the default mode.
         */
        fun fromKey(key: String?): BlendMode = entries.firstOrNull { it.key == key } ?: SOURCE_OVER
    }
}
