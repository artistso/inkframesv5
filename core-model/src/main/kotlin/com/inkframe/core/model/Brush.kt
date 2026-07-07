package com.inkframe.core.model

/**
 * Parameters describing a brush. The GL engine consumes these to stamp textured
 * dabs along an input stroke. Pressure/tilt from the stylus modulate size & opacity.
 */
data class Brush(
    val id: String,
    val name: String,
    val kind: BrushKind = BrushKind.ROUND,
    /** Base diameter in canvas pixels. */
    val sizePx: Float = 24f,
    val minSizePx: Float = 2f,
    val opacity: Float = 1f,
    val flow: Float = 1f,
    val hardness: Float = 0.8f,
    /** Dab spacing as a fraction of the diameter (lower = smoother but heavier). */
    val spacing: Float = 0.08f,
    val pressureToSize: Boolean = true,
    val pressureToOpacity: Boolean = false,
    val sizePressureCurve: PressureCurve = PressureCurve.LINEAR,
    val opacityPressureCurve: PressureCurve = PressureCurve.LINEAR,
    val smoothing: Float = 0.35f,
    /**
     * When true, repeated dabs within a single stroke accumulate (darken) — the
     * airbrush model. When false, the stroke is flattened to uniform coverage in a
     * scratch buffer first (no overlap darkening) and applied once at [opacity].
     */
    val buildUp: Boolean = false,
) {
    /** Effective diameter for a given normalized pressure (0..1). */
    fun diameterForPressure(pressure: Float): Float {
        if (!pressureToSize) return sizePx
        val p = sizePressureCurve.apply(pressure)
        return minSizePx + (sizePx - minSizePx) * p
    }

    /**
     * Per-dab coverage written into the stroke scratch buffer. This intentionally does
     * NOT include the brush's overall [opacity] — that is applied a single time when the
     * finished stroke is composited onto the cel, which is what prevents overlapping
     * dabs from darkening. Pressure may still modulate per-dab flow when enabled.
     */
    fun flowForPressure(pressure: Float): Float {
        val base = flow
        return if (pressureToOpacity) base * opacityPressureCurve.apply(pressure) else base
    }
}

/**
 * Pressure response curves shared by size and opacity dynamics. These are small,
 * deterministic curves so brush output can be tested and replayed exactly.
 */
enum class PressureCurve {
    LINEAR,
    /** Responds earlier at light pressure, useful for soft pencils and watercolor. */
    SOFT,
    /** Holds back until firmer pressure, useful for ink and markers. */
    FIRM;

    fun apply(pressure: Float): Float {
        val p = pressure.coerceIn(0f, 1f)
        return when (this) {
            LINEAR -> p
            SOFT -> 1f - (1f - p) * (1f - p)
            FIRM -> p * p
        }
    }
}

enum class BrushKind { ROUND, PENCIL, INK, AIRBRUSH, ERASER, MARKER }

object DefaultBrushes {
    val pencil = Brush(
        "pencil", "Pencil", BrushKind.PENCIL,
        sizePx = 6f, hardness = 0.95f, spacing = 0.05f, sizePressureCurve = PressureCurve.SOFT,
    )
    val ink = Brush(
        "ink", "Ink Pen", BrushKind.INK,
        sizePx = 14f, hardness = 0.9f, spacing = 0.04f, sizePressureCurve = PressureCurve.FIRM,
    )
    val round = Brush("round", "Round", BrushKind.ROUND, sizePx = 32f, hardness = 0.6f)
    val airbrush = Brush(
        "airbrush", "Airbrush", BrushKind.AIRBRUSH,
        sizePx = 64f, hardness = 0.15f, flow = 0.10f, spacing = 0.04f,
        pressureToOpacity = true, opacityPressureCurve = PressureCurve.SOFT, buildUp = true,
    )
    val marker = Brush(
        "marker", "Marker", BrushKind.MARKER,
        sizePx = 40f, hardness = 0.7f, opacity = 0.85f, sizePressureCurve = PressureCurve.FIRM,
    )
    val eraser = Brush("eraser", "Eraser", BrushKind.ERASER, sizePx = 40f, hardness = 0.8f)

    val all = listOf(pencil, ink, round, airbrush, marker, eraser)
}
