package com.inkframe.feature.canvas

internal data class GlassHorizonStagePlacement(
    val stageVisible: Boolean,
    val compactCommands: Boolean,
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
 * Pure responsive layout policy for the Glass Horizon header and artwork stage.
 *
 * Visible stages are fitted only inside reserved horizontal gutters so CanvasView never sits under
 * the fixed side nodes or the Hold/NEW/LAB command column. When a visible stage cannot provide at
 * least two physical pixels on both axes, presentation collapses to a one-physical-pixel offscreen
 * host. The same CanvasView/EGL engine therefore remains attached without becoming an input target.
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

    const val LEFT_STAGE_GUTTER_DP: Float = 124f
    const val RIGHT_STAGE_GUTTER_DP: Float = 140f
    const val COMPACT_WIDTH_THRESHOLD_DP: Float = 600f
    const val COMPACT_COMMAND_CLUSTER_HEIGHT_DP: Float = 34f
    const val COMPACT_NODE_GAP_DP: Float = 12f

    const val MIN_HOST_EXTENT_PX: Float = 1f
    const val MIN_VISIBLE_EXTENT_PX: Float = 2f
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

        val compactCommands = viewportWidthDp < COMPACT_WIDTH_THRESHOLD_DP
        val commandClusterHeight = if (compactCommands) {
            COMPACT_COMMAND_CLUSTER_HEIGHT_DP
        } else {
            GlassHorizonTitleSpec.COMMAND_CLUSTER_HEIGHT_DP
        }
        val minimumHostExtentDp = MIN_HOST_EXTENT_PX / density
        val minimumVisibleExtentDp = MIN_VISIBLE_EXTENT_PX / density
        val titleBottom = GlassHorizonTitleSpec.titleBottomDp(fontScale)
        val commandTop = GlassHorizonTitleSpec.commandTopDp(fontScale)
        val commandBottom = GlassHorizonTitleSpec.commandBottomDp(fontScale, commandClusterHeight)
        val stageAreaTop = commandBottom + HEADER_TO_STAGE_GAP_DP
        val stageAreaBottom = (viewportHeightDp - BOTTOM_CONTROL_RESERVE_DP).coerceAtLeast(0f)
        val availableFrameHeight = stageAreaBottom - stageAreaTop
        val availableCanvasHeight = availableFrameHeight - FRAME_OPTICAL_PADDING_DP

        val safeFrameLeft = LEFT_STAGE_GUTTER_DP
        val safeFrameRight = viewportWidthDp - RIGHT_STAGE_GUTTER_DP
        val availableFrameWidth = safeFrameRight - safeFrameLeft
        val gutterBoundCanvasWidth = availableFrameWidth - FRAME_OPTICAL_PADDING_DP
        val fractionBoundCanvasWidth = viewportWidthDp * CANVAS_WIDTH_FRACTION
        val availableCanvasWidth = minOf(gutterBoundCanvasWidth, fractionBoundCanvasWidth)

        if (
            availableCanvasHeight < minimumVisibleExtentDp ||
            availableCanvasWidth < minimumVisibleExtentDp
        ) {
            return hiddenPlacement(
                compactCommands = compactCommands,
                minimumHostExtentDp = minimumHostExtentDp,
                titleBottom = titleBottom,
                commandTop = commandTop,
                commandBottom = commandBottom,
                stageAreaTop = stageAreaTop,
                stageAreaBottom = stageAreaBottom,
            )
        }

        // Fit from both axes without coercing either dimension upward. This preserves aspect and
        // keeps extreme documents out of the visible stage when one axis would round below 2 px.
        val canvasWidth = minOf(availableCanvasWidth, availableCanvasHeight * documentAspect)
        val canvasHeight = canvasWidth / documentAspect
        if (
            canvasWidth < minimumVisibleExtentDp ||
            canvasHeight < minimumVisibleExtentDp
        ) {
            return hiddenPlacement(
                compactCommands = compactCommands,
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
        val frameLeft = safeFrameLeft + ((availableFrameWidth - frameWidth) / 2f).coerceAtLeast(0f)
        val frameTop = stageAreaTop + ((availableFrameHeight - frameHeight) / 2f).coerceAtLeast(0f)

        return GlassHorizonStagePlacement(
            stageVisible = true,
            compactCommands = compactCommands,
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
        compactCommands: Boolean,
        minimumHostExtentDp: Float,
        titleBottom: Float,
        commandTop: Float,
        commandBottom: Float,
        stageAreaTop: Float,
        stageAreaBottom: Float,
    ): GlassHorizonStagePlacement = GlassHorizonStagePlacement(
        stageVisible = false,
        compactCommands = compactCommands,
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
