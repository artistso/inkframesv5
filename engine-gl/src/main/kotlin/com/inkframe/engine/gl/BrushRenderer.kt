package com.inkframe.engine.gl

import android.content.Context
import android.graphics.BitmapFactory
import android.opengl.GLES30
import android.opengl.GLUtils
import com.inkframe.core.model.Brush
import com.inkframe.core.model.BrushKind
import java.nio.FloatBuffer

/**
 * Stamps brush dabs into a stroke scratch surface using point sprites, then
 * composites the finished scratch onto a cel exactly once.
 *
 * Supports:
 *  - Procedural round/soft dabs (all brush kinds by default)
 *  - Texture-mapped tips loaded from assets/brushtips/<kind>.png
 *  - Tilt-driven point-size squash (passed from StrokeProcessor via Dab.tiltRad)
 *  - Azimuth-driven tip rotation (Dab.rotationRad → shader vAngle)
 */
class BrushRenderer(private val context: Context) {
    private val program = linkProgram(
        context.readAsset("shaders/brush.vert"),
        context.readAsset("shaders/brush.frag"),
    )
    private val uCanvasSize = GLES30.glGetUniformLocation(program, "uCanvasSize")
    private val uColor      = GLES30.glGetUniformLocation(program, "uColor")
    private val uHardness   = GLES30.glGetUniformLocation(program, "uHardness")
    private val uTip        = GLES30.glGetUniformLocation(program, "uTip")
    private val uUseTip     = GLES30.glGetUniformLocation(program, "uUseTip")

    private val overlayProgram = linkProgram(
        context.readAsset("shaders/composite.vert"),
        context.readAsset("shaders/stroke_overlay.frag"),
    )
    private val oStroke  = GLES30.glGetUniformLocation(overlayProgram, "uStroke")
    private val oOpacity = GLES30.glGetUniformLocation(overlayProgram, "uOpacity")

    private val vbo: Int
    private val quadVbo: Int
    private var cpuBuffer: FloatBuffer = directFloatBuffer(INITIAL_DABS * FLOATS_PER_DAB)

    // Cache of GL texture ids keyed by BrushKind, loaded lazily from assets/brushtips/.
    private val tipTextures = HashMap<BrushKind, Int>()

    init {
        val ids = IntArray(2)
        GLES30.glGenBuffers(2, ids, 0)
        vbo = ids[0]; quadVbo = ids[1]
        val quad = floatArrayOf(
            -1f, -1f, 0f, 0f,
             1f, -1f, 1f, 0f,
            -1f,  1f, 0f, 1f,
             1f,  1f, 1f, 1f,
        )
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quadVbo)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, quad.size * Float.SIZE_BYTES, floatBuffer(quad), GLES30.GL_STATIC_DRAW)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)
    }

    /**
     * Returns the GL texture id for [kind]'s tip texture, loading it from
     * assets/brushtips/<kind_lowercase>.png on first call. Returns null if no
     * asset exists for this kind (falls back to procedural round dab).
     */
    private fun tipTextureFor(kind: BrushKind): Int? {
        tipTextures[kind]?.let { return it }
        val assetName = "brushtips/${kind.name.lowercase()}.png"
        val bitmap = try {
            context.assets.open(assetName).use { BitmapFactory.decodeStream(it) }
        } catch (_: Exception) {
            return null  // no tip asset for this kind — use procedural
        }
        val texIds = IntArray(1)
        GLES30.glGenTextures(1, texIds, 0)
        val texId = texIds[0]
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texId)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR_MIPMAP_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bitmap, 0)
        GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, 0)
        bitmap.recycle()
        tipTextures[kind] = texId
        return texId
    }

    /**
     * Stamps [dabs] into the [scratch] surface. [buildUp] selects additive accumulation
     * (airbrush) vs. GL_MAX (uniform coverage, no darkening). Tilt and azimuth from each
     * [Dab] are forwarded to the shader for tip squash and rotation.
     */
    fun stampToScratch(
        scratch: GlSurface,
        brush: Brush,
        color: com.inkframe.core.model.RgbaColor,
        dabs: List<Dab>,
        buildUp: Boolean,
    ) {
        if (dabs.isEmpty()) return
        scratch.bind()

        GLES30.glEnable(GLES30.GL_BLEND)
        if (buildUp) {
            GLES30.glBlendEquation(GLES30.GL_FUNC_ADD)
            GLES30.glBlendFuncSeparate(
                GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA,
                GLES30.GL_ONE, GLES30.GL_ONE_MINUS_SRC_ALPHA,
            )
        } else {
            GLES30.glBlendEquation(GLES30.GL_MAX)
            GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE)
        }

        GLES30.glUseProgram(program)
        GLES30.glUniform2f(uCanvasSize, scratch.width.toFloat(), scratch.height.toFloat())
        GLES30.glUniform1f(uHardness, brush.hardness)
        GLES30.glUniform4f(uColor, color.r, color.g, color.b, 1f)

        // Bind tip texture if available for this brush kind.
        val texId = tipTextureFor(brush.kind)
        if (texId != null) {
            GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
            GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texId)
            GLES30.glUniform1i(uTip, 0)
            GLES30.glUniform1i(uUseTip, 1)
        } else {
            GLES30.glUniform1i(uUseTip, 0)
        }

        ensureCapacity(dabs.size)
        cpuBuffer.clear()
        for (d in dabs) {
            cpuBuffer.put(d.center.x)
            cpuBuffer.put(d.center.y)
            cpuBuffer.put(d.size)
            cpuBuffer.put(d.rotationRad)
            cpuBuffer.put(d.flow)
            cpuBuffer.put(d.tiltRad)
        }
        cpuBuffer.position(0)

        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo)
        GLES30.glBufferData(
            GLES30.GL_ARRAY_BUFFER,
            dabs.size * FLOATS_PER_DAB * Float.SIZE_BYTES,
            cpuBuffer,
            GLES30.GL_DYNAMIC_DRAW,
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
        GLES30.glEnableVertexAttribArray(4) // aTilt
        GLES30.glVertexAttribPointer(4, 1, GLES30.GL_FLOAT, false, stride, 5 * Float.SIZE_BYTES)

        GLES30.glDrawArrays(GLES30.GL_POINTS, 0, dabs.size)

        for (i in 0..4) GLES30.glDisableVertexAttribArray(i)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)
        if (texId != null) GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, 0)

        // Restore default blend equation for subsequent passes.
        GLES30.glBlendEquation(GLES30.GL_FUNC_ADD)
    }

    /**
     * Composites the finished [scratch] stroke onto [target] a single time at [opacity].
     * When [erase] is true the scratch coverage is subtracted from the target's alpha.
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
        drawQuad()
    }

    /** Copies [src] pixels into [dst] (blend disabled). Seeds the stroke preview surface. */
    fun blit(dst: GlSurface, src: GlSurface) {
        dst.bind()
        GLES30.glDisable(GLES30.GL_BLEND)
        GLES30.glUseProgram(overlayProgram)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, src.textureId)
        GLES30.glUniform1i(oStroke, 0)
        GLES30.glUniform1f(oOpacity, 1f)
        drawQuad()
    }

    private fun drawQuad() {
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
        if (cpuBuffer.capacity() < needed) cpuBuffer = directFloatBuffer(needed * 2)
    }

    fun release() {
        GLES30.glDeleteBuffers(2, intArrayOf(vbo, quadVbo), 0)
        GLES30.glDeleteProgram(program)
        GLES30.glDeleteProgram(overlayProgram)
        val texArray = tipTextures.values.toIntArray()
        if (texArray.isNotEmpty()) GLES30.glDeleteTextures(texArray.size, texArray, 0)
        tipTextures.clear()
    }

    private companion object {
        const val FLOATS_PER_DAB = 6   // x, y, size, angle, flow, tilt
        const val INITIAL_DABS   = 1024
    }
}
