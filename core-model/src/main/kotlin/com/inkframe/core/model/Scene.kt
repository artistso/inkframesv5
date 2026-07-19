package com.inkframe.core.model

import java.util.UUID

/**
 * A scene owns a timeline (measured in authored frames) and an ordered stack of layers.
 * Layer index 0 is the BOTTOM of the stack; the last entry is composited on top.
 *
 * [holds] stores the exposure count for each authored frame. A hold of 1 displays the
 * frame for one project tick; a hold of 2 displays it on twos, and so on up to 8. This
 * is intentionally separate from sparse layer cels: a layer may still carry its previous
 * cel into an authored frame that has no explicit cel, while the scene-level hold controls
 * how long that complete frame composition remains on screen.
 */
data class Scene(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val frameCount: Int,
    val layers: List<Layer> = emptyList(),
    val playbackRange: IntRange = 0 until frameCount,
    val loop: Boolean = true,
    val holds: List<Int> = List(frameCount) { 1 },
) {
    init {
        require(frameCount >= 1) { "A scene needs at least one frame" }
        require(holds.size == frameCount) {
            "holds size ${holds.size} must match frameCount $frameCount"
        }
        require(holds.all { it in MIN_HOLD..MAX_HOLD }) {
            "frame holds must be in $MIN_HOLD..$MAX_HOLD"
        }
    }

    fun layerById(id: String): Layer? = layers.firstOrNull { it.id == id }

    /** Returns the validated exposure count for [frame]. */
    fun holdAt(frame: Int): Int = holds[frame.coerceIn(0, frameCount - 1)]

    companion object {
        const val MIN_HOLD = 1
        const val MAX_HOLD = 8
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

    /** Resolves which cel is exposed at [frame], honouring sparse cel holds. */
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
