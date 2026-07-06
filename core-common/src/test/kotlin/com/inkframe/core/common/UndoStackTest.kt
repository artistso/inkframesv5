package com.inkframe.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UndoStackTest {

    /** A trivial command that mutates a single-element int holder. */
    private class IncCommand(val box: IntArray, val by: Int, override val label: String = "inc") : Command {
        override fun apply() { box[0] += by }
        override fun revert() { box[0] -= by }
    }

    @Test
    fun push_appliesImmediately() {
        val box = intArrayOf(0)
        val s = UndoStack()
        s.push(IncCommand(box, 5))
        assertEquals(5, box[0])
        assertTrue(s.canUndo)
        assertFalse(s.canRedo)
    }

    @Test
    fun undoThenRedo_restoresState() {
        val box = intArrayOf(0)
        val s = UndoStack()
        s.push(IncCommand(box, 3))
        s.push(IncCommand(box, 4))
        assertEquals(7, box[0])

        assertTrue(s.undo())
        assertEquals(3, box[0])
        assertTrue(s.undo())
        assertEquals(0, box[0])
        assertFalse(s.undo())   // nothing left

        assertTrue(s.redo())
        assertEquals(3, box[0])
        assertTrue(s.redo())
        assertEquals(7, box[0])
        assertFalse(s.redo())
    }

    @Test
    fun newPush_clearsRedoBranch() {
        val box = intArrayOf(0)
        val s = UndoStack()
        s.push(IncCommand(box, 1))
        s.undo()
        assertTrue(s.canRedo)
        s.push(IncCommand(box, 10))
        assertFalse(s.canRedo)
        assertEquals(10, box[0])
    }

    @Test
    fun labels_reflectTopOfEachStack() {
        val box = intArrayOf(0)
        val s = UndoStack()
        s.push(IncCommand(box, 1, label = "first"))
        assertEquals("first", s.undoLabel)
        assertNull(s.redoLabel)
        s.undo()
        assertEquals("first", s.redoLabel)
        assertNull(s.undoLabel)
    }

    @Test
    fun capacity_dropsOldestCommands() {
        val box = intArrayOf(0)
        val s = UndoStack(capacity = 3)
        repeat(5) { s.push(IncCommand(box, 1)) }
        assertEquals(5, box[0])
        // Only 3 commands retained; undoing all of them reverts 3, not 5.
        var undos = 0
        while (s.undo()) undos++
        assertEquals(3, undos)
        assertEquals(2, box[0]) // 5 - 3 reverted
    }

    @Test
    fun clear_emptiesBothStacks() {
        val box = intArrayOf(0)
        val s = UndoStack()
        s.push(IncCommand(box, 1))
        s.undo()
        s.clear()
        assertFalse(s.canUndo)
        assertFalse(s.canRedo)
    }
}
