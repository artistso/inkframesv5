package com.inkframe.core.model

import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

enum class StudioTimelineExposureUpdate {
    ACCEPTED_CHANGED,
    ACCEPTED_UNCHANGED,
    REJECTED_INVALID,
}

/** Thread-safe read-only holder for the latest typed timeline/exposure projection. */
class StudioTimelineExposureMirror {
    private val current = AtomicReference<StudioTimelineExposureSnapshot?>(null)
    private val generationCounter = AtomicLong(0L)

    val generation: Long
        get() = generationCounter.get()

    fun snapshot(): StudioTimelineExposureSnapshot? = current.get()

    fun update(candidate: StudioTimelineExposureSnapshot): StudioTimelineExposureUpdate {
        val validated = candidate.validatedOrNull()
            ?: return StudioTimelineExposureUpdate.REJECTED_INVALID
        val previous = current.getAndSet(validated)
        return if (previous == validated) {
            StudioTimelineExposureUpdate.ACCEPTED_UNCHANGED
        } else {
            generationCounter.incrementAndGet()
            StudioTimelineExposureUpdate.ACCEPTED_CHANGED
        }
    }

    fun clear() {
        if (current.getAndSet(null) != null) generationCounter.incrementAndGet()
    }
}
