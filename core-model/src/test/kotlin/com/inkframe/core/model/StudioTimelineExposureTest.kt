package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StudioTimelineExposureTest {
    private fun project(
        activeFrame: Int = 4,
        hold: Int = 3,
        selected: List<Int> = listOf(1, 2, 4, 7, 8, 9),
        rangeStart: Int = 1,
        rangeEnd: Int = 9,
        loop: Boolean = true,
        background: Boolean = false,
    ) = StudioProjectReconciliationSnapshot(
        schema = StudioProjectReconciliationSnapshot.CURRENT_SCHEMA,
        revision = 11,
        projectIndex = 2,
        sceneIndex = 0,
        canvasWidth = 1920,
        canvasHeight = 1080,
        shape = StudioCanvasShape.SQUARE,
        playback = StudioPlaybackSnapshot(
            frameCount = 12,
            activeFrameIndex = activeFrame,
            maxFrames = 120,
            rangeStartFrame = rangeStart,
            rangeEndFrame = rangeEnd,
            fps = 12,
            playing = false,
            loopEnabled = loop,
            holdFrames = hold,
            selectedFrameIndices = selected,
        ),
        layer = StudioLayerReconciliationSnapshot(
            layerCount = 3,
            activeLayerIndex = if (background) StudioContextSnapshot.BACKGROUND_LAYER_INDEX else 1,
            backgroundActive = background,
            visible = true,
            opacity = 0.8,
            blendMode = "Normal",
        ),
    )

    @Test
    fun derivesSelectionRangesExposureAndActiveCel() {
        val timeline = assertNotNull(StudioTimelineExposureSnapshot.from(project()))
        assertEquals(StudioPlaybackRange(1, 9), timeline.playbackRange)
        assertEquals(
            listOf(
                StudioFrameSelectionRange(1, 2),
                StudioFrameSelectionRange(4, 4),
                StudioFrameSelectionRange(7, 9),
            ),
            timeline.selectionRanges,
        )
        assertEquals(StudioDeclaredExposureSpan(4, 4, 6, 3), timeline.declaredExposure)
        assertEquals(StudioCelAddress(2, 0, 4, 1, false), timeline.activeCelAddress)
    }

    @Test
    fun exposureClampsAtTimelineEnd() {
        val timeline = assertNotNull(
            StudioTimelineExposureSnapshot.from(project(activeFrame = 11, hold = 4, rangeEnd = 11)),
        )
        assertEquals(11, timeline.declaredExposure.endFrameIndex)
        assertEquals(1, timeline.declaredExposure.visibleFrameCount)
        assertEquals(4, timeline.declaredExposure.holdFrames)
    }

    @Test
    fun frameStateSeparatesActiveSelectedRangeAndExposure() {
        val timeline = assertNotNull(StudioTimelineExposureSnapshot.from(project()))
        val active = assertNotNull(timeline.frameState(4))
        assertTrue(active.active)
        assertTrue(active.selected)
        assertTrue(active.insidePlaybackRange)
        assertTrue(active.insideDeclaredExposure)
        assertNotNull(active.activeCelAddress)

        val held = assertNotNull(timeline.frameState(6))
        assertFalse(held.active)
        assertFalse(held.selected)
        assertTrue(held.insideDeclaredExposure)
        assertNull(held.activeCelAddress)

        val outside = assertNotNull(timeline.frameState(10))
        assertFalse(outside.insidePlaybackRange)
        assertFalse(outside.insideDeclaredExposure)
        assertNull(timeline.frameState(12))
    }

    @Test
    fun transportPreviewLoopsOrClampsWithoutMutation() {
        val looping = assertNotNull(StudioTimelineExposureSnapshot.from(project(activeFrame = 9)))
        assertEquals(1, looping.steppedFrameIndex(1))
        assertEquals(8, looping.steppedFrameIndex(-1))

        val clamped = assertNotNull(StudioTimelineExposureSnapshot.from(project(activeFrame = 9, loop = false)))
        assertEquals(9, clamped.steppedFrameIndex(1))
        assertEquals(1, clamped.copy(activeFrameIndex = 1).steppedFrameIndex(-1))
    }

    @Test
    fun backgroundAddressRemainsExplicit() {
        val timeline = assertNotNull(StudioTimelineExposureSnapshot.from(project(background = true)))
        assertEquals(
            StudioCelAddress(2, 0, 4, StudioContextSnapshot.BACKGROUND_LAYER_INDEX, true),
            timeline.activeCelAddress,
        )
    }

    @Test
    fun mirrorPreservesLastValidTimeline() {
        val mirror = StudioTimelineExposureMirror()
        val first = assertNotNull(StudioTimelineExposureSnapshot.from(project()))
        assertEquals(StudioTimelineExposureUpdate.ACCEPTED_CHANGED, mirror.update(first))
        assertEquals(StudioTimelineExposureUpdate.ACCEPTED_UNCHANGED, mirror.update(first))
        val invalid = first.copy(activeFrameIndex = 99)
        assertEquals(StudioTimelineExposureUpdate.REJECTED_INVALID, mirror.update(invalid))
        assertEquals(first, mirror.snapshot())
        assertEquals(1L, mirror.generation)
        mirror.clear()
        assertNull(mirror.snapshot())
        assertEquals(2L, mirror.generation)
    }
}
