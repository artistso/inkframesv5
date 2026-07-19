package com.inkframe.feature.canvas

internal data class GlassHorizonStagePlacement(
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
 * the fixed Glass Horizon header at any supported landscape window height.
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
    ): GlassHorizonStagePlacement {
        require(viewportWidthDp > 0f)
        require(viewportHeightDp > 0f)
        require(documentAspect > 0f)

        val stageAreaTop = GlassHorizonTitleSpec.commandBottomDp + HEADER_TO_STAGE_GAP_DP
        val stageAreaBottom = (viewportHeightDp - BOTTOM_CONTROL_RESERVE_DP)
            .coerceAtLeast(stageAreaTop + FRAME_OPTICAL_PADDING_DP + MIN_CANVAS_EXTENT_DP)
        val availableFrameHeight = (stageAreaBottom - stageAreaTop)
            .coerceAtLeast(FRAME_OPTICAL_PADDING_DP + MIN_CANVAS_EXTENT_DP)
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
