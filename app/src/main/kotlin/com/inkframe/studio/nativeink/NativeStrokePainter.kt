package com.inkframe.studio.nativeink

import android.graphics.Canvas
import android.graphics.Paint
import kotlin.math.max

/** Shared pressure-to-width and stroke rasterization logic for screen drawing and PNG export. */
internal class NativeStrokePainter {
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val pointPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    fun drawStroke(canvas: Canvas, stroke: NativeStroke, paperColor: Int) {
        val samples = stroke.samples
        if (samples.isEmpty()) return

        val color = if (stroke.eraser) paperColor else stroke.style.color
        strokePaint.color = color
        pointPaint.color = color

        if (samples.size == 1) {
            val sample = samples[0]
            canvas.drawCircle(
                sample.x,
                sample.y,
                widthFor(stroke.style, sample.pressure) / 2f,
                pointPaint,
            )
            return
        }

        var previous = samples[0]
        for (index in 1 until samples.size) {
            val current = samples[index]
            drawSegment(
                canvas = canvas,
                previous = previous,
                current = current,
                style = stroke.style,
                eraser = stroke.eraser,
                paperColor = paperColor,
            )
            previous = current
        }
    }

    fun drawSegment(
        canvas: Canvas,
        previous: InkSample?,
        current: InkSample,
        style: NativeBrushStyle,
        eraser: Boolean,
        paperColor: Int,
    ) {
        val color = if (eraser) paperColor else style.color
        strokePaint.color = color
        pointPaint.color = color

        if (previous == null) {
            canvas.drawCircle(
                current.x,
                current.y,
                widthFor(style, current.pressure) / 2f,
                pointPaint,
            )
            return
        }

        strokePaint.strokeWidth = (
            widthFor(style, previous.pressure) + widthFor(style, current.pressure)
        ) / 2f
        canvas.drawLine(previous.x, previous.y, current.x, current.y, strokePaint)
    }

    private fun widthFor(style: NativeBrushStyle, pressure: Float): Float {
        val normalizedPressure = pressure.coerceIn(0f, 1f)
        return max(0.75f, style.sizePx * (0.18f + normalizedPressure * 0.82f))
    }
}
