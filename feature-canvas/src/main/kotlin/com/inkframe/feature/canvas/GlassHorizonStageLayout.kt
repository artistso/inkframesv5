package com.inkframe.feature.canvas

internal data class GlassHorizonStagePlacement(
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
    const val BOTTOM_CONTROL_RESERVE_DP: Float = 56f
    const val MIN_CANVAS_EXTENT_DP: Float = 1f

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
        val minimumFrameHeight = FRAME_OPTICAL_PADDING_DP + MIN_CANVAS_EXTENT_DP
        val naturalStageBottom = viewportHeightDp - BOTTOM_CONTROL_RESERVE_DP
        val stageAreaBottom = naturalStageBottom.coerceAtLeast(stageAreaTop + minimumFrameHeight)
        val availableFrameHeight = (stageAreaBottom - stageAreaTop).coerceAtLeast(minimumFrameHeight)
        val availableCanvasHeight = (availableFrameHeight - FRAME_OPTICAL_PADDING_DP)
            .coerceAtLeast(MIN_CANVAS_EXTENT_DP)
        val availableCanvasWidth = (viewportWidthDp * CANVAS_WIDTH_FRACTION)
            .coerceAtLeast(MIN_CANVAS_EXTENT_DP)

        val canvasWidth = minOf(availableCanvasWidth, availableCanvasHeight * documentAspect)
            .coerceAtLeast(MIN_CANVAS_EXTENT_DP)
        val canvasHeight = (canvasWidth / documentAspect).coerceAtLeast(MIN_CANVAS_EXTENT_DP)
        val frameWidth = canvasWidth + FRAME_OPTICAL_PADDING_DP
        val frameHeight = canvasHeight + FRAME_OPTICAL_PADDING_DP
        val frameLeft = ((viewportWidthDp - frameWidth) / 2f).coerceAtLeast(0f)
        val frameTop = stageAreaTop + ((availableFrameHeight - frameHeight) / 2f).coerceAtLeast(0f)

        return GlassHorizonStagePlacement(
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
}
