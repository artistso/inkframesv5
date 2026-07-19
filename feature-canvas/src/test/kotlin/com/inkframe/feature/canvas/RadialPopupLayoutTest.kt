package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RadialPopupLayoutTest {

    @Test
    fun paddingCompensationPreservesHistoricalCirclePosition() {
        listOf(-220f, -72f, 0f, 72f, 220f).forEach { fanOffset ->
            val popupX = RadialPopupLayout.compensatedX(fanOffset)
            val popupY = RadialPopupLayout.compensatedY(fanOffset)
            val expectedCirclePosition = fanOffset + RadialPopupLayout.NODE_CENTER_CORRECTION_DP

            assertEquals(expectedCirclePosition, RadialPopupLayout.circleX(popupX), 0f)
            assertEquals(expectedCirclePosition, RadialPopupLayout.circleY(popupY), 0f)
        }
    }

    @Test
    fun popupSurfaceContainsCircleAndOpticalShadow() {
        assertTrue(RadialPopupLayout.START_PADDING_DP >= 16f)
        assertTrue(RadialPopupLayout.TOP_PADDING_DP >= 16f)
        assertTrue(RadialPopupLayout.END_PADDING_DP >= 16f)
        assertEquals(80f, RadialPopupLayout.POPUP_WIDTH_DP, 0f)
    }

    @Test
    fun bottomSurfaceContainsTranslatedLabel() {
        val requiredBottomExtent =
            RadialPopupLayout.LABEL_OFFSET_DP + RadialPopupLayout.MIN_LABEL_EXTENT_DP

        assertTrue(RadialPopupLayout.BOTTOM_PADDING_DP >= requiredBottomExtent)
        assertEquals(100f, RadialPopupLayout.POPUP_HEIGHT_DP, 0f)
    }
}
