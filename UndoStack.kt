package com.inkframe.core.common

/**
 * A reversible operation on the document. Implementations must make [apply] and
 * [revert] exact inverses so undo/redo stays consistent.
 */
interface Command {
    val label: String
    fun apply()
    fun revert()
}

/**
 * Bounded undo/redo history. New commands clear the redo branch. The capacity guard
 * keeps memory bounded for long drawing sessions.
 */
class UndoStack(private val capacity: Int = 200) {
    private val undo = ArrayDeque<Command>()
    private val redo = ArrayDeque<Command>()

    val canUndo: Boolean get() = undo.isNotEmpty()
    val canRedo: Boolean get() = redo.isNotEmpty()
    val undoLabel: String? get() = undo.lastOrNull()?.label
    val redoLabel: String? get() = redo.lastOrNull()?.label

    /** Executes [command] immediately and records it for later undo. */
    fun push(command: Command) {
        command.apply()
        record(command)
    }

    /**
     * Records a command whose effect is **already** present in the document, without
     * re-running [Command.apply]. Use this for actions that were performed directly
     * (e.g. a brush stroke painted live onto the canvas) so they become undoable without
     * a redundant re-apply. Like [push], this clears the redo branch.
     */
    fun pushAlreadyApplied(command: Command) {
        record(command)
    }

    private fun record(command: Command) {
        undo.addLast(command)
        if (undo.size > capacity) undo.removeFirst()
        redo.clear()
    }

    fun undo(): Boolean {
        val c = undo.removeLastOrNull() ?: return false
        c.revert()
        redo.addLast(c)
        return true
    }

    fun redo(): Boolean {
        val c = redo.removeLastOrNull() ?: return false
        c.apply()
        undo.addLast(c)
        return true
    }

    fun clear() {
        undo.clear(); redo.clear()
    }
}
