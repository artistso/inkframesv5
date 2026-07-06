package com.inkframe.engine.gl

import android.content.Context
import android.opengl.GLES30
import android.util.Log
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

private const val TAG = "InkFrameGL"

/** Allocates a native-order float buffer and fills it. */
fun floatBuffer(data: FloatArray): FloatBuffer =
    ByteBuffer.allocateDirect(data.size * Float.SIZE_BYTES)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()
        .apply { put(data); position(0) }

fun directFloatBuffer(capacity: Int): FloatBuffer =
    ByteBuffer.allocateDirect(capacity * Float.SIZE_BYTES)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()

/** Throws if an EGL/GL error is pending, including the originating [op] label. */
fun checkGlError(op: String) {
    val error = GLES30.glGetError()
    if (error != GLES30.GL_NO_ERROR) {
        Log.e(TAG, "GL error after $op: 0x${Integer.toHexString(error)}")
        throw GlException("GL error after $op (0x${Integer.toHexString(error)})")
    }
}

class GlException(message: String) : RuntimeException(message)

/** Compiles a single shader stage and returns its id, or throws with the log. */
fun compileShader(type: Int, source: String): Int {
    val shader = GLES30.glCreateShader(type)
    GLES30.glShaderSource(shader, source)
    GLES30.glCompileShader(shader)
    val status = IntArray(1)
    GLES30.glGetShaderiv(shader, GLES30.GL_COMPILE_STATUS, status, 0)
    if (status[0] == 0) {
        val log = GLES30.glGetShaderInfoLog(shader)
        GLES30.glDeleteShader(shader)
        throw GlException("Shader compile failed: $log")
    }
    return shader
}

/** Links a vertex+fragment program and returns the program id. */
fun linkProgram(vertexSrc: String, fragmentSrc: String): Int {
    val vs = compileShader(GLES30.GL_VERTEX_SHADER, vertexSrc)
    val fs = compileShader(GLES30.GL_FRAGMENT_SHADER, fragmentSrc)
    val program = GLES30.glCreateProgram()
    GLES30.glAttachShader(program, vs)
    GLES30.glAttachShader(program, fs)
    GLES30.glLinkProgram(program)
    val status = IntArray(1)
    GLES30.glGetProgramiv(program, GLES30.GL_LINK_STATUS, status, 0)
    // Shaders can be detached/deleted once linked.
    GLES30.glDeleteShader(vs)
    GLES30.glDeleteShader(fs)
    if (status[0] == 0) {
        val log = GLES30.glGetProgramInfoLog(program)
        GLES30.glDeleteProgram(program)
        throw GlException("Program link failed: $log")
    }
    return program
}

/** Reads a text asset (e.g. a shader) fully into a string. */
fun Context.readAsset(path: String): String {
    assets.open(path).use { input ->
        val out = ByteArrayOutputStream()
        val buf = ByteArray(8 * 1024)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
        }
        return out.toString(Charsets.UTF_8.name())
    }
}
