package com.inkframe.core.model.web

import com.inkframe.core.common.JsonValue

/**
 * Preferences schema — the `inkframe.prefs.v1` localStorage record
 * (i.html:918-1059; saved by `savePrefs` i.html:1044-1050).
 *
 * Global paint/UI flags plus the per-brush tuning maps. The two brush collections
 * stay **raw** ([JsonValue]) on purpose (M1_SPEC §PrefsSchema):
 *  - [brushPrefs] maps brush id → its 13-field profile object
 *    (`size,op,hard,minSize,stabilize,spacing,jitter,taperIn,taperOut,entryPool,
 *    exitPool,texture,response` — i.html:924-939,964-978). Seeding/merging those
 *    profiles against `DEFAULT_PROFILE` (i.html:947-978) is brush-model behavior,
 *    not codec behavior.
 *  - [brushLibrary] is the user-saved preset array (`{id,name≤60,brushId,profile,
 *    createdAt}`); the web sanitizes entries on load (i.html:1029-1038), which is
 *    likewise left to the runtime side.
 *
 * [penEngineVersion] always reads [PEN_ENGINE_VERSION] after a load: the web never
 * persists the stored value into runtime state — it only feeds the one-time
 * migration (i.html:1028) and writes the constant back out (i.html:1046).
 */
data class Prefs(
    /** Stroke colour (`color`, i.html:911). */
    val color: String = DEFAULT_COLOR,
    /** StreamLine smoothing 0 = raw … ~0.9 heavy (`streamline`, i.html:1863). */
    val streamline: Double = DEFAULT_STREAMLINE,
    /** Ignore touch input when a stylus is expected (i.html:911). */
    val stylusOnly: Boolean = false,
    /** Auto palm rejection, independent of [stylusOnly] (i.html:1805). */
    val palmReject: Boolean = true,
    /** High-readability UI text toggle (i.html:911). */
    val readableText: Boolean = false,
    /** Pen barrel/secondary-button behavior; one of [BARREL_MODES] (i.html:915-916). */
    val barrelMode: String = DEFAULT_BARREL_MODE,
    /** Always [PEN_ENGINE_VERSION] — see class KDoc (i.html:995,1028,1046). */
    val penEngineVersion: Int = PEN_ENGINE_VERSION,
    /** Onion-skin settings group (i.html:1231-1232 + the `onion` flag i.html:911). */
    val onion: Onion = Onion(),
    /** QuickShape master toggle (`qsEnabled`, i.html:1870). */
    val qsEnabled: Boolean = true,
    /** Active brush id; one of [BRUSH_IDS] (i.html:891-909,1039). */
    val brushId: String = DEFAULT_BRUSH_ID,
    /** Per-brush 13-field profiles, keyed by brush id — raw JSON. */
    val brushPrefs: Map<String, JsonValue> = emptyMap(),
    /** User-saved named presets array — raw JSON (i.html:941,1029-1038). */
    val brushLibrary: JsonValue = JsonValue.arr(emptyList()),
) {

    /**
     * Onion-skin group. Ranges enforced on load (i.html:1019-1022):
     * [depth] 0–8, [pastOpacity]/[futureOpacity] 0.02–0.85, [tint] 0–1.
     */
    data class Onion(
        /** Onion skin on/off (`onion`, i.html:911). */
        val enabled: Boolean = true,
        /** Ghost frame count each side (`onionDepth`, i.html:1231). */
        val depth: Int = DEFAULT_DEPTH,
        /** Past ghost opacity (`onionPastOpacity`, i.html:1232). */
        val pastOpacity: Double = DEFAULT_PAST_OPACITY,
        /** Future ghost opacity (`onionFutureOpacity`, i.html:1232). */
        val futureOpacity: Double = DEFAULT_FUTURE_OPACITY,
        /** Tint blend amount (`onionTint`, i.html:1232). */
        val tint: Double = DEFAULT_TINT,
        /** Restrict ghosts to the active layer (`onionLayerOnly`, i.html:1232). */
        val layerOnly: Boolean = false,
        /** Past ghost colour (`onionBack`, i.html:1231). */
        val back: String = DEFAULT_BACK,
        /** Future ghost colour (`onionFront`, i.html:1231). */
        val front: String = DEFAULT_FRONT,
    ) {
        companion object {
            const val DEFAULT_DEPTH = 2
            const val DEFAULT_PAST_OPACITY = 0.34
            const val DEFAULT_FUTURE_OPACITY = 0.24
            const val DEFAULT_TINT = 0.5
            const val DEFAULT_BACK = "#880057"
            const val DEFAULT_FRONT = "#f7cac9"

            /** `Math.max(0, Math.min(8, …))` (i.html:1019). */
            val DEPTH_RANGE = 0..8

            /** `Math.max(0.02, Math.min(0.85, …))` (i.html:1020-1021). */
            val OPACITY_RANGE = 0.02..0.85

            /** `Math.max(0, Math.min(1, …))` (i.html:1022). */
            val TINT_RANGE = 0.0..1.0
        }
    }

    companion object {
        /** Current pen-engine schema version (`PEN_ENGINE_VERSION`, i.html:995). */
        const val PEN_ENGINE_VERSION = 2

        const val DEFAULT_COLOR = "#bb0037"
        const val DEFAULT_STREAMLINE = 0.45
        const val DEFAULT_BARREL_MODE = "pick"

        /** Default active brush — `brushes[1]` (i.html:911). */
        const val DEFAULT_BRUSH_ID = "ink"

        /** Valid barrel modes (`BARREL_MODES`, i.html:915). */
        val BARREL_MODES: List<String> = listOf("pick", "erase", "off")

        /** The ten brush ids, in `brushes[]` order (i.html:891-909). */
        val BRUSH_IDS: List<String> = listOf(
            "pencil", "ink", "marker", "water", "frost",
            "smudge", "glow", "neon", "star", "eraser",
        )
    }
}
