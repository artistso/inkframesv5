package com.inkframe.core.model.web

import com.inkframe.core.common.JsonParseException
import com.inkframe.core.common.JsonValue
import com.inkframe.core.common.optional
import com.inkframe.core.common.parseJson
import kotlin.math.roundToInt

/**
 * JSON codec for [Prefs] — ports `savePrefs`/`loadPrefs` (i.html:1009-1050) and the
 * one-time `PEN_ENGINE_VERSION` migration (i.html:995-1009).
 *
 * The written key set is exactly what `savePrefs` stores (i.html:1045-1049):
 * `{color, streamline, stylusOnly, palmReject, readableText, barrelMode,
 * penEngineVersion, onion, onionDepth, onionPastOpacity, onionFutureOpacity,
 * onionTint, onionLayerOnly, onionBack, onionFront, qsEnabled, brushId, brushPrefs,
 * brushLibrary}`.
 *
 * [fromJson] mirrors `loadPrefs`' field-by-field `typeof` guards: a field that is
 * missing or has the wrong JSON type keeps its default, exactly like the web keeps
 * the runtime's current value. Unparseable text yields [Prefs] defaults — the web
 * swallows the same failure with `catch(_){}` (i.html:1041).
 *
 * The 180 ms save debounce (i.html:1043-1050) is repository behavior, not codec
 * behavior; [SAVE_DEBOUNCE_MS] is exported for the M4 `PrefsRepository`.
 */
object PrefsCodec {

    /** localStorage key of the web record (`PREF_KEY`, i.html:923). */
    const val PREF_KEY = "inkframe.prefs.v1"

    /** Debounce of the web's `savePrefs` (i.html:1043-1050). */
    const val SAVE_DEBOUNCE_MS = 180L

    // ---- Encode (i.html:1045-1049) ----------------------------------------------

    fun toJson(prefs: Prefs): String = JsonValue.obj(
        "color" to JsonValue.of(prefs.color),
        "streamline" to JsonValue.Num(prefs.streamline),
        "stylusOnly" to JsonValue.of(prefs.stylusOnly),
        "palmReject" to JsonValue.of(prefs.palmReject),
        "readableText" to JsonValue.of(prefs.readableText),
        "barrelMode" to JsonValue.of(prefs.barrelMode),
        // savePrefs writes the constant, never a stored value (i.html:1046).
        "penEngineVersion" to JsonValue.of(Prefs.PEN_ENGINE_VERSION),
        "onion" to JsonValue.of(prefs.onion.enabled),
        "onionDepth" to JsonValue.of(prefs.onion.depth),
        "onionPastOpacity" to JsonValue.Num(prefs.onion.pastOpacity),
        "onionFutureOpacity" to JsonValue.Num(prefs.onion.futureOpacity),
        "onionTint" to JsonValue.Num(prefs.onion.tint),
        "onionLayerOnly" to JsonValue.of(prefs.onion.layerOnly),
        "onionBack" to JsonValue.of(prefs.onion.back),
        "onionFront" to JsonValue.of(prefs.onion.front),
        "qsEnabled" to JsonValue.of(prefs.qsEnabled),
        "brushId" to JsonValue.of(prefs.brushId),
        "brushPrefs" to JsonValue.Obj(LinkedHashMap(prefs.brushPrefs)),
        "brushLibrary" to prefs.brushLibrary,
    ).toJsonString()

    // ---- Decode (i.html:1009-1042) ------------------------------------------------

    fun fromJson(json: String): Prefs {
        val root = try {
            parseJson(json)
        } catch (e: JsonParseException) {
            return Prefs() // i.html:1041 — corrupt prefs are ignored, defaults win
        }
        val obj = root as? JsonValue.Obj ?: return Prefs()

        val brushPrefs = (obj.optional("brushPrefs") as? JsonValue.Obj)?.entries ?: emptyMap()
        // i.html:1028 — `migratePenProfile(p.penEngineVersion || 0)`.
        val storedPenVersion = (obj.optional("penEngineVersion") as? JsonValue.Num)?.value?.toInt() ?: 0

        return Prefs(
            // `if (p.color) color = p.color` (i.html:1012) — truthy strings only.
            color = obj.strOr("color")?.takeIf { it.isNotEmpty() } ?: Prefs.DEFAULT_COLOR,
            // `typeof p.streamline === 'number'` (i.html:1013) — intentionally unclamped.
            streamline = obj.numOr("streamline") ?: Prefs.DEFAULT_STREAMLINE,
            stylusOnly = obj.boolOr("stylusOnly") ?: false,
            palmReject = obj.boolOr("palmReject") ?: true,
            readableText = obj.boolOr("readableText") ?: false,
            // i.html:1017 — unknown modes are ignored, the default survives.
            barrelMode = obj.strOr("barrelMode")?.takeIf { it in Prefs.BARREL_MODES }
                ?: Prefs.DEFAULT_BARREL_MODE,
            penEngineVersion = Prefs.PEN_ENGINE_VERSION,
            onion = Prefs.Onion(
                enabled = obj.boolOr("onion") ?: true,
                // i.html:1019 — `Math.max(0, Math.min(8, Math.round(p.onionDepth)))`.
                depth = obj.numOr("onionDepth")?.roundToInt()?.coerceIn(Prefs.Onion.DEPTH_RANGE)
                    ?: Prefs.Onion.DEFAULT_DEPTH,
                pastOpacity = obj.numOr("onionPastOpacity")?.coerceIn(Prefs.Onion.OPACITY_RANGE)
                    ?: Prefs.Onion.DEFAULT_PAST_OPACITY,
                futureOpacity = obj.numOr("onionFutureOpacity")?.coerceIn(Prefs.Onion.OPACITY_RANGE)
                    ?: Prefs.Onion.DEFAULT_FUTURE_OPACITY,
                tint = obj.numOr("onionTint")?.coerceIn(Prefs.Onion.TINT_RANGE)
                    ?: Prefs.Onion.DEFAULT_TINT,
                layerOnly = obj.boolOr("onionLayerOnly") ?: false,
                back = obj.strOr("onionBack")?.takeIf { it.isNotEmpty() } ?: Prefs.Onion.DEFAULT_BACK,
                front = obj.strOr("onionFront")?.takeIf { it.isNotEmpty() } ?: Prefs.Onion.DEFAULT_FRONT,
            ),
            qsEnabled = obj.boolOr("qsEnabled") ?: true,
            // i.html:1039 — an id that names no brush is ignored.
            brushId = obj.strOr("brushId")?.takeIf { it in Prefs.BRUSH_IDS } ?: Prefs.DEFAULT_BRUSH_ID,
            brushPrefs = migratePenProfile(storedPenVersion, brushPrefs),
            // i.html:1029-1038 — kept raw (M1_SPEC §PrefsSchema); entry sanitation is
            // runtime behavior.
            brushLibrary = (obj.optional("brushLibrary") as? JsonValue.Arr)
                ?: JsonValue.arr(emptyList()),
        )
    }

    // ---- v1→v2 pen-engine migration (i.html:996-1009) ------------------------------

    /**
     * One-time terminal cleanup for installs that still carry the old calligraphic
     * entry/exit pools: preserves the user's size/opacity/hardness (and jitter), and
     * modernizes only the pen-feel controls that caused blobs/lag. No-op when the
     * payload carries no ink profile (`if (!ink) return`, i.html:997) or when the
     * stored version is already current (`v < PEN_ENGINE_VERSION`, i.html:1001).
     */
    private fun migratePenProfile(
        storedVersion: Int,
        brushPrefs: Map<String, JsonValue>,
    ): Map<String, JsonValue> {
        val ink = brushPrefs["ink"] as? JsonValue.Obj ?: return brushPrefs
        if (storedVersion >= Prefs.PEN_ENGINE_VERSION) return brushPrefs
        val forced = LinkedHashMap(ink.entries)
        forced["minSize"] = JsonValue.Num(0.08)
        forced["stabilize"] = JsonValue.Num(0.08)
        forced["spacing"] = JsonValue.Num(0.055)
        // `Math.max(ink.taperIn || 0, 12)` / `Math.max(ink.taperOut || 0, 16)` — i.html:1004.
        forced["taperIn"] = JsonValue.Num(maxOf(jsOr(ink.entries["taperIn"], 0.0), 12.0))
        forced["taperOut"] = JsonValue.Num(maxOf(jsOr(ink.entries["taperOut"], 0.0), 16.0))
        forced["entryPool"] = JsonValue.Num(0.0)
        forced["exitPool"] = JsonValue.Num(0.0)
        // `Math.min(ink.texture || 0.10, 0.10)` — i.html:1005.
        forced["texture"] = JsonValue.Num(minOf(jsOr(ink.entries["texture"], 0.10), 0.10))
        forced["response"] = JsonValue.Num(-0.20)
        val migrated = LinkedHashMap(brushPrefs)
        migrated["ink"] = JsonValue.Obj(forced)
        return migrated
    }

    /** JS `x || dflt` for JSON numbers: 0, NaN, missing and non-numbers are falsy. */
    private fun jsOr(v: JsonValue?, dflt: Double): Double {
        val d = (v as? JsonValue.Num)?.value ?: return dflt
        return if (d == 0.0 || d.isNaN()) dflt else d
    }

    private fun JsonValue.Obj.strOr(key: String): String? =
        (optional(key) as? JsonValue.Str)?.value

    private fun JsonValue.Obj.numOr(key: String): Double? =
        (optional(key) as? JsonValue.Num)?.value

    private fun JsonValue.Obj.boolOr(key: String): Boolean? =
        (optional(key) as? JsonValue.Bool)?.value
}
