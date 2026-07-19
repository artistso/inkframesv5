package com.inkframe.feature.canvas

/**
 * Measured surface policy for radial-action popup windows.
 *
 * The action circle must remain at its historical fan coordinate while the popup surface expands
 * around it to contain the 16dp optical shadow and the label translated 20dp below the circle.
 */
internal object RadialPopupLayout {
    const val CIRCLE_EXTENT_DP: Float = 48f
    const val NODE_CENTER_CORRECTION_DP: Float = 5f
    const val START_PADDING_DP: Float = 16f
    const val TOP_PADDING_DP: Float = 16f
    const val END_PADDING_DP: Float = 16f
    const val BOTTOM_PADDING_DP: Float = 36f
    const val LABEL_OFFSET_DP: Float = 20f
    const val MIN_LABEL_EXTENT_DP: Float = 10f

    const val POPUP_WIDTH_DP: Float =
        START_PADDING_DP + CIRCLE_EXTENT_DP + END_PADDING_DP
    const val POPUP_HEIGHT_DP: Float =
        TOP_PADDING_DP + CIRCLE_EXTENT_DP + BOTTOM_PADDING_DP

    fun compensatedX(fanOffsetDp: Float): Float =
        fanOffsetDp + NODE_CENTER_CORRECTION_DP - START_PADDING_DP

    fun compensatedY(fanOffsetDp: Float): Float =
        fanOffsetDp + NODE_CENTER_CORRECTION_DP - TOP_PADDING_DP

    fun circleX(popupX: Float): Float = popupX + START_PADDING_DP

    fun circleY(popupY: Float): Float = popupY + TOP_PADDING_DP
}
