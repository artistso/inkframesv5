package com.inkframe.core.model.web

import java.util.concurrent.atomic.AtomicLong

/**
 * Monotonic layer-id source mirroring the web's module-global `let __lid=1` with
 * `id:__lid++` at every layer birth (i.html:1072, 1074); import re-issues ids through the
 * same counter (i.html:4559 `id:__lid++`, autosave.js `env.nextLayerId()`).
 *
 * First [next] returns 1, matching the web's post-increment read of a counter seeded at 1.
 * Thread-safe ([AtomicLong]) so document controllers on any thread can mint ids.
 */
class LayerIdGenerator {
    private val counter = AtomicLong(1L)

    /** Returns the current counter value and advances it (`__lid++`). */
    fun next(): Long = counter.getAndIncrement()

    /**
     * Guarantees every future [next] is strictly greater than [id]. Used after adopting
     * externally-minted layer ids so freshly created layers can never collide with them.
     */
    fun ensureAbove(id: Long) {
        counter.updateAndGet { cur -> if (id >= cur) if (id == Long.MAX_VALUE) Long.MAX_VALUE else id + 1 else cur }
    }
}
