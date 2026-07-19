package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlassHorizonTitleSpecTest {

    @Test
    fun titleAndSubtitleMatchBindingCopyExactly() {
        assertEquals("INKFRAME", GlassHorizonTitleSpec.TITLE)
        assertEquals("THE GLASS HORIZON", GlassHorizonTitleSpec.SUBTITLE)
        assertFalse(GlassHorizonTitleSpec.SUBTITLE.contains("CANVAS"))
    }

    @Test
    fun titleUsesContractScaleAndTracking() {
        assertEquals(20f, GlassHorizonTitleSpec.TITLE_SIZE_SP, 0f)
        assertEquals(4.4f, GlassHorizonTitleSpec.TITLE_TRACKING_SP, 0f)
        assertEquals(10f, GlassHorizonTitleSpec.SUBTITLE_SIZE_SP, 0f)
        assertEquals(2.8f, GlassHorizonTitleSpec.SUBTITLE_TRACKING_SP, 0f)
    }

    @Test
    fun titleKeepsBindingTopRhythm() {
        assertEquals(14f, GlassHorizonTitleSpec.TOP_OFFSET_DP, 0f)
        assertEquals(3f, GlassHorizonTitleSpec.SUBTITLE_TOP_GAP_DP, 0f)
        assertTrue(GlassHorizonTitleSpec.TITLE_TRACKING_SP > GlassHorizonTitleSpec.SUBTITLE_SIZE_SP * 0.4f)
    }
}
