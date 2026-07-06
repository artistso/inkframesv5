package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackOpsTest {

    @Test
    fun clampFps_bounds() {
        assertEquals(1, PlaybackOps.clampFps(0))
        assertEquals(1, PlaybackOps.clampFps(-10))
        assertEquals(120, PlaybackOps.clampFps(999))
        assertEquals(24, PlaybackOps.clampFps(24))
    }

    @Test
    fun frameDuration_matchesFps() {
        assertEquals(41L, PlaybackOps.frameDurationMs(24)) // 1000/24 = 41
        assertEquals(33L, PlaybackOps.frameDurationMs(30))
        assertEquals(1000L, PlaybackOps.frameDurationMs(1))
        // Very high fps still yields >= 1ms.
        assertTrue(PlaybackOps.frameDurationMs(120) >= 1L)
    }

    @Test
    fun clampRange_ordersAndBounds() {
        assertEquals(0..9, PlaybackOps.clampRange(0..9, 10))
        assertEquals(0..9, PlaybackOps.clampRange(-5..99, 10))
        // reversed input -> last pulled up to first
        assertEquals(5..5, PlaybackOps.clampRange(5..2, 10))
    }

    @Test
    fun setInPoint_pushesOutWhenNeeded() {
        // in beyond out -> out follows
        assertEquals(7..7, PlaybackOps.setInPoint(2..5, 7, 10))
        // normal
        assertEquals(3..8, PlaybackOps.setInPoint(2..8, 3, 10))
        // clamp
        assertEquals(9..9, PlaybackOps.setInPoint(0..4, 50, 10))
    }

    @Test
    fun setOutPoint_pullsInWhenNeeded() {
        // out before in -> in follows back
        assertEquals(3..3, PlaybackOps.setOutPoint(5..8, 3, 10))
        // normal
        assertEquals(2..6, PlaybackOps.setOutPoint(2..8, 6, 10))
        // clamp to last
        assertEquals(2..9, PlaybackOps.setOutPoint(2..4, 99, 10))
    }

    @Test
    fun fullRange_coversTimeline() {
        assertEquals(0..9, PlaybackOps.fullRange(10))
        assertEquals(0..0, PlaybackOps.fullRange(1))
    }

    @Test
    fun length_isInclusive() {
        assertEquals(10, PlaybackOps.length(0..9))
        assertEquals(1, PlaybackOps.length(4..4))
        assertEquals(3, PlaybackOps.length(2..4))
    }

    @Test
    fun nextFrame_advancesWithinRange() {
        assertEquals(4 to true, PlaybackOps.nextFrame(3, 0..9, loop = true))
    }

    @Test
    fun nextFrame_loopsAtOutPoint() {
        // out-point with loop -> back to in-point
        assertEquals(2 to true, PlaybackOps.nextFrame(8, 2..8, loop = true))
    }

    @Test
    fun nextFrame_stopsAtOutPointWhenNotLooping() {
        assertEquals(8 to false, PlaybackOps.nextFrame(8, 2..8, loop = false))
    }

    @Test
    fun nextFrame_jumpsToInPointWhenOutsideRange() {
        // current before in
        assertEquals(2 to true, PlaybackOps.nextFrame(0, 2..8, loop = true))
        // current after out
        assertEquals(2 to true, PlaybackOps.nextFrame(9, 2..8, loop = false))
    }

    @Test
    fun nextFrame_singleFrameRange() {
        // range of one frame: loop stays, non-loop stops
        assertEquals(5 to true, PlaybackOps.nextFrame(5, 5..5, loop = true))
        assertEquals(5 to false, PlaybackOps.nextFrame(5, 5..5, loop = false))
    }
}
