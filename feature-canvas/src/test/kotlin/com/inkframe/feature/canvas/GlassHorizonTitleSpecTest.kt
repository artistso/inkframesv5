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
    fun titleKeepsBindingTopRhythmAndClearsCommands() {
        assertEquals(14f, GlassHorizonTitleSpec.TOP_OFFSET_DP, 0f)
        assertEquals(3f, GlassHorizonTitleSpec.SUBTITLE_TOP_GAP_DP, 0f)
        assertEquals(37f, GlassHorizonTitleSpec.measuredTextBlockHeightDp, 0f)
        assertEquals(62f, GlassHorizonTitleSpec.COMMAND_TOP_OFFSET_DP, 0f)
        assertTrue(GlassHorizonTitleSpec.commandClearanceDp >= 10f)
        assertTrue(GlassHorizonTitleSpec.TITLE_TRACKING_SP > GlassHorizonTitleSpec.SUBTITLE_SIZE_SP * 0.4f)
    }
}
