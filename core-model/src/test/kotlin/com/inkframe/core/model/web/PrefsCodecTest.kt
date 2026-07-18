package com.inkframe.core.model.web

import com.inkframe.core.common.JsonValue
import com.inkframe.core.common.asArr
import com.inkframe.core.common.asInt
import com.inkframe.core.common.get
import com.inkframe.core.common.parseJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Round-trip, defaults/clamps and `PEN_ENGINE_VERSION` v1→v2 migration tests for
 * [PrefsCodec] (i.html:1009-1050 load/save, i.html:996-1009 migration).
 */
class PrefsCodecTest {

    private fun inkOf(prefs: Prefs): Map<String, JsonValue> =
        (prefs.brushPrefs["ink"] as JsonValue.Obj).entries

    private fun Map<String, JsonValue>.num(key: String): Double =
        (this[key] as JsonValue.Num).value

    // ---- Round trip -----------------------------------------------------------------

    @Test
    fun roundTrip_defaults() {
        assertEquals(Prefs(), PrefsCodec.fromJson(PrefsCodec.toJson(Prefs())))
    }

    @Test
    fun roundTrip_custom() {
        val prefs = Prefs(
            color = "#123456",
            streamline = 0.9,
            stylusOnly = true,
            palmReject = false,
            readableText = true,
            barrelMode = "erase",
            onion = Prefs.Onion(
                enabled = false, depth = 6, pastOpacity = 0.5, futureOpacity = 0.1,
                tint = 0.8, layerOnly = true, back = "#111111", front = "#eeeeee",
            ),
            qsEnabled = false,
            brushId = "star",
            brushPrefs = mapOf(
                "pencil" to JsonValue.obj("size" to JsonValue.of(9), "op" to JsonValue.Num(0.5)),
            ),
            brushLibrary = JsonValue.arr(
                listOf(
                    JsonValue.obj(
                        "id" to JsonValue.of("p1"),
                        "name" to JsonValue.of("Mine"),
                        "brushId" to JsonValue.of("ink"),
                        "profile" to JsonValue.obj("size" to JsonValue.of(3)),
                        "createdAt" to JsonValue.of(1_690_000_000_000L),
                    ),
                ),
            ),
        )
        assertEquals(prefs, PrefsCodec.fromJson(PrefsCodec.toJson(prefs)))
    }

    @Test
    fun toJson_writesExactSavePrefsKeySet() {
        // i.html:1045-1049 — the complete record savePrefs writes, nothing more.
        val keys = (parseJson(PrefsCodec.toJson(Prefs())) as JsonValue.Obj).entries.keys
        assertEquals(
            setOf(
                "color", "streamline", "stylusOnly", "palmReject", "readableText", "barrelMode",
                "penEngineVersion", "onion", "onionDepth", "onionPastOpacity", "onionFutureOpacity",
                "onionTint", "onionLayerOnly", "onionBack", "onionFront", "qsEnabled", "brushId",
                "brushPrefs", "brushLibrary",
            ),
            keys,
        )
        // savePrefs writes the constant, never a stored value (i.html:1046).
        assertEquals(2, parseJson(PrefsCodec.toJson(Prefs()))["penEngineVersion"].asInt())
    }

    // ---- Defaults / lenient load (i.html:1010-1041) ---------------------------------

    @Test
    fun fromJson_emptyObjectYieldsDefaults() {
        assertEquals(Prefs(), PrefsCodec.fromJson("{}"))
    }

    @Test
    fun fromJson_malformedOrNonObjectYieldsDefaults() {
        // loadPrefs swallows parse errors with catch(_){} (i.html:1041).
        assertEquals(Prefs(), PrefsCodec.fromJson("not json {"))
        assertEquals(Prefs(), PrefsCodec.fromJson(""))
        assertEquals(Prefs(), PrefsCodec.fromJson("[1,2]"))
        assertEquals(Prefs(), PrefsCodec.fromJson("\"text\""))
    }

    @Test
    fun fromJson_wrongTypedFieldsKeepDefaults() {
        val prefs = PrefsCodec.fromJson(
            """{
              "color": 5, "streamline": "fast", "stylusOnly": 1, "palmReject": "no",
              "readableText": 0, "barrelMode": 7, "onion": 1, "onionDepth": "3",
              "onionPastOpacity": "x", "onionTint": true, "onionLayerOnly": 0,
              "onionBack": 3, "onionFront": null, "qsEnabled": "yes", "brushId": 9,
              "brushPrefs": [1], "brushLibrary": {"a": 1}
            }""",
        )
        assertEquals(Prefs(), prefs)
    }

    @Test
    fun fromJson_emptyStringsAreFalsyLikeJs() {
        // `if (p.color)` / `p.name || …` — empty strings are falsy in JS (i.html:1012,1024-1025).
        val prefs = PrefsCodec.fromJson("""{"color":"","onionBack":"","onionFront":""}""")
        assertEquals(Prefs.DEFAULT_COLOR, prefs.color)
        assertEquals(Prefs.Onion.DEFAULT_BACK, prefs.onion.back)
        assertEquals(Prefs.Onion.DEFAULT_FRONT, prefs.onion.front)
    }

    @Test
    fun fromJson_clampsOnionAndValidatesEnums() {
        val prefs = PrefsCodec.fromJson(
            """{
              "barrelMode": "bogus", "brushId": "bogus",
              "onionDepth": 99, "onionPastOpacity": 0.99, "onionFutureOpacity": 0.001,
              "onionTint": 5.0
            }""",
        )
        // i.html:1017,1039 — unknown enum values are ignored, defaults survive.
        assertEquals("pick", prefs.barrelMode)
        assertEquals("ink", prefs.brushId)
        // i.html:1019-1022 clamps.
        assertEquals(8, prefs.onion.depth)
        assertEquals(0.85, prefs.onion.pastOpacity, 0.0)
        assertEquals(0.02, prefs.onion.futureOpacity, 0.0)
        assertEquals(1.0, prefs.onion.tint, 0.0)

        val low = PrefsCodec.fromJson("""{"onionDepth": -4, "barrelMode": "off", "brushId": "star"}""")
        assertEquals(0, low.onion.depth)
        assertEquals("off", low.barrelMode) // valid modes pass through
        assertEquals("star", low.brushId) // known brush ids pass through
    }

    @Test
    fun fromJson_onionDepthRoundsLikeJsMathRound() {
        // `Math.round` rounds half towards +∞ (i.html:1019); roundToInt matches.
        assertEquals(3, PrefsCodec.fromJson("""{"onionDepth": 2.5}""").onion.depth)
        assertEquals(2, PrefsCodec.fromJson("""{"onionDepth": 2.4}""").onion.depth)
    }

    // ---- v1→v2 pen-engine migration (i.html:996-1009) -------------------------------

    @Test
    fun migration_v1ForcesInkProfileButPreservesUserSizeOpHardJitter() {
        val prefs = PrefsCodec.fromJson(
            """{
              "penEngineVersion": 1,
              "brushPrefs": {
                "ink": {"size": 30, "op": 0.7, "hard": 0.5, "jitter": 0.2,
                        "minSize": 0.5, "stabilize": 0.6, "spacing": 0.3,
                        "taperIn": 4, "taperOut": 6, "entryPool": 0.8, "exitPool": 0.6,
                        "texture": 0.9, "response": 0.7}
              }
            }""",
        )
        val ink = inkOf(prefs)
        // Modernized pen-feel controls (i.html:1002-1006).
        assertEquals(0.08, ink.num("minSize"), 0.0)
        assertEquals(0.08, ink.num("stabilize"), 0.0)
        assertEquals(0.055, ink.num("spacing"), 0.0)
        assertEquals(12.0, ink.num("taperIn"), 0.0) // max(4, 12)
        assertEquals(16.0, ink.num("taperOut"), 0.0) // max(6, 16)
        assertEquals(0.0, ink.num("entryPool"), 0.0)
        assertEquals(0.0, ink.num("exitPool"), 0.0)
        assertEquals(0.10, ink.num("texture"), 0.0) // min(0.9, 0.10)
        assertEquals(-0.20, ink.num("response"), 0.0)
        // User's size/opacity/hardness (+ jitter) survive (i.html:999-1000).
        assertEquals(30.0, ink.num("size"), 0.0)
        assertEquals(0.7, ink.num("op"), 0.0)
        assertEquals(0.5, ink.num("hard"), 0.0)
        assertEquals(0.2, ink.num("jitter"), 0.0)
        // The loaded record reports the current engine version (i.html:995,1046).
        assertEquals(Prefs.PEN_ENGINE_VERSION, prefs.penEngineVersion)
    }

    @Test
    fun migration_missingVersionFieldStillMigrates() {
        // `migratePenProfile(p.penEngineVersion || 0)` — missing means 0 < 2 (i.html:1028).
        val prefs = PrefsCodec.fromJson(
            """{"brushPrefs": {"ink": {"entryPool": 0.9, "texture": 0.5}}}""",
        )
        val ink = inkOf(prefs)
        assertEquals(0.0, ink.num("entryPool"), 0.0)
        assertEquals(0.10, ink.num("texture"), 0.0)
    }

    @Test
    fun migration_currentVersionLeavesInkUntouched() {
        val prefs = PrefsCodec.fromJson(
            """{"penEngineVersion": 2,
                "brushPrefs": {"ink": {"entryPool": 0.9, "taperIn": 4, "texture": 0.5}}}""",
        )
        val ink = inkOf(prefs)
        assertEquals(0.9, ink.num("entryPool"), 0.0)
        assertEquals(4.0, ink.num("taperIn"), 0.0)
        assertEquals(0.5, ink.num("texture"), 0.0)
        assertEquals(2, prefs.penEngineVersion)
    }

    @Test
    fun migration_withoutInkProfileIsNoOp() {
        // `const ink = brushPrefs.ink; if (!ink) return;` (i.html:997).
        val prefs = PrefsCodec.fromJson(
            """{"penEngineVersion": 1, "brushPrefs": {"pencil": {"size": 9, "entryPool": 0.9}}}""",
        )
        assertEquals(
            mapOf("pencil" to JsonValue.obj("size" to JsonValue.of(9), "entryPool" to JsonValue.Num(0.9))),
            prefs.brushPrefs,
        )
        assertEquals(emptyMap<String, JsonValue>(), PrefsCodec.fromJson("""{"penEngineVersion":1}""").brushPrefs)
    }

    @Test
    fun migration_jsFalsyAndMinMaxEdgeCases() {
        val prefs = PrefsCodec.fromJson(
            """{"penEngineVersion": 1,
                "brushPrefs": {"ink": {"taperIn": 20, "taperOut": 0, "texture": 0.05}}}""",
        )
        val ink = inkOf(prefs)
        assertEquals(20.0, ink.num("taperIn"), 0.0) // max(20, 12) keeps longer taper
        assertEquals(16.0, ink.num("taperOut"), 0.0) // 0 is falsy in JS → 0 → max(0, 16)
        assertEquals(0.05, ink.num("texture"), 0.0) // min(0.05, 0.10) keeps lower texture

        val zeroTexture = inkOf(
            PrefsCodec.fromJson(
                """{"penEngineVersion": 1, "brushPrefs": {"ink": {"texture": 0}}}""",
            ),
        )
        // `ink.texture || 0.10` — 0 is falsy in JS, so the floor applies.
        assertEquals(0.10, zeroTexture.num("texture"), 0.0)
    }

    @Test
    fun migration_survivesRoundTripWithoutReapplying() {
        val once = PrefsCodec.fromJson(
            """{"penEngineVersion": 1, "brushPrefs": {"ink": {"entryPool": 0.8}}}""",
        )
        val twice = PrefsCodec.fromJson(PrefsCodec.toJson(once))
        assertEquals(once, twice)
        assertEquals(0.0, inkOf(twice).num("entryPool"), 0.0)
    }

    // ---- Constants --------------------------------------------------------------------

    @Test
    fun constants_matchWebPrefs() {
        assertEquals("inkframe.prefs.v1", PrefsCodec.PREF_KEY) // i.html:923
        assertEquals(180L, PrefsCodec.SAVE_DEBOUNCE_MS) // i.html:1043-1050
        assertEquals(2, Prefs.PEN_ENGINE_VERSION) // i.html:995
        assertEquals(listOf("pick", "erase", "off"), Prefs.BARREL_MODES) // i.html:915
        assertEquals(10, Prefs.BRUSH_IDS.size) // i.html:891-909
        assertEquals("ink", Prefs.BRUSH_IDS[1]) // default brush is brushes[1] (i.html:911)
    }
}
