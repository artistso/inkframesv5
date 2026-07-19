package com.inkframe.core.model

/**
 * Artist-facing stroke-feel presets shared by the native Brush Lab UI and tests.
 *
 * The web Brush Lab exposes Direct, Balanced, and Smooth as its primary tuning choices.
 * This native slice maps those choices onto the parameters already consumed by the
 * Kotlin/OpenGL stroke processor: dab spacing and smoothing. Brush material settings
 * such as size, opacity, hardness, flow, pressure response, and build-up remain intact.
 */
enum class BrushLabPreset(val displayName: String) {
    DIRECT("Direct"),
    BALANCED("Balanced"),
    SMOOTH("Smooth"),
}

object BrushLabPresets {

    data class Tuning(
        val spacing: Float,
        val smoothing: Float,
    )

    fun tuning(preset: BrushLabPreset): Tuning = when (preset) {
        BrushLabPreset.DIRECT -> Tuning(spacing = 0.08f, smoothing = 0.05f)
        BrushLabPreset.BALANCED -> Tuning(spacing = 0.06f, smoothing = 0.35f)
        BrushLabPreset.SMOOTH -> Tuning(spacing = 0.035f, smoothing = 0.70f)
    }

    /** Applies stroke feel without replacing the selected brush's material identity. */
    fun apply(brush: Brush, preset: BrushLabPreset): Brush {
        val value = tuning(preset)
        return brush.copy(
            spacing = value.spacing.coerceIn(
                BrushAdjustments.SPACING_RANGE.start,
                BrushAdjustments.SPACING_RANGE.endInclusive,
            ),
            smoothing = value.smoothing.coerceIn(
                BrushAdjustments.SMOOTHING_RANGE.start,
                BrushAdjustments.SMOOTHING_RANGE.endInclusive,
            ),
        )
    }

    /** Returns the exact primary preset represented by [brush], or null for custom tuning. */
    fun closestExact(brush: Brush, epsilon: Float = 0.0001f): BrushLabPreset? =
        BrushLabPreset.entries.firstOrNull { preset ->
            val value = tuning(preset)
            kotlin.math.abs(brush.spacing - value.spacing) <= epsilon &&
                kotlin.math.abs(brush.smoothing - value.smoothing) <= epsilon
        }
}
