package com.inkframe.core.model

/**
 * Typed, immutable projection of timeline selection, playback, and active cel exposure.
 *
 * The original perimeter and circular timelines remain authoritative. This model performs no
 * frame, hold, selection, project, artwork, or storage writes.
 */
data class StudioTimelineExposureSnapshot(
    val schema: Int,
    val revision: Int,
    val projectIndex: Int,
    val sceneIndex: Int,
    val frameCount: Int,
    val maxFrames: Int,
    val activeFrameIndex: Int,
    val playbackRange: StudioPlaybackRange,
    val fps: Int,
    val playing: Boolean,
    val loopEnabled: Boolean,
    val selectedFrameIndices: List<Int>,
    val selectionRanges: List<StudioFrameSelectionRange>,
    val declaredExposure: StudioDeclaredExposureSpan,
    val activeCelAddress: StudioCelAddress?,
) {
    fun validatedOrNull(): StudioTimelineExposureSnapshot? {
        if (schema != CURRENT_SCHEMA || revision < 0 || projectIndex < 0 || sceneIndex < 0) return null
        if (frameCount !in 1..StudioPlaybackSnapshot.MAX_FRAME_COUNT) return null
        if (maxFrames !in frameCount..StudioPlaybackSnapshot.MAX_FRAME_COUNT) return null
        if (activeFrameIndex !in 0 until frameCount || fps !in 1..120) return null
        if (!playbackRange.isValid(frameCount) || !declaredExposure.isValid(frameCount)) return null
        if (selectedFrameIndices.size > StudioPlaybackSnapshot.MAX_SELECTED_FRAMES) return null
        if (selectedFrameIndices.any { it !in 0 until frameCount }) return null
        if (selectedFrameIndices.distinct().size != selectedFrameIndices.size) return null
        if (selectedFrameIndices != selectedFrameIndices.sorted()) return null
        if (selectionRanges != selectionRangesFor(selectedFrameIndices)) return null
        if (activeCelAddress != null) {
            if (activeCelAddress.projectIndex != projectIndex || activeCelAddress.sceneIndex != sceneIndex) return null
            if (activeCelAddress.frameIndex != activeFrameIndex) return null
        }
        return this
    }

    fun frameState(frameIndex: Int): StudioTimelineFrameState? {
        if (frameIndex !in 0 until frameCount) return null
        return StudioTimelineFrameState(
            frameIndex = frameIndex,
            active = frameIndex == activeFrameIndex,
            selected = frameIndex in selectedFrameIndices,
            insidePlaybackRange = playbackRange.contains(frameIndex),
            insideDeclaredExposure = declaredExposure.contains(frameIndex),
            activeCelAddress = activeCelAddress?.takeIf { frameIndex == activeFrameIndex },
        )
    }

    /** Pure preview of transport stepping; it does not mutate the authoritative timeline. */
    fun steppedFrameIndex(delta: Int): Int {
        if (delta == 0) return activeFrameIndex
        val direction = if (delta > 0) 1 else -1
        var result = activeFrameIndex
        repeat(kotlin.math.abs(delta)) {
            result = when {
                direction > 0 && result < playbackRange.endFrameIndex -> result + 1
                direction < 0 && result > playbackRange.startFrameIndex -> result - 1
                loopEnabled && direction > 0 -> playbackRange.startFrameIndex
                loopEnabled -> playbackRange.endFrameIndex
                direction > 0 -> playbackRange.endFrameIndex
                else -> playbackRange.startFrameIndex
            }
        }
        return result
    }

    companion object {
        const val CURRENT_SCHEMA = 1

        fun from(project: StudioProjectReconciliationSnapshot): StudioTimelineExposureSnapshot? {
            val reconciled = project.validatedOrNull() ?: return null
            val playback = reconciled.playback
            val selected = playback.selectedFrameIndices.sorted()
            val exposureEnd = (playback.activeFrameIndex + playback.holdFrames - 1)
                .coerceAtMost(playback.frameCount - 1)
            return StudioTimelineExposureSnapshot(
                schema = CURRENT_SCHEMA,
                revision = reconciled.revision,
                projectIndex = reconciled.projectIndex,
                sceneIndex = reconciled.sceneIndex,
                frameCount = playback.frameCount,
                maxFrames = playback.maxFrames,
                activeFrameIndex = playback.activeFrameIndex,
                playbackRange = StudioPlaybackRange(playback.rangeStartFrame, playback.rangeEndFrame),
                fps = playback.fps,
                playing = playback.playing,
                loopEnabled = playback.loopEnabled,
                selectedFrameIndices = selected,
                selectionRanges = selectionRangesFor(selected),
                declaredExposure = StudioDeclaredExposureSpan(
                    sourceFrameIndex = playback.activeFrameIndex,
                    startFrameIndex = playback.activeFrameIndex,
                    endFrameIndex = exposureEnd,
                    holdFrames = playback.holdFrames,
                ),
                activeCelAddress = reconciled.activeCelAddress,
            ).validatedOrNull()
        }

        internal fun selectionRangesFor(indices: List<Int>): List<StudioFrameSelectionRange> {
            if (indices.isEmpty()) return emptyList()
            val ranges = ArrayList<StudioFrameSelectionRange>()
            var start = indices.first()
            var previous = start
            for (index in indices.drop(1)) {
                if (index == previous + 1) previous = index
                else {
                    ranges += StudioFrameSelectionRange(start, previous)
                    start = index
                    previous = index
                }
            }
            ranges += StudioFrameSelectionRange(start, previous)
            return ranges
        }
    }
}
