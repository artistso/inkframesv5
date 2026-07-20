package com.inkframe.feature.canvas

/** Exact visible bounds for radial action tiles rendered above the top-ordered GL surface. */
internal object RadialActionPopupLayout {
    const val HISTORICAL_ACTION_EXTENT_DP: Float = 48f
    const val HISTORICAL_POSITION_CORRECTION_DP: Float = 5f
    const val TILE_WIDTH_DP: Float = 52f
    const val TILE_HEIGHT_DP: Float = 40f

    fun popupXDp(fanOffsetDp: Float): Float =
        fanOffsetDp + HISTORICAL_POSITION_CORRECTION_DP +
            (HISTORICAL_ACTION_EXTENT_DP - TILE_WIDTH_DP) / 2f

    fun popupYDp(fanOffsetDp: Float): Float =
        fanOffsetDp + HISTORICAL_POSITION_CORRECTION_DP +
            (HISTORICAL_ACTION_EXTENT_DP - TILE_HEIGHT_DP) / 2f

    fun historicalCenterDp(fanOffsetDp: Float): Float =
        fanOffsetDp + HISTORICAL_POSITION_CORRECTION_DP + HISTORICAL_ACTION_EXTENT_DP / 2f

    fun popupCenterXDp(fanOffsetDp: Float): Float = popupXDp(fanOffsetDp) + TILE_WIDTH_DP / 2f
    fun popupCenterYDp(fanOffsetDp: Float): Float = popupYDp(fanOffsetDp) + TILE_HEIGHT_DP / 2f
}
