package com.inkframe.feature.canvas

/**
 * Geometry for radial action tiles hosted in window-level Compose popups.
 *
 * CanvasView uses a top-ordered SurfaceView, so radial actions that cross the artwork must live in
 * a higher window. Each popup is exactly the visible rectangular tile: there is no transparent
 * padding or optical overflow that could create a hidden touch region. The tile center stays at the
 * historical 48dp action-circle center so fan spacing and direction remain unchanged.
 */
internal object RadialActionPopupLayout {
    const val HISTORICAL_ACTION_EXTENT_DP: Float = 48f
    const val HISTORICAL_POSITION_CORRECTION_DP: Float = 5f

    const val TILE_WIDTH_DP: Float = 76f
    const val TILE_HEIGHT_DP: Float = 38f

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
