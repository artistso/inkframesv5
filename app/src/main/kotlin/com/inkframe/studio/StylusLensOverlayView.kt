package com.inkframe.studio

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import android.view.MotionEvent
import android.view.View
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Native counterpart of the original Glass Horizon `#lens` cursor.
 *
 * This view is attached to the activity decor overlay, so it can float above both Compose and the
 * OpenGL SurfaceView without intercepting input. It is deliberately driven from Android
 * [MotionEvent] data rather than a browser pointer-event translation.
 */
internal class StylusLensOverlayView(context: Context) : View(context) {

    private val density = resources.displayMetrics.density
    private val outerRadius = 50f * density
    private val glassRadius = 27f * density
    private val nibBaseRadius = 2.8f * density
    private val tiltLength = 17f * density

    private val haloPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glassPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1.2f * density
        color = COLOR_RIM
    }
    private val innerRimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 0.8f * density
        color = COLOR_ROSE_SOFT
    }
    private val nibPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = COLOR_BLUSH
    }
    private val tiltPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1f * density
        strokeCap = Paint.Cap.ROUND
        color = COLOR_NIB
    }
    private val accentPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f * density
        strokeCap = Paint.Cap.ROUND
        color = COLOR_ACCENT
    }
    private val eraserPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1.2f * density
        strokeJoin = Paint.Join.ROUND
        color = COLOR_BLUSH
    }

    private var centerX = 0f
    private var centerY = 0f
    private var pressure = 0f
    private var tiltRadians = 0f
    private var orientationRadians = 0f
    private var distance = 0f
    private var contact = false
    private var eraser = false
    private var barrelPressed = false
    private var showing = false

    init {
        alpha = 0f
        isClickable = false
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        setWillNotDraw(false)
    }

    /** Updates the lens from one stylus pointer in window coordinates. */
    fun observe(event: MotionEvent, pointerIndex: Int, overCanvas: Boolean) {
        when (event.actionMasked) {
            MotionEvent.ACTION_HOVER_EXIT,
            MotionEvent.ACTION_CANCEL,
            -> {
                hideLens()
                return
            }
        }

        if (!overCanvas) {
            hideLens()
            return
        }

        val toolType = event.getToolType(pointerIndex)
        if (toolType != MotionEvent.TOOL_TYPE_STYLUS && toolType != MotionEvent.TOOL_TYPE_ERASER) {
            hideLens()
            return
        }

        centerX = event.getX(pointerIndex)
        centerY = event.getY(pointerIndex)
        contact = event.actionMasked == MotionEvent.ACTION_DOWN ||
            event.actionMasked == MotionEvent.ACTION_MOVE
        pressure = if (contact) event.getPressure(pointerIndex).coerceIn(0f, 1f) else 0f
        tiltRadians = event.getAxisValue(MotionEvent.AXIS_TILT, pointerIndex)
            .coerceIn(0f, (PI / 2.0).toFloat())
        orientationRadians = event.getAxisValue(MotionEvent.AXIS_ORIENTATION, pointerIndex)
        distance = event.getAxisValue(MotionEvent.AXIS_DISTANCE, pointerIndex).coerceAtLeast(0f)
        eraser = toolType == MotionEvent.TOOL_TYPE_ERASER
        barrelPressed = event.buttonState and (
            MotionEvent.BUTTON_STYLUS_PRIMARY or MotionEvent.BUTTON_STYLUS_SECONDARY
            ) != 0

        showLens()
        invalidate()
    }

    fun hideLens() {
        if (!showing && alpha == 0f) return
        showing = false
        animate().cancel()
        animate().alpha(0f).setDuration(140L).start()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (!showing && alpha <= 0f) return

        canvas.save()
        canvas.translate(centerX, centerY)

        haloPaint.shader = RadialGradient(
            0f,
            0f,
            outerRadius,
            intArrayOf(
                Color.argb(if (contact) 38 else 24, 247, 202, 201),
                Color.argb(12, 187, 0, 55),
                Color.TRANSPARENT,
            ),
            floatArrayOf(0f, 0.48f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawCircle(0f, 0f, outerRadius, haloPaint)

        glassPaint.shader = RadialGradient(
            -glassRadius * 0.24f,
            -glassRadius * 0.30f,
            glassRadius * 1.35f,
            intArrayOf(
                Color.argb(if (contact) 38 else 24, 255, 240, 243),
                Color.argb(20, 247, 202, 201),
                Color.argb(16, 42, 0, 26),
            ),
            floatArrayOf(0f, 0.58f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawCircle(0f, 0f, glassRadius, glassPaint)
        canvas.drawCircle(0f, 0f, glassRadius, rimPaint)
        canvas.drawCircle(0f, 0f, glassRadius - 3.2f * density, innerRimPaint)

        // A subtle distance ring makes hover height visible without adding a diagnostics panel.
        if (!contact && distance > 0f) {
            val hoverRadius = (glassRadius - 6f * density - distance.coerceAtMost(8f) * density)
                .coerceAtLeast(9f * density)
            innerRimPaint.alpha = 80
            canvas.drawCircle(0f, 0f, hoverRadius, innerRimPaint)
            innerRimPaint.alpha = 255
        }

        val tiltMagnitude = sin(tiltRadians).coerceIn(0f, 1f)
        val directionX = cos(orientationRadians)
        val directionY = sin(orientationRadians)
        val lineLength = tiltLength * (0.35f + tiltMagnitude * 0.65f)
        canvas.drawLine(
            -directionX * lineLength * 0.30f,
            -directionY * lineLength * 0.30f,
            directionX * lineLength,
            directionY * lineLength,
            tiltPaint,
        )

        val nibRadius = nibBaseRadius + pressure * 5.8f * density
        if (eraser) {
            val r = nibRadius + 2.6f * density
            val diamond = Path().apply {
                moveTo(0f, -r)
                lineTo(r, 0f)
                lineTo(0f, r)
                lineTo(-r, 0f)
                close()
            }
            canvas.drawPath(diamond, eraserPaint)
        } else {
            nibPaint.alpha = if (contact) 245 else 205
            canvas.drawCircle(0f, 0f, nibRadius, nibPaint)
        }

        if (barrelPressed) {
            val r = glassRadius + 4f * density
            canvas.drawArc(-r, -r, r, r, 205f, 130f, false, accentPaint)
        }

        canvas.restore()
    }

    override fun onDetachedFromWindow() {
        animate().cancel()
        super.onDetachedFromWindow()
    }

    private fun showLens() {
        if (showing) return
        showing = true
        animate().cancel()
        animate().alpha(1f).setDuration(140L).start()
    }

    private companion object {
        val COLOR_BLUSH: Int = Color.rgb(255, 240, 243)
        val COLOR_RIM: Int = Color.argb(210, 255, 240, 243)
        val COLOR_ROSE_SOFT: Int = Color.argb(105, 247, 202, 201)
        val COLOR_NIB: Int = Color.argb(225, 255, 240, 243)
        val COLOR_ACCENT: Int = Color.rgb(187, 0, 55)
    }
}
