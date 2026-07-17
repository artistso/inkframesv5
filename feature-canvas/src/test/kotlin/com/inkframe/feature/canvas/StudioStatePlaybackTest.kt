package com.inkframe.feature.canvas

import com.inkframe.core.model.InkFrameDefaults
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
}
