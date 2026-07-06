package com.inkframe.core.common.video

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class YuvConverterTest {

    private fun argb(a: Int, r: Int, g: Int, b: Int) = (a shl 24) or (r shl 16) or (g shl 8) or b
    private fun u(b: Byte) = b.toInt() and 0xFF

    private fun solid(w: Int, h: Int, color: Int) = IntArray(w * h) { color }

    @Test
    fun bufferSize_isThreeHalvesArea() {
        assertEquals(2 * 2 * 3 / 2, YuvConverter.bufferSize(2, 2))
        assertEquals(640 * 480 * 3 / 2, YuvConverter.bufferSize(640, 480))
    }

    @Test
    fun black_yIs16_chromaIs128() {
        val out = ByteArray(YuvConverter.bufferSize(2, 2))
        YuvConverter.convert(solid(2, 2, argb(255, 0, 0, 0)), 2, 2, YuvConverter.Layout.I420, out)
        // Y plane = 4 bytes, then 1 U, then 1 V.
        for (i in 0 until 4) assertEquals("Y[$i]", 16, u(out[i]))
        assertEquals("U", 128, u(out[4]))
        assertEquals("V", 128, u(out[5]))
    }

    @Test
    fun white_yIs235_chromaNear128() {
        val out = ByteArray(YuvConverter.bufferSize(2, 2))
        YuvConverter.convert(solid(2, 2, argb(255, 255, 255, 255)), 2, 2, YuvConverter.Layout.I420, out)
        // 66+129+25 = 220; (220*255+128)>>8 + 16 = 219 + 16 = 235.
        for (i in 0 until 4) assertEquals(235, u(out[i]))
        assertTrue(kotlin.math.abs(u(out[4]) - 128) <= 1)
        assertTrue(kotlin.math.abs(u(out[5]) - 128) <= 1)
    }

    @Test
    fun pureRed_matchesBt601Reference() {
        val out = ByteArray(YuvConverter.bufferSize(2, 2))
        YuvConverter.convert(solid(2, 2, argb(255, 255, 0, 0)), 2, 2, YuvConverter.Layout.I420, out)
        // Y = (66*255+128>>8)+16 = 66+16... compute: (16830+128)>>8 = 66; +16 = 82.
        assertEquals(82, u(out[0]))
        // U = (-38*255+128>>8)+128 = (-9690+128)>>8 = -38 (arith) ; +128 = 90.
        assertEquals(90, u(out[4]))
        // V = (112*255+128>>8)+128 = (28560+128)>>8 = 112 ; +128 = 240.
        assertEquals(240, u(out[5]))
    }

    @Test
    fun pureGreen_andBlue_referenceChroma() {
        val outG = ByteArray(YuvConverter.bufferSize(2, 2))
        YuvConverter.convert(solid(2, 2, argb(255, 0, 255, 0)), 2, 2, YuvConverter.Layout.I420, outG)
        // Green: Y=(129*255+128>>8)+16 = (33023>>8)+16 = 128+16 = 144; U=-74+128=54; V=-94+128=34.
        assertEquals(144, u(outG[0]))
        assertEquals(54, u(outG[4]))
        assertEquals(34, u(outG[5]))

        val outB = ByteArray(YuvConverter.bufferSize(2, 2))
        YuvConverter.convert(solid(2, 2, argb(255, 0, 0, 255)), 2, 2, YuvConverter.Layout.I420, outB)
        // Blue: Y=(25*255+128>>8)+16=25+16=41; U=(112..)=112+128=240; V=(-18..)=-18+128=110.
        assertEquals(41, u(outB[0]))
        assertEquals(240, u(outB[4]))
        assertEquals(110, u(outB[5]))
    }

    @Test
    fun nv12_interleavesChromaAfterYPlane() {
        val out = ByteArray(YuvConverter.bufferSize(2, 2))
        YuvConverter.convert(solid(2, 2, argb(255, 255, 0, 0)), 2, 2, YuvConverter.Layout.NV12, out)
        // Y plane = indices 0..3; then U,V interleaved at 4,5.
        assertEquals(90, u(out[4]))  // U
        assertEquals(240, u(out[5])) // V
    }

    @Test
    fun i420_planeOffsets_forLargerFrame() {
        val w = 4; val h = 4
        val out = ByteArray(YuvConverter.bufferSize(w, h))
        // Left half red, right half blue -> chroma should differ across columns.
        val px = IntArray(w * h) { i -> if (i % w < 2) argb(255, 255, 0, 0) else argb(255, 0, 0, 255) }
        YuvConverter.convert(px, w, h, YuvConverter.Layout.I420, out)
        val frame = w * h           // 16
        val chromaW = w / 2         // 2
        // U plane starts at frame; first U (left, red)=90, second U (right, blue)=240.
        assertEquals(90, u(out[frame]))
        assertEquals(240, u(out[frame + 1]))
        // V plane starts after U plane (frame + chromaW*h/2 = 16+4=20).
        val vStart = frame + chromaW * (h / 2)
        assertEquals(240, u(out[vStart]))     // red V
        assertEquals(110, u(out[vStart + 1])) // blue V
    }

    @Test
    fun transparentPixel_compositedOverBackground() {
        // Fully transparent over white background should read as white.
        val out = ByteArray(YuvConverter.bufferSize(2, 2))
        YuvConverter.convert(solid(2, 2, argb(0, 0, 0, 0)), 2, 2, YuvConverter.Layout.I420, out,
            backgroundArgb = argb(255, 255, 255, 255))
        for (i in 0 until 4) assertEquals(235, u(out[i])) // white Y
    }

    @Test
    fun chromaIsAveragedOverBlock() {
        // 2x2 with one red, three white -> averaged chroma between red and white.
        val px = intArrayOf(
            argb(255, 255, 0, 0), argb(255, 255, 255, 255),
            argb(255, 255, 255, 255), argb(255, 255, 255, 255),
        )
        val out = ByteArray(YuvConverter.bufferSize(2, 2))
        YuvConverter.convert(px, 2, 2, YuvConverter.Layout.I420, out)
        // V for pure red is 240, for white ~128; average of (255,191,191,191) RGB block.
        val v = u(out[5])
        assertTrue("V $v should be between white(128) and red(240)", v in 129..239)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsOddDimensions() {
        YuvConverter.convert(IntArray(3 * 2), 3, 2, YuvConverter.Layout.I420, ByteArray(9))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsTooSmallOutput() {
        YuvConverter.convert(solid(2, 2, 0), 2, 2, YuvConverter.Layout.I420, ByteArray(2))
    }
}
