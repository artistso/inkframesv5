package com.inkframe.engine.gl

import com.inkframe.core.common.Command
import com.inkframe.core.common.IntRect
import java.nio.ByteBuffer

/**
 * Captured before/after pixels for the dirty rectangle of one stroke, used to make the
 * stroke undoable without snapshotting the whole canvas.
 *
 * @param surfaceId the cel surface the stroke was applied to
 * @param rect the affected rectangle in GL (bottom-left origin) coordinates
 * @param before RGBA8 pixels of [rect] prior to the stroke
 * @param after  RGBA8 pixels of [rect] after the stroke
 */
class StrokeSnapshot(
    val surfaceId: Long,
    val rect: IntRect,
    val before: ByteBuffer,
    val after: ByteBuffer,
)

/**
 * An undoable stroke. [apply]/[revert] restore the after/before snapshot of the dirty
 * rectangle to the cel surface. The actual GL writes are delegated to [restore] so the
 * command stays free of GL bookkeeping (the engine supplies the restore lambda, which
 * it routes onto the GL thread).
 *
 * Note: [apply] is a *redo* (re-applies the finished stroke). When the engine first
 * pushes the command, the stroke is already on the cel, so the engine pushes it
 * **without** re-running apply (see PaintEngine.endStroke) to avoid a redundant write.
 */
class StrokeCommand(
    private val snapshot: StrokeSnapshot,
    private val restore: (surfaceId: Long, rect: IntRect, pixels: ByteBuffer) -> Unit,
    override val label: String = "Brush stroke",
) : Command {
    override fun apply() = restore(snapshot.surfaceId, snapshot.rect, snapshot.after)
    override fun revert() = restore(snapshot.surfaceId, snapshot.rect, snapshot.before)

    /** Approximate heap cost of this command's snapshots, for history budgeting. */
    val byteSize: Int get() = snapshot.before.capacity() + snapshot.after.capacity()
}
