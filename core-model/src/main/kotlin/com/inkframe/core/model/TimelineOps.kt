package com.inkframe.core.model

/**
 * Pure timeline editing operations on the document model — the exposure-sheet edits an
 * animator relies on: clear / move / duplicate / paste cels, and insert / remove frames.
 *
 * Everything here is a referentially-transparent transformation returning new immutable
 * model objects, so it is fully unit-testable without GL. Operations are explicit about
 * GPU surfaces:
 *
 *  - **move** keeps a cel's `surfaceId` (the same pixels relocate on the timeline).
 *  - **duplicate / paste** require a caller-supplied `newSurfaceId` because the result
 *    must be independently editable; the engine clones the source surface's pixels into
 *    that id (see `PaintEngine.cloneSurface`). The model only records the new handle.
 *
 * "Frame" operations act across the whole [Scene] (all layers) like a real timeline
 * insert/remove; per-layer cel edits act on a single [Layer].
 */
object TimelineOps {

    // ---- Single-cel edits (per layer) --------------------------------------

    /** The explicit cel drawn *on* [frame] (not a held cel from an earlier frame). */
    fun explicitCel(layer: Layer, frame: Int): Cel? = layer.cels[frame]

    /** Removes the explicit cel at [frame], if any. Frames after it may then re-expose
     * an earlier cel via frame-holds, matching exposure-sheet behaviour. */
    fun clearCel(layer: Layer, frame: Int): Layer =
        if (layer.cels.containsKey(frame)) layer.copy(cels = layer.cels - frame) else layer

    /** Places (or replaces) [cel] at [frame]. */
    fun setCel(layer: Layer, frame: Int, cel: Cel): Layer =
        layer.copy(cels = layer.cels + (frame to cel))

    /**
     * Moves the explicit cel at [from] to [to], overwriting any cel already at [to].
     * Keeps the same `surfaceId` (the pixels relocate). No-op if [from] has no cel or
     * [from] == [to].
     */
    fun moveCel(layer: Layer, from: Int, to: Int): Layer {
        val cel = layer.cels[from] ?: return layer
        if (from == to) return layer
        val newCels = layer.cels.toMutableMap()
        newCels.remove(from)
        newCels[to] = cel
        return layer.copy(cels = newCels)
    }

    /**
     * Duplicates the explicit cel at [from] onto [to] as an independent cel using
     * [newSurfaceId] (the engine must copy pixels into it). Returns the unchanged layer
     * if [from] has no explicit cel.
     */
    fun duplicateCel(layer: Layer, from: Int, to: Int, newSurfaceId: Long): Layer {
        val src = layer.cels[from] ?: return layer
        val copy = Cel(surfaceId = newSurfaceId, transform = src.transform)
        return layer.copy(cels = layer.cels + (to to copy))
    }

    /**
     * Pastes [clipboardCel] onto [frame] as an independent cel using [newSurfaceId].
     * The clipboard cel's transform is preserved.
     */
    fun pasteCel(layer: Layer, frame: Int, clipboardCel: Cel, newSurfaceId: Long): Layer {
        val pasted = Cel(surfaceId = newSurfaceId, transform = clipboardCel.transform)
        return layer.copy(cels = layer.cels + (frame to pasted))
    }

    /**
     * Shifts every explicit cel at frame >= [fromFrame] by [delta] frames. Used as the
     * primitive for inserting/removing exposure. Cels that would move to a negative frame
     * are dropped. With a positive delta, processes high→low to avoid clobbering.
     */
    fun shiftCels(layer: Layer, fromFrame: Int, delta: Int): Layer {
        if (delta == 0) return layer
        val result = HashMap<Int, Cel>()
        for ((k, v) in layer.cels) {
            if (k < fromFrame) {
                result[k] = v
            } else {
                val nk = k + delta
                if (nk >= 0) result[nk] = v
            }
        }
        return layer.copy(cels = result)
    }

    // ---- Timing edits -------------------------------------------------------

    /** Sets one frame's display hold, clamped to the artist-facing 1..8 contract. */
    fun setFrameHold(scene: Scene, frame: Int, hold: Int): Scene {
        require(frame in 0 until scene.frameCount) { "frame out of range: $frame" }
        val normalized = hold.coerceIn(Scene.MIN_FRAME_HOLD, Scene.MAX_FRAME_HOLD)
        if (scene.frameHolds[frame] == normalized) return scene
        val holds = scene.frameHolds.toMutableList()
        holds[frame] = normalized
        return scene.copy(frameHolds = holds)
    }

    // ---- Frame edits (whole scene) -----------------------------------------

    /**
     * Inserts [count] blank frames before index [at] across all layers (cels at frame
     * >= [at] shift right by [count]); grows [Scene.frameCount] and the playback range.
     * New frames receive the canonical one-frame hold.
     */
    fun insertFrames(scene: Scene, at: Int, count: Int = 1): Scene {
        require(count >= 1) { "count must be >= 1" }
        val clampedAt = at.coerceIn(0, scene.frameCount)
        val layers = scene.layers.map { shiftCels(it, clampedAt, count) }
        val newCount = scene.frameCount + count
        val holds = scene.frameHolds.toMutableList().apply {
            addAll(clampedAt, List(count) { Scene.MIN_FRAME_HOLD })
        }
        return scene.copy(
            layers = layers,
            frameCount = newCount,
            playbackRange = expandRange(scene.playbackRange, clampedAt, count, newCount),
            frameHolds = holds,
        )
    }

    /**
     * Removes [count] frames starting at [at] across all layers. Explicit cels on the
     * removed frames are deleted; later cels shift left. [Scene.frameCount] never drops
     * below 1. Holds are removed with their corresponding frames.
     */
    fun removeFrames(scene: Scene, at: Int, count: Int = 1): Scene {
        require(count >= 1) { "count must be >= 1" }
        val clampedAt = at.coerceIn(0, scene.frameCount - 1)
        val removable = count.coerceAtMost(scene.frameCount - clampedAt)
        val keepCount = (scene.frameCount - removable).coerceAtLeast(1)
        if (removable <= 0 || keepCount == scene.frameCount) return scene

        val layers = scene.layers.map { layer ->
            val result = HashMap<Int, Cel>()
            for ((k, v) in layer.cels) {
                when {
                    k < clampedAt -> result[k] = v
                    k < clampedAt + removable -> { /* removed */ }
                    else -> result[k - removable] = v
                }
            }
            layer.copy(cels = result)
        }
        val retainedHolds = scene.frameHolds.filterIndexed { index, _ ->
            index < clampedAt || index >= clampedAt + removable
        }
        val holds = if (retainedHolds.isEmpty()) {
            listOf(Scene.MIN_FRAME_HOLD)
        } else {
            retainedHolds.take(keepCount)
        }
        return scene.copy(
            layers = layers,
            frameCount = keepCount,
            playbackRange = clampRange(scene.playbackRange, keepCount),
            frameHolds = holds,
        )
    }

    /**
     * Extends the exposure of the cel exposed at [frame] by [holdFrames]: inserts blank
     * frames immediately after [frame] so the current drawing holds longer on screen.
     * Convenience over [insertFrames]. Explicit timing multipliers are edited through
     * [setFrameHold].
     */
    fun extendExposure(scene: Scene, frame: Int, holdFrames: Int = 1): Scene =
        insertFrames(scene, frame + 1, holdFrames)

    // ---- Range helpers ------------------------------------------------------

    private fun expandRange(range: IntRange, at: Int, count: Int, newFrameCount: Int): IntRange {
        val first = if (range.first >= at) range.first + count else range.first
        val last = if (range.last >= at) range.last + count else range.last
        return first.coerceIn(0, newFrameCount - 1)..last.coerceIn(0, newFrameCount - 1)
    }

    private fun clampRange(range: IntRange, newFrameCount: Int): IntRange {
        val last = newFrameCount - 1
        val a = range.first.coerceIn(0, last)
        val b = range.last.coerceIn(a, last)
        return a..b
    }
}
