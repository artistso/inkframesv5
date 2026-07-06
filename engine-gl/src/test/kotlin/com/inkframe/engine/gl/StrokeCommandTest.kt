package com.inkframe.engine.gl

import com.inkframe.core.common.IntRect
import com.inkframe.core.common.UndoStack
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer

/**
 * Tests [StrokeCommand] and the [UndoStack.pushAlreadyApplied] flow using an in-memory
 * fake "surface" instead of GL. The command's restore lambda is injected, so the whole
 * undo/redo round-trip is verifiable on the plain JVM.
 */
class StrokeCommandTest {

    /** A fake cel: a single byte array we restore snapshots into. */
    private class FakeCel(size: Int) {
        val pixels = ByteArray(size)
        fun snapshot(): ByteBuffer = ByteBuffer.allocate(pixels.size).put(pixels).also { it.position(0) }
        fun restore(buf: ByteBuffer) {
            buf.position(0)
            buf.get(pixels)
        }
    }

    private fun buf(vararg bytes: Int): ByteBuffer =
        ByteBuffer.allocate(bytes.size).apply { bytes.forEach { put(it.toByte()) }; position(0) }

    @Test
    fun command_apply_restoresAfter_revert_restoresBefore() {
        val cel = FakeCel(4)
        val before = buf(0, 0, 0, 0)
        val after = buf(10, 20, 30, 40)
        val rect = IntRect(0, 0, 2, 2)
        val snapshot = StrokeSnapshot(surfaceId = 1L, rect = rect, before = before, after = after)

        // restore lambda copies the given snapshot into the fake cel.
        val cmd = StrokeCommand(snapshot, restore = { _, _, pixels -> cel.restore(pixels) })

        cmd.revert()
        assertArrayEquals(byteArrayOf(0, 0, 0, 0), cel.pixels)
        cmd.apply()
        assertArrayEquals(byteArrayOf(10, 20, 30, 40), cel.pixels)
    }

    @Test
    fun undoStack_pushAlreadyApplied_doesNotReapply() {
        val cel = FakeCel(2)
        // Simulate: stroke already painted "after" onto the cel.
        cel.pixels[0] = 5; cel.pixels[1] = 6

        val before = buf(0, 0)
        val after = buf(5, 6)
        val snapshot = StrokeSnapshot(1L, IntRect(0, 0, 1, 2), before, after)
        var applyCount = 0
        val cmd = StrokeCommand(snapshot, restore = { _, _, pixels ->
            applyCount++
            cel.restore(pixels)
        })

        val stack = UndoStack()
        stack.pushAlreadyApplied(cmd)
        assertEquals("registering must not re-apply", 0, applyCount)
        assertTrue(stack.canUndo)
        assertFalse(stack.canRedo)

        assertTrue(stack.undo())
        assertArrayEquals(byteArrayOf(0, 0), cel.pixels)   // reverted to before

        assertTrue(stack.redo())
        assertArrayEquals(byteArrayOf(5, 6), cel.pixels)   // re-applied to after
    }

    @Test
    fun byteSize_reportsSnapshotCost() {
        val snapshot = StrokeSnapshot(1L, IntRect(0, 0, 4, 4), buf(*IntArray(16)), buf(*IntArray(16)))
        val cmd = StrokeCommand(snapshot, restore = { _, _, _ -> })
        assertEquals(32, cmd.byteSize)
    }

    @Test
    fun multipleStrokes_undoRedoInOrder() {
        val cel = FakeCel(1)
        val stack = UndoStack()

        fun stroke(beforeVal: Int, afterVal: Int) {
            cel.pixels[0] = afterVal.toByte()  // "paint"
            val snap = StrokeSnapshot(1L, IntRect(0, 0, 1, 1), buf(beforeVal), buf(afterVal))
            stack.pushAlreadyApplied(StrokeCommand(snap, restore = { _, _, p -> cel.restore(p) }))
        }

        stroke(0, 1)
        stroke(1, 2)
        stroke(2, 3)
        assertEquals(3, cel.pixels[0].toInt())

        stack.undo(); assertEquals(2, cel.pixels[0].toInt())
        stack.undo(); assertEquals(1, cel.pixels[0].toInt())
        stack.redo(); assertEquals(2, cel.pixels[0].toInt())
        stack.undo(); assertEquals(1, cel.pixels[0].toInt())
        stack.undo(); assertEquals(0, cel.pixels[0].toInt())
        assertFalse(stack.undo())
    }
}
