package com.inkframe.engine.gl

import java.util.concurrent.ConcurrentHashMap

/**
 * CPU-side snapshot of every cel surface, kept in plain heap memory so it **survives GL
 * context loss** (when Android destroys the EGL context on backgrounding, all textures
 * and FBOs become invalid, but this store does not).
 *
 * Surfaces are stored as top-down ARGB int arrays (the same orientation used by
 * save/load and export). The store is the single source of truth used to re-upload
 * artwork into a freshly-created [PaintEngine] after the context is recreated.
 *
 * It is also a lightweight in-memory autosave: backing up here is far cheaper than
 * writing a full `.inkframe` package, yet enough to restore an in-progress session.
 */
class SurfaceBackupStore {

    /** One backed-up surface: dimensions plus its top-down ARGB pixels. */
    class Snapshot(val width: Int, val height: Int, val argb: IntArray)

    private val snapshots = ConcurrentHashMap<Long, Snapshot>()

    val size: Int get() = snapshots.size
    val surfaceIds: Set<Long> get() = snapshots.keys.toSet()

    fun put(surfaceId: Long, width: Int, height: Int, argb: IntArray) {
        require(argb.size == width * height) { "argb size ${argb.size} != ${width}x$height" }
        snapshots[surfaceId] = Snapshot(width, height, argb)
    }

    fun get(surfaceId: Long): Snapshot? = snapshots[surfaceId]

    fun contains(surfaceId: Long): Boolean = snapshots.containsKey(surfaceId)

    fun remove(surfaceId: Long) { snapshots.remove(surfaceId) }

    fun clear() = snapshots.clear()

    /** Approximate heap cost of all snapshots, for memory budgeting / diagnostics. */
    fun byteSize(): Long = snapshots.values.sumOf { it.argb.size.toLong() * 4 }

    /** Removes snapshots whose ids are not in [keep] (e.g. surfaces no longer referenced). */
    fun retainOnly(keep: Set<Long>) {
        val toRemove = snapshots.keys.filter { it !in keep }
        toRemove.forEach { snapshots.remove(it) }
    }
}
