package com.inkframe.core.common.video

/**
 * Converts top-down ARGB pixels into the YUV 4:2:0 byte layouts that hardware H.264
 * encoders consume. Pure Kotlin — no Android deps — so the (error-prone) colour math is
 * unit-tested on the JVM.
 *
 * Uses BT.601 **limited/studio range** coefficients (the de-facto standard for SD/HD
 * H.264), in the integer form popularised by libyuv:
 *
 * ```
 *   Y =  ( 66R + 129G +  25B + 128) >> 8 +  16     // 16..235
 *   U =  (-38R -  74G + 112B + 128) >> 8 + 128     // 16..240
 *   V =  (112R -  94G -  18B + 128) >> 8 + 128     // 16..240
 * ```
 *
 * Chroma is 2×2 subsampled by averaging each block's RGB before conversion. Because video
 * has no alpha, source pixels are composited over a solid [backgroundArgb] first.
 *
 * Both outputs require **even** width and height (a hard requirement of YUV 4:2:0).
 */
object YuvConverter {

    /** Plane order for the encoder's input colour format. */
    enum class Layout {
        /** I420 / YUV420Planar: Y plane, then full U plane, then full V plane. */
        I420,
        /** NV12 / YUV420SemiPlanar: Y plane, then interleaved U,V,U,V… */
        NV12,
    }

    /** Bytes needed for a [width]×[height] YUV 4:2:0 frame (any layout). */
    fun bufferSize(width: Int, height: Int): Int = width * height * 3 / 2

    /**
     * Converts [argb] (top-down, row-major, size width*height) into [out] using [layout].
     * Transparent pixels are composited over [backgroundArgb] (alpha ignored on it).
     */
    fun convert(
        argb: IntArray,
        width: Int,
        height: Int,
        layout: Layout,
        out: ByteArray,
        backgroundArgb: Int = 0xFFFFFFFF.toInt(),
    ) {
        require(width % 2 == 0 && height % 2 == 0) { "YUV420 needs even dimensions ($width×$height)" }
        require(argb.size == width * height) { "argb size ${argb.size} != ${width}x$height" }
        require(out.size >= bufferSize(width, height)) { "out too small: ${out.size}" }

        val bgR = (backgroundArgb shr 16) and 0xFF
        val bgG = (backgroundArgb shr 8) and 0xFF
        val bgB = backgroundArgb and 0xFF

        val frameSize = width * height
        // Per-pixel composited RGB cached so chroma averaging doesn't recompute alpha.
        // (Local arrays keep this allocation-light per frame.)
        val rArr = IntArray(frameSize)
        val gArr = IntArray(frameSize)
        val bArr = IntArray(frameSize)

        // --- Y plane (full resolution) ---
        var i = 0
        while (i < frameSize) {
            val c = argb[i]
            val a = (c ushr 24) and 0xFF
            val r: Int; val g: Int; val b: Int
            if (a == 255) {
                r = (c shr 16) and 0xFF; g = (c shr 8) and 0xFF; b = c and 0xFF
            } else {
                val sr = (c shr 16) and 0xFF; val sg = (c shr 8) and 0xFF; val sb = c and 0xFF
                // out = (src*a + bg*(255-a)) / 255
                r = (sr * a + bgR * (255 - a)) / 255
                g = (sg * a + bgG * (255 - a)) / 255
                b = (sb * a + bgB * (255 - a)) / 255
            }
            rArr[i] = r; gArr[i] = g; bArr[i] = b
            out[i] = clampByte(((66 * r + 129 * g + 25 * b + 128) shr 8) + 16)
            i++
        }

        // --- Chroma planes (2×2 subsampled) ---
        val chromaW = width / 2
        val uStart = frameSize
        val vStart = frameSize + chromaW * (height / 2)
        var cy = 0
        while (cy < height / 2) {
            var cx = 0
            while (cx < chromaW) {
                val x = cx * 2
                val y = cy * 2
                val p0 = y * width + x
                val p1 = p0 + 1
                val p2 = p0 + width
                val p3 = p2 + 1
                val r = (rArr[p0] + rArr[p1] + rArr[p2] + rArr[p3]) shr 2
                val g = (gArr[p0] + gArr[p1] + gArr[p2] + gArr[p3]) shr 2
                val b = (bArr[p0] + bArr[p1] + bArr[p2] + bArr[p3]) shr 2
                val u = clampByte(((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128)
                val v = clampByte(((112 * r - 94 * g - 18 * b + 128) shr 8) + 128)
                when (layout) {
                    Layout.I420 -> {
                        val ci = cy * chromaW + cx
                        out[uStart + ci] = u
                        out[vStart + ci] = v
                    }
                    Layout.NV12 -> {
                        val ci = frameSize + (cy * chromaW + cx) * 2
                        out[ci] = u
                        out[ci + 1] = v
                    }
                }
                cx++
            }
            cy++
        }
    }

    private fun clampByte(v: Int): Byte = when {
        v < 0 -> 0
        v > 255 -> 255
        else -> v
    }.toByte()
}
