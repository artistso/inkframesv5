package com.inkframe.engine.gl

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.inkframe.core.model.ProjectPackage
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Bridges GPU cel surfaces to PNG bytes for [ProjectPackage]. Implements [encode] by
 * reading a surface's pixels back and compressing to PNG, and [decode] by decoding PNG
 * into a surface's texture.
 *
 * **Threading:** all methods touch GL and therefore must run on the GL thread. Save/load
 * are routed through the engine's event queue (see [PaintEngine.exportCelImageIO] /
 * [PaintEngine.importCelImageIO]) so this invariant holds.
 *
 * **Coordinate space:** `glReadPixels` returns rows bottom-to-top, while Android Bitmaps
 * are top-to-bottom; rows are flipped on encode and the resulting Bitmap is uploaded
 * already-flipped on decode, so a save→load cycle preserves orientation.
 */
class GlCelImageIO(
    private val width: Int,
    private val height: Int,
    private val surfaceFor: (Long) -> GlSurface?,
    private val ensureSurface: (Long) -> GlSurface,
) : ProjectPackage.CelImageIO {

    override fun encode(surfaceId: Long): ByteArray? {
        val surface = surfaceFor(surfaceId) ?: return null
        val buffer = surface.readPixels(0, 0, width, height) // GL: bottom-up RGBA8

        val pixels = IntArray(width * height)
        PixelConvert.rgbaBottomUpToArgbTopDown(buffer, width, height, pixels)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        bitmap.recycle()
        return out.toByteArray()
    }

    override fun decode(surfaceId: Long, bytes: ByteArray) {
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return
        val surface = ensureSurface(surfaceId)

        val w = bitmap.width.coerceAtMost(width)
        val h = bitmap.height.coerceAtMost(height)
        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h) // ARGB, top-down
        bitmap.recycle()

        // Convert ARGB(top-down) -> RGBA(bottom-up) for glTexSubImage2D.
        val buffer = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
        for (row in 0 until h) {
            val srcRow = h - 1 - row
            for (col in 0 until w) {
                val argb = pixels[srcRow * w + col]
                buffer.put(((argb shr 16) and 0xFF).toByte()) // R
                buffer.put(((argb shr 8) and 0xFF).toByte())  // G
                buffer.put((argb and 0xFF).toByte())          // B
                buffer.put(((argb shr 24) and 0xFF).toByte()) // A
            }
        }
        buffer.position(0)
        surface.writePixels(0, 0, w, h, buffer)
    }
}
