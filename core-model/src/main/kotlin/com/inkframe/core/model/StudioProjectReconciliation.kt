package com.inkframe.core.model

import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/**
 * Read-only address of the cel currently targeted by the original InkFrame studio.
 *
 * This identifies where drawing belongs; it does not claim that pixel content exists at the address.
 * The WebView remains authoritative until the Kotlin document engine reaches full parity.
 */
data class StudioCelAddress(
    val projectIndex: Int,
    val sceneIndex: Int,
    val frameIndex: Int,
    val layerIndex: Int,
    val background: Boolean,
)

/** Playback and exposure state mirrored from the existing perimeter/circular timeline. */
data class StudioPlaybackSnapshot(
    val frameCount: Int,
    val activeFrameIndex: Int,
    val maxFrames: Int,
    val rangeStartFrame: Int,
    val rangeEndFrame: Int,
    val fps: Int,
    val playing: Boolean,
    val loopEnabled: Boolean,
    val holdFrames: Int,
    val selectedFrameIndices: List<Int>,
) {
    fun isValid(): Boolean {
        if (frameCount !in 1..MAX_FRAME_COUNT) return false
        if (activeFrameIndex !in 0 until frameCount) return false
        if (maxFrames !in frameCount..MAX_FRAME_COUNT) return false
        if (rangeStartFrame !in 0 until frameCount) return false
        if (rangeEndFrame !in rangeStartFrame until frameCount) return false
        if (fps !in 1..120 || holdFrames !in 1..8) return false
        if (selectedFrameIndices.size > MAX_SELECTED_FRAMES) return false
        if (selectedFrameIndices.any { it !in 0 until frameCount }) return false
        if (selectedFrameIndices.distinct().size != selectedFrameIndices.size) return false
        return true
    }

    companion object {
        const val MAX_FRAME_COUNT = 1_000_000
        const val MAX_SELECTED_FRAMES = 120
    }
}

/** Active layer properties mirrored without reading artwork pixels or layer names. */
data class StudioLayerReconciliationSnapshot(
    val layerCount: Int,
    val activeLayerIndex: Int,
    val backgroundActive: Boolean,
    val visible: Boolean,
    val opacity: Double,
    val blendMode: String,
) {
    fun isValid(): Boolean {
        if (layerCount !in 0..MAX_LAYER_COUNT) return false
        if (!opacity.isFinite() || opacity !in 0.0..1.0) return false
        if (blendMode.isBlank() || blendMode.length > MAX_BLEND_NAME_LENGTH) return false
        if (backgroundActive) return activeLayerIndex == StudioContextSnapshot.BACKGROUND_LAYER_INDEX
        if (layerCount == 0) return activeLayerIndex == 0
        return activeLayerIndex in 0 until layerCount
    }

    companion object {
        const val MAX_LAYER_COUNT = 100_000
        const val MAX_BLEND_NAME_LENGTH = 48
    }
}

/**
 * Immutable read-only projection of the live WebView project into Kotlin's Project/Scene/Layer/Cel
 * vocabulary. It contains only structural and active-context metadata; no bitmap or project writes.
 */
data class StudioProjectReconciliationSnapshot(
    val schema: Int,
    val revision: Int,
    val projectIndex: Int,
    val sceneIndex: Int,
    val canvasWidth: Int,
    val canvasHeight: Int,
    val shape: StudioCanvasShape,
    val playback: StudioPlaybackSnapshot,
    val layer: StudioLayerReconciliationSnapshot,
) {
    val activeCelAddress: StudioCelAddress?
        get() {
            if (!layer.backgroundActive && layer.layerCount == 0) return null
            return StudioCelAddress(
                projectIndex = projectIndex,
                sceneIndex = sceneIndex,
                frameIndex = playback.activeFrameIndex,
                layerIndex = layer.activeLayerIndex,
                background = layer.backgroundActive,
            )
        }

    fun validatedOrNull(): StudioProjectReconciliationSnapshot? {
        if (schema != CURRENT_SCHEMA) return null
        if (revision < 0 || projectIndex < 0 || sceneIndex < 0) return null
        if (canvasWidth !in 1..16_384 || canvasHeight !in 1..16_384) return null
        if (!playback.isValid() || !layer.isValid()) return null
        return this
    }

    /** Confirms that the structural mirror and the native-stroke context address the same target. */
    fun matches(context: StudioContextSnapshot): Boolean {
        val validated = validatedOrNull() ?: return false
        val studio = context.validatedOrNull() ?: return false
        return validated.projectIndex == studio.projectIndex &&
            validated.playback.activeFrameIndex == studio.frameIndex &&
            validated.layer.activeLayerIndex == studio.layerIndex &&
            validated.layer.layerCount == studio.layerCount &&
            validated.layer.backgroundActive == studio.backgroundActive &&
            validated.canvasWidth == studio.canvasWidth &&
            validated.canvasHeight == studio.canvasHeight &&
            validated.shape == studio.shape
    }

    companion object {
        const val CURRENT_SCHEMA = 1
    }
}

enum class StudioProjectReconciliationUpdate {
    ACCEPTED_CHANGED,
    ACCEPTED_UNCHANGED,
    REJECTED_INVALID,
}

/** Thread-safe, read-only Kotlin mirror of the original studio's current project structure. */
class StudioProjectReconciliationMirror {
    private val current = AtomicReference<StudioProjectReconciliationSnapshot?>(null)
    private val generationCounter = AtomicLong(0L)

    val generation: Long
        get() = generationCounter.get()

    fun snapshot(): StudioProjectReconciliationSnapshot? = current.get()

    fun update(candidate: StudioProjectReconciliationSnapshot): StudioProjectReconciliationUpdate {
        val validated = candidate.validatedOrNull()
            ?: return StudioProjectReconciliationUpdate.REJECTED_INVALID
        val previous = current.getAndSet(validated)
        return if (previous == validated) {
            StudioProjectReconciliationUpdate.ACCEPTED_UNCHANGED
        } else {
            generationCounter.incrementAndGet()
            StudioProjectReconciliationUpdate.ACCEPTED_CHANGED
        }
    }

    fun clear() {
        if (current.getAndSet(null) != null) generationCounter.incrementAndGet()
    }
}
