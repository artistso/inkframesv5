package com.inkframe.feature.canvas

import com.inkframe.core.model.InkFrameDefaults
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class GlassHorizonPresentationTest {
    @Test
    fun originalPaperIsPresentedWithoutCheckerByDefault() {
        val state = StudioState()
        assertFalse(state.showChecker)
        assertEquals(
  InkFrameDefaults.DEFAULT_PAPER.toArgb(),
  InkFrameDefaults.newProject().canvas.backgroundColor.toArgb(),
        )
    }
}
