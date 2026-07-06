package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RecentColorsTest {

    private val red = RgbaColor(1f, 0f, 0f)
    private val green = RgbaColor(0f, 1f, 0f)
    private val blue = RgbaColor(0f, 0f, 1f)

    @Test
    fun empty_hasNoColors() {
        val rc = RecentColors.empty()
        assertTrue(rc.isEmpty())
        assertEquals(0, rc.size)
    }

    @Test
    fun add_putsNewestFirst() {
        val rc = RecentColors.empty().add(red).add(green).add(blue)
        assertEquals(listOf(blue, green, red), rc.colors)
    }

    @Test
    fun add_deduplicatesAndPromotes() {
        val rc = RecentColors.empty().add(red).add(green).add(red)
        // red moves to front; only one red entry remains.
        assertEquals(listOf(red, green), rc.colors)
        assertEquals(2, rc.size)
    }

    @Test
    fun add_dedupesByPackedArgb() {
        // Two colours that pack to the same ARGB are treated as identical.
        val a = RgbaColor(0.5000f, 0f, 0f)
        val b = RgbaColor(0.5010f, 0f, 0f) // both round to 8-bit red 128
        assertEquals(a.toArgb(), b.toArgb())
        val rc = RecentColors.empty().add(a).add(b)
        assertEquals(1, rc.size)
    }

    @Test
    fun capacity_isEnforced() {
        var rc = RecentColors.empty(capacity = 3)
        rc = rc.add(red).add(green).add(blue).add(RgbaColor(1f, 1f, 0f))
        assertEquals(3, rc.size)
        // Oldest (red) was dropped.
        assertTrue(rc.colors.none { it.toArgb() == red.toArgb() })
    }

    @Test
    fun of_preservesOrderWithFirstAtFront() {
        val rc = RecentColors.of(listOf(red, green, blue))
        assertEquals(listOf(red, green, blue), rc.colors)
    }

    @Test
    fun immutability_addReturnsNewInstance() {
        val a = RecentColors.empty().add(red)
        val b = a.add(green)
        assertEquals(1, a.size) // original unchanged
        assertEquals(2, b.size)
    }

    @Test
    fun capacityAtLeastOne() {
        val rc = RecentColors.empty(capacity = 0).add(red).add(green)
        assertEquals(1, rc.size)
        assertEquals(green, rc.colors.first())
    }
}
