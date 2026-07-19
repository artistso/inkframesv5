package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

        assertTrue(placement.stageVisible)
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

        assertTrue(placement.stageVisible)
        assertTrue(placement.frameTopDp >= placement.commandBottomDp)
        assertTrue(placement.frameTopDp + placement.frameHeightDp <= placement.stageAreaBottomDp + 0.001f)
        assertTrue(placement.canvasHeightDp > 0f)
        assertTrue(placement.canvasWidthDp > placement.canvasHeightDp)
    }

    @Test
    fun accessibilityScaleExpandsHeaderAndFurtherShrinksStage() {
        val normal = GlassHorizonStageLayout.place(900f, 480f, 4f / 3f, fontScale = 1f)
        val large = GlassHorizonStageLayout.place(900f, 480f, 4f / 3f, fontScale = 2f)

        assertTrue(normal.stageVisible)
        assertTrue(large.stageVisible)
        assertTrue(large.commandTopDp > normal.commandTopDp)
        assertTrue(large.stageAreaTopDp > normal.stageAreaTopDp)
        assertTrue(large.canvasHeightDp < normal.canvasHeightDp)
        assertTrue(large.frameTopDp >= large.stageAreaTopDp)
    }

    @Test
    fun placementPreservesDocumentAspectRatio() {
        listOf(4f / 3f, 16f / 9f, 9f / 16f, 1f).forEach { aspect ->
            val placement = GlassHorizonStageLayout.place(1280f, 800f, aspect, fontScale = 1f)
            assertTrue(placement.stageVisible)
            assertEquals(aspect, placement.canvasWidthDp / placement.canvasHeightDp, 0.001f)
        }
    }

    @Test
    fun extremeTallArchivePreservesHeightCapAndAspect() {
        val aspect = 1f / 16_384f
        val placement = GlassHorizonStageLayout.place(1280f, 720f, aspect, fontScale = 1f)
        val maximumCanvasHeight =
            placement.stageAreaBottomDp - placement.stageAreaTopDp -
                GlassHorizonStageLayout.FRAME_OPTICAL_PADDING_DP

        assertTrue(placement.stageVisible)
        assertTrue(placement.canvasWidthDp < 1f)
        assertTrue(placement.canvasHeightDp <= maximumCanvasHeight + 0.001f)
        assertEquals(aspect, placement.canvasWidthDp / placement.canvasHeightDp, 0.000001f)
        assertTrue(placement.frameTopDp + placement.frameHeightDp <= placement.stageAreaBottomDp + 0.001f)
    }

    @Test
    fun noRoomWindowOmitsStageWithoutConsumingControlReserve() {
        val viewportHeight = 260f
        val placement = GlassHorizonStageLayout.place(640f, viewportHeight, 16f / 9f, fontScale = 1f)

        assertFalse(placement.stageVisible)
        assertEquals(
            viewportHeight - GlassHorizonStageLayout.BOTTOM_CONTROL_RESERVE_DP,
            placement.stageAreaBottomDp,
            0f,
        )
        assertEquals(0f, placement.canvasWidthDp, 0f)
        assertEquals(0f, placement.canvasHeightDp, 0f)
        assertEquals(0f, placement.frameWidthDp, 0f)
        assertEquals(0f, placement.frameHeightDp, 0f)
        assertTrue(placement.stageAreaBottomDp < placement.stageAreaTopDp)
    }

    @Test
    fun frameBadgeClearsScrubRailWithDedicatedGap() {
        val viewportHeight = 720f
        val placement = GlassHorizonStageLayout.place(1280f, viewportHeight, 16f / 9f, fontScale = 1f)
        val frameBottom = placement.frameTopDp + placement.frameHeightDp
        val badgeBottom = frameBottom + GlassHorizonStageLayout.FRAME_BADGE_OVERFLOW_DP
        val scrubRailTop = viewportHeight - GlassHorizonStageLayout.SCRUB_RAIL_TOP_INSET_DP

        assertTrue(placement.stageVisible)
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
