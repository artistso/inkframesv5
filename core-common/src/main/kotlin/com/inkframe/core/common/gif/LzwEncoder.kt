package com.inkframe.core.common.gif

import java.io.ByteArrayOutputStream

/**
 * GIF variable-length LZW compressor (the algorithm from the GIF89a spec, Appendix F).
 *
 * Encodes a stream of color indices (each < 2^[minCodeSize]) into the packed,
 * sub-blocked bitstream a GIF image-data section expects. Pure Kotlin, no Android deps —
 * verified by round-tripping through an independent decoder in tests.
 *
 * @param minCodeSize bits per index for the initial code size (2..8). For an N-color
 *   palette this is max(2, ceil(log2(N))).
 */
class LzwEncoder(private val minCodeSize: Int) {

    init {
        require(minCodeSize in 2..8) { "minCodeSize must be 2..8, was $minCodeSize" }
    }

    private val clearCode = 1 shl minCodeSize
    private val eoiCode = clearCode + 1

    /** Returns the LZW code stream packed into GIF sub-blocks (without the leading
     * minCodeSize byte; [encodeImageData] adds that and the block framing). */
    fun encode(indices: ByteArray): ByteArray {
        val bits = BitWriter()
        var codeSize = minCodeSize + 1
        var nextCode = eoiCode + 1
        val table = HashMap<Long, Int>()

        fun resetTable() {
            table.clear()
            // Single-index strings get their literal code implicitly (0..clearCode-1).
            codeSize = minCodeSize + 1
            nextCode = eoiCode + 1
        }

        bits.write(clearCode, codeSize)
        resetTable()

        if (indices.isEmpty()) {
            bits.write(eoiCode, codeSize)
            return bits.toByteArray()
        }

        // "prefix" is the current string's code; start with the first index.
        var prefix = (indices[0].toInt() and 0xFF)
        for (i in 1 until indices.size) {
            val k = indices[i].toInt() and 0xFF
            val key = (prefix.toLong() shl 8) or k.toLong()
            val existing = table[key]
            if (existing != null) {
                prefix = existing
            } else {
                bits.write(prefix, codeSize)
                table[key] = nextCode
                nextCode++
                // Grow code size when the table outgrows the current width.
                if (nextCode > (1 shl codeSize) && codeSize < MAX_CODE_SIZE) {
                    codeSize++
                }
                // Table full: emit a clear and start over.
                if (nextCode > MAX_TABLE) {
                    bits.write(clearCode, codeSize)
                    resetTable()
                }
                prefix = k
            }
        }
        bits.write(prefix, codeSize)
        bits.write(eoiCode, codeSize)
        return bits.toByteArray()
    }

    /** Full image-data section: the minCodeSize byte + LZW data framed into sub-blocks. */
    fun encodeImageData(indices: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        out.write(minCodeSize)
        val data = encode(indices)
        // Split into <=255-byte sub-blocks, each prefixed by its length; 0 terminates.
        var off = 0
        while (off < data.size) {
            val len = minOf(255, data.size - off)
            out.write(len)
            out.write(data, off, len)
            off += len
        }
        out.write(0)
        return out.toByteArray()
    }

    /** LSB-first bit packer, as GIF requires. */
    private class BitWriter {
        private val bytes = ByteArrayOutputStream()
        private var cur = 0
        private var nbits = 0

        fun write(code: Int, size: Int) {
            cur = cur or (code shl nbits)
            nbits += size
            while (nbits >= 8) {
                bytes.write(cur and 0xFF)
                cur = cur ushr 8
                nbits -= 8
            }
        }

        fun toByteArray(): ByteArray {
            if (nbits > 0) {
                bytes.write(cur and 0xFF)
                cur = 0; nbits = 0
            }
            return bytes.toByteArray()
        }
    }

    private companion object {
        const val MAX_CODE_SIZE = 12
        const val MAX_TABLE = 1 shl 12 // 4096
    }
}
