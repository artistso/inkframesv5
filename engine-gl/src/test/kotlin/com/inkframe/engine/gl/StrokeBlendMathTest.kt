package com.inkframe.engine.gl

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * CPU simulation of the GPU blend math used by stroke-buffer compositing, proving the
 * key property: overlapping dabs within one stroke must NOT darken (for normal brushes),
 * whereas the old "stamp straight onto the cel with source-over" approach does darken.
 *
 * We model a single channel of straight-alpha coverage. These mirror the exact blend
 * equations configured in [BrushRenderer].
 */
class StrokeBlendMathTest {

    /** Source-over (the OLD direct-stamp behaviour): out = src + dst*(1-src). */
    private fun sourceOver(dst: Float, src: Float): Float = src + dst * (1f - src)

    /** GL_MAX scratch blend (the NEW normal-brush behaviour): out = max(dst, src). */
    private fun glMax(dst: Float, src: Float): Float = maxOf(dst, src)

    /** Additive build-up scratch blend (airbrush): same as source-over here. */
    private fun additive(dst: Float, src: Float): Float = (src + dst * (1f - src)).coerceAtMost(1f)

    @Test
    fun directSourceOver_darkensOnOverlap() {
        // Two soft dabs of coverage 0.5 overlapping at a pixel.
        var a = 0f
        a = sourceOver(a, 0.5f)   // 0.5
        a = sourceOver(a, 0.5f)   // 0.75 -> heavier than a single dab
        assertTrue("overlap should accumulate with source-over", a > 0.5f)
        assertEquals(0.75f, a, 1e-4f)
    }

    @Test
    fun glMaxScratch_doesNotDarkenOnOverlap() {
        // Same two 0.5 dabs into the scratch buffer with GL_MAX.
        var a = 0f
        a = glMax(a, 0.5f)        // 0.5
        a = glMax(a, 0.5f)        // 0.5 -> identical to a single dab
        assertEquals("overlap must stay uniform with GL_MAX", 0.5f, a, 1e-4f)
    }

    @Test
    fun glMaxScratch_manyOverlapsStayUniform() {
        // A slow stroke / turn produces dozens of overlapping dabs at one pixel.
        var a = 0f
        repeat(50) { a = glMax(a, 0.4f) }
        assertEquals(0.4f, a, 1e-4f)   // never darker than one dab
    }

    @Test
    fun glMaxScratch_higherFlowDabRaisesCoverage() {
        // A later, stronger dab can still increase coverage up to its own flow.
        var a = 0f
        a = glMax(a, 0.3f)
        a = glMax(a, 0.7f)
        assertEquals(0.7f, a, 1e-4f)
    }

    @Test
    fun strokeOpacityAppliedOnceAtComposite() {
        // After the scratch reaches uniform coverage 1.0, applying brush opacity once
        // yields exactly that opacity on the cel — not a function of dab count.
        var scratch = 0f
        repeat(20) { scratch = glMax(scratch, 1f) }
        val brushOpacity = 0.6f
        val celBefore = 0f
        val celAfter = sourceOver(celBefore, scratch * brushOpacity)
        assertEquals(0.6f, celAfter, 1e-4f)
    }

    @Test
    fun airbrushBuildUp_accumulatesAsDesigned() {
        // Build-up brushes are *meant* to darken with repeated passes (airbrush feel).
        var a = 0f
        repeat(5) { a = additive(a, 0.1f) }
        assertTrue("airbrush should build up", a > 0.1f)
        assertTrue(a <= 1f)
    }

    @Test
    fun eraserSubtractsCoverage() {
        // Eraser blend: out.a = dst.a * (1 - src.a).
        val dst = 1f
        val src = 0.6f   // stroke coverage * opacity
        val out = dst * (1f - src)
        assertEquals(0.4f, out, 1e-4f)
    }
}
