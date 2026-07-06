package com.inkframe.core.model

/**
 * Pure helpers for sampling a colour out of a flattened canvas (top-down ARGB int array),
 * as the eyedropper tool does. Bounds handling and index math live here so they're
 * unit-tested without GL — the engine supplies the actual pixels via `glReadPixels`.
 */
object ColorSampler {

    /**
     * Returns the [RgbaColor] at integer pixel ([x], [y]) in a [width]×[height] top-down
     * ARGB array, or `null` if the point is out of bounds. Fully-transparent pixels return
     * a colour with alpha 0 (the caller decides whether to ignore those).
     */
    fun sampleAt(argb: IntArray, width: Int, height: Int, x: Int, y: Int): RgbaColor? {
        if (x < 0 || y < 0 || x >= width || y >= height) return null
        require(argb.size >= width * height) { "argb too small for ${width}x$height" }
        return RgbaColor.fromArgb(argb[y * width + x])
    }

    /**
     * Averages an odd [radius]-sized square neighbourhood around ([x], [y]) — a steadier
     * sample for finger taps on noisy/anti-aliased art. Out-of-bounds and fully
     * transparent pixels are skipped; returns `null` if nothing opaque was found.
     *
     * Averaging is done in straight (non-premultiplied) RGB over opaque-enough pixels,
     * which is fine for picking a representative colour.
     */
    fun sampleAverage(
        argb: IntArray,
        width: Int,
        height: Int,
        x: Int,
        y: Int,
        radius: Int = 1,
        alphaThreshold: Int = 8,
    ): RgbaColor? {
        require(argb.size >= width * height) { "argb too small for ${width}x$height" }
        val r = radius.coerceAtLeast(0)
        var rs = 0L; var gs = 0L; var bs = 0L; var asum = 0L; var count = 0
        for (dy in -r..r) {
            val py = y + dy
            if (py < 0 || py >= height) continue
            for (dx in -r..r) {
                val px = x + dx
                if (px < 0 || px >= width) continue
                val c = argb[py * width + px]
                val a = (c ushr 24) and 0xFF
                if (a <= alphaThreshold) continue
                rs += (c shr 16) and 0xFF
                gs += (c shr 8) and 0xFF
                bs += c and 0xFF
                asum += a
                count++
            }
        }
        if (count == 0) return null
        return RgbaColor(
            r = (rs / count) / 255f,
            g = (gs / count) / 255f,
            b = (bs / count) / 255f,
            a = (asum / count) / 255f,
        )
    }
}
