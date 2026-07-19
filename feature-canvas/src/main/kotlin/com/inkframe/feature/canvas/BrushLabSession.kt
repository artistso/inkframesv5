package com.inkframe.feature.canvas

import com.inkframe.core.model.Brush
import com.inkframe.core.model.BrushAdjustments
import com.inkframe.core.model.DefaultBrushes
import java.util.WeakHashMap

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
        val normalizedIncoming = BrushAdjustments.normalized(incoming)
        val previous = active
        if (previous == null) {
            active = normalizedIncoming
            profiles[normalizedIncoming.id] = normalizedIncoming
            return normalizedIncoming
        }

        if (previous.id == normalizedIncoming.id) {
            active = normalizedIncoming
            profiles[normalizedIncoming.id] = normalizedIncoming
            return normalizedIncoming
        }

        profiles[previous.id] = previous
        val restored = BrushAdjustments.normalized(profiles[normalizedIncoming.id] ?: normalizedIncoming)
        active = restored
        profiles[restored.id] = restored
        return restored
    }

    /** Records a live Brush Lab edit and returns it for direct StudioState assignment. */
    fun record(updated: Brush): Brush {
        val normalized = BrushAdjustments.normalized(updated)
        active = normalized
        profiles[normalized.id] = normalized
        return normalized
    }

    /** Resets only the active brush profile to its factory definition. */
    fun reset(brush: Brush): Brush = record(BrushAdjustments.resetToDefault(brush))

    internal fun profile(id: String): Brush? = profiles[id]
}

/**
 * Associates the cache with the configuration-surviving [StudioState] ViewModel.
 *
 * Compose's plain `remember` is recreated with the Activity. The weak-keyed registry keeps
 * inactive brush profiles for as long as the ViewModel exists, while allowing the complete
 * entry to be collected once that studio session is destroyed.
 */
internal object BrushLabSessionRegistry {
    private val sessions = WeakHashMap<StudioState, BrushLabSession>()

    @Synchronized
    fun forState(state: StudioState): BrushLabSession =
        sessions.getOrPut(state) { BrushLabSession() }
}
