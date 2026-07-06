package com.inkframe.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DirtyRegionTest {

    @Test
    fun empty_region_returnsNull() {
        val r = DirtyRegion()
        assertTrue(r.isEmpty)
        assertNull(r.toIntRect(100, 100))
    }

    @Test
    fun singleDab_boundsCoverCircleWithPadding() {
        val r = DirtyRegion()
        r.addCircle(50f, 50f, 20f) // radius 10 -> [40,60]
        val rect = r.toIntRect(100, 100, padding = 2)!!
        // 40-2 .. 60+2  => x=38, w=24
        assertEquals(38, rect.x)
        assertEquals(38, rect.y)
        assertEquals(24, rect.w)
        assertEquals(24, rect.h)
    }

    @Test
    fun multipleDabs_unionOfBounds() {
        val r = DirtyRegion()
        r.addCircle(20f, 20f, 10f)  // [15,25]
        r.addCircle(80f, 60f, 10f)  // [75,85] x, [55,65] y
        val rect = r.toIntRect(200, 200, padding = 0)!!
        assertEquals(15, rect.x)
        assertEquals(15, rect.y)
        assertEquals(70, rect.w)   // 85 - 15
        assertEquals(50, rect.h)   // 65 - 15
    }

    @Test
    fun bounds_clampedToCanvas() {
        val r = DirtyRegion()
        r.addCircle(5f, 5f, 40f)    // would extend to negative coords
        val rect = r.toIntRect(100, 100, padding = 0)!!
        assertEquals(0, rect.x)
        assertEquals(0, rect.y)
        assertTrue(rect.right <= 100)
        assertTrue(rect.bottom <= 100)
    }

    @Test
    fun fullyOffCanvas_returnsNull() {
        val r = DirtyRegion()
        r.addCircle(500f, 500f, 10f) // entirely outside a 100x100 canvas
        assertNull(r.toIntRect(100, 100, padding = 0))
    }

    @Test
    fun reset_clearsBounds() {
        val r = DirtyRegion()
        r.addCircle(50f, 50f, 20f)
        r.reset()
        assertTrue(r.isEmpty)
        assertNull(r.toIntRect(100, 100))
    }

    @Test
    fun intRect_derivedFieldsAreCorrect() {
        val rect = IntRect(10, 20, 30, 40)
        assertEquals(40, rect.right)
        assertEquals(60, rect.bottom)
        assertEquals(1200, rect.area)
    }
}
