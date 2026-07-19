package com.inkframe.feature.canvas

internal data class GlassHorizonStagePlacement(
    val stageVisible: Boolean,
    val hostWidthDp: Float,
    val hostHeightDp: Float,
    val titleBottomDp: Float,
    val commandTopDp: Float,
    val commandBottomDp: Float,
    val canvasWidthDp: Float,
    val canvasHeightDp: Float,
    val frameWidthDp: Float,
    val frameHeightDp: Float,
    val frameLeftDp: Float,
    val frameTopDp: Float,
    val stageAreaTopDp: Float,
    val stageAreaBottomDp: Float,
)

/**
 * Pure layout policy that reserves the product title and command cluster before fitting artwork.
 *
 * The OpenGL host must remain composed even when the visible stage cannot fit. Hidden placements
 * therefore retain a one-physical-pixel host offscreen while exposing zero visual frame/canvas
 * dimensions. This preserves the same CanvasView, EGL context, engine, recovery controller, and
 * GPU surface identities across compact/freeform window resizing.
 */
internal object GlassHorizonStageLayout {
    const val CANVAS_WIDTH_FRACTION: Float = 0.64f
    const val FRAME_OPTICAL_PADDING_DP: Float = 28f
    const val HEADER_TO_STAGE_GAP_DP: Float = 12f
    const val FRAME_BADGE_OVERFLOW_DP: Float = 30f
    const val SCRUB_RAIL_TOP_INSET_DP: Float = 46f
    const val FRAME_BADGE_TO_SCRUB_GAP_DP: Float = 8f
    const val BOTTOM_CONTROL_RESERVE_DP: Float =
        FRAME_BADGE_OVERFLOW_DP + SCRUB_RAIL_TOP_INSET_DP + FRAME_BADGE_TO_SCRUB_GAP_DP
    const val MIN_RENDERABLE_EXTENT_PX: Float = 1f
    const val HIDDEN_HOST_OFFSET_MULTIPLIER: Float = 2f

    fun place(
        viewportWidthDp: Float,
        viewportHeightDp: Float,
        documentAspect: Float,
        fontScale: Float,
        density: Float,
    ): GlassHorizonStagePlacement {
        require(viewportWidthDp > 0f)
        require(viewportHeightDp > 0f)
        require(documentAspect > 0f)
        require(fontScale > 0f)
        require(density > 0f)

        val minimumHostExtentDp = MIN_RENDERABLE_EXTENT_PX / density
        val titleBottom = GlassHorizonTitleSpec.titleBottomDp(fontScale)
        val commandTop = GlassHorizonTitleSpec.commandTopDp(fontScale)
        val commandBottom = GlassHorizonTitleSpec.commandBottomDp(fontScale)
        val stageAreaTop = commandBottom + HEADER_TO_STAGE_GAP_DP
        val stageAreaBottom = (viewportHeightDp - BOTTOM_CONTROL_RESERVE_DP).coerceAtLeast(0f)
        val availableFrameHeight = stageAreaBottom - stageAreaTop
        val availableCanvasHeight = availableFrameHeight - FRAME_OPTICAL_PADDING_DP
        val availableCanvasWidth = viewportWidthDp * CANVAS_WIDTH_FRACTION

        if (
            availableCanvasHeight < minimumHostExtentDp ||
            availableCanvasWidth < minimumHostExtentDp
        ) {
            return hiddenPlacement(
                minimumHostExtentDp = minimumHostExtentDp,
                titleBottom = titleBottom,
                commandTop = commandTop,
                commandBottom = commandBottom,
                stageAreaTop = stageAreaTop,
                stageAreaBottom = stageAreaBottom,
            )
        }

        // Fit from both axes without coercing either dimension upward. This preserves the aspect
        // ratio and height cap for valid extreme documents such as 1×16384 pixel archives.
        val canvasWidth = minOf(availableCanvasWidth, availableCanvasHeight * documentAspect)
        val canvasHeight = canvasWidth / documentAspect
        if (
            canvasWidth < minimumHostExtentDp ||
            canvasHeight < minimumHostExtentDp
        ) {
            return hiddenPlacement(
                minimumHostExtentDp = minimumHostExtentDp,
                titleBottom = titleBottom,
                commandTop = commandTop,
                commandBottom = commandBottom,
                stageAreaTop = stageAreaTop,
                stageAreaBottom = stageAreaBottom,
            )
        }

        val frameWidth = canvasWidth + FRAME_OPTICAL_PADDING_DP
        val frameHeight = canvasHeight + FRAME_OPTICAL_PADDING_DP
        val frameLeft = ((viewportWidthDp - frameWidth) / 2f).coerceAtLeast(0f)
        val frameTop = stageAreaTop + ((availableFrameHeight - frameHeight) / 2f).coerceAtLeast(0f)

        return GlassHorizonStagePlacement(
            stageVisible = true,
            hostWidthDp = canvasWidth,
            hostHeightDp = canvasHeight,
            titleBottomDp = titleBottom,
            commandTopDp = commandTop,
            commandBottomDp = commandBottom,
            canvasWidthDp = canvasWidth,
            canvasHeightDp = canvasHeight,
            frameWidthDp = frameWidth,
            frameHeightDp = frameHeight,
            frameLeftDp = frameLeft,
            frameTopDp = frameTop,
            stageAreaTopDp = stageAreaTop,
            stageAreaBottomDp = stageAreaBottom,
        )
    }

    private fun hiddenPlacement(
        minimumHostExtentDp: Float,
        titleBottom: Float,
        commandTop: Float,
        commandBottom: Float,
        stageAreaTop: Float,
        stageAreaBottom: Float,
    ): GlassHorizonStagePlacement = GlassHorizonStagePlacement(
        stageVisible = false,
        hostWidthDp = minimumHostExtentDp,
        hostHeightDp = minimumHostExtentDp,
        titleBottomDp = titleBottom,
        commandTopDp = commandTop,
        commandBottomDp = commandBottom,
        canvasWidthDp = 0f,
        canvasHeightDp = 0f,
        frameWidthDp = 0f,
        frameHeightDp = 0f,
        frameLeftDp = -minimumHostExtentDp * HIDDEN_HOST_OFFSET_MULTIPLIER,
        frameTopDp = -minimumHostExtentDp * HIDDEN_HOST_OFFSET_MULTIPLIER,
        stageAreaTopDp = stageAreaTop,
        stageAreaBottomDp = stageAreaBottom,
    )
}
