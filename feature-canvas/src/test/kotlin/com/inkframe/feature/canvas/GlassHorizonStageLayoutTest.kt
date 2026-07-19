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
            fontScale = 1f,
        )

        assertEquals(GlassHorizonTitleSpec.titleBottomDp(1f), placement.titleBottomDp, 0f)
        assertEquals(GlassHorizonTitleSpec.commandTopDp(1f), placement.commandTopDp, 0f)
        assertEquals(GlassHorizonTitleSpec.commandBottomDp(1f), placement.commandBottomDp, 0f)
        assertEquals(
            placement.commandBottomDp + GlassHorizonStageLayout.HEADER_TO_STAGE_GAP_DP,
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
            fontScale = 1f,
        )

        assertTrue(placement.frameTopDp >= placement.commandBottomDp)
        assertTrue(placement.frameTopDp + placement.frameHeightDp <= placement.stageAreaBottomDp + 0.001f)
        assertTrue(placement.canvasHeightDp > 0f)
        assertTrue(placement.canvasWidthDp > placement.canvasHeightDp)
    }

    @Test
    fun accessibilityScaleExpandsHeaderAndFurtherShrinksStage() {
        val normal = GlassHorizonStageLayout.place(900f, 480f, 4f / 3f, fontScale = 1f)
        val large = GlassHorizonStageLayout.place(900f, 480f, 4f / 3f, fontScale = 2f)

        assertTrue(large.commandTopDp > normal.commandTopDp)
        assertTrue(large.stageAreaTopDp > normal.stageAreaTopDp)
        assertTrue(large.canvasHeightDp < normal.canvasHeightDp)
        assertTrue(large.frameTopDp >= large.stageAreaTopDp)
    }

    @Test
    fun placementPreservesDocumentAspectRatio() {
        listOf(4f / 3f, 16f / 9f, 9f / 16f, 1f).forEach { aspect ->
            val placement = GlassHorizonStageLayout.place(1280f, 800f, aspect, fontScale = 1f)
            assertEquals(aspect, placement.canvasWidthDp / placement.canvasHeightDp, 0.001f)
        }
    }

    @Test
    fun frameBadgeClearsScrubRailWithDedicatedGap() {
        val viewportHeight = 720f
        val placement = GlassHorizonStageLayout.place(1280f, viewportHeight, 16f / 9f, fontScale = 1f)
        val frameBottom = placement.frameTopDp + placement.frameHeightDp
        val badgeBottom = frameBottom + GlassHorizonStageLayout.FRAME_BADGE_OVERFLOW_DP
        val scrubRailTop = viewportHeight - GlassHorizonStageLayout.SCRUB_RAIL_TOP_INSET_DP

        assertEquals(84f, GlassHorizonStageLayout.BOTTOM_CONTROL_RESERVE_DP, 0f)
        assertEquals(
            viewportHeight - GlassHorizonStageLayout.BOTTOM_CONTROL_RESERVE_DP,
            placement.stageAreaBottomDp,
            0f,
        )
        assertTrue(frameBottom <= placement.stageAreaBottomDp + 0.001f)
        assertTrue(
            badgeBottom + GlassHorizonStageLayout.FRAME_BADGE_TO_SCRUB_GAP_DP <= scrubRailTop + 0.001f,
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun invalidDocumentAspectIsRejected() {
        GlassHorizonStageLayout.place(1280f, 720f, 0f, fontScale = 1f)
    }

    @Test(expected = IllegalArgumentException::class)
    fun invalidFontScaleIsRejected() {
        GlassHorizonStageLayout.place(1280f, 720f, 16f / 9f, fontScale = 0f)
    }
}
