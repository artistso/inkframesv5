package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TimelineDragTest {

    // Cells 10 wide, 2 spacing -> pitch 12, strip starting at x=0.
    private val w = 10f
    private val gap = 2f

    @Test
    fun frameAt_mapsWithinCells() {
        assertEquals(0, TimelineDrag.frameAt(0f, 8, w, gap))
        assertEquals(0, TimelineDrag.frameAt(5f, 8, w, gap))   // inside cell 0
        assertEquals(1, TimelineDrag.frameAt(12f, 8, w, gap))  // start of cell 1
        assertEquals(2, TimelineDrag.frameAt(25f, 8, w, gap))  // inside cell 2 (24..34)
    }

    @Test
    fun frameAt_clampsOutOfRange() {
        assertEquals(0, TimelineDrag.frameAt(-50f, 8, w, gap))
        assertEquals(7, TimelineDrag.frameAt(9999f, 8, w, gap))
    }

    @Test
    fun frameAt_honoursStripStart() {
        // Strip offset by 100; x=106 is inside cell 0.
        assertEquals(0, TimelineDrag.frameAt(106f, 8, w, gap, stripStart = 100f))
        assertEquals(1, TimelineDrag.frameAt(112f, 8, w, gap, stripStart = 100f))
    }

    @Test
    fun resolveDrag_movesBetweenCells() {
        // cel exists at frame 1; drag from cell 1 (~x14) to cell 4 (~x50)
        val r = TimelineDrag.resolveDrag(14f, 50f, 8, w, gap) { it == 1 }
        assertEquals(TimelineDrag.DragResult(1, 4), r)
        assertTrue(r!!.isMove)
    }

    @Test
    fun resolveDrag_nullWhenSourceHasNoCel() {
        // No cel at the start cell -> null (caller treats as a tap/seek instead).
        val r = TimelineDrag.resolveDrag(14f, 50f, 8, w, gap) { false }
        assertNull(r)
    }

    @Test
    fun resolveDrag_sameCellIsNotAMove() {
        val r = TimelineDrag.resolveDrag(14f, 18f, 8, w, gap) { it == 1 }
        assertEquals(TimelineDrag.DragResult(1, 1), r)
        assertTrue(!r!!.isMove)
    }

    @Test
    fun resolveDrag_clampsDestinationToStrip() {
        // Drag far past the right edge clamps to last frame.
        val r = TimelineDrag.resolveDrag(14f, 9999f, 6, w, gap) { it == 1 }
        assertEquals(5, r!!.to)
    }

    @Test
    fun frameAt_singleFrameAlwaysZero() {
        assertEquals(0, TimelineDrag.frameAt(500f, 1, w, gap))
    }

    @Test(expected = IllegalArgumentException::class)
    fun frameAt_rejectsZeroFrameCount() {
        TimelineDrag.frameAt(0f, 0, w, gap)
    }

    @Test(expected = IllegalArgumentException::class)
    fun frameAt_rejectsNonPositiveCellWidth() {
        TimelineDrag.frameAt(0f, 8, 0f, gap)
    }
}
