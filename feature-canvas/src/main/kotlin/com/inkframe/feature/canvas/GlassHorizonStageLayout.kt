package com.inkframe.feature.canvas

internal data class GlassHorizonStagePlacement(
    val stageVisible: Boolean,
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
 * This prevents later-composed AndroidView content from painting over or receiving input through
 * the fixed Glass Horizon header at any supported landscape window height or accessibility scale.
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
    const val MIN_RENDERABLE_EXTENT_DP: Float = 0.01f

    fun place(
        viewportWidthDp: Float,
        viewportHeightDp: Float,
        documentAspect: Float,
        fontScale: Float,
    ): GlassHorizonStagePlacement {
        require(viewportWidthDp > 0f)
        require(viewportHeightDp > 0f)
        require(documentAspect > 0f)
        require(fontScale > 0f)

        val titleBottom = GlassHorizonTitleSpec.titleBottomDp(fontScale)
        val commandTop = GlassHorizonTitleSpec.commandTopDp(fontScale)
        val commandBottom = GlassHorizonTitleSpec.commandBottomDp(fontScale)
        val stageAreaTop = commandBottom + HEADER_TO_STAGE_GAP_DP
        val stageAreaBottom = (viewportHeightDp - BOTTOM_CONTROL_RESERVE_DP).coerceAtLeast(0f)
        val availableFrameHeight = stageAreaBottom - stageAreaTop
        val availableCanvasHeight = availableFrameHeight - FRAME_OPTICAL_PADDING_DP
        val availableCanvasWidth = viewportWidthDp * CANVAS_WIDTH_FRACTION

        if (
            availableCanvasHeight < MIN_RENDERABLE_EXTENT_DP ||
            availableCanvasWidth < MIN_RENDERABLE_EXTENT_DP
        ) {
            return hiddenPlacement(
                titleBottom = titleBottom,
                commandTop = commandTop,
                commandBottom = commandBottom,
                stageAreaTop = stageAreaTop,
                stageAreaBottom = stageAreaBottom,
                viewportWidthDp = viewportWidthDp,
            )
        }

        // Fit from both axes without coercing either dimension upward. This preserves the aspect
        // ratio and height cap for valid extreme documents such as 1×16384 pixel archives.
        val canvasWidth = minOf(availableCanvasWidth, availableCanvasHeight * documentAspect)
        val canvasHeight = canvasWidth / documentAspect
        if (
            canvasWidth < MIN_RENDERABLE_EXTENT_DP ||
            canvasHeight < MIN_RENDERABLE_EXTENT_DP
        ) {
            return hiddenPlacement(
                titleBottom = titleBottom,
                commandTop = commandTop,
                commandBottom = commandBottom,
                stageAreaTop = stageAreaTop,
                stageAreaBottom = stageAreaBottom,
                viewportWidthDp = viewportWidthDp,
            )
        }

        val frameWidth = canvasWidth + FRAME_OPTICAL_PADDING_DP
        val frameHeight = canvasHeight + FRAME_OPTICAL_PADDING_DP
        val frameLeft = ((viewportWidthDp - frameWidth) / 2f).coerceAtLeast(0f)
        val frameTop = stageAreaTop + ((availableFrameHeight - frameHeight) / 2f).coerceAtLeast(0f)

        return GlassHorizonStagePlacement(
            stageVisible = true,
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
        titleBottom: Float,
        commandTop: Float,
        commandBottom: Float,
        stageAreaTop: Float,
        stageAreaBottom: Float,
        viewportWidthDp: Float,
    ): GlassHorizonStagePlacement = GlassHorizonStagePlacement(
        stageVisible = false,
        titleBottomDp = titleBottom,
        commandTopDp = commandTop,
        commandBottomDp = commandBottom,
        canvasWidthDp = 0f,
        canvasHeightDp = 0f,
        frameWidthDp = 0f,
        frameHeightDp = 0f,
        frameLeftDp = viewportWidthDp / 2f,
        frameTopDp = stageAreaTop,
        stageAreaTopDp = stageAreaTop,
        stageAreaBottomDp = stageAreaBottom,
    )
}
