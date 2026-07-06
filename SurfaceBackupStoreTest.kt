package com.inkframe.engine.gl

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SurfaceBackupStoreTest {

    @Test
    fun putAndGet_roundTripsSnapshot() {
        val store = SurfaceBackupStore()
        val px = IntArray(4) { it }
        store.put(7L, 2, 2, px)
        val snap = store.get(7L)!!
        assertEquals(2, snap.width)
        assertEquals(2, snap.height)
        assertArrayEquals(px, snap.argb)
        assertTrue(store.contains(7L))
        assertEquals(1, store.size)
    }

    @Test
    fun get_missingReturnsNull() {
        assertNull(SurfaceBackupStore().get(99L))
    }

    @Test(expected = IllegalArgumentException::class)
    fun put_rejectsMismatchedPixelCount() {
        SurfaceBackupStore().put(1L, 4, 4, IntArray(10))
    }

    @Test
    fun remove_andClear() {
        val store = SurfaceBackupStore()
        store.put(1L, 1, 1, IntArray(1))
        store.put(2L, 1, 1, IntArray(1))
        store.remove(1L)
        assertFalse(store.contains(1L))
        assertEquals(1, store.size)
        store.clear()
        assertEquals(0, store.size)
    }

    @Test
    fun retainOnly_dropsUnreferencedSurfaces() {
        val store = SurfaceBackupStore()
        store.put(1L, 1, 1, IntArray(1))
        store.put(2L, 1, 1, IntArray(1))
        store.put(3L, 1, 1, IntArray(1))
        store.retainOnly(setOf(2L, 3L))
        assertEquals(setOf(2L, 3L), store.surfaceIds)
    }

    @Test
    fun byteSize_reportsApproximateHeapCost() {
        val store = SurfaceBackupStore()
        store.put(1L, 10, 10, IntArray(100)) // 100 px * 4 bytes = 400
        store.put(2L, 5, 5, IntArray(25))    // 25 px * 4 = 100
        assertEquals(500L, store.byteSize())
    }

    @Test
    fun put_overwritesExistingSnapshot() {
        val store = SurfaceBackupStore()
        store.put(1L, 1, 1, intArrayOf(0xAAAAAAAA.toInt()))
        store.put(1L, 1, 1, intArrayOf(0xBBBBBBBB.toInt()))
        assertEquals(0xBBBBBBBB.toInt(), store.get(1L)!!.argb[0])
        assertEquals(1, store.size)
    }
}
