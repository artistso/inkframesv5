package com.inkframe.core.common

import kotlin.math.atan2
import kotlin.math.hypot

/**
 * A 2D similarity transform (uniform scale + rotation + translation) mapping **canvas
 * pixel space → view (screen) pixel space**. Used for pan / zoom / rotate of the canvas.
 *
 * The linear part is stored as a complex number `a = ax + i·ay` (so `|a|` is the zoom
 * and `arg(a)` is the rotation), with translation `b = bx + i·by`. Representing the
 * transform this way keeps canvas/view conversion exact while allowing touch navigation
 * to apply stable centroid pan and span-only zoom without accidental rotation.
 *
 *  - **canvasToView(c) = a·c + b**, **viewToCanvas(v) = (v − b) / a**
 *  - **touch gesture composition** maps the previous two-finger centroid onto the current
 *    centroid while scaling by the change in finger span.
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
     * Applies stable two-finger navigation from the previous pointer positions to the
     * current positions.
     *
     * The gesture intentionally uses only:
     *
     *  - centroid movement for two-finger panning; and
     *  - span change for pinch zoom.
     *
     * Finger-vector angle is ignored. Small angle changes are unavoidable when pinching
     * on glass and previously caused the canvas to rotate and wobble. Any rotation already
     * present in this transform is retained, but touch navigation does not add more.
     */
    fun applyGesture(prevA: Vec2, prevB: Vec2, curA: Vec2, curB: Vec2): ViewportTransform {
        val prevCenterX = (prevA.x + prevB.x) * 0.5f
        val prevCenterY = (prevA.y + prevB.y) * 0.5f
        val curCenterX = (curA.x + curB.x) * 0.5f
        val curCenterY = (curA.y + curB.y) * 0.5f

        val prevSpan = hypot(prevB.x - prevA.x, prevB.y - prevA.y)
        val curSpan = hypot(curB.x - curA.x, curB.y - curA.y)

        // When the previous pointers are effectively coincident, retain useful centroid
        // panning while suppressing an undefined/infinite zoom ratio.
        val scaleFactor = if (prevSpan >= MIN_GESTURE_SPAN && curSpan.isFinite()) {
            (curSpan / prevSpan).takeIf { it.isFinite() && it > 0f } ?: 1f
        } else {
            1f
        }

        return preCompose(
            mAx = scaleFactor,
            mAy = 0f,
            mBx = curCenterX - scaleFactor * prevCenterX,
            mBy = curCenterY - scaleFactor * prevCenterY,
        )
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
        private const val MIN_GESTURE_SPAN = 0.5f

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
