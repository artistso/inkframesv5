package com.inkframe.core.model

/**
 * Settings for multi-frame onion skinning: how many neighbouring drawings to ghost on
 * each side, how strongly they fade with distance, and the tint colours that distinguish
 * past from future frames (classic red = before, blue = after).
 */
data class OnionSkinSettings(
    val enabled: Boolean = true,
    val framesBefore: Int = 1,
    val framesAfter: Int = 1,
    /** Opacity of the nearest ghost frame. */
    val nearOpacity: Float = 0.35f,
    /** Opacity of the farthest ghost frame (linear falloff between near and far). */
    val farOpacity: Float = 0.10f,
    val beforeTint: RgbaColor = RgbaColor(0.95f, 0.25f, 0.25f), // red-ish (past)
    val afterTint: RgbaColor = RgbaColor(0.25f, 0.55f, 0.95f),  // blue-ish (future)
    /** How strongly the tint colour replaces the ghost's own colour, 0..1. */
    val tintStrength: Float = 0.6f,
) {
    init {
        require(framesBefore in 0..MAX_RANGE) { "framesBefore out of range" }
        require(framesAfter in 0..MAX_RANGE) { "framesAfter out of range" }
    }

    companion object {
        const val MAX_RANGE = 8
    }
}

/** One onion-skin ghost to composite below the current frame. */
data class OnionGhost(
    val surfaceId: Long,
    val opacity: Float,
    val tint: RgbaColor,
    val tintStrength: Float,
    /** Signed frame offset from the current frame (negative = before, positive = after). */
    val offset: Int,
)

/**
 * Pure planner that turns [OnionSkinSettings] into a list of [OnionGhost]s for a given
 * current frame. It is decoupled from the document type via [surfaceAt], a lookup of the
 * explicit drawing at a frame (`null` if that frame has no drawing), so the
 * frame-selection and opacity-falloff math is unit-tested without GL or Android.
 *
 * Ghosts are ordered farthest → nearest so that, when composited bottom-up, nearer
 * frames sit on top of farther ones.
 */
object OnionSkinPlanner {

    fun plan(
        currentFrame: Int,
        settings: OnionSkinSettings,
        surfaceAt: (frame: Int) -> Long?,
    ): List<OnionGhost> {
        if (!settings.enabled) return emptyList()
        val ghosts = ArrayList<OnionGhost>()

        // Collect both sides, then sort farthest-first for correct stacking.
        for (d in settings.framesBefore downTo 1) {
            val sid = surfaceAt(currentFrame - d) ?: continue
            ghosts += OnionGhost(
                surfaceId = sid,
                opacity = opacityForDistance(d, settings.framesBefore, settings),
                tint = settings.beforeTint,
                tintStrength = settings.tintStrength,
                offset = -d,
            )
        }
        for (d in settings.framesAfter downTo 1) {
            val sid = surfaceAt(currentFrame + d) ?: continue
            ghosts += OnionGhost(
                surfaceId = sid,
                opacity = opacityForDistance(d, settings.framesAfter, settings),
                tint = settings.afterTint,
                tintStrength = settings.tintStrength,
                offset = d,
            )
        }

        // Stack farthest first (largest |offset|), nearest last (drawn on top).
        return ghosts.sortedByDescending { kotlin.math.abs(it.offset) }
    }

    /**
     * Linear opacity falloff: distance 1 → nearOpacity, distance [count] → farOpacity.
     * With a single frame on that side, uses nearOpacity.
     */
    private fun opacityForDistance(distance: Int, count: Int, s: OnionSkinSettings): Float {
        if (count <= 1) return s.nearOpacity
        val t = (distance - 1).toFloat() / (count - 1).toFloat() // 0 at nearest, 1 at farthest
        return s.nearOpacity + (s.farOpacity - s.nearOpacity) * t
    }
}
