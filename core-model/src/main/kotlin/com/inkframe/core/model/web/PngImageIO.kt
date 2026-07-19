package com.inkframe.core.model.web

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import java.awt.image.BufferedImage

/**
 * PNG encode/decode seam for the archive and session codecs: the web side is the
 * browser's `canvas.toBlob('image/png')` / `Image` element (i.html:4474-4485,
 * 4527-4536); the JVM side needs a pluggable equivalent.
 *
 * The Android runtime binds a `Bitmap`-backed implementation in M4; unit tests and
 * desktop tooling use [ImageIoPngImageIO]. Pixel contract on both sides is the model's
 * straight-alpha ARGB `IntArray` (see [Layer.pixels]).
 */
interface PngImageIO {
    /**
     * Decodes PNG [bytes] into (pixels, (w, h)), or returns `null` on any failure —
     * truncated/corrupt input must degrade to a blank layer, matching the web's
     * `img.onerror -> blank canvas` import path (i.html:4533).
     */
    fun decode(bytes: ByteArray): Pair<IntArray, Pair<Int, Int>>?

    /** Encodes `w*h` straight-alpha ARGB [pixels] as PNG bytes. */
    fun encode(pixels: IntArray, w: Int, h: Int): ByteArray
}

/**
 * JVM-default [PngImageIO] on `javax.imageio` (java.desktop; headless-safe — pure raster
 * access, no AWT toolkit). `BufferedImage.getRGB/setRGB` use the default straight-alpha
 * ARGB color model, so pixel round-trips through PNG are lossless.
 */
class ImageIoPngImageIO : PngImageIO {
    override fun decode(bytes: ByteArray): Pair<IntArray, Pair<Int, Int>>? {
        val image = try {
            ImageIO.read(ByteArrayInputStream(bytes))
        } catch (e: Exception) {
            null
        } ?: return null
        val w = image.width
        val h = image.height
        if (w <= 0 || h <= 0) return null
        val pixels = IntArray(w * h)
        image.getRGB(0, 0, w, h, pixels, 0, w)
        return pixels to (w to h)
    }

    override fun encode(pixels: IntArray, w: Int, h: Int): ByteArray {
        require(w > 0 && h > 0) { "PNG dimensions must be positive: ${w}x$h" }
        require(pixels.size == w * h) { "pixels.size ${pixels.size} != w*h ${w * h}" }
        val image = BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB)
        image.setRGB(0, 0, w, h, pixels, 0, w)
        val out = ByteArrayOutputStream()
        check(ImageIO.write(image, "png", out)) { "No PNG writer available" }
        return out.toByteArray()
    }
}
