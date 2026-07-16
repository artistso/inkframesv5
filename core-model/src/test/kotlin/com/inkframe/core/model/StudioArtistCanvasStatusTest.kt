package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StudioArtistCanvasStatusTest {
    private fun project(background: Boolean = false): StudioProjectReconciliationSnapshot =
        StudioProjectReconciliationSnapshot(
            schema = StudioProjectReconciliationSnapshot.CURRENT_SCHEMA,
            revision = 14,
            projectIndex = 2,
            sceneIndex = 0,
            canvasWidth = 2048,
            canvasHeight = 2048,
            shape = StudioCanvasShape.CIRCLE,
            playback = StudioPlaybackSnapshot(
                frameCount = 12,
                activeFrameIndex = 7,
                maxFrames = 120,
                rangeStartFrame = 0,
                rangeEndFrame = 11,
                fps = 12,
                playing = false,
                loopEnabled = true,
                holdFrames = 3,
                selectedFrameIndices = listOf(7),
            ),
            layer = StudioLayerReconciliationSnapshot(
                layerCount = 3,
                activeLayerIndex = if (background) StudioContextSnapshot.BACKGROUND_LAYER_INDEX else 1,
                backgroundActive = background,
                visible = true,
                opacity = 1.0,
                blendMode = "Normal",
            ),
        )

    @Test
    fun formatsNormalLayerArtistContext() {
        val project = project()
        val timeline = requireNotNull(StudioTimelineExposureSnapshot.from(project))
        val status = requireNotNull(StudioArtistCanvasStatus.from(project, timeline))
        assertEquals("F 8/12 · Layer 2/3 · Hold 3 · Circle", status.displayText())
    }

    @Test
    fun formatsStaticBackgroundAndPlayback() {
        val project = project(background = true).let {
            it.copy(playback = it.playback.copy(playing = true, holdFrames = 1))
        }
        val timeline = requireNotNull(StudioTimelineExposureSnapshot.from(project))
        val status = requireNotNull(StudioArtistCanvasStatus.from(project, timeline))
        assertEquals("F 8/12 · Static BG · Circle · Playing", status.displayText())
    }

    @Test
    fun rejectsMismatchedTimelineRevision() {
        val project = project()
        val timeline = requireNotNull(StudioTimelineExposureSnapshot.from(project)).copy(revision = 99)
        assertNull(StudioArtistCanvasStatus.from(project, timeline))
    }
}
