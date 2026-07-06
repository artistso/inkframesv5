package com.inkframe.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FloodFillTest {

    private val RED = 0xFFFF0000.toInt()
    private val GREEN = 0xFF00FF00.toInt()
    private val BLUE = 0xFF0000FF.toInt()
    private val WHITE = 0xFFFFFFFF.toInt()

    /** Build a w×h grid from a row-major list (helper for readable tests). */
    private fun grid(w: Int, h: Int, fill: Int) = IntArray(w * h) { fill }

    @Test
    fun fillsEntireUniformCanvas() {
        val w = 4; val h = 3
        val px = grid(w, h, WHITE)
        val r = FloodFill.fill(px, w, h, 0, 0, RED)
        assertTrue(r.changed)
        assertEquals(w * h, r.pixelsFilled)
        assertTrue(px.all { it == RED })
        assertEquals(IntRect(0, 0, 4, 3), r.dirtyRect())
    }

    @Test
    fun stopsAtDifferentColourBorder() {
        // 5x1: white | white | BLUE wall | white | white  — fill left side only.
        val px = intArrayOf(WHITE, WHITE, BLUE, WHITE, WHITE)
        val r = FloodFill.fill(px, 5, 1, 0, 0, RED)
        assertEquals(2, r.pixelsFilled)
        assertEquals(intArrayOf(RED, RED, BLUE, WHITE, WHITE).toList(), px.toList())
    }

    @Test
    fun fillsEnclosedRegionNotOutside() {
        // 5x5 white with a green ring; fill the center -> only inside changes.
        val w = 5; val h = 5
        val px = grid(w, h, WHITE)
        // draw a green box border at radius 1 (a 3x3 ring around center)
        val ring = listOf(
            1 to 1, 2 to 1, 3 to 1,
            1 to 2, 3 to 2,
            1 to 3, 2 to 3, 3 to 3,
        )
        for ((x, y) in ring) px[y * w + x] = GREEN
        // center is (2,2)
        val r = FloodFill.fill(px, w, h, 2, 2, RED)
        assertTrue(r.changed)
        assertEquals(1, r.pixelsFilled)           // only the single enclosed pixel
        assertEquals(RED, px[2 * w + 2])
        // corners (outside the ring) stay white
        assertEquals(WHITE, px[0])
        assertEquals(WHITE, px[w * h - 1])
    }

    @Test
    fun fillsConcaveShape() {
        // An L / U shape connectivity test on a 3x3:
        // W W W
        // W B W
        // W W W   -> fill from corner reaches all 8 white pixels around the center B.
        val w = 3; val h = 3
        val px = grid(w, h, WHITE)
        px[1 * w + 1] = BLUE
        val r = FloodFill.fill(px, w, h, 0, 0, RED)
        assertEquals(8, r.pixelsFilled)
        assertEquals(BLUE, px[1 * w + 1]) // island untouched
    }

    @Test
    fun noopWhenSeedAlreadyFillColour() {
        val px = grid(3, 3, RED)
        val r = FloodFill.fill(px, 3, 3, 1, 1, RED)
        assertFalse(r.changed)
        assertEquals(0, r.pixelsFilled)
        assertNull(r.dirtyRect())
    }

    @Test
    fun outOfBoundsSeedIsNoop() {
        val px = grid(2, 2, WHITE)
        assertFalse(FloodFill.fill(px, 2, 2, -1, 0, RED).changed)
        assertFalse(FloodFill.fill(px, 2, 2, 0, 5, RED).changed)
    }

    @Test
    fun toleranceIncludesNearColours() {
        // Two near-white shades + a hard black wall.
        val almostWhite = 0xFFFAFAFA.toInt()
        val px = intArrayOf(WHITE, almostWhite, 0xFF000000.toInt(), WHITE)
        // tol 0: only the exact-white seed run (stops at almostWhite)
        val strict = FloodFill.fill(px.copyOf(), 4, 1, 0, 0, RED, tolerance = 0)
        assertEquals(1, strict.pixelsFilled)
        // tol 16: includes almostWhite, still stops at black wall
        val loose = FloodFill.fill(px.copyOf(), 4, 1, 0, 0, RED, tolerance = 16)
        assertEquals(2, loose.pixelsFilled)
    }

    @Test
    fun dirtyRectTracksFilledBoundsOnly() {
        // Fill a 2x2 block in the top-left of a 5x5; rect should be (0,0,2,2)-ish.
        val w = 5; val h = 5
        val px = grid(w, h, GREEN)            // background green
        // a white 2x2 block at top-left, rest green
        for (y in 0..1) for (x in 0..1) px[y * w + x] = WHITE
        val r = FloodFill.fill(px, w, h, 0, 0, RED)
        assertEquals(4, r.pixelsFilled)
        assertEquals(IntRect(0, 0, 2, 2), r.dirtyRect())
    }

    @Test
    fun largeRegionDoesNotStackOverflow() {
        // 600x600 uniform -> scanline must handle 360k pixels without recursion blowup.
        val w = 600; val h = 600
        val px = grid(w, h, WHITE)
        val r = FloodFill.fill(px, w, h, 300, 300, RED)
        assertTrue(r.changed)
        assertEquals(w * h, r.pixelsFilled)
        assertTrue(px.all { it == RED })
    }

    @Test
    fun spiralConnectivity() {
        // A thin connected white path that snakes; fill should follow all of it.
        // 5x5, walls = black, path = white forming an S.
        val B = 0xFF000000.toInt()
        val w = 5; val h = 5
        val px = intArrayOf(
            WHITE, WHITE, WHITE, WHITE, WHITE,
            B,     B,     B,     B,     WHITE,
            WHITE, WHITE, WHITE, WHITE, WHITE,
            WHITE, B,     B,     B,     B,
            WHITE, WHITE, WHITE, WHITE, WHITE,
        )
        val whiteCount = px.count { it == WHITE }
        val r = FloodFill.fill(px, w, h, 0, 0, RED)
        assertEquals(whiteCount, r.pixelsFilled) // the whole S path is connected
        assertTrue(px.none { it == WHITE })
    }
}
