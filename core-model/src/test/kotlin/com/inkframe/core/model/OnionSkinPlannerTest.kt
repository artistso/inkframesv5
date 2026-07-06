package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OnionSkinPlannerTest {

    /** A timeline where each frame index maps to surfaceId = frame*10 (or null if absent). */
    private fun surfaces(vararg present: Int): (Int) -> Long? {
        val set = present.toSet()
        return { f -> if (f in set) f * 10L else null }
    }

    @Test
    fun disabled_returnsNoGhosts() {
        val s = OnionSkinSettings(enabled = false, framesBefore = 2, framesAfter = 2)
        assertTrue(OnionSkinPlanner.plan(5, s, surfaces(3, 4, 6, 7)).isEmpty())
    }

    @Test
    fun singleBeforeAndAfter_pickNeighbours() {
        val s = OnionSkinSettings(framesBefore = 1, framesAfter = 1)
        val g = OnionSkinPlanner.plan(5, s, surfaces(4, 5, 6))
        assertEquals(2, g.size)
        // offsets present: -1 and +1
        assertEquals(setOf(-1, 1), g.map { it.offset }.toSet())
        assertEquals(40L, g.first { it.offset == -1 }.surfaceId)
        assertEquals(60L, g.first { it.offset == 1 }.surfaceId)
    }

    @Test
    fun missingFrames_areSkipped() {
        val s = OnionSkinSettings(framesBefore = 2, framesAfter = 2)
        // Only frame 3 and 7 exist around current=5 (4,6 missing).
        val g = OnionSkinPlanner.plan(5, s, surfaces(3, 7))
        assertEquals(setOf(-2, 2), g.map { it.offset }.toSet())
    }

    @Test
    fun ghostsOrderedFarthestFirst() {
        val s = OnionSkinSettings(framesBefore = 2, framesAfter = 2)
        val g = OnionSkinPlanner.plan(5, s, surfaces(3, 4, 6, 7))
        // Farthest (|offset|=2) must come before nearest (|offset|=1).
        val absSeq = g.map { kotlin.math.abs(it.offset) }
        assertEquals(absSeq.sortedDescending(), absSeq)
        assertEquals(2, absSeq.first())
        assertEquals(1, absSeq.last())
    }

    @Test
    fun beforeAndAfterTintsDiffer() {
        val s = OnionSkinSettings(framesBefore = 1, framesAfter = 1)
        val g = OnionSkinPlanner.plan(5, s, surfaces(4, 6))
        val before = g.first { it.offset == -1 }
        val after = g.first { it.offset == 1 }
        assertEquals(s.beforeTint, before.tint)
        assertEquals(s.afterTint, after.tint)
    }

    @Test
    fun opacityFalloff_nearIsStrongerThanFar() {
        val s = OnionSkinSettings(framesBefore = 3, framesAfter = 0, nearOpacity = 0.4f, farOpacity = 0.1f)
        val g = OnionSkinPlanner.plan(10, s, surfaces(7, 8, 9))
        val near = g.first { it.offset == -1 }.opacity
        val mid = g.first { it.offset == -2 }.opacity
        val far = g.first { it.offset == -3 }.opacity
        assertEquals(0.4f, near, 1e-4f)
        assertEquals(0.1f, far, 1e-4f)
        assertEquals(0.25f, mid, 1e-4f) // linear midpoint
        assertTrue(near > mid && mid > far)
    }

    @Test
    fun singleFrameSide_usesNearOpacity() {
        val s = OnionSkinSettings(framesBefore = 1, framesAfter = 0, nearOpacity = 0.33f)
        val g = OnionSkinPlanner.plan(5, s, surfaces(4))
        assertEquals(0.33f, g.single().opacity, 1e-4f)
    }

    @Test
    fun asymmetricRanges() {
        val s = OnionSkinSettings(framesBefore = 3, framesAfter = 1)
        val g = OnionSkinPlanner.plan(10, s, surfaces(7, 8, 9, 11))
        assertEquals(listOf(-3, -2, -1, 1).sorted(), g.map { it.offset }.sorted())
    }

    @Test
    fun zeroRangeBothSides_returnsEmpty() {
        val s = OnionSkinSettings(framesBefore = 0, framesAfter = 0)
        assertTrue(OnionSkinPlanner.plan(5, s, surfaces(4, 5, 6)).isEmpty())
    }

    @Test
    fun tintStrengthPropagated() {
        val s = OnionSkinSettings(framesBefore = 1, framesAfter = 0, tintStrength = 0.8f)
        val g = OnionSkinPlanner.plan(5, s, surfaces(4))
        assertEquals(0.8f, g.single().tintStrength, 1e-4f)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsRangeAboveMax() {
        OnionSkinSettings(framesBefore = OnionSkinSettings.MAX_RANGE + 1)
    }
}
