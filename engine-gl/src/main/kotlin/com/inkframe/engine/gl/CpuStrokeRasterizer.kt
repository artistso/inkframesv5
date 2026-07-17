package com.inkframe.engine.gl

import com.inkframe.core.common.IntRect
import com.inkframe.core.model.Brush
import com.inkframe.core.model.RgbaColor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Device-safe stroke commit used after the live GPU preview.
 *
 * Samsung device testing showed that the wet OpenGL path could accept input without
 * leaving persistent pixels. This rasterizer writes the completed dirty rectangle into
 * the cel texture deterministically, while OpenGL remains responsible for presentation,
 * compositing, onion skinning and export readback.
 */
internal object CpuStrokeRasterizer {
    fun commit(
        baseBottomUpRgba: ByteBuffer,
        topRect: IntRect,
        brush: Brush,
        color: RgbaColor,
        opacity: Float,
        erase: Boolean,
        dabs: List<Dab>,
    ): ByteBuffer {
        val width = topRect.w
        val height = topRect.h
        val byteCount = width * height * 4
        val bytes = ByteArray(byteCount)
        val source = baseBottomUpRgba.duplicate().apply { position(0) }
        source.get(bytes)
        if (width <= 0 || height <= 0 || dabs.isEmpty()) {
            return direct(bytes)
        }

        val coverage = FloatArray(width * height)
        val hardness = brush.hardness.coerceIn(0f, 0.98f)
        for (dab in dabs) {
            val radius = max(0.5f, dab.size * 0.5f)
            val left = max(0, floor(dab.center.x - radius - topRect.x).toInt())
            val right = min(width - 1, ceil(dab.center.x + radius - topRect.x).toInt())
            val top = max(0, floor(dab.center.y - radius - topRect.y).toInt())
            val bottom = min(height - 1, ceil(dab.center.y + radius - topRect.y).toInt())
            if (left > right || top > bottom) continue

            for (localY in top..bottom) {
                val canvasY = topRect.y + localY + 0.5f
                for (localX in left..right) {
                    val canvasX = topRect.x + localX + 0.5f
                    val dx = canvasX - dab.center.x
                    val dy = canvasY - dab.center.y
                    val normalized = sqrt(dx * dx + dy * dy) / radius
                    if (normalized >= 1f) continue
                    val falloff = 1f - smoothstep(hardness, 1f, normalized)
                    val dabCoverage = (falloff * dab.flow).coerceIn(0f, 1f)
                    val index = localY * width + localX
                    coverage[index] = if (brush.buildUp) {
                        1f - (1f - coverage[index]) * (1f - dabCoverage)
                    } else {
                        max(coverage[index], dabCoverage)
                    }
                }
            }
        }

        val paintAlphaScale = (opacity * color.a).coerceIn(0f, 1f)
        for (localY in 0 until height) {
            val bufferRow = height - 1 - localY
            for (localX in 0 until width) {
                val cover = coverage[localY * width + localX]
                if (cover <= 0f) continue
                val offset = (bufferRow * width + localX) * 4
                val dstR = u8(bytes[offset]) / 255f
                val dstG = u8(bytes[offset + 1]) / 255f
                val dstB = u8(bytes[offset + 2]) / 255f
                val dstA = u8(bytes[offset + 3]) / 255f
                val mask = cover.coerceIn(0f, 1f)

                if (erase) {
                    val outA = dstA * (1f - mask)
                    bytes[offset + 3] = channel(outA)
                    if (outA <= 0.0001f) {
                        bytes[offset] = 0
                        bytes[offset + 1] = 0
                        bytes[offset + 2] = 0
                    }
                } else {
                    val srcA = (mask * paintAlphaScale).coerceIn(0f, 1f)
                    val outA = srcA + dstA * (1f - srcA)
                    if (outA <= 0f) continue
                    val outR = (color.r * srcA + dstR * dstA * (1f - srcA)) / outA
                    val outG = (color.g * srcA + dstG * dstA * (1f - srcA)) / outA
                    val outB = (color.b * srcA + dstB * dstA * (1f - srcA)) / outA
                    bytes[offset] = channel(outR)
                    bytes[offset + 1] = channel(outG)
                    bytes[offset + 2] = channel(outB)
                    bytes[offset + 3] = channel(outA)
                }
            }
        }
        return direct(bytes)
    }

    private fun smoothstep(edge0: Float, edge1: Float, value: Float): Float {
        if (edge0 >= edge1) return if (value < edge1) 0f else 1f
        val t = ((value - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    private fun u8(value: Byte): Int = value.toInt() and 0xFF
    private fun channel(value: Float): Byte = (value.coerceIn(0f, 1f) * 255f + 0.5f).toInt().toByte()
    private fun direct(bytes: ByteArray): ByteBuffer =
        ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).apply {
            put(bytes)
            position(0)
        }
}
