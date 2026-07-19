package com.inkframe.core.model

/**
 * Pure, validated mutators for live brush editing from a settings panel.
 *
 * A UI slider can produce any raw value; these helpers clamp each parameter into the
 * range the engine expects and keep dependent invariants consistent (e.g. min diameter
 * never exceeds the base diameter). Each returns a new [Brush] — the model stays
 * immutable — and the logic is unit-tested without Android.
 *
 * The clamp ranges double as the slider bounds the panel should display (see the
 * `*_RANGE` constants), so UI and validation can't drift apart.
 */
object BrushAdjustments {

    val SIZE_RANGE = 1f..512f
    val MIN_SIZE_RANGE = 1f..512f
    val OPACITY_RANGE = 0f..1f
    val FLOW_RANGE = 0f..1f
    val HARDNESS_RANGE = 0f..1f
    val SPACING_RANGE = 0.01f..1f
    val SMOOTHING_RANGE = 0f..0.95f

    private fun Float.clampTo(r: ClosedFloatingPointRange<Float>): Float =
        coerceIn(r.start, r.endInclusive)

    /**
     * Repairs a complete brush profile that may have been changed outside these helpers.
     *
     * Radial shortcuts and imported profiles can arrive with individually plausible values
     * that violate a dependent invariant such as `minSizePx <= sizePx`. Normalize at UI and
     * engine boundaries so displayed values and pressure behavior always describe one state.
     */
    fun normalized(brush: Brush): Brush {
        val size = brush.sizePx.clampTo(SIZE_RANGE)
        return brush.copy(
            sizePx = size,
            minSizePx = brush.minSizePx.clampTo(MIN_SIZE_RANGE).coerceAtMost(size),
            opacity = brush.opacity.clampTo(OPACITY_RANGE),
            flow = brush.flow.clampTo(FLOW_RANGE),
            hardness = brush.hardness.clampTo(HARDNESS_RANGE),
            spacing = brush.spacing.clampTo(SPACING_RANGE),
            smoothing = brush.smoothing.clampTo(SMOOTHING_RANGE),
        )
    }

    /** Sets base diameter; nudges [Brush.minSizePx] down if it would exceed the new size. */
    fun withSize(brush: Brush, sizePx: Float): Brush {
        val s = sizePx.clampTo(SIZE_RANGE)
        val min = brush.minSizePx.coerceAtMost(s)
        return brush.copy(sizePx = s, minSizePx = min)
    }

    /** Sets the minimum (lowest-pressure) diameter; never above the base size. */
    fun withMinSize(brush: Brush, minSizePx: Float): Brush {
        val min = minSizePx.clampTo(MIN_SIZE_RANGE).coerceAtMost(brush.sizePx)
        return brush.copy(minSizePx = min)
    }

    fun withOpacity(brush: Brush, opacity: Float): Brush =
        brush.copy(opacity = opacity.clampTo(OPACITY_RANGE))

    fun withFlow(brush: Brush, flow: Float): Brush =
        brush.copy(flow = flow.clampTo(FLOW_RANGE))

    fun withHardness(brush: Brush, hardness: Float): Brush =
        brush.copy(hardness = hardness.clampTo(HARDNESS_RANGE))

    fun withSpacing(brush: Brush, spacing: Float): Brush =
        brush.copy(spacing = spacing.clampTo(SPACING_RANGE))

    fun withSmoothing(brush: Brush, smoothing: Float): Brush =
        brush.copy(smoothing = smoothing.clampTo(SMOOTHING_RANGE))

    fun withPressureToSize(brush: Brush, enabled: Boolean): Brush =
        brush.copy(pressureToSize = enabled)

    fun withPressureToOpacity(brush: Brush, enabled: Boolean): Brush =
        brush.copy(pressureToOpacity = enabled)

    fun withBuildUp(brush: Brush, enabled: Boolean): Brush =
        brush.copy(buildUp = enabled)

    /** Restores a brush's parameters to its matching factory default (matched by id). */
    fun resetToDefault(brush: Brush): Brush =
        DefaultBrushes.all.firstOrNull { it.id == brush.id } ?: brush
}
