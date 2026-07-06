package com.inkframe.core.model

/**
 * Pure helpers for the playback range (in/out points), frame rate, and the
 * frame-advance step used during playback. Keeping this out of the UI means the
 * range-validation and looping edge cases are unit-tested without GL/Android.
 *
 * The "in" point is [IntRange.first], the "out" point is [IntRange.last]; both are
 * inclusive frame indices. Helpers always return a valid range: `0 <= in <= out <=
 * frameCount-1`.
 */
object PlaybackOps {

    const val MIN_FPS = 1
    const val MAX_FPS = 120

    /** Clamps [fps] to the supported range. */
    fun clampFps(fps: Int): Int = fps.coerceIn(MIN_FPS, MAX_FPS)

    /** Milliseconds each frame is shown at [fps] (>= 1ms). */
    fun frameDurationMs(fps: Int): Long = (1000L / clampFps(fps)).coerceAtLeast(1L)

    /** A clamped, ordered range within `0 until frameCount`. */
    fun clampRange(range: IntRange, frameCount: Int): IntRange {
        val last = (frameCount - 1).coerceAtLeast(0)
        val a = range.first.coerceIn(0, last)
        val b = range.last.coerceIn(a, last)
        return a..b
    }

    /**
     * Sets the in-point to [inFrame]. If it would pass the current out-point, the out-point
     * is pushed along so the range stays valid (in <= out).
     */
    fun setInPoint(range: IntRange, inFrame: Int, frameCount: Int): IntRange {
        val last = (frameCount - 1).coerceAtLeast(0)
        val newIn = inFrame.coerceIn(0, last)
        val newOut = range.last.coerceIn(newIn, last)
        return newIn..newOut
    }

    /**
     * Sets the out-point to [outFrame]. If it would precede the current in-point, the
     * in-point is pulled back so the range stays valid.
     */
    fun setOutPoint(range: IntRange, outFrame: Int, frameCount: Int): IntRange {
        val last = (frameCount - 1).coerceAtLeast(0)
        val newOut = outFrame.coerceIn(0, last)
        val newIn = range.first.coerceIn(0, newOut)
        return newIn..newOut
    }

    /** Resets the range to cover the whole timeline. */
    fun fullRange(frameCount: Int): IntRange = 0..(frameCount - 1).coerceAtLeast(0)

    /** Number of frames in [range] (inclusive). */
    fun length(range: IntRange): Int = (range.last - range.first + 1).coerceAtLeast(1)

    /**
     * Computes the next frame during playback. Advances by one; at/after the out-point it
     * loops to the in-point when [loop] is true, otherwise it stays on the out-point (the
     * caller stops playing). A [current] outside the range jumps to the in-point first.
     *
     * @return (nextFrame, stillPlaying)
     */
    fun nextFrame(current: Int, range: IntRange, loop: Boolean): Pair<Int, Boolean> {
        if (current < range.first || current > range.last) return range.first to true
        val next = current + 1
        return when {
            next <= range.last -> next to true
            loop -> range.first to true
            else -> range.last to false
        }
    }
}
