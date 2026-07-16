package com.inkframe.studio.nativeink

import java.util.ArrayDeque

/** Immutable brush settings captured when a stroke begins. */
data class NativeBrushStyle(
    val color: Int,
    val sizePx: Float,
)

/** One committed artist stroke. Samples remain in canvas coordinates. */
data class NativeStroke(
    val samples: List<InkSample>,
    val style: NativeBrushStyle,
    val eraser: Boolean,
)

/** Read-only document state used by the artist UI and export path. */
data class NativeCanvasSnapshot(
    val strokes: List<NativeStroke>,
    val strokeCount: Int,
    val sampleCount: Int,
    val canUndo: Boolean,
    val canRedo: Boolean,
)

/**
 * Bounded, platform-neutral native canvas history.
 *
 * Active MotionEvent ownership remains inside the Android View. This model only accepts completed
 * immutable strokes, making cancellation non-destructive and keeping undo/redo deterministic.
 */
class NativeCanvasDocument(
    private val maximumStrokes: Int = 512,
    private val maximumSamples: Int = 262_144,
) {
    private val committed = ArrayDeque<NativeStroke>()
    private val redo = ArrayDeque<NativeStroke>()
    private var retainedSamples = 0

    init {
        require(maximumStrokes > 0) { "maximumStrokes must be positive" }
        require(maximumSamples > 0) { "maximumSamples must be positive" }
    }

    fun commit(
        samples: List<InkSample>,
        style: NativeBrushStyle,
        eraser: Boolean,
    ): Boolean {
        if (samples.isEmpty()) return false

        while (redo.isNotEmpty()) {
            retainedSamples -= redo.removeLast().samples.size
        }

        val stroke = NativeStroke(
            samples = samples.toList(),
            style = style.copy(sizePx = style.sizePx.coerceAtLeast(0.5f)),
            eraser = eraser,
        )
        committed.addLast(stroke)
        retainedSamples += stroke.samples.size
        trimToBounds()
        return true
    }

    fun undo(): Boolean {
        val stroke = committed.pollLast() ?: return false
        redo.addLast(stroke)
        return true
    }

    fun redo(): Boolean {
        val stroke = redo.pollLast() ?: return false
        committed.addLast(stroke)
        return true
    }

    fun clear() {
        committed.clear()
        redo.clear()
        retainedSamples = 0
    }

    fun snapshot(): NativeCanvasSnapshot {
        val visible = committed.toList()
        return NativeCanvasSnapshot(
            strokes = visible,
            strokeCount = visible.size,
            sampleCount = visible.sumOf { it.samples.size },
            canUndo = committed.isNotEmpty(),
            canRedo = redo.isNotEmpty(),
        )
    }

    private fun trimToBounds() {
        while (committed.size + redo.size > maximumStrokes || retainedSamples > maximumSamples) {
            val removed = committed.pollFirst() ?: redo.pollFirst() ?: break
            retainedSamples -= removed.samples.size
        }
        retainedSamples = retainedSamples.coerceAtLeast(0)
    }
}
