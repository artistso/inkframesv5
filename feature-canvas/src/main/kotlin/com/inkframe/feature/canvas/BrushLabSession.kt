package com.inkframe.feature.canvas

import com.inkframe.core.model.Brush
import com.inkframe.core.model.BrushAdjustments
import com.inkframe.core.model.DefaultBrushes

/**
 * Small session-only profile cache used by the native Brush Lab.
 *
 * The Glass Horizon tool node still selects brushes by assigning a factory profile to
 * [StudioState.brush]. [observe] recognizes that brush-id transition, saves the brush the
 * artist was editing, and restores any prior edits for the newly selected brush. Nothing
 * is written to the project document and no account, network, or browser storage exists.
 */
internal class BrushLabSession(
    defaults: List<Brush> = DefaultBrushes.all,
) {
    private val profiles = defaults.associateByTo(linkedMapOf()) { it.id }
    private var active: Brush? = null

    /** Reconciles a newly observed StudioState brush with this session's saved profile. */
    fun observe(incoming: Brush): Brush {
        val previous = active
        if (previous == null) {
            active = incoming
            profiles[incoming.id] = incoming
            return incoming
        }

        if (previous.id == incoming.id) {
            active = incoming
            profiles[incoming.id] = incoming
            return incoming
        }

        profiles[previous.id] = previous
        val restored = profiles[incoming.id] ?: incoming
        active = restored
        profiles[restored.id] = restored
        return restored
    }

    /** Records a live Brush Lab edit and returns it for direct StudioState assignment. */
    fun record(updated: Brush): Brush {
        active = updated
        profiles[updated.id] = updated
        return updated
    }

    /** Resets only the active brush profile to its factory definition. */
    fun reset(brush: Brush): Brush = record(BrushAdjustments.resetToDefault(brush))

    internal fun profile(id: String): Brush? = profiles[id]
}
