package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GlassHorizonStageLayoutTest {

    @Test
    fun tabletLandscapeStageStartsBelowHeaderAndCommands() {
        val placement = GlassHorizonStageLayout.place(
            viewportWidthDp = 1480f,
            viewportHeightDp = 924f,
            documentAspect = 16f / 9f,
        )

        assertEquals(
            GlassHorizonTitleSpec.commandBottomDp + GlassHorizonStageLayout.HEADER_TO_STAGE_GAP_DP,
            placement.stageAreaTopDp,
            0f,
        )
        assertTrue(placement.frameTopDp >= placement.stageAreaTopDp)
        assertTrue(placement.frameTopDp + placement.frameHeightDp <= placement.stageAreaBottomDp + 0.001f)
        assertTrue(placement.frameLeftDp >= 0f)
    }

    @Test
    fun compactHeightShrinksStageInsteadOfOverlappingHeader() {
        val placement = GlassHorizonStageLayout.place(
            viewportWidthDp = 900f,
            viewportHeightDp = 480f,
            documentAspect = 4f / 3f,
        )

        assertTrue(placement.frameTopDp >= GlassHorizonTitleSpec.commandBottomDp)
        assertTrue(placement.frameTopDp + placement.frameHeightDp <= placement.stageAreaBottomDp + 0.001f)
        assertTrue(placement.canvasHeightDp > 0f)
        assertTrue(placement.canvasWidthDp > placement.canvasHeightDp)
    }

    @Test
    fun placementPreservesDocumentAspectRatio() {
        listOf(4f / 3f, 16f / 9f, 9f / 16f, 1f).forEach { aspect ->
            val placement = GlassHorizonStageLayout.place(1280f, 800f, aspect)
            assertEquals(aspect, placement.canvasWidthDp / placement.canvasHeightDp, 0.001f)
        }
    }

    @Test
    fun bottomControlsReceiveDedicatedReserve() {
        val placement = GlassHorizonStageLayout.place(1280f, 720f, 16f / 9f)
        assertEquals(
            720f - GlassHorizonStageLayout.BOTTOM_CONTROL_RESERVE_DP,
            placement.stageAreaBottomDp,
            0f,
        )
        assertTrue(placement.frameTopDp + placement.frameHeightDp <= placement.stageAreaBottomDp + 0.001f)
    }

    @Test(expected = IllegalArgumentException::class)
    fun invalidDocumentAspectIsRejected() {
        GlassHorizonStageLayout.place(1280f, 720f, 0f)
    }
}
