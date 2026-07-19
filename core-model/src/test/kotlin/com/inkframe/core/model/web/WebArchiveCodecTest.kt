package com.inkframe.core.model.web

import com.inkframe.core.common.JsonValue
import com.inkframe.core.common.parseJson
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Golden `.inkframe` v3 fixture decode + round-trip tests (PORT_MAP §7 tier 0) and the
 * lenient-import matrix of `archiveToProjects` (i.html:4546-4572). Pixel assertions are
 * pixel-level only — never PNG byte-level (PORT_MAP §7).
 */
class WebArchiveCodecTest {

    // ---------------------------------------------------------------- fixtures

    @Test
    fun decode_archiveEmpty_singleBlankProject() {
        val gallery = WebArchiveCodec.decode(fixture("archive-empty.inkframe"), LayerIdGenerator())
        assertEquals(0, gallery.active)
        val p = gallery.projects.single()
        assertEquals("Canvas", p.name)
        assertEquals(1024, p.w)
        assertEquals(768, p.h)
        assertEquals(12, p.fps)
        assertEquals("#fff0f3", p.paper)
        assertEquals(listOf(1), p.holds)
        assertEquals(0, p.cur)
        assertSame(CanvasShape.SQUARE, p.canvasShape)
        assertNull(p.background)
        val frame = p.frames.single()
        assertEquals(0, frame.active)
        val layer = frame.layers.single()
        assertEquals("Layer 1", layer.name)
        assertTrue(layer.visible)
        assertEquals(1.0, layer.opacity, 0.0)
        assertSame(BlendMode.SOURCE_OVER, layer.blend)
        // the blank canvas round-trips as a fully transparent pixel buffer
        val pixels = requireNotNull(layer.pixels)
        assertEquals(1024 * 768, pixels.size)
        assertTrue(pixels.all { it == 0 })
    }

    @Test
    fun decode_archiveHolds_multiLayerBlendOpacityHolds() {
        val gallery = WebArchiveCodec.decode(fixture("archive-holds.inkframe"), LayerIdGenerator())
        assertEquals(0, gallery.active)
        val p = gallery.projects.single()
        assertEquals("Holds demo", p.name)
        assertEquals(8, p.w)
        assertEquals(8, p.h)
        assertEquals(listOf(2, 3, 1), p.holds)
        assertEquals(1, p.cur)
        assertEquals(3, p.frames.size)

        val f0 = p.frames[0]
        assertEquals(0, f0.active)
        assertEquals(2, f0.layers.size)
        val ink0 = f0.layers[0]
        assertEquals("Ink", ink0.name)
        assertTrue(ink0.visible)
        assertEquals(1.0, ink0.opacity, 0.0)
        assertSame(BlendMode.SOURCE_OVER, ink0.blend)
        assertPixelsEqual(checker(off = 0), ink0.pixels)
        val wash = f0.layers[1]
        assertEquals("Wash", wash.name)
        assertTrue(!wash.visible)
        assertEquals(0.5, wash.opacity, 0.0)
        assertSame(BlendMode.MULTIPLY, wash.blend)
        assertPixelsEqual(diag(), wash.pixels)

        val f1 = p.frames[1]
        assertEquals(1, f1.active)
        assertPixelsEqual(checker(off = 1), f1.layers[0].pixels)
        val shadow = f1.layers[1]
        assertEquals(0.25, shadow.opacity, 0.0)
        assertSame(BlendMode.DARKEN, shadow.blend)
        assertPixelsEqual(bottomHalf(), shadow.pixels)

        val f2 = p.frames[2]
        assertEquals(1, f2.layers.size)
        assertPixelsEqual(border(), f2.layers[0].pixels)
    }

    @Test
    fun decode_archiveGallery3_threeProjectsActiveClamped() {
        val gallery = WebArchiveCodec.decode(fixture("archive-gallery3.inkframe"), LayerIdGenerator())
        assertEquals(3, gallery.projects.size)
        assertEquals(2, gallery.active)

        val p0 = gallery.projects[0]
        assertEquals("Classic sketch", p0.name)
        assertEquals(4, p0.w)
        assertEquals(4, p0.h)
        assertEquals(12, p0.fps)
        assertEquals("#fff0f3", p0.paper)
        assertTrue(requireNotNull(p0.frames.single().layers.single().pixels).all { it == 0 })

        val p1 = gallery.projects[1]
        assertEquals("Pixel art", p1.name)
        assertEquals(8, p1.fps)
        assertEquals("#f5f5f0", p1.paper)
        assertEquals(listOf(2, 2), p1.holds)
        assertEquals(1, p1.cur)
        assertPixelsEqual(block(size = 8, lo = 2, hi = 5, color = RED), p1.frames[0].layers[0].pixels)
        assertPixelsEqual(block(size = 8, lo = 4, hi = 7, color = GREEN), p1.frames[1].layers[0].pixels)

        val p2 = gallery.projects[2]
        assertEquals("Neon loop", p2.name)
        assertEquals(24, p2.fps)
        assertEquals("#0a0a10", p2.paper)
        assertPixelsEqual(block(size = 4, lo = 1, hi = 2, color = CYAN), p2.frames[0].layers[0].pixels)
    }

    @Test
    fun roundTrip_fixturesDeepEqualAfterReEncode() {
        // decode(encode(decode(x))) deep-equals decode(x) at the model level (SPEC)
        for (name in listOf("archive-empty.inkframe", "archive-holds.inkframe", "archive-gallery3.inkframe")) {
            val first = WebArchiveCodec.decode(fixture(name), LayerIdGenerator())
            val second = WebArchiveCodec.decode(WebArchiveCodec.encode(first, savedAt = 1L), LayerIdGenerator())
            assertEquals("round-trip mismatch for $name", first, second)
        }
    }

    @Test
    fun roundTrip_programmaticGalleryDeepEqual() {
        val ids = LayerIdGenerator()
        val original = Gallery(
            projects = listOf(
                Project(
                    name = "A", w = 4, h = 4, fps = 8, paper = "#000000",
                    frames = listOf(
                        Frame(listOf(layerPixels(ids, "bg", RED_4X4), layerPixels(ids, "fg", BLUE_4X4, opacity = 0.5, blend = BlendMode.SCREEN)), active = 1, version = 9),
                        Frame(listOf(layerPixels(ids, "only", GREEN_4X4, visible = false))),
                    ),
                    holds = listOf(1, 8), cur = 1,
                ),
                Project(
                    name = "B", w = 2, h = 3, fps = 24,
                    frames = listOf(Frame(listOf(layerPixels(ids, "x", IntArray(6) { 0x7F010203 })))),
                    holds = listOf(3),
                ),
            ),
            active = 1,
        )
        val restored = WebArchiveCodec.decode(WebArchiveCodec.encode(original, savedAt = 42L), LayerIdGenerator())
        // version is session state (web `_v`), never persisted (i.html:4510 key set)
        val normalized = original.copy(projects = original.projects.map { p ->
            p.copy(frames = p.frames.map { it.copy(version = 0) })
        })
        assertEquals(normalized, restored)
    }

    // ---------------------------------------------------------------- encode shape

    @Test
    fun encode_exactKeySetsAndScalars() {
        val ids = LayerIdGenerator()
        val gallery = Gallery(
            listOf(
                Project(
                    name = "Doc", w = 2, h = 2, fps = 8, paper = "#123456",
                    frames = listOf(Frame(listOf(layerPixels(ids, "L1", IntArray(4) { RED })))),
                    holds = listOf(2), cur = 0,
                ),
            ),
            active = 0,
        )
        val root = parseJson(WebArchiveCodec.encode(gallery, savedAt = 123456789L)) as JsonValue.Obj
        // buildProjectArchive key set (i.html:4524-4525)
        assertEquals(setOf("v", "app", "kind", "savedAt", "active", "projects"), root.entries.keys)
        assertEquals(JsonValue.Num(3.0), root.entries["v"])
        assertEquals(JsonValue.Str("InkFrame Studio"), root.entries["app"])
        assertEquals(JsonValue.Str("inkframe-web-archive"), root.entries["kind"])
        assertEquals(JsonValue.Num(123456789.0), root.entries["savedAt"])
        assertEquals(JsonValue.Num(0.0), root.entries["active"])

        val project = (root.entries["projects"] as JsonValue.Arr).items.single() as JsonValue.Obj
        // projectToArchive key set (i.html:4512-4515)
        assertEquals(setOf("name", "w", "h", "cur", "fps", "paper", "holds", "frames"), project.entries.keys)
        val frame = (project.entries["frames"] as JsonValue.Arr).items.single() as JsonValue.Obj
        assertEquals(setOf("active", "layers"), frame.entries.keys)
        val layer = (frame.entries["layers"] as JsonValue.Arr).items.single() as JsonValue.Obj
        assertEquals(setOf("name", "visible", "opacity", "blend", "png"), layer.entries.keys)
        assertEquals(JsonValue.Num(2.0), project.entries["holds"]?.let { (it as JsonValue.Arr).items[0] })
        val png = (layer.entries["png"] as JsonValue.Str).value
        assertTrue(png.startsWith("data:image/png;base64,"))
    }

    @Test
    fun encode_blankLayerStillWritesPngOfBlankCanvas() {
        // canvasPngDataUrl always serializes the canvas, even untouched ones (i.html:4506)
        val gallery = Gallery(listOf(Project.blank(LayerIdGenerator())), active = 0)
        val root = parseJson(WebArchiveCodec.encode(gallery, savedAt = 0L)) as JsonValue.Obj
        val layer = (((((root.entries["projects"] as JsonValue.Arr).items[0] as JsonValue.Obj)
            .entries["frames"] as JsonValue.Arr).items[0] as JsonValue.Obj)
            .entries["layers"] as JsonValue.Arr).items[0] as JsonValue.Obj
        val png = (layer.entries["png"] as JsonValue.Str).value
        assertTrue(png.startsWith("data:image/png;base64,"))
        val bytes = Base64.getDecoder().decode(png.removePrefix("data:image/png;base64,"))
        val (pixels, size) = ImageIoPngImageIO().decode(bytes)!!
        assertEquals(1024 to 768, size)
        assertTrue(pixels.all { it == 0 })
    }

    @Test
    fun encode_decode_blendModeKeysFileCompat() {
        // every Canvas2D string survives the archive unchanged (PORT_MAP row 2)
        val ids = LayerIdGenerator()
        val layers = BlendMode.entries.map { mode ->
            Layer(id = ids.next(), name = mode.key, pixels = IntArray(1) { RED }, blend = mode)
        }
        val gallery = Gallery(listOf(Project(w = 1, h = 1, frames = listOf(Frame(layers, active = 3)), holds = listOf(1))), active = 0)
        val restored = WebArchiveCodec.decode(WebArchiveCodec.encode(gallery, savedAt = 0L), LayerIdGenerator())
        assertEquals(BlendMode.entries.toList(), restored.projects[0].frames[0].layers.map { it.blend })
        assertEquals(3, restored.projects[0].frames[0].active)
    }

    @Test
    fun suggestedFileName_utcStamp() {
        assertEquals("inkframe-19700101-0000.inkframe", WebArchiveCodec.suggestedFileName(0L))
        assertEquals("inkframe-20250615-1506.inkframe", WebArchiveCodec.suggestedFileName(1750000000000L))
    }

    // ---------------------------------------------------------------- lenient import matrix

    @Test
    fun decode_legacySingleProjectPayload() {
        // payload.project fallback (i.html:4548)
        val json = """{"project":{"name":"Legacy","w":4,"h":4,"fps":12,"paper":"#fff0f3","cur":0,"holds":[1],"frames":[${frameJson("[${layerJson("Solo", png = dataUrl(RED_4X4, 4, 4))}]")}]}}"""
        val gallery = WebArchiveCodec.decode(json, LayerIdGenerator())
        val p = gallery.projects.single()
        assertEquals("Legacy", p.name)
        assertPixelsEqual(RED_4X4, p.frames[0].layers[0].pixels)
    }

    @Test
    fun decode_perLayerPngDataUrlDataKeys() {
        // L.png||L.dataUrl||L.data (i.html:4561)
        val layers = listOf("png", "dataUrl", "data").joinToString(",") { key ->
            """{"name":"$key","visible":true,"opacity":1,"blend":"source-over","$key":"${dataUrl(RED_4X4, 4, 4)}"}"""
        }
        val json = """{"v":3,"projects":[${projectJson(w = 4, h = 4, frames = "[${frameJson("[$layers]")}]")}]}"""
        val p = WebArchiveCodec.decode(json, LayerIdGenerator()).projects.single()
        assertEquals(3, p.frames[0].layers.size)
        p.frames[0].layers.forEach { assertPixelsEqual(RED_4X4, it.pixels) }
    }

    @Test
    fun decode_clampsToMaxProjectsAndReclampsActive() {
        // 5 projects -> 4 (caller slice i.html:4807); active 4 -> 3 (i.html:4808)
        val projects = (1..5).joinToString(",") { projectJson(name = "P$it", frames = "[${frameJson()}]") }
        val json = """{"v":3,"active":4,"projects":[$projects]}"""
        val gallery = WebArchiveCodec.decode(json, LayerIdGenerator())
        assertEquals(4, gallery.projects.size)
        assertEquals(3, gallery.active)
        assertEquals("P4", gallery.projects.last().name)
    }

    @Test
    fun decode_clampsToMaxFrames() {
        val frames = (1..121).joinToString(",") { frameJson() }
        val json = """{"v":3,"projects":[${projectJson(holds = null, frames = "[$frames]")}]}"""
        val p = WebArchiveCodec.decode(json, LayerIdGenerator()).projects.single()
        assertEquals(Caps.MAX_FRAMES, p.frames.size)
        assertEquals(Caps.MAX_FRAMES, p.holds.size)
    }

    @Test
    fun decode_truncatedAndGarbagePngsBecomeBlankLayers() {
        val truncated = Base64.getEncoder().encodeToString(
            ImageIoPngImageIO().encode(RED_4X4, 4, 4).copyOf(24),
        )
        val layers = listOf(
            """{"name":"x","png":"data:image/png;base64,$truncated"}""", // truncated PNG bytes
            """{"name":"x","png":"data:image/png;base64,###bogus###"}""", // undecodable base64 payload
            """{"name":"x","png":"https://example.com/layer.png"}""", // non-data URL: web onerror path
            """{"name":"x","png":""}""", // empty src
        ).joinToString(",")
        val json = """{"v":3,"projects":[${projectJson(w = 4, h = 4, frames = "[${frameJson("[$layers]")}]")}]}"""
        val p = WebArchiveCodec.decode(json, LayerIdGenerator()).projects.single()
        assertEquals(4, p.frames[0].layers.size)
        p.frames[0].layers.forEach { assertNull(it.pixels) }
    }

    @Test
    fun decode_holdsLengthMismatchFallsBackToAllOnes() {
        // SPEC: holds kept only if length == frames.size, else all-1 (autosave.js:192 rule)
        val twoFrames = "[${frameJson()},${frameJson()}]"
        val wrongLength = """{"v":3,"projects":[${projectJson(holds = "[5,5,5]", frames = twoFrames)}]}"""
        assertEquals(listOf(1, 1), WebArchiveCodec.decode(wrongLength, LayerIdGenerator()).projects[0].holds)
        val rightLength = """{"v":3,"projects":[${projectJson(holds = "[2,3]", frames = twoFrames)}]}"""
        assertEquals(listOf(2, 3), WebArchiveCodec.decode(rightLength, LayerIdGenerator()).projects[0].holds)
    }

    @Test
    fun decode_holdsEntriesSanitizedLikeWeb() {
        // Math.max(1,Math.round(v||1)) per kept entry (i.html:4567)
        val frames = "[${frameJson()},${frameJson()},${frameJson()},${frameJson()}]"
        val json = """{"v":3,"projects":[${projectJson(holds = "[0,-3,2.5,7]", frames = frames)}]}"""
        assertEquals(listOf(1, 1, 3, 7), WebArchiveCodec.decode(json, LayerIdGenerator()).projects[0].holds)
    }

    @Test
    fun decode_curClampedBothDirections() {
        // Math.min(Math.max(0,P.cur|0),frames.length-1) (i.html:4568)
        val twoFrames = "[${frameJson()},${frameJson()}]"
        val high = """{"v":3,"projects":[${projectJson(cur = 99, frames = twoFrames)}]}"""
        assertEquals(1, WebArchiveCodec.decode(high, LayerIdGenerator()).projects[0].cur)
        val low = """{"v":3,"projects":[${projectJson(cur = -5, frames = twoFrames)}]}"""
        assertEquals(0, WebArchiveCodec.decode(low, LayerIdGenerator()).projects[0].cur)
    }

    @Test
    fun decode_missingOrEmptyFramesBecomeOneBlankFrame() {
        // [{active:0,layers:[]}] placeholder -> single "Layer 1" (i.html:4553, 4556)
        for (framesValue in listOf("null", "[]")) {
            val json = """{"v":3,"projects":[${projectJson(cur = 7, frames = framesValue)}]}"""
            val p = WebArchiveCodec.decode(json, LayerIdGenerator()).projects.single()
            assertEquals(1, p.frames.size)
            assertEquals(1, p.frames[0].layers.size)
            assertEquals("Layer 1", p.frames[0].layers[0].name)
            assertNull(p.frames[0].layers[0].pixels)
            assertEquals(listOf(1), p.holds)
            assertEquals(0, p.cur)
        }
        // "frames" key entirely absent
        val absent = """{"v":3,"projects":[{"name":"NoFrames"}]}"""
        val p = WebArchiveCodec.decode(absent, LayerIdGenerator()).projects.single()
        assertEquals(1, p.frames.size)
        assertEquals("Layer 1", p.frames[0].layers[0].name)
        assertEquals("NoFrames", p.name)
        assertEquals(Caps.W0, p.w)
        assertEquals(Caps.H0, p.h)
    }

    @Test
    fun decode_frameLevelPngFallbackForLegacySingleCanvasFrames() {
        // [{name:'Layer 1', png:item.png||item.dataUrl||item.data}] (i.html:4556)
        for (key in listOf("png", "dataUrl", "data")) {
            val frame = """{"$key":"${dataUrl(RED_4X4, 4, 4)}"}"""
            val json = """{"v":3,"projects":[${projectJson(w = 4, h = 4, frames = "[$frame]")}]}"""
            val p = WebArchiveCodec.decode(json, LayerIdGenerator()).projects.single()
            assertEquals(1, p.frames[0].layers.size)
            assertEquals("Layer 1", p.frames[0].layers[0].name)
            assertPixelsEqual(RED_4X4, p.frames[0].layers[0].pixels)
        }
    }

    @Test
    fun decode_layerDefaultsAndVisibleStrictness() {
        // name||'Layer', visible!==false, typeof opacity==='number'?opacity:1, blend||'source-over' (i.html:4559-4560)
        val layers = """
            [
              {"name":"","png":null},
              {"visible":false},
              {"visible":0},
              {"opacity":0,"blend":"multiply"},
              {"opacity":"0.5","blend":"lighter"}
            ]
        """.trimIndent()
        val json = """{"v":3,"projects":[${projectJson(frames = "[${frameJson(layers)}]")}]}"""
        val decoded = WebArchiveCodec.decode(json, LayerIdGenerator()).projects[0].frames[0].layers
        assertEquals("Layer", decoded[0].name) // empty name falls back
        assertTrue(decoded[0].visible)
        assertTrue(!decoded[1].visible) // explicit false only
        assertTrue(decoded[2].visible) // 0 !== false in JS semantics
        assertEquals(0.0, decoded[3].opacity, 0.0) // numeric zero kept
        assertSame(BlendMode.MULTIPLY, decoded[3].blend)
        assertEquals(1.0, decoded[4].opacity, 0.0) // non-number opacity -> 1
        assertSame(BlendMode.SOURCE_OVER, decoded[4].blend) // unknown blend -> source-over
    }

    @Test
    fun decode_activeClampedToLayerCountNotBelow() {
        // Math.min(item.active|0, layers.length-1) — no lower clamp upstream (i.html:4565)
        val layers = "[${layerJson("a")},${layerJson("b")}]"
        val high = """{"v":3,"projects":[${projectJson(frames = "[${frameJson(layers, active = 9)}]")}]}"""
        assertEquals(1, WebArchiveCodec.decode(high, LayerIdGenerator()).projects[0].frames[0].active)
        val low = """{"v":3,"projects":[${projectJson(frames = "[${frameJson(layers, active = -2)}]")}]}"""
        val frame = WebArchiveCodec.decode(low, LayerIdGenerator()).projects[0].frames[0]
        assertEquals(-2, frame.active) // quirk preserved
        assertEquals("a", frame.activeLayer.name) // read path falls back like frameActive (i.html:1079)
    }

    @Test
    fun decode_dimensionAndScalarFallbacks() {
        // Math.max(1,P.w||W0); fps:P.fps||12 (unclamped); name/paper fallbacks (i.html:4552, 4569)
        val frame = frameJson()
        val json = """{"v":3,"projects":[
            ${projectJson(w = null, h = null, fps = null, name = "", paper = "", frames = "[$frame]")},
            ${projectJson(w = 0, h = -3, fps = 0, frames = "[$frame]")},
            ${projectJson(w = 30, h = 40, fps = 30, frames = "[$frame]")}
        ]}"""
        val gallery = WebArchiveCodec.decode(json, LayerIdGenerator())
        assertEquals(Caps.W0 to Caps.H0, gallery.projects[0].w to gallery.projects[0].h)
        assertEquals(Caps.DEFAULT_FPS, gallery.projects[0].fps)
        assertEquals(Caps.DEFAULT_PROJECT_NAME, gallery.projects[0].name)
        assertEquals(Caps.DEFAULT_PAPER, gallery.projects[0].paper)
        assertEquals(Caps.W0 to 1, gallery.projects[1].w to gallery.projects[1].h)
        assertEquals(Caps.DEFAULT_FPS, gallery.projects[1].fps)
        assertEquals(30 to 40, gallery.projects[2].w to gallery.projects[2].h)
        assertEquals(30, gallery.projects[2].fps) // import does not clamp to the 1..24 dial range
    }

    @Test
    fun decode_mintsFreshSequentialLayerIds() {
        // id:__lid++ on import (i.html:4559)
        val layers = "[${layerJson("a")},${layerJson("b")}]"
        val json = """{"v":3,"projects":[${projectJson(frames = "[${frameJson(layers)},${frameJson(layers)}]")}]}"""
        val p = WebArchiveCodec.decode(json, LayerIdGenerator()).projects[0]
        assertEquals(listOf(1L, 2L), p.frames[0].layers.map { it.id })
        assertEquals(listOf(3L, 4L), p.frames[1].layers.map { it.id })
    }

    // ---------------------------------------------------------------- v4 background acceptance

    @Test
    fun decode_v4BackgroundPopulatedFromPngKey() {
        // injector-era v4 archives: background{visible,opacity,blend,png} (inject-static-background-v2.mjs:87-94)
        val background = """{"visible":false,"opacity":0.5,"blend":"multiply","png":"${dataUrl(RED_4X4, 4, 4)}"}"""
        val json = """{"v":4,"app":"InkFrame Studio","kind":"inkframe-web-archive","savedAt":1,"active":0,
            "projects":[${projectJson(w = 4, h = 4, frames = "[${frameJson()}]", background = background)}]}"""
        val p = WebArchiveCodec.decode(json, LayerIdGenerator()).projects.single()
        val bg = requireNotNull(p.background)
        assertTrue(!bg.visible)
        assertEquals(0.5, bg.opacity, 0.0)
        assertSame(BlendMode.MULTIPLY, bg.blend)
        assertPixelsEqual(RED_4X4, bg.pixels)
    }

    @Test
    fun decode_v4BackgroundAcceptsBlobDataUrlDataKeysAndDefaults() {
        // SPEC: background keys visible/opacity/blend/blob|png|dataUrl|data
        for (key in listOf("blob", "png", "dataUrl", "data")) {
            val background = """{"$key":"${dataUrl(RED_4X4, 4, 4)}"}"""
            val json = """{"v":4,"projects":[${projectJson(w = 4, h = 4, frames = "[${frameJson()}]", background = background)}]}"""
            val bg = WebArchiveCodec.decode(json, LayerIdGenerator()).projects[0].background
            assertNotNull("key $key", bg)
            assertPixelsEqual(RED_4X4, bg!!.pixels)
            assertTrue(bg.visible) // defaults like layers (!==false)
            assertEquals(1.0, bg.opacity, 0.0)
            assertSame(BlendMode.SOURCE_OVER, bg.blend)
        }
        // corrupt background image -> blank background canvas, project still imports
        val corrupt = """{"v":4,"projects":[${projectJson(w = 4, h = 4, frames = "[${frameJson()}]", background = """{"png":"data:image/png;base64,###"}""")}]}"""
        val bg = WebArchiveCodec.decode(corrupt, LayerIdGenerator()).projects[0].background
        assertNotNull(bg)
        assertNull(bg!!.pixels)
    }

    @Test
    fun decode_v3BackgroundKeyIsIgnored() {
        // unpatched web importer never reads project.background (i.html:4551-4569)
        val background = """{"png":"${dataUrl(RED_4X4, 4, 4)}"}"""
        val json = """{"v":3,"projects":[${projectJson(w = 4, h = 4, frames = "[${frameJson()}]", background = background)}]}"""
        assertNull(WebArchiveCodec.decode(json, LayerIdGenerator()).projects[0].background)
    }

    // ---------------------------------------------------------------- error cases

    @Test
    fun decode_invalidPayloadsThrowLikeWeb() {
        // 'Invalid archive' (i.html:4547) / 'No projects in archive' (i.html:4549)
        assertThrowsWithMessage("Invalid archive") { WebArchiveCodec.decode("null", LayerIdGenerator()) }
        assertThrowsWithMessage("Invalid archive") { WebArchiveCodec.decode("\"str\"", LayerIdGenerator()) }
        assertThrowsWithMessage("Invalid archive") { WebArchiveCodec.decode("42", LayerIdGenerator()) }
        assertThrowsWithMessage("No projects in archive") { WebArchiveCodec.decode("[]", LayerIdGenerator()) }
        assertThrowsWithMessage("No projects in archive") { WebArchiveCodec.decode("{}", LayerIdGenerator()) }
        assertThrowsWithMessage("No projects in archive") { WebArchiveCodec.decode("""{"projects":[]}""", LayerIdGenerator()) }
        assertThrowsWithMessage("No projects in archive") { WebArchiveCodec.decode("""{"project":null}""", LayerIdGenerator()) }
    }

    // ---------------------------------------------------------------- helpers

    private fun assertThrowsWithMessage(message: String, block: () -> Unit) {
        try {
            block()
            fail("expected IllegalArgumentException($message)")
        } catch (e: IllegalArgumentException) {
            assertEquals(message, e.message)
        }
    }

    private fun fixture(name: String): String =
        String(
            requireNotNull(javaClass.classLoader.getResourceAsStream("webv3/$name")) { "missing fixture $name" }.readBytes(),
            Charsets.UTF_8,
        )

    private fun assertPixelsEqual(expected: IntArray, actual: IntArray?) {
        assertNotNull(actual)
        assertTrue(
            "pixel mismatch: expected ${expected.toList()} but was ${actual!!.toList()}",
            expected.contentEquals(actual),
        )
    }

    private fun layerPixels(
        ids: LayerIdGenerator,
        name: String,
        pixels: IntArray,
        visible: Boolean = true,
        opacity: Double = 1.0,
        blend: BlendMode = BlendMode.SOURCE_OVER,
    ) = Layer(ids.next(), name, visible, opacity, blend, pixels.copyOf())

    private fun dataUrl(pixels: IntArray, w: Int, h: Int): String =
        "data:image/png;base64," + Base64.getEncoder().encodeToString(ImageIoPngImageIO().encode(pixels, w, h))

    /** Minimal layer JSON; only png/name are set unless overridden. */
    private fun layerJson(name: String, png: String = ""): String =
        """{"name":"$name","visible":true,"opacity":1,"blend":"source-over","png":"$png"}"""

    private fun frameJson(layers: String = "[${layerJson("Layer 1")}]", active: Int = 0): String =
        """{"active":$active,"layers":$layers}"""

    private fun projectJson(
        name: String? = "Doc",
        w: Int? = 4,
        h: Int? = 4,
        cur: Int? = 0,
        fps: Int? = 12,
        paper: String? = "#fff0f3",
        holds: String? = null,
        frames: String,
        background: String? = null,
    ): String {
        val parts = mutableListOf<String>()
        if (name != null) parts += """"name":"$name""""
        if (w != null) parts += """"w":$w""""
        if (h != null) parts += """"h":$h""""
        if (cur != null) parts += """"cur":$cur""""
        if (fps != null) parts += """"fps":$fps""""
        if (paper != null) parts += """"paper":"$paper""""
        if (holds != null) parts += """"holds":$holds""""
        parts += """"frames":$frames""""
        if (background != null) parts += """"background":$background""""
        return parts.joinToString(",", "{", "}")
    }

    companion object {
        private const val RED = 0xFFFF0000.toInt()
        private const val GREEN = 0xFF00AA00.toInt()
        private const val CYAN = 0xFF00FFFF.toInt()
        private const val INK = 0xFFBB0037.toInt()
        private const val WASH = 0x80224488.toInt()
        private const val BLACK = 0xFF000000.toInt()
        private const val BORDER = 0xFF1A0F16.toInt()

        private val RED_4X4 = IntArray(16) { RED }
        private val BLUE_4X4 = IntArray(16) { 0xFF0000FF.toInt() }
        private val GREEN_4X4 = IntArray(16) { GREEN }

        private fun checker(off: Int) = IntArray(64) { i ->
            val x = i % 8
            val y = i / 8
            if ((x + y) % 2 == off) INK else 0
        }

        private fun diag() = IntArray(64) { i -> if (i % 8 == i / 8) WASH else 0 }

        private fun bottomHalf() = IntArray(64) { i -> if (i / 8 >= 4) BLACK else 0 }

        private fun border() = IntArray(64) { i ->
            val x = i % 8
            val y = i / 8
            if (x == 0 || x == 7 || y == 0 || y == 7) BORDER else 0
        }

        private fun block(size: Int, lo: Int, hi: Int, color: Int) = IntArray(size * size) { i ->
            val x = i % size
            val y = i / size
            if (x in lo..hi && y in lo..hi) color else 0
        }
    }
}
