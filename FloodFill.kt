package com.inkframe.core.common

/**
 * Pure scanline flood fill over a top-down ARGB int array. No GL / Android — the
 * engine supplies pixels read back from a cel surface, runs this, and writes the result
 * back. Fully unit-tested.
 *
 * Uses the classic span-based (scanline) algorithm: for each seed, fill the contiguous
 * horizontal run, then queue the rows above and below. This is far cheaper than a
 * naive 4-way recursion and won't overflow the stack on large regions.
 *
 * Matching uses a per-channel tolerance against the *original* colour at the seed, so
 * anti-aliased edges can be included by raising [tolerance]. Already-target pixels are
 * treated as a no-op to avoid infinite loops when fill == target.
 */
object FloodFill {

    /** Result of a fill: which pixels changed (as a dirty rect) and how many. */
    data class FillResult(
        val changed: Boolean,
        val minX: Int,
        val minY: Int,
        val maxX: Int,
        val maxY: Int,
        val pixelsFilled: Int,
    ) {
        /** Inclusive dirty rectangle as an [IntRect], or null if nothing changed. */
        fun dirtyRect(): IntRect? =
            if (!changed) null else IntRect(minX, minY, maxX - minX + 1, maxY - minY + 1)
    }

    /**
     * Flood-fills [argb] (modified in place) starting at ([seedX], [seedY]) with
     * [fillArgb], replacing the connected region whose colour matches the seed's within
     * [tolerance] (0..255 per channel, including alpha).
     *
     * @return a [FillResult] describing the affected area.
     */
    fun fill(
        argb: IntArray,
        width: Int,
        height: Int,
        seedX: Int,
        seedY: Int,
        fillArgb: Int,
        tolerance: Int = 0,
    ): FillResult {
        require(argb.size >= width * height) { "argb too small for ${width}x$height" }
        if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) {
            return FillResult(false, 0, 0, 0, 0, 0)
        }

        val target = argb[seedY * width + seedX]
        // No-op if the seed already equals the fill colour (avoids spinning forever).
        if (target == fillArgb) return FillResult(false, 0, 0, 0, 0, 0)

        val tol = tolerance.coerceIn(0, 255)
        fun matches(c: Int): Boolean {
            if (c == fillArgb) return false // already filled this pass
            if (tol == 0) return c == target
            val da = kotlin.math.abs(((c ushr 24) and 0xFF) - ((target ushr 24) and 0xFF))
            val dr = kotlin.math.abs(((c ushr 16) and 0xFF) - ((target ushr 16) and 0xFF))
            val dg = kotlin.math.abs(((c ushr 8) and 0xFF) - ((target ushr 8) and 0xFF))
            val db = kotlin.math.abs((c and 0xFF) - (target and 0xFF))
            return da <= tol && dr <= tol && dg <= tol && db <= tol
        }

        var minX = seedX; var minY = seedY; var maxX = seedX; var maxY = seedY
        var filled = 0

        // Stack of seed points; each expands into a horizontal span.
        val stackX = ArrayDeque<Int>()
        val stackY = ArrayDeque<Int>()
        stackX.addLast(seedX); stackY.addLast(seedY)

        while (stackX.isNotEmpty()) {
            val px = stackX.removeLast()
            val py = stackY.removeLast()
            val rowBase = py * width

            // Skip if this pixel was already handled.
            if (!matches(argb[rowBase + px])) continue

            // Expand left and right to find the span bounds.
            var left = px
            while (left - 1 >= 0 && matches(argb[rowBase + left - 1])) left--
            var right = px
            while (right + 1 < width && matches(argb[rowBase + right + 1])) right++

            // Fill the span and record dirty bounds.
            for (x in left..right) {
                argb[rowBase + x] = fillArgb
                filled++
            }
            if (left < minX) minX = left
            if (right > maxX) maxX = right
            if (py < minY) minY = py
            if (py > maxY) maxY = py

            // Queue spans above and below: add a seed wherever the neighbour row matches.
            queueRow(argb, width, left, right, py - 1, ::matches, stackX, stackY)
            queueRow(argb, width, left, right, py + 1, ::matches, stackX, stackY)
        }

        return FillResult(filled > 0, minX, minY, maxX, maxY, filled)
    }

    /** Adds one seed per contiguous matching run in row [y] within [left]..[right]. */
    private inline fun queueRow(
        argb: IntArray,
        width: Int,
        left: Int,
        right: Int,
        y: Int,
        matches: (Int) -> Boolean,
        stackX: ArrayDeque<Int>,
        stackY: ArrayDeque<Int>,
    ) {
        if (y < 0) return
        val rowBase = y * width
        if (rowBase >= argb.size) return
        var x = left
        while (x <= right) {
            // advance to the next matching pixel
            while (x <= right && !matches(argb[rowBase + x])) x++
            if (x > right) break
            // one seed for this run, then skip to its end
            stackX.addLast(x); stackY.addLast(y)
            while (x <= right && matches(argb[rowBase + x])) x++
        }
    }
}
