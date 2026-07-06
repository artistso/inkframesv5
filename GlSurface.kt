package com.inkframe.engine.gl

import android.opengl.GLES30
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * An off-screen RGBA8 render target (texture + framebuffer object). Each drawing
 * layer/cel owns one of these so strokes accumulate persistently on the GPU.
 */
class GlSurface(val width: Int, val height: Int) {
    var textureId: Int = 0
        private set
    private var fboId: Int = 0
    private var released = false

    init {
        val tex = IntArray(1)
        GLES30.glGenTextures(1, tex, 0)
        textureId = tex[0]
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, textureId)
        GLES30.glTexImage2D(
            GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA8, width, height, 0,
            GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null,
        )
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)

        val fbo = IntArray(1)
        GLES30.glGenFramebuffers(1, fbo, 0)
        fboId = fbo[0]
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fboId)
        GLES30.glFramebufferTexture2D(
            GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0,
            GLES30.GL_TEXTURE_2D, textureId, 0,
        )
        val st = GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER)
        check(st == GLES30.GL_FRAMEBUFFER_COMPLETE) { "Incomplete FBO: 0x${Integer.toHexString(st)}" }
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    }

    /** Binds this surface's FBO and sets the viewport to its full extent. */
    fun bind() {
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fboId)
        GLES30.glViewport(0, 0, width, height)
    }

    fun clear(r: Float = 0f, g: Float = 0f, b: Float = 0f, a: Float = 0f) {
        bind()
        GLES30.glClearColor(r, g, b, a)
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
    }

    /**
     * Reads back an [w]x[h] block of RGBA8 pixels starting at ([x], [y]) into a direct
     * buffer (one byte per channel, tightly packed). Used to snapshot a stroke's dirty
     * rectangle for undo. Must run on the GL thread.
     */
    fun readPixels(x: Int, y: Int, w: Int, h: Int): ByteBuffer {
        val buf = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
        bind()
        GLES30.glPixelStorei(GLES30.GL_PACK_ALIGNMENT, 1)
        GLES30.glReadPixels(x, y, w, h, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, buf)
        buf.position(0)
        return buf
    }

    /**
     * Writes an [w]x[h] block of RGBA8 [pixels] back into this surface's texture at
     * ([x], [y]), replacing those texels. Used to restore a snapshot on undo/redo.
     */
    fun writePixels(x: Int, y: Int, w: Int, h: Int, pixels: ByteBuffer) {
        pixels.position(0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, textureId)
        GLES30.glPixelStorei(GLES30.GL_UNPACK_ALIGNMENT, 1)
        GLES30.glTexSubImage2D(
            GLES30.GL_TEXTURE_2D, 0, x, y, w, h,
            GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, pixels,
        )
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, 0)
    }

    fun release() {
        if (released) return
        released = true
        GLES30.glDeleteFramebuffers(1, intArrayOf(fboId), 0)
        GLES30.glDeleteTextures(1, intArrayOf(textureId), 0)
        fboId = 0; textureId = 0
    }
}
