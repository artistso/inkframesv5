package com.inkframe.core.model

/**
 * Pure operations on a [Scene]'s layer stack: reorder, rename, delete, and toggle the
 * per-layer flags. Layer index 0 is the BOTTOM of the stack (drawn first); the last entry
 * is composited on top — so "move up" in the panel means toward the end of the list.
 *
 * All functions are referentially transparent (return a new [Scene]); the z-order and
 * edge-case handling is unit-tested without GL/Android.
 */
object LayerOps {

    /** Index of the layer with [id], or -1 if absent. */
    fun indexOf(scene: Scene, id: String): Int = scene.layers.indexOfFirst { it.id == id }

    /**
     * Moves the layer with [id] to absolute [toIndex] (clamped to the valid range),
     * preserving the order of the others. No-op if the layer is missing or already there.
     */
    fun moveTo(scene: Scene, id: String, toIndex: Int): Scene {
        val from = indexOf(scene, id)
        if (from < 0) return scene
        val dest = toIndex.coerceIn(0, scene.layers.lastIndex)
        if (from == dest) return scene
        val mutable = scene.layers.toMutableList()
        val moved = mutable.removeAt(from)
        mutable.add(dest, moved)
        return scene.copy(layers = mutable)
    }

    /** Moves the layer one step toward the TOP of the stack (end of the list). */
    fun moveUp(scene: Scene, id: String): Scene {
        val i = indexOf(scene, id)
        if (i < 0 || i == scene.layers.lastIndex) return scene
        return swap(scene, i, i + 1)
    }

    /** Moves the layer one step toward the BOTTOM of the stack (start of the list). */
    fun moveDown(scene: Scene, id: String): Scene {
        val i = indexOf(scene, id)
        if (i <= 0) return scene
        return swap(scene, i, i - 1)
    }

    private fun swap(scene: Scene, a: Int, b: Int): Scene {
        val list = scene.layers.toMutableList()
        val tmp = list[a]; list[a] = list[b]; list[b] = tmp
        return scene.copy(layers = list)
    }

    /** Renames the layer with [id]. Blank names fall back to a sensible default. */
    fun rename(scene: Scene, id: String, name: String): Scene {
        val clean = name.trim().ifEmpty { "Layer" }.take(64)
        return mapLayer(scene, id) { it.copy(name = clean) }
    }

    /**
     * Deletes the layer with [id]. A scene must keep at least one layer, so deleting the
     * last remaining layer is a no-op (the caller can clear it instead).
     */
    fun delete(scene: Scene, id: String): Scene {
        if (scene.layers.size <= 1) return scene
        val remaining = scene.layers.filterNot { it.id == id }
        if (remaining.size == scene.layers.size) return scene // id not found
        return scene.copy(layers = remaining)
    }

    /**
     * Chooses which layer should be active after [deletedId] is removed: the layer that
     * takes its slot (or the new top). Returns the current [fallbackActiveId] unchanged if
     * the deleted layer wasn't the active one or deletion won't happen.
     */
    fun activeAfterDelete(scene: Scene, deletedId: String, fallbackActiveId: String): String {
        if (scene.layers.size <= 1) return fallbackActiveId
        if (deletedId != fallbackActiveId) return fallbackActiveId
        val idx = indexOf(scene, deletedId)
        val remaining = scene.layers.filterNot { it.id == deletedId }
        if (remaining.isEmpty()) return fallbackActiveId
        // Prefer the layer now occupying the deleted index, else the last one.
        return remaining.getOrElse(idx) { remaining.last() }.id
    }

    fun setVisible(scene: Scene, id: String, visible: Boolean): Scene =
        mapLayer(scene, id) { it.copy(visible = visible) }

    fun toggleVisible(scene: Scene, id: String): Scene =
        mapLayer(scene, id) { it.copy(visible = !it.visible) }

    fun setLocked(scene: Scene, id: String, locked: Boolean): Scene =
        mapLayer(scene, id) { it.copy(locked = locked) }

    fun toggleLocked(scene: Scene, id: String): Scene =
        mapLayer(scene, id) { it.copy(locked = !it.locked) }

    fun setOpacity(scene: Scene, id: String, opacity: Float): Scene =
        mapLayer(scene, id) { it.copy(opacity = opacity.coerceIn(0f, 1f)) }

    fun setBlendMode(scene: Scene, id: String, mode: BlendMode): Scene =
        mapLayer(scene, id) { it.copy(blendMode = mode) }

    private inline fun mapLayer(scene: Scene, id: String, transform: (Layer) -> Layer): Scene =
        scene.copy(layers = scene.layers.map { if (it.id == id) transform(it) else it })
}
