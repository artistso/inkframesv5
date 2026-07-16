package com.inkframe.core.model

/** Inclusive playback range mirrored from the artist-facing timeline. */
data class StudioPlaybackRange(
    val startFrameIndex: Int,
    val endFrameIndex: Int,
) {
    val frameCount: Int get() = endFrameIndex - startFrameIndex + 1
    fun contains(frameIndex: Int): Boolean = frameIndex in startFrameIndex..endFrameIndex
    fun isValid(totalFrameCount: Int): Boolean =
        totalFrameCount > 0 && startFrameIndex in 0 until totalFrameCount &&
            endFrameIndex in startFrameIndex until totalFrameCount
}

/** One contiguous selection segment from the perimeter or circular timeline. */
data class StudioFrameSelectionRange(
    val startFrameIndex: Int,
    val endFrameIndex: Int,
) {
    val frameCount: Int get() = endFrameIndex - startFrameIndex + 1
    fun contains(frameIndex: Int): Boolean = frameIndex in startFrameIndex..endFrameIndex
}

/**
 * Declared exposure beginning at the active frame.
 *
 * This mirrors the current hold value only. It does not claim to resolve older held cels whose
 * bitmap ownership still lives in the WebView document engine.
 */
data class StudioDeclaredExposureSpan(
    val sourceFrameIndex: Int,
    val startFrameIndex: Int,
    val endFrameIndex: Int,
    val holdFrames: Int,
) {
    val visibleFrameCount: Int get() = endFrameIndex - startFrameIndex + 1
    fun contains(frameIndex: Int): Boolean = frameIndex in startFrameIndex..endFrameIndex
    fun isValid(totalFrameCount: Int): Boolean =
        totalFrameCount > 0 && holdFrames in 1..8 &&
            sourceFrameIndex == startFrameIndex &&
            startFrameIndex in 0 until totalFrameCount &&
            endFrameIndex in startFrameIndex until totalFrameCount &&
            visibleFrameCount <= holdFrames
}

/** Read-only state for one frame position in the mirrored timeline. */
data class StudioTimelineFrameState(
    val frameIndex: Int,
    val active: Boolean,
    val selected: Boolean,
    val insidePlaybackRange: Boolean,
    val insideDeclaredExposure: Boolean,
    val activeCelAddress: StudioCelAddress?,
)
