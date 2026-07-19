package com.inkframe.core.model

/**
 * Pure helpers for playback range, frame rate, and hold-aware frame advancement.
 */
object PlaybackOps {

    const val MIN_FPS = 1
    const val MAX_FPS = 120

    data class TickResult(
        val frame: Int,
        val ticksRemaining: Int,
        val stillPlaying: Boolean,
        val advanced: Boolean,
    )

    /** Clamps [fps] to the supported range. */
    fun clampFps(fps: Int): Int = fps.coerceIn(MIN_FPS, MAX_FPS)

    /** Milliseconds for one project timing tick at [fps] (>= 1ms). */
    fun frameDurationMs(fps: Int): Long = (1000L / clampFps(fps)).coerceAtLeast(1L)

    /** A clamped, ordered range within `0 until frameCount`. */
    fun clampRange(range: IntRange, frameCount: Int): IntRange {
        val last = (frameCount - 1).coerceAtLeast(0)
        val a = range.first.coerceIn(0, last)
        val b = range.last.coerceIn(a, last)
        return a..b
    }

    /** Sets the in-point while preserving a valid inclusive range. */
    fun setInPoint(range: IntRange, inFrame: Int, frameCount: Int): IntRange {
        val last = (frameCount - 1).coerceAtLeast(0)
        val newIn = inFrame.coerceIn(0, last)
        val newOut = range.last.coerceIn(newIn, last)
        return newIn..newOut
    }

    /** Sets the out-point while preserving a valid inclusive range. */
    fun setOutPoint(range: IntRange, outFrame: Int, frameCount: Int): IntRange {
        val last = (frameCount - 1).coerceAtLeast(0)
        val newOut = outFrame.coerceIn(0, last)
        val newIn = range.first.coerceIn(0, newOut)
        return newIn..newOut
    }

    /** Resets the range to cover the whole timeline. */
    fun fullRange(frameCount: Int): IntRange = 0..(frameCount - 1).coerceAtLeast(0)

    /** Number of authored frames in [range] (inclusive). */
    fun length(range: IntRange): Int = (range.last - range.first + 1).coerceAtLeast(1)

    /** Computes the next authored frame, without applying hold timing. */
    fun nextFrame(current: Int, range: IntRange, loop: Boolean): Pair<Int, Boolean> {
        if (current < range.first || current > range.last) return range.first to true
        val next = current + 1
        return when {
            next <= range.last -> next to true
            loop -> range.first to true
            else -> range.last to false
        }
    }

    /**
     * Advances one playback timing tick. A frame with hold N remains current for N calls
     * before moving to the next authored frame. [holdAt] must return a positive hold count;
     * values are clamped defensively to the supported scene range.
     */
    fun nextTick(
        current: Int,
        range: IntRange,
        loop: Boolean,
        ticksRemaining: Int,
        holdAt: (Int) -> Int,
    ): TickResult {
        if (current !in range) {
            return TickResult(
                frame = range.first,
                ticksRemaining = holdAt(range.first).coerceIn(Scene.MIN_HOLD, Scene.MAX_HOLD),
                stillPlaying = true,
                advanced = true,
            )
        }

        val remaining = ticksRemaining.coerceAtLeast(1)
        if (remaining > 1) {
            return TickResult(
                frame = current,
                ticksRemaining = remaining - 1,
                stillPlaying = true,
                advanced = false,
            )
        }

        val (next, stillPlaying) = nextFrame(current, range, loop)
        if (!stillPlaying && next == current) {
            return TickResult(
                frame = current,
                ticksRemaining = 0,
                stillPlaying = false,
                advanced = false,
            )
        }

        return TickResult(
            frame = next,
            ticksRemaining = holdAt(next).coerceIn(Scene.MIN_HOLD, Scene.MAX_HOLD),
            stillPlaying = stillPlaying,
            advanced = next != current,
        )
    }
}
