package com.inkframe.core.model

/**
 * Compact, read-only artist context shown by the native canvas while the S Pen hovers.
 *
 * The original studio remains authoritative. This value contains no artwork and performs no
 * project, timeline, layer, history, or storage writes.
 */
data class StudioArtistCanvasStatus(
    val revision: Int,
    val frameNumber: Int,
    val frameCount: Int,
    val layerLabel: String,
    val holdFrames: Int,
    val shape: StudioCanvasShape,
    val playing: Boolean,
) {
    fun validatedOrNull(): StudioArtistCanvasStatus? {
        if (revision < 0) return null
        if (frameCount !in 1..StudioPlaybackSnapshot.MAX_FRAME_COUNT) return null
        if (frameNumber !in 1..frameCount) return null
        if (layerLabel.isBlank() || layerLabel.length > MAX_LAYER_LABEL_LENGTH) return null
        if (holdFrames !in 1..8) return null
        return this
    }

    fun displayText(): String {
        val parts = ArrayList<String>(5)
        parts += "F $frameNumber/$frameCount"
        parts += layerLabel
        if (holdFrames > 1) parts += "Hold $holdFrames"
        parts += if (shape == StudioCanvasShape.CIRCLE) "Circle" else "Square"
        if (playing) parts += "Playing"
        return parts.joinToString(" · ")
    }

    companion object {
        const val MAX_LAYER_LABEL_LENGTH = 48

        fun from(
            project: StudioProjectReconciliationSnapshot,
            timeline: StudioTimelineExposureSnapshot,
        ): StudioArtistCanvasStatus? {
            val reconciled = project.validatedOrNull() ?: return null
            val exposure = timeline.validatedOrNull() ?: return null
            if (reconciled.revision != exposure.revision) return null
            if (reconciled.projectIndex != exposure.projectIndex) return null
            if (reconciled.sceneIndex != exposure.sceneIndex) return null
            if (reconciled.playback.frameCount != exposure.frameCount) return null
            if (reconciled.playback.activeFrameIndex != exposure.activeFrameIndex) return null

            val layerLabel = when {
                reconciled.layer.backgroundActive -> "Static BG"
                reconciled.layer.layerCount > 0 ->
                    "Layer ${reconciled.layer.activeLayerIndex + 1}/${reconciled.layer.layerCount}"
                else -> "No Layer"
            }
            return StudioArtistCanvasStatus(
                revision = reconciled.revision,
                frameNumber = exposure.activeFrameIndex + 1,
                frameCount = exposure.frameCount,
                layerLabel = layerLabel,
                holdFrames = exposure.declaredExposure.holdFrames,
                shape = reconciled.shape,
                playing = exposure.playing,
            ).validatedOrNull()
        }
    }
}
