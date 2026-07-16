package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StudioProjectReconciliationTest {
    private fun snapshot(
        revision: Int = 7,
        projectIndex: Int = 2,
        frameIndex: Int = 4,
        layerIndex: Int = 1,
        layerCount: Int = 3,
        background: Boolean = false,
    ) = StudioProjectReconciliationSnapshot(
        schema = StudioProjectReconciliationSnapshot.CURRENT_SCHEMA,
        revision = revision,
        projectIndex = projectIndex,
        sceneIndex = 0,
        canvasWidth = 1920,
        canvasHeight = 1080,
        shape = StudioCanvasShape.SQUARE,
        playback = StudioPlaybackSnapshot(
            frameCount = 12,
            activeFrameIndex = frameIndex,
            maxFrames = 120,
            rangeStartFrame = 0,
            rangeEndFrame = 11,
            fps = 12,
            playing = false,
            loopEnabled = true,
            holdFrames = 2,
            selectedFrameIndices = listOf(3, 4),
        ),
        layer = StudioLayerReconciliationSnapshot(
            layerCount = layerCount,
            activeLayerIndex = if (background) StudioContextSnapshot.BACKGROUND_LAYER_INDEX else layerIndex,
            backgroundActive = background,
            visible = true,
            opacity = 0.75,
            blendMode = "Multiply",
        ),
    )

    private fun context(
        frameIndex: Int = 4,
        layerIndex: Int = 1,
        layerCount: Int = 3,
        background: Boolean = false,
    ) = StudioContextSnapshot(
        schema = StudioContextSnapshot.CURRENT_SCHEMA,
        enabled = true,
        contextToken = "project-2-frame-$frameIndex-layer-$layerIndex",
        baseContextToken = "base",
        contextRevision = 7,
        projectIndex = 2,
        frameIndex = frameIndex,
        layerIndex = if (background) StudioContextSnapshot.BACKGROUND_LAYER_INDEX else layerIndex,
        layerCount = layerCount,
        backgroundActive = background,
        canvasWidth = 1920,
        canvasHeight = 1080,
        shape = StudioCanvasShape.SQUARE,
        geometry = StudioCanvasGeometry(10.0, 20.0, 960.0, 540.0),
        brush = StudioBrushContext("ink", 0xff112233.toInt(), 0xffffffff.toInt(), 14.0, 1.0),
    )

    @Test
    fun validSnapshotPublishesActiveCelAddress() {
        val value = snapshot()
        assertNotNull(value.validatedOrNull())
        assertEquals(
            StudioCelAddress(2, 0, 4, 1, false),
            value.activeCelAddress,
        )
        assertTrue(value.matches(context()))
    }

    @Test
    fun backgroundUsesExplicitBackgroundCelAddress() {
        val value = snapshot(background = true)
        assertEquals(
            StudioCelAddress(2, 0, 4, StudioContextSnapshot.BACKGROUND_LAYER_INDEX, true),
            value.activeCelAddress,
        )
        assertTrue(value.matches(context(background = true)))
        assertFalse(value.matches(context(background = false)))
    }

    @Test
    fun emptyLayerStackHasNoActiveCel() {
        val value = snapshot(layerIndex = 0, layerCount = 0)
        assertNotNull(value.validatedOrNull())
        assertNull(value.activeCelAddress)
    }

    @Test
    fun rejectsOutOfRangeTimelineAndLayerState() {
        assertNull(snapshot(frameIndex = 12).validatedOrNull())
        assertNull(snapshot(layerIndex = 3, layerCount = 3).validatedOrNull())
        assertNull(snapshot().copy(playback = snapshot().playback.copy(fps = 0)).validatedOrNull())
        assertNull(snapshot().copy(layer = snapshot().layer.copy(opacity = 1.5)).validatedOrNull())
    }

    @Test
    fun mirrorPreservesLastValidSnapshot() {
        val mirror = StudioProjectReconciliationMirror()
        val first = snapshot()
        assertEquals(StudioProjectReconciliationUpdate.ACCEPTED_CHANGED, mirror.update(first))
        assertEquals(StudioProjectReconciliationUpdate.ACCEPTED_UNCHANGED, mirror.update(first))
        val invalid = first.copy(playback = first.playback.copy(activeFrameIndex = 99))
        assertEquals(StudioProjectReconciliationUpdate.REJECTED_INVALID, mirror.update(invalid))
        assertEquals(first, mirror.snapshot())
        assertEquals(1L, mirror.generation)
        mirror.clear()
        assertNull(mirror.snapshot())
        assertEquals(2L, mirror.generation)
    }

    @Test
    fun structuralMirrorDetectsStaleFrameLayerAndCanvas() {
        val value = snapshot()
        assertFalse(value.matches(context(frameIndex = 5)))
        assertFalse(value.matches(context(layerIndex = 2)))
        assertFalse(value.matches(context().copy(canvasWidth = 2048)))
    }
}
