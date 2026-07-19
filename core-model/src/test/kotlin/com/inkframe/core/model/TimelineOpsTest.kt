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

    private fun scene(
        frameCount: Int,
        layers: List<Layer>,
        playback: IntRange? = null,
        holds: List<Int> = List(frameCount) { 1 },
    ) = Scene(
        id = "s",
        name = "S",
        frameCount = frameCount,
        layers = layers,
        playbackRange = playback ?: (0 until frameCount),
        holds = holds,
    )

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
        assertEquals(5L, dup.cels[0]!!.surfaceId)
        assertEquals(777L, dup.cels[1]!!.surfaceId)
        assertEquals(30f, dup.cels[1]!!.transform.rotationDeg, 1e-4f)
        assertTrue(dup.cels[0]!!.id != dup.cels[1]!!.id)
    }

    @Test
    fun pasteCel_createsIndependentCel() {
        val clip = Cel(surfaceId = 1L, transform = CelTransform(scaleX = 2f))
        val pasted = TimelineOps.pasteCel(layer(), 3, clip, newSurfaceId = 900L)
        assertEquals(900L, pasted.cels[3]!!.surfaceId)
        assertEquals(2f, pasted.cels[3]!!.transform.scaleX, 1e-4f)
    }

    @Test
    fun shiftCels_positiveMovesRightAndPreservesEarlier() {
        val shifted = TimelineOps.shiftCels(layer(0 to 10L, 3 to 30L, 6 to 60L), 3, 2)
        assertEquals(10L, shifted.cels[0]!!.surfaceId)
        assertEquals(30L, shifted.cels[5]!!.surfaceId)
        assertEquals(60L, shifted.cels[8]!!.surfaceId)
        assertNull(shifted.cels[3])
    }

    @Test
    fun shiftCels_negativeDropsBelowZero() {
        val shifted = TimelineOps.shiftCels(layer(1 to 11L, 2 to 22L), 0, -2)
        assertEquals(1, shifted.cels.size)
        assertEquals(22L, shifted.cels[0]!!.surfaceId)
    }

    @Test
    fun insertFrames_growsCountShiftsLayersAndInsertsUnitHolds() {
        val a = layer(0 to 1L, 2 to 2L)
        val b = layer(2 to 3L)
        val r = TimelineOps.insertFrames(
            scene(4, listOf(a, b), holds = listOf(1, 2, 3, 4)),
            at = 1,
            count = 2,
        )
        assertEquals(6, r.frameCount)
        assertEquals(listOf(1, 1, 1, 2, 3, 4), r.holds)
        assertEquals(1L, r.layers[0].cels[0]!!.surfaceId)
        assertEquals(2L, r.layers[0].cels[4]!!.surfaceId)
        assertEquals(3L, r.layers[1].cels[4]!!.surfaceId)
    }

    @Test
    fun insertFrames_shiftsPlaybackRange() {
        val r = TimelineOps.insertFrames(scene(10, listOf(layer(0 to 1L)), playback = 2..6), 0, 3)
        assertEquals(13, r.frameCount)
        assertEquals(5..9, r.playbackRange)
    }

    @Test
    fun removeFrames_deletesCelsAndMatchingHolds() {
        val a = layer(0 to 1L, 2 to 2L, 5 to 5L)
        val r = TimelineOps.removeFrames(
            scene(6, listOf(a), holds = listOf(1, 2, 3, 4, 5, 6)),
            at = 2,
            count = 2,
        )
        assertEquals(4, r.frameCount)
        assertEquals(listOf(1, 2, 5, 6), r.holds)
        assertEquals(1L, r.layers[0].cels[0]!!.surfaceId)
        assertNull(r.layers[0].cels[2])
        assertEquals(5L, r.layers[0].cels[3]!!.surfaceId)
    }

    @Test
    fun removeFrames_neverDropsBelowOneFrame() {
        val r = TimelineOps.removeFrames(scene(3, listOf(layer(0 to 1L))), 0, 99)
        assertEquals(1, r.frameCount)
        assertEquals(listOf(1), r.holds)
    }

    @Test
    fun removeFrames_clampsPlaybackRange() {
        val r = TimelineOps.removeFrames(scene(10, listOf(layer()), playback = 4..9), 0, 7)
        assertEquals(3, r.frameCount)
        assertTrue(r.playbackRange.first in 0..2)
        assertTrue(r.playbackRange.last in 0..2)
        assertTrue(r.playbackRange.first <= r.playbackRange.last)
    }

    @Test
    fun extendExposure_increasesHoldWithoutAddingFakeFrames() {
        val a = layer(0 to 10L, 1 to 11L)
        val r = TimelineOps.extendExposure(scene(2, listOf(a)), frame = 0, holdFrames = 2)
        assertEquals(2, r.frameCount)
        assertEquals(listOf(3, 1), r.holds)
        assertEquals(10L, r.layers[0].cels[0]!!.surfaceId)
        assertEquals(11L, r.layers[0].cels[1]!!.surfaceId)
    }

    @Test
    fun setHold_clampsToOneThroughEight() {
        val s = scene(2, listOf(layer()))
        assertEquals(1, TimelineOps.setHold(s, 0, -4).holdAt(0))
        assertEquals(8, TimelineOps.setHold(s, 0, 99).holdAt(0))
    }

    @Test(expected = IllegalArgumentException::class)
    fun insertFrames_rejectsNonPositiveCount() {
        TimelineOps.insertFrames(scene(3, listOf(layer())), at = 0, count = 0)
    }
}
