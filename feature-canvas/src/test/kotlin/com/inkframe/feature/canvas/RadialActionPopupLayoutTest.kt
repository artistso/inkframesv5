package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RadialActionPopupLayoutTest {
    @Test
    fun rectangularTilePreservesHistoricalFanCenter() {
        listOf(-260f, -72f, 0f, 72f, 260f).forEach { offset ->
            val expected = RadialActionPopupLayout.historicalCenterDp(offset)
            assertEquals(expected, RadialActionPopupLayout.popupCenterXDp(offset), 0f)
            assertEquals(expected, RadialActionPopupLayout.popupCenterYDp(offset), 0f)
        }
    }

    @Test
    fun popupBoundsAreExactlyTheVisibleControl() {
        assertEquals(52f, RadialActionPopupLayout.TILE_WIDTH_DP, 0f)
        assertEquals(40f, RadialActionPopupLayout.TILE_HEIGHT_DP, 0f)
        assertTrue(RadialActionPopupLayout.TILE_WIDTH_DP > 0f)
        assertTrue(RadialActionPopupLayout.TILE_HEIGHT_DP > 0f)
    }
}
