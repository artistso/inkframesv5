package com.inkframe.engine.gl

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Shared conversions between GL pixel buffers (RGBA8, bottom-up) and Android-style
 * top-down ARGB int arrays. Centralised so the export path and the save/load path use
 * exactly the same orientation logic.
 */
object PixelConvert {

    /** GL bottom-up RGBA8 [buffer] -> top-down ARGB int array. */
    fun rgbaBottomUpToArgbTopDown(buffer: ByteBuffer, width: Int, height: Int, out: IntArray) {
        buffer.position(0)
        val rowBytes = width * 4
        val row = ByteArray(rowBytes)
        for (y in 0 until height) {
            buffer.position((height - 1 - y) * rowBytes)
            buffer.get(row, 0, rowBytes)
            var dst = y * width
            var p = 0
            for (x in 0 until width) {
                val r = row[p].toInt() and 0xFF
                val g = row[p + 1].toInt() and 0xFF
                val b = row[p + 2].toInt() and 0xFF
                val a = row[p + 3].toInt() and 0xFF
                out[dst] = (a shl 24) or (r shl 16) or (g shl 8) or b
                dst++; p += 4
            }
        }
    }

    /**
     * Inverse of [rgbaBottomUpToArgbTopDown]: top-down ARGB int array -> GL bottom-up
     * RGBA8 direct buffer (ready for `glTexSubImage2D`). Used when restoring surfaces
     * after GL-context loss.
     */
    fun argbTopDownToRgbaBottomUp(argb: IntArray, width: Int, height: Int): ByteBuffer {
        val buffer = ByteBuffer.allocateDirect(width * height * 4).order(ByteOrder.nativeOrder())
        for (y in 0 until height) {
            // GL row 0 is the bottom; emit source rows in reverse.
            val srcRow = height - 1 - y
            var src = srcRow * width
            for (x in 0 until width) {
                val c = argb[src]
                buffer.put(((c shr 16) and 0xFF).toByte()) // R
                buffer.put(((c shr 8) and 0xFF).toByte())  // G
                buffer.put((c and 0xFF).toByte())          // B
                buffer.put(((c shr 24) and 0xFF).toByte()) // A
                src++
            }
        }
        buffer.position(0)
        return buffer
    }
}
