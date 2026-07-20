package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlassHorizonTitleSpecTest {

    @Test
    fun sourceCopyMatchesBindingContractExactly() {
        assertEquals("InkFrame", GlassHorizonTitleSpec.TITLE)
        assertEquals("The Glass Horizon", GlassHorizonTitleSpec.SUBTITLE)
        assertEquals("InkFrame. The Glass Horizon", GlassHorizonTitleSpec.accessibilityLabel)
        assertFalse(GlassHorizonTitleSpec.SUBTITLE.contains("Canvas", ignoreCase = true))
    }

    @Test
    fun uppercaseIsPresentationRatherThanMutatedCopy() {
        assertEquals("INKFRAME", GlassHorizonTitleSpec.displayedTitle)
        assertEquals("THE GLASS HORIZON", GlassHorizonTitleSpec.displayedSubtitle)
        assertFalse(GlassHorizonTitleSpec.TITLE == GlassHorizonTitleSpec.displayedTitle)
    }

    @Test
    fun titleUsesContractScaleTrackingAndLineHeight() {
        assertEquals(20f, GlassHorizonTitleSpec.TITLE_SIZE_SP, 0f)
        assertEquals(22f, GlassHorizonTitleSpec.TITLE_LINE_HEIGHT_SP, 0f)
        assertEquals(4.4f, GlassHorizonTitleSpec.TITLE_TRACKING_SP, 0f)
        assertEquals(10f, GlassHorizonTitleSpec.SUBTITLE_SIZE_SP, 0f)
        assertEquals(12f, GlassHorizonTitleSpec.SUBTITLE_LINE_HEIGHT_SP, 0f)
        assertEquals(2.8f, GlassHorizonTitleSpec.SUBTITLE_TRACKING_SP, 0f)
    }

    @Test
    fun defaultScaleKeepsBindingTopRhythmAndReservesCommands() {
        assertEquals(14f, GlassHorizonTitleSpec.TOP_OFFSET_DP, 0f)
        assertEquals(3f, GlassHorizonTitleSpec.SUBTITLE_TOP_GAP_DP, 0f)
        assertEquals(39f, GlassHorizonTitleSpec.measuredTextBlockHeightDp(1f), 0f)
        assertEquals(53f, GlassHorizonTitleSpec.titleBottomDp(1f), 0f)
        assertEquals(66f, GlassHorizonTitleSpec.commandTopDp(1f), 0f)
        assertEquals(147f, GlassHorizonTitleSpec.commandBottomDp(1f), 0f)
        assertTrue(
            GlassHorizonTitleSpec.commandTopDp(1f) - GlassHorizonTitleSpec.titleBottomDp(1f) >=
                GlassHorizonTitleSpec.MIN_COMMAND_CLEARANCE_DP,
        )
    }

    @Test
    fun largeTextPushesCommandsDownInsteadOfOverlappingTitle() {
        val fontScale = 2f
        assertEquals(73f, GlassHorizonTitleSpec.measuredTextBlockHeightDp(fontScale), 0f)
        assertEquals(87f, GlassHorizonTitleSpec.titleBottomDp(fontScale), 0f)
        assertEquals(99f, GlassHorizonTitleSpec.commandTopDp(fontScale), 0f)
        assertEquals(180f, GlassHorizonTitleSpec.commandBottomDp(fontScale), 0f)
    }

    @Test
    fun subtitleUsesHighContrastReadabilityPlate() {
        assertTrue(GlassHorizonTitleSpec.SUBTITLE_PLATE_ALPHA >= 0.80f)
        assertTrue(GlassHorizonTitleSpec.SUBTITLE_HORIZONTAL_PADDING_DP >= 8f)
        assertTrue(GlassHorizonTitleSpec.SUBTITLE_VERTICAL_PADDING_DP >= 1f)
    }

    @Test(expected = IllegalArgumentException::class)
    fun invalidFontScaleIsRejected() {
        GlassHorizonTitleSpec.measuredTextBlockHeightDp(0f)
    }
}
