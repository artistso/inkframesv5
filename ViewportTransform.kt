package com.inkframe.core.common

import kotlin.math.atan2
import kotlin.math.hypot

/**
 * A 2D similarity transform (uniform scale + rotation + translation) mapping **canvas
 * pixel space → view (screen) pixel space**. Used for pan / zoom / rotate of the canvas.
 *
 * The linear part is stored as a complex number `a = ax + i·ay` (so `|a|` is the zoom
 * and `arg(a)` is the rotation), with translation `b = bx + i·by`. Representing the
 * transform this way makes the two operations we need cheap and exact:
 *
 *  - **canvasToView(c) = a·c + b**, **viewToCanvas(v) = (v − b) / a**
 *  - **gesture composition** (pinch/rotate from two finger correspondences) is a single
 *    complex division + multiply, with no matrix bookkeeping.
 *
 * Immutable; every mutator returns a new instance. Pure Kotlin — fully unit-tested.
 */
data class ViewportTransform(
    val ax: Float,
    val ay: Float,
    val bx: Float,
    val by: Float,
) {
    /** Uniform zoom factor (1 = canvas pixels map 1:1 to view pixels). */
    val scale: Float get() = hypot(ax, ay)

    /** Rotation in radians. */
    val rotation: Float get() = atan2(ay, ax)

    fun canvasToView(p: Vec2): Vec2 =
        Vec2(ax * p.x - ay * p.y + bx, ay * p.x + ax * p.y + by)

    fun viewToCanvas(p: Vec2): Vec2 {
        val det = ax * ax + ay * ay
        val dx = p.x - bx
        val dy = p.y - by
        return Vec2((ax * dx + ay * dy) / det, (-ay * dx + ax * dy) / det)
    }

    /**
     * Coefficients of the inverse (view → canvas) affine, packed for the GLSL present
     * shader as `[iax, iay, ibx, iby]` where `canvas = (iax+i·iay)·view + (ibx+i·iby)`.
     */
    fun inverseCoeffs(): FloatArray {
        val det = ax * ax + ay * ay
        val iax = ax / det
        val iay = -ay / det
        val ibx = -(iax * bx - iay * by)
        val iby = -(iax * by + iay * bx)
        return floatArrayOf(iax, iay, ibx, iby)
    }

    /** Pre-composes this transform with M(v) = (mAx+i·mAy)·v + (mBx+i·mBy): result = M ∘ this. */
    fun preCompose(mAx: Float, mAy: Float, mBx: Float, mBy: Float): ViewportTransform {
        val nax = mAx * ax - mAy * ay
        val nay = mAx * ay + mAy * ax
        val nbx = mAx * bx - mAy * by + mBx
        val nby = mAx * by + mAy * bx + mBy
        return ViewportTransform(nax, nay, nbx, nby)
    }

    /** Translates the canvas in view space by ([dx], [dy]) pixels. */
    fun pan(dx: Float, dy: Float): ViewportTransform = copy(bx = bx + dx, by = by + dy)

    /**
     * Applies the incremental similarity that maps the previous two-finger configuration
     * (prevA, prevB) onto the current one (curA, curB): pinch-zoom, two-finger rotate and
     * pan, all at once. The unique similarity with two point correspondences is computed
     * via complex division `M_a = (curB−curA)/(prevB−prevA)`.
     */
    fun applyGesture(prevA: Vec2, prevB: Vec2, curA: Vec2, curB: Vec2): ViewportTransform {
        val pvx = prevB.x - prevA.x
        val pvy = prevB.y - prevA.y
        val cvx = curB.x - curA.x
        val cvy = curB.y - curA.y
        val den = pvx * pvx + pvy * pvy
        if (den < 1e-6f) return this
        // M_a = cv / pv  (complex)
        val mAx = (cvx * pvx + cvy * pvy) / den
        val mAy = (cvy * pvx - cvx * pvy) / den
        // M_b = curA - M_a · prevA
        val mBx = curA.x - (mAx * prevA.x - mAy * prevA.y)
        val mBy = curA.y - (mAy * prevA.x + mAx * prevA.y)
        return preCompose(mAx, mAy, mBx, mBy)
    }

    /**
     * Clamps the zoom to [[min], [max]], scaling about the view-space pivot
     * ([pivotX], [pivotY]) so that point stays fixed on screen.
     */
    fun withScaleClamped(min: Float, max: Float, pivotX: Float, pivotY: Float): ViewportTransform {
        val s = scale
        val clamped = s.coerceIn(min, max)
        if (clamped == s) return this
        val k = clamped / s
        return preCompose(k, 0f, pivotX - k * pivotX, pivotY - k * pivotY)
    }

    companion object {
        val IDENTITY = ViewportTransform(1f, 0f, 0f, 0f)

        /**
         * Aspect-fits a [canvasW]×[canvasH] canvas centered in a [viewW]×[viewH] view
         * (no rotation), the default "frame the whole drawing" view.
         */
        fun fit(canvasW: Float, canvasH: Float, viewW: Float, viewH: Float): ViewportTransform {
            if (canvasW <= 0f || canvasH <= 0f) return IDENTITY
            val scale = minOf(viewW / canvasW, viewH / canvasH)
            val bx = (viewW - canvasW * scale) * 0.5f
            val by = (viewH - canvasH * scale) * 0.5f
            return ViewportTransform(scale, 0f, bx, by)
        }
    }
}
