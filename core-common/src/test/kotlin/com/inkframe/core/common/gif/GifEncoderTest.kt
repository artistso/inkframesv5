package com.inkframe.core.common.gif

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GifEncoderTest {

    private fun solid(w: Int, h: Int, argb: Int) = IntArray(w * h) { argb }

    @Test
    fun headerAndTrailerAreValidGif89a() {
        val px = solid(4, 4, 0xFFFF0000.toInt())
        val bytes = GifEncoder.encode(4, 4, listOf(px to 10), loop = true)
        // Signature "GIF89a"
        assertEquals("GIF89a", String(bytes.copyOfRange(0, 6), Charsets.US_ASCII))
        // Trailer 0x3B
        assertEquals(0x3B, bytes.last().toInt() and 0xFF)
        // Logical screen width/height little-endian at offset 6.
        assertEquals(4, (bytes[6].toInt() and 0xFF) or ((bytes[7].toInt() and 0xFF) shl 8))
        assertEquals(4, (bytes[8].toInt() and 0xFF) or ((bytes[9].toInt() and 0xFF) shl 8))
    }

    @Test
    fun loopingAddsNetscapeExtension() {
        val px = solid(2, 2, 0xFF00FF00.toInt())
        val bytes = GifEncoder.encode(2, 2, listOf(px to 5), loop = true)
        val s = String(bytes, Charsets.ISO_8859_1)
        assertTrue("NETSCAPE2.0 application extension expected", s.contains("NETSCAPE2.0"))
    }

    @Test
    fun nonLoopingOmitsNetscapeExtension() {
        val px = solid(2, 2, 0xFF0000FF.toInt())
        val bytes = GifEncoder.encode(2, 2, listOf(px to 5), loop = false)
        val s = String(bytes, Charsets.ISO_8859_1)
        assertTrue(!s.contains("NETSCAPE2.0"))
    }

    @Test
    fun multipleFramesEachHaveGraphicControlAndImageDescriptor() {
        val frames = listOf(
            solid(3, 3, 0xFFFF0000.toInt()) to 4,
            solid(3, 3, 0xFF00FF00.toInt()) to 4,
            solid(3, 3, 0xFF0000FF.toInt()) to 4,
        )
        val bytes = GifEncoder.encode(3, 3, frames, loop = true)
        // Count Image Descriptors (0x2C) — one per frame.
        val imageSeparators = bytes.count { (it.toInt() and 0xFF) == 0x2C }
        assertEquals(3, imageSeparators)
        // Count Graphic Control Extensions (0x21 0xF9).
        var gce = 0
        for (i in 0 until bytes.size - 1) {
            if ((bytes[i].toInt() and 0xFF) == 0x21 && (bytes[i + 1].toInt() and 0xFF) == 0xF9) gce++
        }
        assertEquals(3, gce)
    }

    @Test
    fun transparencyIsFlaggedWhenAlphaPresent() {
        // Half transparent, half red.
        val px = IntArray(4) { if (it < 2) 0x00000000 else 0xFFFF0000.toInt() }
        val bytes = GifEncoder.encode(2, 2, listOf(px to 8), loop = false)
        // Find the GCE packed byte (after 0x21 0xF9 0x04) and check transparency bit 0.
        var idx = -1
        for (i in 0 until bytes.size - 2) {
            if ((bytes[i].toInt() and 0xFF) == 0x21 && (bytes[i + 1].toInt() and 0xFF) == 0xF9) { idx = i + 3; break }
        }
        assertTrue(idx > 0)
        val packed = bytes[idx].toInt() and 0xFF
        assertEquals("transparency flag", 1, packed and 1)
    }

    @Test
    fun delayIsEncodedLittleEndianInCentiseconds() {
        val px = solid(2, 2, 0xFFFFFFFF.toInt())
        val bytes = GifEncoder.encode(2, 2, listOf(px to 0x0102), loop = false)
        // GCE: 0x21 0xF9 0x04 packed delayLo delayHi tIndex 0x00
        var i = 0
        while (i < bytes.size - 1 && !((bytes[i].toInt() and 0xFF) == 0x21 && (bytes[i + 1].toInt() and 0xFF) == 0xF9)) i++
        val delayLo = bytes[i + 4].toInt() and 0xFF
        val delayHi = bytes[i + 5].toInt() and 0xFF
        assertEquals(0x0102, delayLo or (delayHi shl 8))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsWrongPixelCount() {
        GifEncoder.encode(4, 4, listOf(IntArray(10) to 5))
    }
}
