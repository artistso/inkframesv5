package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Test

class GlassHorizonRecoveryScreenTest {

    @Test
    fun outsidePlaybackRange_restartsAtInPoint() {
        assertEquals(
            4,
            recoveredPlaybackStartFrame(
                currentFrame = 1,
                playbackRange = 4..9,
                frameCount = 12,
                loop = true,
            ),
        )
    }

    @Test
    fun nonLoopingPlaybackAtOutPoint_restartsAtInPoint() {
        assertEquals(
            3,
            recoveredPlaybackStartFrame(
                currentFrame = 7,
                playbackRange = 3..7,
                frameCount = 10,
                loop = false,
            ),
        )
    }

    @Test
    fun validFrameInsideRange_isPreserved() {
        assertEquals(
            5,
            recoveredPlaybackStartFrame(
                currentFrame = 5,
                playbackRange = 3..7,
                frameCount = 10,
                loop = true,
            ),
        )
    }

    @Test
    fun malformedRange_isClampedToDocument() {
        assertEquals(
            0,
            recoveredPlaybackStartFrame(
                currentFrame = 8,
                playbackRange = -5..99,
                frameCount = 6,
                loop = true,
            ),
        )
    }
}
