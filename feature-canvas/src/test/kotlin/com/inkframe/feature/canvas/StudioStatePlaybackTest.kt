package com.inkframe.feature.canvas

import com.inkframe.core.model.CanvasSpec
import com.inkframe.core.model.Cel
import com.inkframe.core.model.InkFrameDefaults
import com.inkframe.core.model.Layer
import com.inkframe.core.model.Project
import com.inkframe.core.model.Scene
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StudioStatePlaybackTest {
    @Test
    fun insertFrameAddsAfterCurrentAndExpandsPlaybackRange() {
        val state = StudioState()
        state.replaceProject(InkFrameDefaults.newProject())
        state.insertFrame()
        assertEquals(2, state.scene.frameCount)
        assertEquals(1, state.currentFrame)
        assertEquals(0..1, state.scene.playbackRange)
        assertEquals(listOf(1, 1), state.scene.holds)
    }

    @Test
    fun playbackRestartsAtRangeStartWhenPressedAtEnd() {
        val state = StudioState()
        state.replaceProject(InkFrameDefaults.newProject())
        state.insertFrame()
        state.togglePlay()
        assertTrue(state.isPlaying)
        assertEquals(0, state.currentFrame)
        state.stop()
        assertFalse(state.isPlaying)
    }

    @Test
    fun oneFrameProjectDoesNotPretendToPlay() {
        val state = StudioState()
        state.replaceProject(InkFrameDefaults.newProject())
        state.togglePlay()
        assertFalse(state.isPlaying)
        assertEquals("ADD AT LEAST 2 FRAMES TO PLAY", state.statusMessage)
    }

    @Test
    fun currentHoldCanBeAdjustedAndIsClamped() {
        val state = StudioState()
        state.replaceProject(InkFrameDefaults.newProject())
        state.adjustCurrentHold(2)
        assertEquals(3, state.currentHold)
        state.setCurrentHold(99)
        assertEquals(Scene.MAX_HOLD, state.currentHold)
        state.setCurrentHold(-4)
        assertEquals(Scene.MIN_HOLD, state.currentHold)
    }

    @Test
    fun playbackConsumesCurrentFrameHoldBeforeAdvancing() {
        val state = StudioState()
        state.replaceProject(InkFrameDefaults.newProject())
        state.insertFrame()
        state.setFrame(0)
        state.setCurrentHold(3)
        state.togglePlay()

        state.advancePlayback()
        assertEquals(0, state.currentFrame)
        state.advancePlayback()
        assertEquals(0, state.currentFrame)
        state.advancePlayback()
        assertEquals(1, state.currentFrame)
    }

    @Test
    fun duplicateCopiesPixelsIndependentlyAndPreservesHold() {
        val state = StudioState()
        state.replaceProject(twoFrameProject())
        state.setFrame(0)
        state.duplicateCelToNextFrame()

        assertEquals(1, state.currentFrame)
        assertEquals(4, state.currentHold)
        val source = state.activeLayer.cels[0]!!
        val duplicate = state.activeLayer.cels[1]!!
        assertNotEquals(source.surfaceId, duplicate.surfaceId)
    }

    @Test
    fun copyPasteCarriesExposureTiming() {
        val state = StudioState()
        state.replaceProject(twoFrameProject())
        state.setFrame(0)
        state.copyCel()
        state.setFrame(1)
        state.pasteCel()

        assertEquals(4, state.currentHold)
        val source = state.activeLayer.cels[0]!!
        val pasted = state.activeLayer.cels[1]!!
        assertNotEquals(source.surfaceId, pasted.surfaceId)
    }

    private fun twoFrameProject(): Project {
        val layer = Layer(
            id = "layer",
            name = "Layer",
            cels = mapOf(0 to Cel(id = "cel", surfaceId = 10L)),
        )
        val scene = Scene(
            id = "scene",
            name = "Scene",
            frameCount = 2,
            layers = listOf(layer),
            holds = listOf(4, 1),
        )
        return Project(
            id = "project",
            name = "Project",
            canvas = CanvasSpec(320, 240, 12),
            scenes = listOf(scene),
            activeSceneId = scene.id,
        )
    }
}
