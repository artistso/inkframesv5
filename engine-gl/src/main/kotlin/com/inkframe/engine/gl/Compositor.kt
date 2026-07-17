package com.inkframe.engine.gl

import android.content.Context
import android.opengl.GLES30
import com.inkframe.core.model.RgbaColor

/**
 * Composites a stack of layer surfaces into a single canvas texture and presents the
 * result to the screen with an optional transparency checkerboard.
 *
 * Compositing uses ping-pong surfaces: the running "below" accumulator and the layer
 * being added are read by [composite.frag], which writes the merged result.
 */
class Compositor(context: Context, private val width: Int, private val height: Int) {
    private val compositeProgram = linkProgram(
        context.readAsset("shaders/composite.vert"),
        context.readAsset("shaders/composite.frag"),
    )
    private val presentProgram = linkProgram(
        context.readAsset("shaders/composite.vert"),
        context.readAsset("shaders/present.frag"),
    )

    private val cLayer = GLES30.glGetUniformLocation(compositeProgram, "uLayer")
    private val cBelow = GLES30.glGetUniformLocation(compositeProgram, "uBelow")
    private val cOpacity = GLES30.glGetUniformLocation(compositeProgram, "uOpacity")
    private val cBlend = GLES30.glGetUniformLocation(compositeProgram, "uBlend")
    private val cTint = GLES30.glGetUniformLocation(compositeProgram, "uTint")
    private val cTintStrength = GLES30.glGetUniformLocation(compositeProgram, "uTintStrength")

    private val pCanvas = GLES30.glGetUniformLocation(presentProgram, "uCanvas")
    private val pScreen = GLES30.glGetUniformLocation(presentProgram, "uScreenSize")
    private val pCanvasSize = GLES30.glGetUniformLocation(presentProgram, "uCanvasSize")
    private val pInv = GLES30.glGetUniformLocation(presentProgram, "uInv")
    private val pChecker = GLES30.glGetUniformLocation(presentProgram, "uShowChecker")
    private val pBackground = GLES30.glGetUniformLocation(presentProgram, "uBackground")

    // Fullscreen quad: pos.xy, uv.xy
    private val quad = floatBuffer(
        floatArrayOf(
            -1f, -1f, 0f, 0f,
            1f, -1f, 1f, 0f,
            -1f, 1f, 0f, 1f,
            1f, 1f, 1f, 1f,
        ),
    )
    private val quadVbo: Int

    private var accumA = GlSurface(width, height)
    private var accumB = GlSurface(width, height)

    init {
        val ids = IntArray(1)
        GLES30.glGenBuffers(1, ids, 0)
        quadVbo = ids[0]
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quadVbo)
        val arr = FloatArray(quad.capacity()).also { quad.get(it); quad.position(0) }
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, arr.size * Float.SIZE_BYTES, floatBuffer(arr), GLES30.GL_STATIC_DRAW)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)
    }

    data class LayerDraw(
        val surface: GlSurface,
        val opacity: Float,
        val blendOrdinal: Int,
        val tintR: Float = 0f,
        val tintG: Float = 0f,
        val tintB: Float = 0f,
        val tintStrength: Float = 0f,
    )

    /**
     * Flattens [layers] (bottom-first) into a single canvas texture and returns it.
     * The returned surface is owned by the compositor; do not release it.
     */
    fun flatten(layers: List<LayerDraw>): GlSurface {
        accumA.clear(0f, 0f, 0f, 0f)
        var below = accumA
        var scratch = accumB

        for (layer in layers) {
            scratch.bind()
            GLES30.glDisable(GLES30.GL_BLEND)
            GLES30.glUseProgram(compositeProgram)

            GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
            GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, layer.surface.textureId)
            GLES30.glUniform1i(cLayer, 0)

            GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
            GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, below.textureId)
            GLES30.glUniform1i(cBelow, 1)

            GLES30.glUniform1f(cOpacity, layer.opacity)
            GLES30.glUniform1i(cBlend, layer.blendOrdinal)
            GLES30.glUniform3f(cTint, layer.tintR, layer.tintG, layer.tintB)
            GLES30.glUniform1f(cTintStrength, layer.tintStrength)

            drawQuad(compositeProgram)

            // Swap: result becomes the new "below".
            val tmp = below; below = scratch; scratch = tmp
        }
        return below
    }

    /**
     * Draws [canvas] to the default framebuffer under the viewport transform described by
     * [invCoeffs] (the packed inverse view→canvas affine: iax, iay, ibx, iby). With the
     * identity-fit transform this frames the whole canvas; pan/zoom/rotate are applied by
     * passing a transformed [invCoeffs].
     */
    fun present(
        canvas: GlSurface,
        screenW: Int,
        screenH: Int,
        showChecker: Boolean,
        backgroundColor: RgbaColor,
        invCoeffs: FloatArray,
    ) {
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        GLES30.glViewport(0, 0, screenW, screenH)
        GLES30.glDisable(GLES30.GL_BLEND)
        GLES30.glUseProgram(presentProgram)

        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, canvas.textureId)
        GLES30.glUniform1i(pCanvas, 0)
        GLES30.glUniform2f(pScreen, screenW.toFloat(), screenH.toFloat())
        GLES30.glUniform2f(pCanvasSize, width.toFloat(), height.toFloat())
        GLES30.glUniform4f(pInv, invCoeffs[0], invCoeffs[1], invCoeffs[2], invCoeffs[3])
        GLES30.glUniform1i(pChecker, if (showChecker) 1 else 0)
        GLES30.glUniform3f(pBackground, backgroundColor.r, backgroundColor.g, backgroundColor.b)

        drawQuad(presentProgram)
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

    fun release() {
        accumA.release(); accumB.release()
        GLES30.glDeleteBuffers(1, intArrayOf(quadVbo), 0)
        GLES30.glDeleteProgram(compositeProgram)
        GLES30.glDeleteProgram(presentProgram)
    }
}
