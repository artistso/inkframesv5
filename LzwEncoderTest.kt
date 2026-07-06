package com.inkframe.core.common.gif

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies the LZW encoder by decoding its output with an independent GIF-LZW decoder
 * and asserting we recover the exact input indices. This proves correctness end-to-end
 * rather than checking opaque byte patterns.
 */
class LzwEncoderTest {

    /** Reference GIF variable-length LZW decoder (spec Appendix F), LSB-first. */
    private fun decode(minCodeSize: Int, data: ByteArray): ByteArray {
        val clear = 1 shl minCodeSize
        val eoi = clear + 1
        var codeSize = minCodeSize + 1
        val out = ArrayList<Byte>()
        val dict = ArrayList<IntArray>()

        fun reset() {
            dict.clear()
            for (i in 0 until clear) dict.add(intArrayOf(i))
            dict.add(IntArray(0)) // clear
            dict.add(IntArray(0)) // eoi
            codeSize = minCodeSize + 1
        }
        reset()

        var bitPos = 0
        fun readCode(): Int {
            var code = 0
            for (i in 0 until codeSize) {
                val bytePos = bitPos / 8
                if (bytePos >= data.size) return eoi
                val bit = (data[bytePos].toInt() ushr (bitPos % 8)) and 1
                code = code or (bit shl i)
                bitPos++
            }
            return code
        }

        var prev: IntArray? = null
        while (true) {
            val code = readCode()
            if (code == eoi) break
            if (code == clear) { reset(); prev = null; continue }
            val entry: IntArray = when {
                code < dict.size -> dict[code]
                prev != null -> prev!! + prev!![0] // KwKwK case
                else -> error("Bad code")
            }
            for (v in entry) out.add(v.toByte())
            if (prev != null) {
                dict.add(prev!! + entry[0])
                if (dict.size == (1 shl codeSize) && codeSize < 12) codeSize++
            }
            prev = entry
        }
        return out.toByteArray()
    }

    /** Strips GIF sub-block framing (length-prefixed chunks, 0 terminator). */
    private fun deframe(imageData: ByteArray): Pair<Int, ByteArray> {
        val minCodeSize = imageData[0].toInt() and 0xFF
        val body = ArrayList<Byte>()
        var i = 1
        while (i < imageData.size) {
            val len = imageData[i].toInt() and 0xFF
            i++
            if (len == 0) break
            for (j in 0 until len) body.add(imageData[i + j])
            i += len
        }
        return minCodeSize to body.toByteArray()
    }

    private fun roundTrip(minCodeSize: Int, indices: ByteArray) {
        val enc = LzwEncoder(minCodeSize)
        val framed = enc.encodeImageData(indices)
        val (decMin, body) = deframe(framed)
        assertEquals(minCodeSize, decMin)
        val decoded = decode(minCodeSize, body)
        assertArrayEquals("round-trip mismatch", indices, decoded)
    }

    @Test fun emptyInput() = roundTrip(2, byteArrayOf())

    @Test fun singlePixel() = roundTrip(2, byteArrayOf(1))

    @Test fun repeatedRun() = roundTrip(2, ByteArray(500) { 3 })

    @Test fun simplePattern() = roundTrip(4, byteArrayOf(0, 1, 2, 3, 0, 1, 2, 3, 0, 1))

    @Test
    fun gradientAcrossFullByteRange() {
        roundTrip(8, ByteArray(1000) { (it % 256).toByte() })
    }

    @Test
    fun largePseudoRandomImage() {
        val rnd = java.util.Random(42)
        val data = ByteArray(8192) { (rnd.nextInt(16)).toByte() }
        roundTrip(4, data) // forces table growth, possibly a clear
    }

    @Test
    fun framingProducesValidSubBlocks() {
        val framed = LzwEncoder(8).encodeImageData(ByteArray(1000) { (it % 200).toByte() })
        // First byte is minCodeSize, last byte is the 0 terminator.
        assertEquals(8, framed[0].toInt())
        assertEquals(0, framed.last().toInt())
        assertTrue(framed.size > 3)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsBadMinCodeSize() { LzwEncoder(1) }
}
