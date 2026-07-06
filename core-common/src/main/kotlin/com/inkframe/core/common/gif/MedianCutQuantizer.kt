package com.inkframe.core.common.gif

/**
 * Reduces a set of RGB pixels to a palette of at most [maxColors] using median-cut
 * quantization, then maps every source pixel to its nearest palette entry.
 *
 * GIF supports a single transparent palette index per frame. Fully-transparent source
 * pixels are routed to a reserved transparent slot; partially-transparent pixels are
 * treated as opaque (GIF has no partial alpha). Pure Kotlin — unit-tested.
 */
object MedianCutQuantizer {

    /** Packed result: the palette (RGB triplets) plus one index per input pixel. */
    class Result(
        val palette: IntArray,        // each entry 0xRRGGBB
        val indices: ByteArray,       // one palette index per pixel
        val transparentIndex: Int,    // -1 if no transparency present
    ) {
        val colorCount: Int get() = palette.size
        /** Bits needed to represent the largest index (min 1). */
        val bitsPerPixel: Int
            get() {
                var n = colorCount.coerceAtLeast(2)
                var bits = 0
                while ((1 shl bits) < n) bits++
                return bits.coerceAtLeast(1)
            }
    }

    private class Box(val pixels: IntArray, var start: Int, var end: Int) {
        var rMin = 0; var rMax = 0; var gMin = 0; var gMax = 0; var bMin = 0; var bMax = 0
        val size: Int get() = end - start
        fun shrink() {
            rMin = 255; gMin = 255; bMin = 255; rMax = 0; gMax = 0; bMax = 0
            for (i in start until end) {
                val c = pixels[i]
                val r = (c shr 16) and 0xFF; val g = (c shr 8) and 0xFF; val b = c and 0xFF
                if (r < rMin) rMin = r; if (r > rMax) rMax = r
                if (g < gMin) gMin = g; if (g > gMax) gMax = g
                if (b < bMin) bMin = b; if (b > bMax) bMax = b
            }
        }
        fun longestAxis(): Int {
            val dr = rMax - rMin; val dg = gMax - gMin; val db = bMax - bMin
            return when { dr >= dg && dr >= db -> 0; dg >= db -> 1; else -> 2 }
        }
    }

    /**
     * @param argb input pixels (0xAARRGGBB)
     * @param maxColors maximum palette size including the transparent slot (2..256)
     * @param alphaThreshold pixels with alpha <= this become transparent
     */
    fun quantize(argb: IntArray, maxColors: Int = 256, alphaThreshold: Int = 8): Result {
        require(maxColors in 2..256) { "maxColors must be 2..256" }

        // Separate transparent pixels; quantize only the opaque ones.
        val opaque = IntArray(argb.size)
        var n = 0
        val isTransparent = BooleanArray(argb.size)
        var anyTransparent = false
        for (i in argb.indices) {
            val a = (argb[i] ushr 24) and 0xFF
            if (a <= alphaThreshold) {
                isTransparent[i] = true
                anyTransparent = true
            } else {
                opaque[n++] = argb[i] and 0xFFFFFF
            }
        }

        val reserved = if (anyTransparent) 1 else 0
        val colorBudget = (maxColors - reserved).coerceAtLeast(1)

        val work = opaque.copyOf(n)
        val boxes = ArrayList<Box>()
        if (n > 0) {
            Box(work, 0, n).also { it.shrink(); boxes.add(it) }
            // Split the box with the largest pixel population along its longest axis.
            while (boxes.size < colorBudget) {
                val box = boxes.filter { it.size > 1 }.maxByOrNull { it.size } ?: break
                val axis = box.longestAxis()
                sortRange(box.pixels, box.start, box.end, axis)
                val mid = box.start + box.size / 2
                val left = Box(box.pixels, box.start, mid)
                val right = Box(box.pixels, mid, box.end)
                left.shrink(); right.shrink()
                boxes.remove(box); boxes.add(left); boxes.add(right)
            }
        }

        // Average each box into a palette color.
        val paletteList = ArrayList<Int>()
        var transparentIndex = -1
        if (anyTransparent) {
            transparentIndex = 0
            paletteList.add(0x000000) // transparent slot color is irrelevant
        }
        val boxColor = IntArray(boxes.size)
        for ((bi, box) in boxes.withIndex()) {
            var rs = 0L; var gs = 0L; var bs = 0L
            for (i in box.start until box.end) {
                val c = box.pixels[i]
                rs += (c shr 16) and 0xFF; gs += (c shr 8) and 0xFF; bs += c and 0xFF
            }
            val cnt = box.size.coerceAtLeast(1)
            val r = (rs / cnt).toInt(); val g = (gs / cnt).toInt(); val b = (bs / cnt).toInt()
            boxColor[bi] = (r shl 16) or (g shl 8) or b
            paletteList.add(boxColor[bi])
        }
        if (paletteList.isEmpty()) paletteList.add(0x000000)
        val palette = paletteList.toIntArray()

        // Map every original pixel to nearest palette entry (or the transparent slot).
        val indices = ByteArray(argb.size)
        for (i in argb.indices) {
            indices[i] = if (isTransparent[i]) {
                transparentIndex.toByte()
            } else {
                nearest(palette, reserved, argb[i] and 0xFFFFFF).toByte()
            }
        }
        return Result(palette, indices, transparentIndex)
    }

    /** Nearest palette index by squared Euclidean RGB distance, skipping reserved slots. */
    private fun nearest(palette: IntArray, fromIndex: Int, rgb: Int): Int {
        val r = (rgb shr 16) and 0xFF; val g = (rgb shr 8) and 0xFF; val b = rgb and 0xFF
        var best = fromIndex; var bestD = Int.MAX_VALUE
        for (i in fromIndex until palette.size) {
            val c = palette[i]
            val dr = ((c shr 16) and 0xFF) - r
            val dg = ((c shr 8) and 0xFF) - g
            val db = (c and 0xFF) - b
            val d = dr * dr + dg * dg + db * db
            if (d < bestD) { bestD = d; best = i; if (d == 0) break }
        }
        return best
    }

    /** Sorts a sub-range by one RGB channel (small ranges typical). */
    private fun sortRange(a: IntArray, start: Int, end: Int, axis: Int) {
        val shift = when (axis) { 0 -> 16; 1 -> 8; else -> 0 }
        val sub = a.copyOfRange(start, end).toTypedArray()
        sub.sortBy { (it shr shift) and 0xFF }
        for (i in sub.indices) a[start + i] = sub[i]
    }
}
