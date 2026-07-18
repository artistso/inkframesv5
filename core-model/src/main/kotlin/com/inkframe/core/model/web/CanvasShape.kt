package com.inkframe.core.model.web

/**
 * Document canvas outline persisted by the session schema (`canvasShape:'square'|'circle'`).
 * Normalization mirrors `normalizeShape` in web/canvas-shape.js:4
 * (`value==='circle'?'circle':'square'`, re-exported as `normalizeCanvasShape` in
 * web/autosave.js:29-31): only the exact string `'circle'` selects [CIRCLE].
 *
 * Note: the `.inkframe` archive v3/v4 does **not** carry this field (exact key set,
 * PORT_MAP §4.2); it is session-only, so archive import always yields [SQUARE].
 */
enum class CanvasShape(val key: String) {
    SQUARE("square"),
    CIRCLE("circle");

    companion object {
        /** `null`/unknown → [SQUARE] (canvas-shape.js:4: anything but `'circle'` is square). */
        fun fromKey(key: String?): CanvasShape = if (key == CIRCLE.key) CIRCLE else SQUARE
    }
}
