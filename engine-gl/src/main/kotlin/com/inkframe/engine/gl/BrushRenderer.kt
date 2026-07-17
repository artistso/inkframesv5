package com.inkframe.engine.gl

import android.content.Context
import android.opengl.GLES30
import com.inkframe.core.model.Brush
import java.nio.FloatBuffer

/**
 * Stamps brush dabs into a stroke **scratch** surface using point sprites, then
 * composites the finished scratch onto a cel exactly once.
 *
 * Why a scratch buffer? If dabs were stamped straight onto the cel with the brush
 * opacity baked in, overlapping dabs (dense spacing, soft tips, slow strokes, turns)
 * would accumulate and darken. Instead:
 *
 *   1. [stampToScratch] writes per-dab *flow* into the scratch buffer. For normal
 *      brushes it uses GL_MAX blending so overlaps take the maximum coverage (uniform,
 *      no darkening). For build-up brushes (airbrush) it accumulates additively, which
 *      is the desired airbrush behaviour.
 *   2. [compositeScratchToCel] applies the whole flattened stroke to the cel a single
 *      time at the brush's overall opacity (or subtracts it, for the eraser).
 */
class BrushRenderer(context: Context) {
    private val program = linkProgram(
        context.readAsset("shaders/brush.vert"),
        context.readAsset("shaders/brush.frag"),
    )
    private val uCanvasSize = GLES30.glGetUniformLocation(program, "uCanvasSize")
    private val uColor = GLES30.glGetUniformLocation(program, "uColor")
    private val uHardness = GLES30.glGetUniformLocation(program, "uHardness")

    private val overlayProgram = linkProgram(
        context.readAsset("shaders/composite.vert"),
        context.readAsset("shaders/stroke_overlay.frag"),
    )
    private val oStroke = GLES30.glGetUniformLocation(overlayProgram, "uStroke")
    private val oOpacity = GLES30.glGetUniformLocation(overlayProgram, "uOpacity")

    private val vbo: Int
    private val quadVbo: Int
    private var cpuBuffer: FloatBuffer = directFloatBuffer(INITIAL_DABS * FLOATS_PER_DAB)

    init {
        val ids = IntArray(2)
        GLES30.glGenBuffers(2, ids, 0)
        vbo = ids[0]
        quadVbo = ids[1]
        // Fullscreen quad: pos.xy, uv.xy
        val quad = floatArrayOf(
            -1f, -1f, 0f, 0f,
            1f, -1f, 1f, 0f,
            -1f, 1f, 0f, 1f,
            1f, 1f, 1f, 1f,
        )
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quadVbo)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, quad.size * Float.SIZE_BYTES, floatBuffer(quad), GLES30.GL_STATIC_DRAW)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)
    }

    /**
     * Stamps [dabs] into the [scratch] surface. [buildUp] selects additive accumulation
     * (airbrush) vs. GL_MAX (uniform coverage, no darkening). The brush [color] RGB is
     * written; per-dab flow comes from each [Dab].
     */
    fun stampToScratch(scratch: GlSurface, brush: Brush, color: com.inkframe.core.model.RgbaColor, dabs: List<Dab>, buildUp: Boolean) {
        if (dabs.isEmpty()) return
        scratch.bind()

        GLES30.glEnable(GLES30.GL_BLEND)
        if (buildUp) {
            // Accumulate coverage: src.a + dst.a*(1-src.a), color follows coverage.
            GLES30.glBlendEquation(GLES30.GL_FUNC_ADD)
            GLES30.glBlendFuncSeparate(
                GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA,
                GLES30.GL_ONE, GLES30.GL_ONE_MINUS_SRC_ALPHA,
            )
        } else {
            // Take the max coverage where dabs overlap -> uniform stroke, no build-up.
            // RGB also maxed; since all dabs share the brush color this is exact.
            GLES30.glBlendEquation(GLES30.GL_MAX)
            GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE)
        }

        GLES30.glUseProgram(program)
        GLES30.glUniform2f(uCanvasSize, scratch.width.toFloat(), scratch.height.toFloat())
        GLES30.glUniform1f(uHardness, brush.hardness)
        GLES30.glUniform4f(uColor, color.r, color.g, color.b, 1f)

        ensureCapacity(dabs.size)
        cpuBuffer.clear()
        for (d in dabs) {
            cpuBuffer.put(d.center.x)
            cpuBuffer.put(d.center.y)
            cpuBuffer.put(d.size)
            cpuBuffer.put(d.rotationRad)
            cpuBuffer.put(d.flow)
            cpuBuffer.put(d.aspectRatio)
        }
        cpuBuffer.position(0)

        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo)
        GLES30.glBufferData(
            GLES30.GL_ARRAY_BUFFER, dabs.size * FLOATS_PER_DAB * Float.SIZE_BYTES,
            cpuBuffer, GLES30.GL_DYNAMIC_DRAW,
        )

        val stride = FLOATS_PER_DAB * Float.SIZE_BYTES
        GLES30.glEnableVertexAttribArray(0) // aCenter
        GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, stride, 0)
        GLES30.glEnableVertexAttribArray(1) // aSize
        GLES30.glVertexAttribPointer(1, 1, GLES30.GL_FLOAT, false, stride, 2 * Float.SIZE_BYTES)
        GLES30.glEnableVertexAttribArray(2) // aAngle
        GLES30.glVertexAttribPointer(2, 1, GLES30.GL_FLOAT, false, stride, 3 * Float.SIZE_BYTES)
        GLES30.glEnableVertexAttribArray(3) // aFlow
        GLES30.glVertexAttribPointer(3, 1, GLES30.GL_FLOAT, false, stride, 4 * Float.SIZE_BYTES)
        GLES30.glEnableVertexAttribArray(4) // aAspect
        GLES30.glVertexAttribPointer(4, 1, GLES30.GL_FLOAT, false, stride, 5 * Float.SIZE_BYTES)

        GLES30.glDrawArrays(GLES30.GL_POINTS, 0, dabs.size)

        GLES30.glDisableVertexAttribArray(0)
        GLES30.glDisableVertexAttribArray(1)
        GLES30.glDisableVertexAttribArray(2)
        GLES30.glDisableVertexAttribArray(3)
        GLES30.glDisableVertexAttribArray(4)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)

        // Restore default blend equation for subsequent passes.
        GLES30.glBlendEquation(GLES30.GL_FUNC_ADD)
    }

    /**
     * Composites the finished [scratch] stroke onto [target] a single time at
     * [opacity]. When [erase] is true the scratch coverage is subtracted from the
     * target's alpha (eraser); otherwise it is painted source-over.
     */
    fun compositeScratchToCel(target: GlSurface, scratch: GlSurface, opacity: Float, erase: Boolean) {
        target.bind()
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendEquation(GLES30.GL_FUNC_ADD)
        if (erase) {
            GLES30.glBlendFuncSeparate(
                GLES30.GL_ZERO, GLES30.GL_ONE_MINUS_SRC_ALPHA,
                GLES30.GL_ZERO, GLES30.GL_ONE_MINUS_SRC_ALPHA,
            )
        } else {
            GLES30.glBlendFuncSeparate(
                GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA,
                GLES30.GL_ONE, GLES30.GL_ONE_MINUS_SRC_ALPHA,
            )
        }

        GLES30.glUseProgram(overlayProgram)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, scratch.textureId)
        GLES30.glUniform1i(oStroke, 0)
        GLES30.glUniform1f(oOpacity, opacity.coerceIn(0f, 1f))
        drawQuad(overlayProgram)
    }

    /**
     * Copies [src]'s pixels into [dst], replacing them (blend disabled). Used to seed a
     * stroke preview surface from the untouched cel before overlaying the wet stroke.
     */
    fun blit(dst: GlSurface, src: GlSurface) {
        dst.bind()
        GLES30.glDisable(GLES30.GL_BLEND)
        GLES30.glUseProgram(overlayProgram)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, src.textureId)
        GLES30.glUniform1i(oStroke, 0)
        GLES30.glUniform1f(oOpacity, 1f)
        drawQuad(overlayProgram)
    }

    private fun drawQuad(@Suppress("UNUSED_PARAMETER") program: Int) {
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quadVbo)
        val stride = 4 * Float.SIZE_BYTES
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, stride, 0)
        GLES30.glEnableVertexAttribArray(1)
        GLES30.glVertexAttribPointer(1, 2, GLES30.GL_FLOAT, false, stride, 2 * Float.SIZE_BYTES)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
        GLES30.glDisableVertexAttribArray(0)
        GLES30.glDisableVertexAttribArray(1)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)
    }

    private fun ensureCapacity(dabCount: Int) {
        val needed = dabCount * FLOATS_PER_DAB
        if (cpuBuffer.capacity() < needed) {
            cpuBuffer = directFloatBuffer(needed * 2)
        }
    }

    fun release() {
        GLES30.glDeleteBuffers(2, intArrayOf(vbo, quadVbo), 0)
        GLES30.glDeleteProgram(program)
        GLES30.glDeleteProgram(overlayProgram)
    }

    private companion object {
        const val FLOATS_PER_DAB = 6   // x, y, size, angle, flow, aspect
        const val INITIAL_DABS = 1024
    }
}
