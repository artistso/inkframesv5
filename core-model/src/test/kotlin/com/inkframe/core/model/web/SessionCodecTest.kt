package com.inkframe.core.model.web

import com.inkframe.core.common.JsonValue
import com.inkframe.core.common.asArr
import com.inkframe.core.common.asDouble
import com.inkframe.core.common.asInt
import com.inkframe.core.common.asString
import com.inkframe.core.common.get
import com.inkframe.core.common.parseJson
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Restore-matrix and round-trip tests for [SessionCodec] — one test per restore rule
 * of PORT_MAP §4.3 (autosave.js:156-207), plus the v1/v2/v3 migrator vectors in
 * `webv3/session-v{1,2,3}.json` (tiny 2×2/3×2/4×4 PNGs encoded with ImageIO).
 */
class SessionCodecTest {

    private val codec = SessionCodec()
    private val pngIo = ImageIoPngImageIO()

    private fun fixture(name: String): String =
        checkNotNull(javaClass.getResource("/webv3/$name")) { "missing fixture $name" }.readText()

    private fun dataUrl(w: Int, h: Int, argb: Int): String =
        SessionCodec.PNG_DATA_URL_PREFIX +
            Base64.getEncoder().encodeToString(pngIo.encode(IntArray(w * h) { argb }, w, h))

    private fun projectJson(w: Int = 4, h: Int = 4, frames: String, extra: String = ""): String =
        """{"v":3,"savedAt":1,"pi":0,"projects":[{"name":"P","w":$w,"h":$h$extra,"frames":[$frames]}]}"""

    private fun layerJson(extra: String = "", blob: String? = null): String {
        val b = blob?.let { ""","blob":"$it"""" } ?: ""
        return """{"name":"L"$extra$b}"""
    }

    // ---- Migrator vectors (files) -------------------------------------------------

    @Test
    fun restore_v1Fixture_upgradesFrameBlobsToSingleLayerFrames() {
        val g = codec.restore(fixture("session-v1.json"), LayerIdGenerator())
        assertEquals(1, g.projects.size)
        assertEquals(0, g.active)

        val p = g.projects[0]
        assertEquals("Legacy One", p.name)
        assertEquals(4, p.w)
        assertEquals(4, p.h)
        assertEquals(10, p.fps)
        assertEquals("#112233", p.paper)
        assertEquals(0, p.cur)
        assertEquals(CanvasShape.SQUARE, p.canvasShape)
        assertEquals(listOf(1, 2), p.holds)

        // Pre-v3 payloads restore with a blank transparent background (autosave.js:26,183).
        val bg = p.background
        assertNotNull(bg)
        assertEquals(true, bg!!.visible)
        assertEquals(1.0, bg.opacity, 0.0)
        assertEquals(BlendMode.SOURCE_OVER, bg.blend)
        assertNull(bg.pixels)

        assertEquals(2, p.frames.size)
        for ((i, argb) in listOf(0xFFFF0000.toInt(), 0xFF0000FF.toInt()).withIndex()) {
            val f = p.frames[i]
            assertEquals(0, f.active)
            assertEquals(1, f.layers.size)
            val l = f.layers[0]
            assertEquals("Layer 1", l.name)
            assertEquals(true, l.visible)
            assertEquals(1.0, l.opacity, 0.0)
            assertEquals(BlendMode.SOURCE_OVER, l.blend)
            assertNotNull(l.pixels)
            assertEquals(16, l.pixels!!.size)
            assertTrue(l.pixels!!.all { it == argb })
        }
    }

    @Test
    fun restore_v1Fixture_assignsFreshSequentialIds() {
        val g = codec.restore(fixture("session-v1.json"), LayerIdGenerator())
        assertSequentialIds(g.projects[0].frames.map { it.layers[0].id })
    }

    @Test
    fun restore_v2Fixture_keepsLayeredFramesAndAppliesLayerDefaults() {
        val g = codec.restore(fixture("session-v2.json"), LayerIdGenerator())
        assertEquals(2, g.projects.size)
        assertEquals(1, g.active) // payload pi

        val p0 = g.projects[0]
        assertEquals("Layered", p0.name)
        assertEquals(listOf(3), p0.holds)
        assertEquals(1, p0.frames.size)
        val f = p0.frames[0]
        assertEquals(1, f.active) // payload active, in range
        assertEquals(2, f.layers.size)

        val sketch = f.layers[0]
        assertEquals("Sketch", sketch.name)
        assertEquals(false, sketch.visible) // explicit false survives (autosave.js:167)
        assertEquals(0.5, sketch.opacity, 0.0)
        assertEquals(BlendMode.MULTIPLY, sketch.blend)
        assertTrue(sketch.pixels!!.all { it == 0xFFFF0000.toInt() })

        // Missing visible/opacity/blend fall back to true / 1 / source-over (autosave.js:167-169).
        val ink = f.layers[1]
        assertEquals("Ink", ink.name)
        assertEquals(true, ink.visible)
        assertEquals(1.0, ink.opacity, 0.0)
        assertEquals(BlendMode.SOURCE_OVER, ink.blend)
        assertTrue(ink.pixels!!.all { it == 0xFF0000FF.toInt() })

        assertSequentialIds(f.layers.map { it.id })
    }

    @Test
    fun restore_v2Fixture_cropsOversizedImageTopLeft() {
        // "Second" is 2×2 but its layer blob is a 3×2 PNG: drawImage(img,0,0) clips the
        // overflow column and keeps the rest (autosave.js:113).
        val g = codec.restore(fixture("session-v2.json"), LayerIdGenerator())
        val p1 = g.projects[1]
        assertEquals(2, p1.w)
        assertEquals(2, p1.h)
        assertEquals(24, p1.fps)
        assertEquals("#000000", p1.paper)
        val l = p1.frames[0].layers[0]
        assertEquals("Only", l.name)
        assertEquals(BlendMode.SCREEN, l.blend)
        assertNotNull(l.pixels)
        assertEquals(4, l.pixels!!.size)
        assertTrue(l.pixels!!.all { it == 0xFF00FF00.toInt() })
        // ids continue across projects (autosave.js:165)
        assertSequentialIds(g.projects.flatMap { p -> p.frames.flatMap { f -> f.layers.map { it.id } } })
    }

    @Test
    fun restore_v3Fixture_readsBackgroundAndCanvasShape() {
        val g = codec.restore(fixture("session-v3.json"), LayerIdGenerator())
        val p = g.projects[0]
        assertEquals("Modern", p.name)
        assertEquals(CanvasShape.CIRCLE, p.canvasShape)

        val bg = p.background
        assertNotNull(bg)
        assertEquals(false, bg!!.visible) // `!== false` keeps explicit false (autosave.js:186)
        assertEquals(0.7, bg.opacity, 0.0)
        assertEquals(BlendMode.SCREEN, bg.blend)
        assertNotNull(bg.pixels)
        assertEquals(16, bg.pixels!!.size)
        assertEquals(0x80FF00FF.toInt(), bg.pixels!![0])
        assertEquals(0x8000FFFF.toInt(), bg.pixels!![1])

        assertEquals(2, p.frames.size)
        assertEquals(listOf(1, 1), p.holds)
        val f1 = p.frames[1]
        assertEquals(1, f1.active)
        assertEquals(BlendMode.OVERLAY, f1.layers[0].blend)
        assertEquals(0.25, f1.layers[1].opacity, 0.0)
        assertEquals(BlendMode.DIFFERENCE, f1.layers[1].blend)
        assertSequentialIds(p.frames.flatMap { it.layers.map { l -> l.id } })
    }

    // ---- Restore rules, one by one (autosave.js:156-207) ---------------------------

    @Test
    fun restore_visibleIsTrueUnlessLiteralFalse() {
        val frames = """{"active":0,"layers":[${layerJson()},${layerJson(""","visible":false""")},${layerJson(""","visible":0""")}]}"""
        val g = codec.restore(projectJson(frames = frames), LayerIdGenerator())
        val layers = g.projects[0].frames[0].layers
        assertEquals(true, layers[0].visible) // missing → true (autosave.js:167)
        assertEquals(false, layers[1].visible) // literal false → false
        assertEquals(true, layers[2].visible) // 0 !== false → true
    }

    @Test
    fun restore_opacityAndBlendDefaultToOneAndSourceOver() {
        val frames = """{"active":0,"layers":[${layerJson()},${layerJson(""","opacity":0.3,"blend":"multiply"""")},${layerJson(""","blend":"bogus"""")}]}"""
        val g = codec.restore(projectJson(frames = frames), LayerIdGenerator())
        val layers = g.projects[0].frames[0].layers
        assertEquals(1.0, layers[0].opacity, 0.0) // typeof !== number → 1 (autosave.js:168)
        assertEquals(BlendMode.SOURCE_OVER, layers[0].blend) // missing → source-over (L169)
        assertEquals(0.3, layers[1].opacity, 0.0)
        assertEquals(BlendMode.MULTIPLY, layers[1].blend)
        assertEquals(BlendMode.SOURCE_OVER, layers[2].blend) // unknown key → SOURCE_OVER (enum model)
    }

    @Test
    fun restore_layerNameDefaultsToLayer() {
        val frames = """{"active":0,"layers":[{"blob":null},{"name":"","blob":null}]}"""
        val g = codec.restore(projectJson(frames = frames), LayerIdGenerator())
        val layers = g.projects[0].frames[0].layers
        assertEquals("Layer", layers[0].name) // `sL.name || 'Layer'` (autosave.js:166)
        assertEquals("Layer", layers[1].name) // empty string is falsy in JS
    }

    @Test
    fun restore_decodeFailureYieldsBlankLayer() {
        val notBase64 = "data:image/png;base64,%%%not-base64%%%"
        val notPng = "data:image/png;base64," + Base64.getEncoder().encodeToString("hello".toByteArray())
        val frames = """{"active":0,"layers":[${layerJson(blob = notBase64)},${layerJson(blob = notPng)},${layerJson()}]}"""
        val g = codec.restore(projectJson(frames = frames), LayerIdGenerator())
        val layers = g.projects[0].frames[0].layers
        // All three stay as layers; only the pixels are blank (autosave.js:115-116).
        assertEquals(3, layers.size)
        assertNull(layers[0].pixels)
        assertNull(layers[1].pixels)
        assertNull(layers[2].pixels) // missing blob → blank canvas (autosave.js:110)
    }

    @Test
    fun restore_emptyLayerListBecomesOneBlankLayer1() {
        val g = codec.restore(projectJson(frames = """{"active":0,"layers":[]}"""), LayerIdGenerator())
        val f = g.projects[0].frames[0]
        assertEquals(1, f.layers.size) // autosave.js:172
        assertEquals("Layer 1", f.layers[0].name)
        assertNull(f.layers[0].pixels)
    }

    @Test
    fun restore_activeIsClampedIntoLayerRange() {
        val two = "${layerJson()},${layerJson()}"
        val high = codec.restore(projectJson(frames = """{"active":99,"layers":[$two]}"""), LayerIdGenerator())
        assertEquals(1, high.projects[0].frames[0].active) // autosave.js:173
        val low = codec.restore(projectJson(frames = """{"active":-3,"layers":[$two]}"""), LayerIdGenerator())
        assertEquals(0, low.projects[0].frames[0].active) // model invariant clamps the lower bound
    }

    @Test
    fun restore_holdsKeptOnlyWhenLengthMatchesFrameCount() {
        val frame = """{"active":0,"layers":[${layerJson()}]}"""
        val kept = codec.restore(
            """{"v":3,"savedAt":1,"pi":0,"projects":[{"name":"P","w":4,"h":4,"holds":[2,3],"frames":[$frame,$frame]}]}""",
            LayerIdGenerator(),
        )
        assertEquals(listOf(2, 3), kept.projects[0].holds) // autosave.js:192
        val mismatch = codec.restore(
            """{"v":3,"savedAt":1,"pi":0,"projects":[{"name":"P","w":4,"h":4,"holds":[9],"frames":[$frame,$frame]}]}""",
            LayerIdGenerator(),
        )
        assertEquals(listOf(1, 1), mismatch.projects[0].holds) // fallback all-1
        val missing = codec.restore(projectJson(frames = frame), LayerIdGenerator())
        assertEquals(listOf(1), missing.projects[0].holds)
    }

    @Test
    fun restore_curIsClampedIntoFrameRange() {
        val frame = """{"active":0,"layers":[${layerJson()}]}"""
        val high = codec.restore(
            """{"v":3,"savedAt":1,"pi":0,"projects":[{"name":"P","w":4,"h":4,"cur":99,"frames":[$frame,$frame]}]}""",
            LayerIdGenerator(),
        )
        assertEquals(1, high.projects[0].cur) // autosave.js:193
        val low = codec.restore(
            """{"v":3,"savedAt":1,"pi":0,"projects":[{"name":"P","w":4,"h":4,"cur":-2,"frames":[$frame]}]}""",
            LayerIdGenerator(),
        )
        assertEquals(0, low.projects[0].cur)
    }

    @Test
    fun restore_emptyOrMissingFramesBecomeOneBlankFrame() {
        val empty = codec.restore(
            """{"v":3,"savedAt":1,"pi":0,"projects":[{"name":"P","w":4,"h":4,"frames":[]}]}""",
            LayerIdGenerator(),
        )
        val p = empty.projects[0]
        assertEquals(1, p.frames.size) // autosave.js:191
        assertEquals(1, p.frames[0].layers.size)
        assertEquals("Layer 1", p.frames[0].layers[0].name)
        assertNull(p.frames[0].layers[0].pixels)
        assertEquals(listOf(1), p.holds)
        assertEquals(0, p.cur)

        val missing = codec.restore(
            """{"v":3,"savedAt":1,"pi":0,"projects":[{"name":"P","w":4,"h":4}]}""",
            LayerIdGenerator(),
        )
        assertEquals(1, missing.projects[0].frames.size)

        // A null v1 frame item is a null blob → blank single layer (autosave.js:110,176).
        val nullItem = codec.restore(projectJson(frames = "null"), LayerIdGenerator())
        assertEquals("Layer 1", nullItem.projects[0].frames[0].layers[0].name)
        assertNull(nullItem.projects[0].frames[0].layers[0].pixels)
    }

    @Test
    fun restore_missingOrEmptyProjectsYieldEmptyGallery() {
        // autosave.js:157 — web returns false and the caller boots blank (i.html:5628-5648).
        assertEquals(0, codec.restore("""{"v":3,"savedAt":1,"pi":0}""", LayerIdGenerator()).projects.size)
        assertEquals(0, codec.restore("""{"v":3,"savedAt":1,"pi":0,"projects":[]}""", LayerIdGenerator()).projects.size)
    }

    @Test
    fun restore_piIsClampedIntoProjectRange() {
        val frame = """{"active":0,"layers":[${layerJson()}]}"""
        val one = """{"name":"P","w":4,"h":4,"frames":[$frame]}"""
        val high = codec.restore("""{"v":3,"savedAt":1,"pi":99,"projects":[$one]}""", LayerIdGenerator())
        assertEquals(0, high.active) // autosave.js:203
        val low = codec.restore("""{"v":3,"savedAt":1,"pi":-5,"projects":[$one]}""", LayerIdGenerator())
        assertEquals(0, low.active)
        val missing = codec.restore("""{"v":3,"savedAt":1,"projects":[$one]}""", LayerIdGenerator())
        assertEquals(0, missing.active)
    }

    @Test
    fun restore_missingDimensionsAndScalarsFallBackToDefaults() {
        val frame = """{"active":0,"layers":[${layerJson()}]}"""
        val g = codec.restore(
            """{"v":3,"savedAt":1,"pi":0,"projects":[{"frames":[$frame]}]}""",
            LayerIdGenerator(),
        )
        val p = g.projects[0]
        assertEquals(Caps.W0, p.w) // autosave.js:160
        assertEquals(Caps.H0, p.h)
        assertEquals(Caps.DEFAULT_PROJECT_NAME, p.name) // autosave.js:195
        assertEquals(Caps.DEFAULT_FPS, p.fps)
        assertEquals(Caps.DEFAULT_PAPER, p.paper) // autosave.js:196
        assertEquals(CanvasShape.SQUARE, p.canvasShape) // autosave.js:29-31,197
    }

    @Test
    fun restore_neverReadsPayloadVersion() {
        fun payload(vField: String) = """
            {$vField"savedAt":1,"pi":0,"projects":[{"name":"P","w":4,"h":4,
             "canvasShape":"circle",
             "background":{"visible":true,"opacity":1,"blend":"source-over","blob":null},
             "frames":[{"active":0,"layers":[${layerJson()}]}]}]}
        """.trimIndent()
        val asV1 = codec.restore(payload(""), LayerIdGenerator())
        val asV99 = codec.restore(payload(""""v":99,"""), LayerIdGenerator())
        val asV3 = codec.restore(payload(""""v":3,"""), LayerIdGenerator())
        // Structural detection: identical shapes restore identically whatever v says.
        assertEquals(asV3, asV1)
        assertEquals(asV3, asV99)
        assertEquals(CanvasShape.CIRCLE, asV1.projects[0].canvasShape)
    }

    @Test
    fun restore_undersizedImageIsPaddedWithTransparency() {
        // 2×2 red blob into a 4×4 project: top-left anchored, rest transparent (autosave.js:113).
        val g = codec.restore(
            projectJson(frames = """{"active":0,"layers":[${layerJson(blob = dataUrl(2, 2, 0xFFFF0000.toInt()))}]}"""),
            LayerIdGenerator(),
        )
        val px = g.projects[0].frames[0].layers[0].pixels
        assertNotNull(px)
        assertEquals(16, px!!.size)
        val red = 0xFFFF0000.toInt()
        assertEquals(red, px[0]); assertEquals(red, px[1])
        assertEquals(red, px[4]); assertEquals(red, px[5])
        assertEquals(0, px[2]); assertEquals(0, px[3]); assertEquals(0, px[15])
    }

    // ---- Serialize (autosave.js:121-154) ------------------------------------------

    @Test
    fun serialize_writesExactV3KeySet() {
        val g = codec.restore(fixture("session-v3.json"), LayerIdGenerator())
        val root = parseJson(codec.serialize(g, 1_690_000_002_000L))

        assertEquals(setOf("v", "savedAt", "pi", "projects"), root.asObjKeys())
        assertEquals(3, root["v"].asInt())
        assertEquals(1_690_000_002_000L, root["savedAt"].asDouble().toLong())
        assertEquals(0, root["pi"].asInt())

        val projects = root["projects"].asArr().items
        assertEquals(1, projects.size)
        assertEquals(
            setOf("name", "w", "h", "cur", "fps", "paper", "canvasShape", "background", "holds", "frames"),
            projects[0].asObjKeys(),
        )
        assertEquals("circle", projects[0]["canvasShape"].asString())

        val bg = projects[0]["background"]
        assertEquals(setOf("visible", "opacity", "blend", "blob"), bg.asObjKeys())
        assertTrue(bg["blob"].asString().startsWith(SessionCodec.PNG_DATA_URL_PREFIX))

        val frame = projects[0]["frames"].asArr().items[0]
        assertEquals(setOf("active", "layers"), frame.asObjKeys())
        val layer = frame["layers"].asArr().items[0]
        assertEquals(setOf("name", "visible", "opacity", "blend", "blob"), layer.asObjKeys())
        assertTrue(layer["blob"].asString().startsWith(SessionCodec.PNG_DATA_URL_PREFIX))
    }

    @Test
    fun serialize_blankLayerStillWritesPngBlobAndNullBackgroundStaysNull() {
        // frameToBlob always produces a PNG, even for a blank canvas (autosave.js:99-107);
        // a model with no background writes `background: null` (M1_SPEC §SessionPayload).
        val ids = LayerIdGenerator()
        val g = Gallery(
            projects = listOf(
                Project(
                    w = 4, h = 4,
                    frames = listOf(Frame(layers = listOf(Layer(id = ids.next(), name = "Layer 1")))),
                    holds = listOf(1),
                    background = null,
                ),
            ),
            active = 0,
        )
        val root = parseJson(codec.serialize(g, 1L))
        val p = root["projects"].asArr().items[0]
        assertEquals(JsonValue.Null, p["background"])
        val blob = p["frames"].asArr().items[0]["layers"].asArr().items[0]["blob"].asString()
        assertTrue(blob.startsWith(SessionCodec.PNG_DATA_URL_PREFIX))
        val bytes = Base64.getDecoder().decode(blob.removePrefix(SessionCodec.PNG_DATA_URL_PREFIX))
        val decoded = pngIo.decode(bytes)
        assertNotNull(decoded)
        assertEquals(4 to 4, decoded!!.second)
        assertTrue(decoded.first.all { it == 0 }) // fully transparent blank canvas
    }

    @Test
    fun serialize_misalignedHoldsFallBackToAllOnes() {
        // Model invariant "holds.size == frames.size else treated all-1" (PORT_MAP §4.1),
        // mirroring `(P.holds || P.frames.map(() => 1))` (autosave.js:139).
        val ids = LayerIdGenerator()
        val g = Gallery(
            projects = listOf(
                Project(
                    w = 4, h = 4,
                    frames = listOf(Frame.blank(ids), Frame.blank(ids)),
                    holds = listOf(5),
                ),
            ),
        )
        val root = parseJson(codec.serialize(g, 1L))
        val holds = root["projects"].asArr().items[0]["holds"].asArr().items.map { it.asInt() }
        assertEquals(listOf(1, 1), holds)
    }

    @Test
    fun roundTrip_serializeRestoreDeepEquals() {
        // Layer ids are re-issued in traversal order on restore (autosave.js:165), so a
        // gallery built with a fresh generator survives restore(serialize(g)) untouched.
        val ids = LayerIdGenerator()
        val red = IntArray(16) { 0xFFFF0000.toInt() }
        val blue = IntArray(16) { 0xFF0000FF.toInt() }
        val g = Gallery(
            projects = listOf(
                Project(
                    name = "One", w = 4, h = 4, fps = 10, paper = "#112233",
                    frames = listOf(
                        Frame(layers = listOf(Layer(id = ids.next(), name = "Layer 1", pixels = red))),
                        Frame(
                            layers = listOf(
                                Layer(id = ids.next(), name = "A", visible = false, opacity = 0.5, blend = BlendMode.MULTIPLY),
                                Layer(id = ids.next(), name = "B", opacity = 0.25, blend = BlendMode.DIFFERENCE, pixels = blue),
                            ),
                            active = 1,
                        ),
                    ),
                    holds = listOf(1, 2), cur = 1,
                    canvasShape = CanvasShape.CIRCLE,
                    background = Background(visible = false, opacity = 0.7, blend = BlendMode.SCREEN, pixels = blue),
                ),
                Project(
                    name = "Two", w = 4, h = 4,
                    frames = listOf(Frame(layers = listOf(Layer(id = ids.next(), name = "Layer 1")))),
                    holds = listOf(1),
                    background = Background(),
                ),
            ),
            active = 1,
        )
        val restored = codec.restore(codec.serialize(g, 1_690_000_000_000L), LayerIdGenerator())
        assertEquals(g, restored)
    }

    @Test
    fun codecConstants_matchWebAutosave() {
        assertEquals(3, SessionCodec.VERSION) // autosave.js:126
        assertEquals(800L, SessionCodec.SAVE_DELAY_MS) // autosave.js:57
    }

    private fun JsonValue.asObjKeys(): Set<String> =
        (this as JsonValue.Obj).entries.keys

    /** Fresh ids from the generator are distinct and issued sequentially in traversal order. */
    private fun assertSequentialIds(ids: List<Long>) {
        assertEquals(ids.size, ids.toSet().size)
        for (i in 1 until ids.size) {
            assertEquals("ids[$i] should follow ids[${i - 1}]", ids[i - 1] + 1, ids[i])
        }
    }
}
