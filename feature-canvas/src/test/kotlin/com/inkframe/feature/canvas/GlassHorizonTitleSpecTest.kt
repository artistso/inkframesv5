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
    fun titleKeepsBindingTopRhythmAndReservesCommands() {
        assertEquals(14f, GlassHorizonTitleSpec.TOP_OFFSET_DP, 0f)
        assertEquals(3f, GlassHorizonTitleSpec.SUBTITLE_TOP_GAP_DP, 0f)
        assertEquals(39f, GlassHorizonTitleSpec.measuredTextBlockHeightDp, 0f)
        assertEquals(66f, GlassHorizonTitleSpec.COMMAND_TOP_OFFSET_DP, 0f)
        assertEquals(81f, GlassHorizonTitleSpec.COMMAND_CLUSTER_HEIGHT_DP, 0f)
        assertEquals(147f, GlassHorizonTitleSpec.commandBottomDp, 0f)
        assertTrue(GlassHorizonTitleSpec.commandClearanceDp >= 12f)
    }

    @Test
    fun subtitleUsesHighContrastReadabilityPlate() {
        assertTrue(GlassHorizonTitleSpec.SUBTITLE_PLATE_ALPHA >= 0.80f)
        assertTrue(GlassHorizonTitleSpec.SUBTITLE_HORIZONTAL_PADDING_DP >= 8f)
        assertTrue(GlassHorizonTitleSpec.SUBTITLE_VERTICAL_PADDING_DP >= 1f)
    }
}
