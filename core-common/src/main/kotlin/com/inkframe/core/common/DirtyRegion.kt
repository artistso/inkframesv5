package com.inkframe.core.common

import kotlin.math.floor
import kotlin.math.ceil

/** An axis-aligned integer rectangle in canvas pixel space. */
data class IntRect(val x: Int, val y: Int, val w: Int, val h: Int) {
    val area: Int get() = w * h
    val right: Int get() = x + w
    val bottom: Int get() = y + h
}

/**
 * Accumulates the bounding box touched by a stroke so undo only needs to snapshot the
 * affected pixels, not the whole canvas. Pure logic — unit-tested without GL.
 *
 * Dabs are circles; [addCircle] expands the bounds by each dab's footprint. [toIntRect]
 * snaps to integers, pads for soft edges, and clamps to the canvas, returning null when
 * nothing was drawn or the region falls entirely outside the canvas.
 */
class DirtyRegion {
    private var minX = Float.POSITIVE_INFINITY
    private var minY = Float.POSITIVE_INFINITY
    private var maxX = Float.NEGATIVE_INFINITY
    private var maxY = Float.NEGATIVE_INFINITY

    val isEmpty: Boolean get() = minX > maxX || minY > maxY

    fun reset() {
        minX = Float.POSITIVE_INFINITY
        minY = Float.POSITIVE_INFINITY
        maxX = Float.NEGATIVE_INFINITY
        maxY = Float.NEGATIVE_INFINITY
    }

    /** Expands bounds to include a dab of [diameter] centred at ([cx], [cy]). */
    fun addCircle(cx: Float, cy: Float, diameter: Float) {
        val r = diameter * 0.5f
        if (cx - r < minX) minX = cx - r
        if (cy - r < minY) minY = cy - r
        if (cx + r > maxX) maxX = cx + r
        if (cy + r > maxY) maxY = cy + r
    }

    /**
     * Snaps the accumulated bounds to an integer rect, expanded by [padding] pixels for
     * soft-edge falloff, then clamped to the [canvasW] x [canvasH] canvas. Returns null
     * if empty or fully off-canvas.
     */
    fun toIntRect(canvasW: Int, canvasH: Int, padding: Int = 2): IntRect? {
        if (isEmpty) return null
        var x0 = floor(minX).toInt() - padding
        var y0 = floor(minY).toInt() - padding
        var x1 = ceil(maxX).toInt() + padding
        var y1 = ceil(maxY).toInt() + padding

        x0 = x0.coerceIn(0, canvasW)
        y0 = y0.coerceIn(0, canvasH)
        x1 = x1.coerceIn(0, canvasW)
        y1 = y1.coerceIn(0, canvasH)

        val w = x1 - x0
        val h = y1 - y0
        if (w <= 0 || h <= 0) return null
        return IntRect(x0, y0, w, h)
    }
}
