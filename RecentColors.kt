package com.inkframe.core.model

/**
 * A bounded most-recently-used list of colours for the picker's "recent" swatches.
 *
 * Adding a colour moves it to the front; duplicates (compared by packed ARGB, so tiny
 * float noise doesn't create near-identical entries) are de-duplicated; the list is
 * capped at [capacity]. Immutable — every mutation returns a new instance, so it slots
 * cleanly into observable UI state. Pure Kotlin.
 */
class RecentColors private constructor(
    val colors: List<RgbaColor>,
    private val capacity: Int,
) {
    val size: Int get() = colors.size

    /** Returns a new list with [color] promoted to the front, de-duplicated and capped. */
    fun add(color: RgbaColor): RecentColors {
        val key = color.toArgb()
        val deduped = colors.filter { it.toArgb() != key }
        val next = (listOf(color) + deduped).take(capacity)
        return RecentColors(next, capacity)
    }

    fun isEmpty(): Boolean = colors.isEmpty()

    companion object {
        const val DEFAULT_CAPACITY = 12

        fun empty(capacity: Int = DEFAULT_CAPACITY): RecentColors =
            RecentColors(emptyList(), capacity.coerceAtLeast(1))

        fun of(initial: List<RgbaColor>, capacity: Int = DEFAULT_CAPACITY): RecentColors {
            var rc = empty(capacity)
            // Add in reverse so the first element ends up at the front.
            for (c in initial.asReversed()) rc = rc.add(c)
            return rc
        }
    }
}
