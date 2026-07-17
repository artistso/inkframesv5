package com.inkframe.core.model

import java.util.UUID

/**
 * A scene owns a timeline (measured in frames) and an ordered stack of layers.
 * Layer index 0 is the BOTTOM of the stack; the last entry is composited on top.
 */
data class Scene(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val frameCount: Int,
    val layers: List<Layer> = emptyList(),
    val playbackRange: IntRange = 0 until frameCount,
    val loop: Boolean = true,
    /** Display duration multiplier for every timeline frame. InkFrame supports holds 1 through 8. */
    val frameHolds: List<Int> = List(frameCount) { MIN_FRAME_HOLD },
) {
    init {
        require(frameCount >= 1) { "A scene needs at least one frame" }
        require(frameHolds.size == frameCount) {
            "frameHolds size ${frameHolds.size} must match frameCount $frameCount"
        }
        require(frameHolds.all { it in MIN_FRAME_HOLD..MAX_FRAME_HOLD }) {
            "frame holds must be in $MIN_FRAME_HOLD..$MAX_FRAME_HOLD"
        }
    }

    fun layerById(id: String): Layer? = layers.firstOrNull { it.id == id }

    fun holdAt(frame: Int): Int {
        require(frame in 0 until frameCount) { "frame out of range: $frame" }
        return frameHolds[frame]
    }

    companion object {
        const val MIN_FRAME_HOLD = 1
        const val MAX_FRAME_HOLD = 8
    }
}

/** Blend modes supported by the GL compositor. Ordinal maps to a shader uniform. */
enum class BlendMode {
    NORMAL, MULTIPLY, SCREEN, OVERLAY, ADD, DARKEN, LIGHTEN, DIFFERENCE;

    /** Title-case label for UI (e.g. "Normal", "Multiply"). */
    val displayName: String
        get() = name.lowercase().replaceFirstChar { it.uppercase() }

    companion object {
        fun fromOrdinalSafe(v: Int): BlendMode = entries.getOrElse(v) { NORMAL }
    }
}

data class Layer(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val opacity: Float = 1.0f,
    val visible: Boolean = true,
    val locked: Boolean = false,
    val blendMode: BlendMode = BlendMode.NORMAL,
    /**
     * Sparse map of timeline frame index -> Cel (a drawn image held by the engine).
     * Frames without an entry "hold" the most recent earlier cel (classic exposure sheet
     * behaviour). An empty map means the layer is blank across the whole timeline.
     */
    val cels: Map<Int, Cel> = emptyMap(),
) {
    init {
        require(opacity in 0f..1f) { "opacity must be 0..1" }
    }

    /** Resolves which cel is exposed at [frame], honouring frame holds. */
    fun celAt(frame: Int): Cel? {
        cels[frame]?.let { return it }
        var best: Cel? = null
        var bestKey = Int.MIN_VALUE
        for ((k, v) in cels) {
            if (k <= frame && k > bestKey) {
                bestKey = k; best = v
            }
        }
        return best
    }
}

/**
 * A Cel references a bitmap surface owned by the rendering engine (by id) plus the
 * transform applied when compositing it. Pixels live on the GPU; the model only holds
 * the lightweight handle so document state stays cheap to copy for undo.
 */
data class Cel(
    val id: String = UUID.randomUUID().toString(),
    val surfaceId: Long,
    val transform: CelTransform = CelTransform(),
)

data class CelTransform(
    val tx: Float = 0f,
    val ty: Float = 0f,
    val scaleX: Float = 1f,
    val scaleY: Float = 1f,
    val rotationDeg: Float = 0f,
)
