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
        assertEquals(41L, PlaybackOps.frameDurationMs(24))
        assertEquals(33L, PlaybackOps.frameDurationMs(30))
        assertEquals(1000L, PlaybackOps.frameDurationMs(1))
        assertTrue(PlaybackOps.frameDurationMs(120) >= 1L)
    }

    @Test
    fun clampRange_ordersAndBounds() {
        assertEquals(0..9, PlaybackOps.clampRange(0..9, 10))
        assertEquals(0..9, PlaybackOps.clampRange(-5..99, 10))
        assertEquals(5..5, PlaybackOps.clampRange(5..2, 10))
    }

    @Test
    fun setInPoint_pushesOutWhenNeeded() {
        assertEquals(7..7, PlaybackOps.setInPoint(2..5, 7, 10))
        assertEquals(3..8, PlaybackOps.setInPoint(2..8, 3, 10))
        assertEquals(9..9, PlaybackOps.setInPoint(0..4, 50, 10))
    }

    @Test
    fun setOutPoint_pullsInWhenNeeded() {
        assertEquals(3..3, PlaybackOps.setOutPoint(5..8, 3, 10))
        assertEquals(2..6, PlaybackOps.setOutPoint(2..8, 6, 10))
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
        assertEquals(2 to true, PlaybackOps.nextFrame(8, 2..8, loop = true))
    }

    @Test
    fun nextFrame_stopsAtOutPointWhenNotLooping() {
        assertEquals(8 to false, PlaybackOps.nextFrame(8, 2..8, loop = false))
    }

    @Test
    fun nextFrame_jumpsToInPointWhenOutsideRange() {
        assertEquals(2 to true, PlaybackOps.nextFrame(0, 2..8, loop = true))
        assertEquals(2 to true, PlaybackOps.nextFrame(9, 2..8, loop = false))
    }

    @Test
    fun nextFrame_singleFrameRange() {
        assertEquals(5 to true, PlaybackOps.nextFrame(5, 5..5, loop = true))
        assertEquals(5 to false, PlaybackOps.nextFrame(5, 5..5, loop = false))
    }

    @Test
    fun nextTick_staysOnHeldFrameUntilExposureIsConsumed() {
        val first = PlaybackOps.nextTick(2, 0..4, loop = true, ticksRemaining = 3) { 1 }
        assertEquals(2, first.frame)
        assertEquals(2, first.ticksRemaining)
        assertFalse(first.advanced)

        val second = PlaybackOps.nextTick(2, 0..4, loop = true, ticksRemaining = 2) { 1 }
        assertEquals(2, second.frame)
        assertEquals(1, second.ticksRemaining)
        assertFalse(second.advanced)

        val third = PlaybackOps.nextTick(2, 0..4, loop = true, ticksRemaining = 1) { frame ->
            if (frame == 3) 4 else 1
        }
        assertEquals(3, third.frame)
        assertEquals(4, third.ticksRemaining)
        assertTrue(third.advanced)
    }

    @Test
    fun nextTick_outsideRangeJumpsBeforeConsumingStaleHold() {
        val tick = PlaybackOps.nextTick(9, 2..5, loop = false, ticksRemaining = 7) { frame ->
            if (frame == 2) 3 else 1
        }
        assertEquals(2, tick.frame)
        assertEquals(3, tick.ticksRemaining)
        assertTrue(tick.stillPlaying)
        assertTrue(tick.advanced)
    }

    @Test
    fun nextTick_stopsOnlyAfterFinalFrameHoldCompletes() {
        val waiting = PlaybackOps.nextTick(4, 0..4, loop = false, ticksRemaining = 2) { 1 }
        assertTrue(waiting.stillPlaying)
        assertEquals(4, waiting.frame)
        assertEquals(1, waiting.ticksRemaining)

        val stopped = PlaybackOps.nextTick(4, 0..4, loop = false, ticksRemaining = 1) { 1 }
        assertFalse(stopped.stillPlaying)
        assertEquals(4, stopped.frame)
        assertEquals(0, stopped.ticksRemaining)
    }
}
