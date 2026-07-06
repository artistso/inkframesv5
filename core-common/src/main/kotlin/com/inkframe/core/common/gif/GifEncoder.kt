package com.inkframe.core.common.gif

import java.io.ByteArrayOutputStream
import java.io.OutputStream

/**
 * Streaming animated **GIF89a** encoder. Pure Kotlin, no Android dependencies.
 *
 * Each frame carries its own Local Color Table (quantized independently via
 * [MedianCutQuantizer]), a Graphic Control Extension for delay + transparency, and an
 * LZW-compressed image (via [LzwEncoder]). A NETSCAPE2.0 Application Extension provides
 * looping. Frames are written incrementally so large animations don't need to be held
 * in memory at once.
 *
 * Usage:
 * ```
 * GifEncoder(out, width, height, loop = true).use { gif ->
 *     gif.addFrame(argbPixels, delayCs = 4)
 *     ...
 * }
 * ```
 */
class GifEncoder(
    private val out: OutputStream,
    private val width: Int,
    private val height: Int,
    private val loop: Boolean = true,
    private val maxColorsPerFrame: Int = 256,
) : AutoCloseable {

    private var headerWritten = false
    private var finished = false

    private fun ensureHeader() {
        if (headerWritten) return
        headerWritten = true
        // --- Header ---
        out.write("GIF89a".toByteArray(Charsets.US_ASCII))
        // --- Logical Screen Descriptor (no global color table) ---
        writeShort(width)
        writeShort(height)
        out.write(0x00) // packed: no GCT
        out.write(0x00) // background color index
        out.write(0x00) // pixel aspect ratio
        // --- NETSCAPE2.0 looping extension ---
        if (loop) {
            out.write(0x21); out.write(0xFF); out.write(0x0B)
            out.write("NETSCAPE2.0".toByteArray(Charsets.US_ASCII))
            out.write(0x03); out.write(0x01)
            writeShort(0) // 0 = loop forever
            out.write(0x00)
        }
    }

    /**
     * Appends one frame. [argb] is row-major 0xAARRGGBB of size width*height.
     * [delayCs] is the display time in centiseconds (1/100 s).
     */
    fun addFrame(argb: IntArray, delayCs: Int) {
        require(!finished) { "GIF already finished" }
        require(argb.size == width * height) {
            "Pixel count ${argb.size} != ${width}x$height"
        }
        ensureHeader()

        val q = MedianCutQuantizer.quantize(argb, maxColorsPerFrame)
        val bpp = q.bitsPerPixel
        val tableSize = 1 shl bpp

        // --- Graphic Control Extension ---
        out.write(0x21); out.write(0xF9); out.write(0x04)
        val hasTransparency = q.transparentIndex >= 0
        // Disposal method 2 (restore to background) so transparent frames don't ghost.
        val packed = (2 shl 2) or (if (hasTransparency) 1 else 0)
        out.write(packed)
        writeShort(delayCs.coerceAtLeast(0))
        out.write(if (hasTransparency) q.transparentIndex else 0)
        out.write(0x00)

        // --- Image Descriptor ---
        out.write(0x2C)
        writeShort(0); writeShort(0) // left, top
        writeShort(width); writeShort(height)
        // packed: local color table present, size = bpp-1
        out.write(0x80 or (bpp - 1))

        // --- Local Color Table (padded to tableSize entries) ---
        for (i in 0 until tableSize) {
            val c = if (i < q.palette.size) q.palette[i] else 0
            out.write((c shr 16) and 0xFF)
            out.write((c shr 8) and 0xFF)
            out.write(c and 0xFF)
        }

        // --- Image Data (LZW) ---
        val minCodeSize = bpp.coerceAtLeast(2)
        out.write(LzwEncoder(minCodeSize).encodeImageData(q.indices))
    }

    /** Writes the trailer. Called automatically by [close]. */
    fun finish() {
        if (finished) return
        ensureHeader()
        out.write(0x3B) // GIF trailer
        out.flush()
        finished = true
    }

    override fun close() {
        finish()
    }

    private fun writeShort(v: Int) {
        out.write(v and 0xFF)
        out.write((v shr 8) and 0xFF)
    }

    companion object {
        /** Convenience: encode a list of frames to a byte array. */
        fun encode(width: Int, height: Int, frames: List<Pair<IntArray, Int>>, loop: Boolean = true): ByteArray {
            val baos = ByteArrayOutputStream()
            GifEncoder(baos, width, height, loop).use { gif ->
                for ((px, delay) in frames) gif.addFrame(px, delay)
            }
            return baos.toByteArray()
        }
    }
}
