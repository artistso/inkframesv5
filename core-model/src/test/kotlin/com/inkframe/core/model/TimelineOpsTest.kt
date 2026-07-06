package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class TimelineOpsTest {

    private fun layer(vararg cels: Pair<Int, Long>): Layer =
        Layer(id = "l", name = "L", cels = cels.associate { (f, sid) -> f to Cel(surfaceId = sid) })

    private fun scene(frameCount: Int, layers: List<Layer>, playback: IntRange? = null) =
        Scene(
            id = "s", name = "S", frameCount = frameCount, layers = layers,
            playbackRange = playback ?: (0 until frameCount),
        )

    // ---- Single-cel edits ---------------------------------------------------

    @Test
    fun clearCel_removesExplicitCelOnly() {
        val l = layer(0 to 10L, 5 to 20L)
        val cleared = TimelineOps.clearCel(l, 5)
        assertFalse(cleared.cels.containsKey(5))
        assertEquals(10L, cleared.cels[0]!!.surfaceId)
    }

    @Test
    fun clearCel_noopWhenNoExplicitCel() {
        val l = layer(0 to 10L)
        // Frame 3 only holds frame 0; clearing it changes nothing.
        assertSame(l, TimelineOps.clearCel(l, 3))
    }

    @Test
    fun moveCel_keepsSurfaceIdAndRelocates() {
        val l = layer(2 to 99L)
        val moved = TimelineOps.moveCel(l, 2, 7)
        assertNull(moved.cels[2])
        assertEquals(99L, moved.cels[7]!!.surfaceId)
    }

    @Test
    fun moveCel_overwritesDestination() {
        val l = layer(1 to 11L, 4 to 44L)
        val moved = TimelineOps.moveCel(l, 1, 4)
        assertEquals(1, moved.cels.size)
        assertEquals(11L, moved.cels[4]!!.surfaceId)
    }

    @Test
    fun moveCel_noopWhenSourceEmptyOrSameFrame() {
        val l = layer(1 to 11L)
        assertSame(l, TimelineOps.moveCel(l, 9, 3))
        assertSame(l, TimelineOps.moveCel(l, 1, 1))
    }

    @Test
    fun duplicateCel_usesNewSurfaceIdAndPreservesTransform() {
        val src = Cel(surfaceId = 5L, transform = CelTransform(tx = 8f, rotationDeg = 30f))
        val l = Layer(id = "l", name = "L", cels = mapOf(0 to src))
        val dup = TimelineOps.duplicateCel(l, 0, 1, newSurfaceId = 777L)
        assertEquals(5L, dup.cels[0]!!.surfaceId)          // original untouched
        assertEquals(777L, dup.cels[1]!!.surfaceId)        // copy is independent
        assertEquals(30f, dup.cels[1]!!.transform.rotationDeg, 1e-4f)
        // The two cels have distinct ids.
        assertTrue(dup.cels[0]!!.id != dup.cels[1]!!.id)
    }

    @Test
    fun pasteCel_createsIndependentCel() {
        val clip = Cel(surfaceId = 1L, transform = CelTransform(scaleX = 2f))
        val l = layer()
        val pasted = TimelineOps.pasteCel(l, 3, clip, newSurfaceId = 900L)
        assertEquals(900L, pasted.cels[3]!!.surfaceId)
        assertEquals(2f, pasted.cels[3]!!.transform.scaleX, 1e-4f)
    }

    @Test
    fun shiftCels_positiveMovesRightAndPreservesEarlier() {
        val l = layer(0 to 10L, 3 to 30L, 6 to 60L)
        val shifted = TimelineOps.shiftCels(l, fromFrame = 3, delta = 2)
        assertEquals(10L, shifted.cels[0]!!.surfaceId) // before fromFrame: unchanged
        assertEquals(30L, shifted.cels[5]!!.surfaceId) // 3 -> 5
        assertEquals(60L, shifted.cels[8]!!.surfaceId) // 6 -> 8
        assertNull(shifted.cels[3])
    }

    @Test
    fun shiftCels_negativeDropsBelowZero() {
        val l = layer(1 to 11L, 2 to 22L)
        val shifted = TimelineOps.shiftCels(l, fromFrame = 0, delta = -2)
        // 1 -> -1 (dropped), 2 -> 0 (kept)
        assertEquals(1, shifted.cels.size)
        assertEquals(22L, shifted.cels[0]!!.surfaceId)
    }

    // ---- Frame edits (whole scene) -----------------------------------------

    @Test
    fun insertFrames_growsCountAndShiftsAllLayers() {
        val a = layer(0 to 1L, 2 to 2L)
        val b = layer(2 to 3L)
        val s = scene(4, listOf(a, b))
        val r = TimelineOps.insertFrames(s, at = 1, count = 2)
        assertEquals(6, r.frameCount)
        // Layer a: frame 0 stays, frame 2 -> 4.
        assertEquals(1L, r.layers[0].cels[0]!!.surfaceId)
        assertEquals(2L, r.layers[0].cels[4]!!.surfaceId)
        // Layer b: frame 2 -> 4.
        assertEquals(3L, r.layers[1].cels[4]!!.surfaceId)
    }

    @Test
    fun insertFrames_shiftsPlaybackRange() {
        val s = scene(10, listOf(layer(0 to 1L)), playback = 2..6)
        val r = TimelineOps.insertFrames(s, at = 0, count = 3)
        assertEquals(13, r.frameCount)
        assertEquals(5..9, r.playbackRange)
    }

    @Test
    fun removeFrames_deletesAndShiftsLeft() {
        val a = layer(0 to 1L, 2 to 2L, 5 to 5L)
        val s = scene(6, listOf(a))
        val r = TimelineOps.removeFrames(s, at = 2, count = 2) // remove frames 2,3
        assertEquals(4, r.frameCount)
        assertEquals(1L, r.layers[0].cels[0]!!.surfaceId)  // before range
        assertNull(r.layers[0].cels[2])                    // 2 removed
        assertEquals(5L, r.layers[0].cels[3]!!.surfaceId)  // 5 -> 3
    }

    @Test
    fun removeFrames_neverDropsBelowOneFrame() {
        val s = scene(3, listOf(layer(0 to 1L)))
        val r = TimelineOps.removeFrames(s, at = 0, count = 99)
        assertEquals(1, r.frameCount)
    }

    @Test
    fun removeFrames_clampsPlaybackRange() {
        val s = scene(10, listOf(layer()), playback = 4..9)
        val r = TimelineOps.removeFrames(s, at = 0, count = 7) // keep 3 frames
        assertEquals(3, r.frameCount)
        assertTrue(r.playbackRange.first in 0..2)
        assertTrue(r.playbackRange.last in 0..2)
        assertTrue(r.playbackRange.first <= r.playbackRange.last)
    }

    @Test
    fun extendExposure_holdsCurrentDrawingLonger() {
        // Cel on 0 and 1; extending exposure of frame 0 by 2 pushes frame 1's cel to 3.
        val a = layer(0 to 10L, 1 to 11L)
        val s = scene(2, listOf(a))
        val r = TimelineOps.extendExposure(s, frame = 0, holdFrames = 2)
        assertEquals(4, r.frameCount)
        assertEquals(10L, r.layers[0].cels[0]!!.surfaceId)
        assertEquals(11L, r.layers[0].cels[3]!!.surfaceId)
        // Frames 1 and 2 now hold the cel from frame 0 (exposure-sheet behaviour).
        assertEquals(10L, r.layers[0].celAt(1)?.surfaceId)
        assertEquals(10L, r.layers[0].celAt(2)?.surfaceId)
    }

    @Test(expected = IllegalArgumentException::class)
    fun insertFrames_rejectsNonPositiveCount() {
        TimelineOps.insertFrames(scene(3, listOf(layer())), at = 0, count = 0)
    }
}
