package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlassHorizonStageLayoutTest {

    private val tabletDensity = 2.5f

    @Test
    fun tabletLandscapeStageStartsBelowHeaderAndCommands() {
        val placement = GlassHorizonStageLayout.place(
            viewportWidthDp = 1480f,
            viewportHeightDp = 924f,
            documentAspect = 16f / 9f,
            fontScale = 1f,
            density = tabletDensity,
        )

        assertTrue(placement.stageVisible)
        assertEquals(placement.canvasWidthDp, placement.hostWidthDp, 0f)
        assertEquals(placement.canvasHeightDp, placement.hostHeightDp, 0f)
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
            density = tabletDensity,
        )

        assertTrue(placement.stageVisible)
        assertTrue(placement.frameTopDp >= placement.commandBottomDp)
        assertTrue(placement.frameTopDp + placement.frameHeightDp <= placement.stageAreaBottomDp + 0.001f)
        assertTrue(placement.canvasHeightDp > 0f)
        assertTrue(placement.canvasWidthDp > placement.canvasHeightDp)
    }

    @Test
    fun accessibilityScaleExpandsHeaderAndFurtherShrinksStage() {
        val normal = GlassHorizonStageLayout.place(
            900f,
            480f,
            4f / 3f,
            fontScale = 1f,
            density = tabletDensity,
        )
        val large = GlassHorizonStageLayout.place(
            900f,
            480f,
            4f / 3f,
            fontScale = 2f,
            density = tabletDensity,
        )

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
            val placement = GlassHorizonStageLayout.place(
                1280f,
                800f,
                aspect,
                fontScale = 1f,
                density = tabletDensity,
            )
            assertTrue(placement.stageVisible)
            assertEquals(aspect, placement.canvasWidthDp / placement.canvasHeightDp, 0.001f)
        }
    }

    @Test
    fun extremeTallArchiveUsesOnePhysicalPixelOffscreenHost() {
        val density = 3f
        val aspect = 1f / 16_384f
        val placement = GlassHorizonStageLayout.place(
            1280f,
            720f,
            aspect,
            fontScale = 1f,
            density = density,
        )
        val expectedHostDp = GlassHorizonStageLayout.MIN_RENDERABLE_EXTENT_PX / density

        assertFalse(placement.stageVisible)
        assertEquals(expectedHostDp, placement.hostWidthDp, 0f)
        assertEquals(expectedHostDp, placement.hostHeightDp, 0f)
        assertEquals(1f, placement.hostWidthDp * density, 0f)
        assertEquals(1f, placement.hostHeightDp * density, 0f)
        assertEquals(0f, placement.canvasWidthDp, 0f)
        assertEquals(0f, placement.canvasHeightDp, 0f)
        assertTrue(placement.frameLeftDp + placement.hostWidthDp < 0f)
        assertTrue(placement.frameTopDp + placement.hostHeightDp < 0f)
    }

    @Test
    fun noRoomWindowRetainsOffscreenHostWithoutConsumingControlReserve() {
        val density = 2f
        val viewportHeight = 260f
        val placement = GlassHorizonStageLayout.place(
            640f,
            viewportHeight,
            16f / 9f,
            fontScale = 1f,
            density = density,
        )
        val availableFrameHeight = placement.stageAreaBottomDp - placement.stageAreaTopDp
        val availableCanvasHeight = availableFrameHeight - GlassHorizonStageLayout.FRAME_OPTICAL_PADDING_DP
        val minimumHostDp = GlassHorizonStageLayout.MIN_RENDERABLE_EXTENT_PX / density

        assertFalse(placement.stageVisible)
        assertEquals(
            viewportHeight - GlassHorizonStageLayout.BOTTOM_CONTROL_RESERVE_DP,
            placement.stageAreaBottomDp,
            0f,
        )
        assertEquals(minimumHostDp, placement.hostWidthDp, 0f)
        assertEquals(minimumHostDp, placement.hostHeightDp, 0f)
        assertEquals(0f, placement.canvasWidthDp, 0f)
        assertEquals(0f, placement.canvasHeightDp, 0f)
        assertEquals(0f, placement.frameWidthDp, 0f)
        assertEquals(0f, placement.frameHeightDp, 0f)
        assertTrue(availableFrameHeight > 0f)
        assertTrue(availableCanvasHeight < minimumHostDp)
        assertTrue(placement.frameLeftDp + placement.hostWidthDp < 0f)
        assertTrue(placement.frameTopDp + placement.hostHeightDp < 0f)
    }

    @Test
    fun frameBadgeClearsScrubRailWithDedicatedGap() {
        val viewportHeight = 720f
        val placement = GlassHorizonStageLayout.place(
            1280f,
            viewportHeight,
            16f / 9f,
            fontScale = 1f,
            density = tabletDensity,
        )
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
        GlassHorizonStageLayout.place(1280f, 720f, 0f, fontScale = 1f, density = tabletDensity)
    }

    @Test(expected = IllegalArgumentException::class)
    fun invalidFontScaleIsRejected() {
        GlassHorizonStageLayout.place(1280f, 720f, 16f / 9f, fontScale = 0f, density = tabletDensity)
    }

    @Test(expected = IllegalArgumentException::class)
    fun invalidDensityIsRejected() {
        GlassHorizonStageLayout.place(1280f, 720f, 16f / 9f, fontScale = 1f, density = 0f)
    }
}
