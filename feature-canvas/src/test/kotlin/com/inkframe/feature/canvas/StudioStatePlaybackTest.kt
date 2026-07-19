package com.inkframe.feature.canvas

import com.inkframe.core.model.InkFrameDefaults
import com.inkframe.core.model.Scene
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
}
