package com.inkframe.core.model

/**
 * Pure geometry for the timeline frame strip: maps a horizontal pointer position to a
 * frame index, and resolves a drag from one cell to another. Kept out of the Compose UI
 * so the (fiddly, off-by-one-prone) hit-testing is unit-tested without Android.
 *
 * The strip is a row of equal cells: each cell is [cellWidth] wide with [spacing] between
 * cells, the first cell's left edge at [stripStart]. All values are in the same units
 * (e.g. px or dp-as-float); the caller is responsible for using one consistently.
 */
object TimelineDrag {

    /**
     * Returns the frame index whose cell contains pointer position [x], clamped to
     * `0 until frameCount`. Positions left of the strip clamp to 0; right of it to the
     * last frame. The inter-cell gap rounds to the nearer cell.
     */
    fun frameAt(
        x: Float,
        frameCount: Int,
        cellWidth: Float,
        spacing: Float,
        stripStart: Float = 0f,
    ): Int {
        require(frameCount >= 1) { "frameCount must be >= 1" }
        require(cellWidth > 0f) { "cellWidth must be > 0" }
        val pitch = cellWidth + spacing            // distance between successive cell lefts
        val rel = x - stripStart
        if (rel <= 0f) return 0
        // Use the cell pitch; rounding by pitch puts the gap boundary at the cell midpoint
        // of the gap, which feels natural when dragging between cells.
        val idx = (rel / pitch).toInt()
        return idx.coerceIn(0, frameCount - 1)
    }

    /** A resolved drag: the source and destination frame indices. */
    data class DragResult(val from: Int, val to: Int) {
        val isMove: Boolean get() = from != to
    }

    /**
     * Resolves a drag that began at pointer [startX] and ended at [endX] into source/dest
     * frame indices. Returns `null` if the start cell has no movable content per
     * [hasCelAt], so the caller can fall back to a plain seek/tap.
     */
    fun resolveDrag(
        startX: Float,
        endX: Float,
        frameCount: Int,
        cellWidth: Float,
        spacing: Float,
        stripStart: Float = 0f,
        hasCelAt: (Int) -> Boolean,
    ): DragResult? {
        val from = frameAt(startX, frameCount, cellWidth, spacing, stripStart)
        if (!hasCelAt(from)) return null
        val to = frameAt(endX, frameCount, cellWidth, spacing, stripStart)
        return DragResult(from, to)
    }
}
