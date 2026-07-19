package com.inkframe.core.model.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Document-model behavior ported from i.html:1061-1182 (factories, caps, templates). */
class WebModelTest {

    // ---- Caps (i.html:1108-1109, 802, 911, 3976, 3924-3927, 1223, 5029, 1113) ---------

    @Test
    fun caps_matchWebConstants() {
        assertEquals(4, Caps.MAX_PROJECTS)
        assertEquals(120, Caps.MAX_FRAMES)
        assertEquals(1024, Caps.W0)
        assertEquals(768, Caps.H0)
        assertEquals(12, Caps.DEFAULT_FPS)
        assertEquals(1..24, Caps.FPS_RANGE)
        assertEquals(1..8, Caps.HOLD_RANGE)
        assertEquals(40, Caps.UNDO_CAP)
        assertEquals(256..4096, Caps.CANVAS_DIM_RANGE)
        assertEquals("#fff0f3", Caps.DEFAULT_PAPER)
        assertEquals("Canvas", Caps.DEFAULT_PROJECT_NAME)
        assertEquals("Layer 1", Caps.FIRST_LAYER_NAME)
    }

    // ---- BlendMode (i.html:1067-1072) -------------------------------------------------

    @Test
    fun blendModes_exactOrderKeysAndLabels() {
        val expected = listOf(
            "source-over" to "Normal", "multiply" to "Multiply", "screen" to "Screen",
            "overlay" to "Overlay", "darken" to "Darken", "lighten" to "Lighten",
            "color-dodge" to "Dodge", "color-burn" to "Burn", "hard-light" to "Hard",
            "soft-light" to "Soft", "difference" to "Diff",
        )
        assertEquals(expected, BlendMode.entries.map { it.key to it.label })
    }

    @Test
    fun blendMode_keyRoundTrip() {
        for (mode in BlendMode.entries) {
            assertSame(mode, BlendMode.fromKey(mode.key))
        }
    }

    @Test
    fun blendMode_fromKeyLenientFallback() {
        assertSame(BlendMode.SOURCE_OVER, BlendMode.fromKey(null))
        assertSame(BlendMode.SOURCE_OVER, BlendMode.fromKey(""))
        assertSame(BlendMode.SOURCE_OVER, BlendMode.fromKey("lighter"))
        assertSame(BlendMode.SOURCE_OVER, BlendMode.fromKey("SOURCE_OVER"))
    }

    // ---- CanvasShape (canvas-shape.js:4) ----------------------------------------------

    @Test
    fun canvasShape_fromKeyOnlyCircleIsCircle() {
        assertSame(CanvasShape.CIRCLE, CanvasShape.fromKey("circle"))
        assertSame(CanvasShape.SQUARE, CanvasShape.fromKey("square"))
        assertSame(CanvasShape.SQUARE, CanvasShape.fromKey(null))
        assertSame(CanvasShape.SQUARE, CanvasShape.fromKey("Circle"))
        assertSame(CanvasShape.SQUARE, CanvasShape.fromKey(""))
    }

    // ---- LayerIdGenerator (i.html:1072, 1074) -----------------------------------------

    @Test
    fun layerIds_startAtOneAndIncrement() {
        val ids = LayerIdGenerator()
        assertEquals(1L, ids.next())
        assertEquals(2L, ids.next())
        assertEquals(3L, ids.next())
    }

    @Test
    fun layerIds_ensureAboveGuaranteesCollisionFreeFutureIds() {
        val ids = LayerIdGenerator()
        ids.ensureAbove(41L)
        assertEquals(42L, ids.next())
        ids.ensureAbove(10L) // below the counter: no-op
        assertEquals(43L, ids.next())
    }

    // ---- Layer equality (pixels by content) -------------------------------------------

    @Test
    fun layer_equalityComparesPixelContent() {
        val a = Layer(id = 7, name = "Ink", pixels = intArrayOf(1, 2, 3))
        val b = Layer(id = 7, name = "Ink", pixels = intArrayOf(1, 2, 3))
        val c = Layer(id = 7, name = "Ink", pixels = intArrayOf(1, 2, 4))
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
        assertNotEquals(a, c)
        assertNotEquals(a, a.copy(pixels = null))
        assertEquals(a.copy(pixels = null), Layer(id = 7, name = "Ink"))
    }

    // ---- Frame (i.html:1077-1081) -----------------------------------------------------

    @Test
    fun frameBlank_mirrorsNewFrame() {
        val ids = LayerIdGenerator()
        val frame = Frame.blank(ids)
        assertEquals(1, frame.layers.size)
        assertEquals("Layer 1", frame.layers.single().name)
        assertEquals(0, frame.active)
        assertEquals(0L, frame.version)
        assertTrue(frame.layers.single().visible)
        assertEquals(1.0, frame.layers.single().opacity, 0.0)
        assertSame(BlendMode.SOURCE_OVER, frame.layers.single().blend)
        assertNull(frame.layers.single().pixels)
        assertEquals(1L, frame.layers.single().id)
    }

    @Test
    fun frame_requiresAtLeastOneLayer() {
        try {
            Frame(layers = emptyList())
            fail("expected IllegalArgumentException")
        } catch (expected: IllegalArgumentException) {
            // web invariant: frames always carry >= 1 layer (i.html:1077, 4556)
        }
    }

    @Test
    fun frameActiveLayer_fallsBackToBottomLayer() {
        // frameActive(fr)=fr.layers[fr.active]||fr.layers[0] (i.html:1079)
        val bottom = Layer(id = 1, name = "Layer 1")
        val top = Layer(id = 2, name = "Layer 2")
        assertSame(top, Frame(listOf(bottom, top), active = 1).activeLayer)
        assertSame(bottom, Frame(listOf(bottom, top), active = 7).activeLayer)
        assertSame(bottom, Frame(listOf(bottom, top), active = -1).activeLayer)
    }

    // ---- Project (i.html:1114-1116, 1227) ----------------------------------------------

    @Test
    fun projectBlank_mirrorsNewProject() {
        val project = Project.blank(LayerIdGenerator())
        assertEquals("Canvas", project.name)
        assertEquals(1024, project.w)
        assertEquals(768, project.h)
        assertEquals(12, project.fps)
        assertEquals("#fff0f3", project.paper)
        assertEquals(1, project.frames.size)
        assertEquals(listOf(1), project.holds)
        assertEquals(0, project.cur)
        assertSame(CanvasShape.SQUARE, project.canvasShape)
        assertNull(project.background)
    }

    @Test
    fun hOf_floorsAtOneAndFallsBackToOne() {
        // hOf=i=>Math.max(1,Math.round((holds&&holds[i])||1)) (i.html:1227)
        val project = Project(frames = List(3) { Frame.blank(LayerIdGenerator()) }, holds = listOf(2, 0, 3))
        assertEquals(2, project.hOf(0))
        assertEquals(1, project.hOf(1)) // 0 floors to 1
        assertEquals(3, project.hOf(2))
        assertEquals(1, project.hOf(3)) // out of range
        assertEquals(1, project.hOf(-1)) // out of range
        assertEquals(1, Project(frames = List(1) { Frame.blank(LayerIdGenerator()) }, holds = emptyList()).hOf(0))
    }

    // ---- Gallery -----------------------------------------------------------------------

    @Test
    fun gallery_activeProjectNullableRead() {
        val p = Project.blank(LayerIdGenerator())
        assertSame(p, Gallery(listOf(p), active = 0).activeProject)
        assertNull(Gallery(listOf(p), active = 3).activeProject)
        assertNull(Gallery(emptyList()).activeProject)
    }

    // ---- ProjectTemplates (verbatim vs i.html:1117-1124) -------------------------------

    @Test
    fun projectTemplates_verbatimEquality() {
        val expected = listOf(
            listOf("classic", "Classic sketch", 1024, 768, 12, 1, "#fff0f3", "4:3 cream paper"),
            listOf("hd", "HD animation", 1280, 720, 12, 12, "#fff0f3", "16:9 · 12 starter frames"),
            listOf("square", "Square social", 1080, 1080, 12, 1, "#fff0f3", "1:1 post / sticker"),
            listOf("phone", "Phone vertical", 1080, 1920, 12, 1, "#fff0f3", "9:16 story / reel"),
            listOf("pixel", "Pixel art", 512, 512, 8, 8, "#f5f5f0", "small canvas · 8 fps"),
            listOf("neon", "Neon loop", 1280, 720, 12, 16, "#0a0a10", "dark paper · 16 frames"),
        )
        assertEquals(6, ProjectTemplates.ALL.size)
        ProjectTemplates.ALL.forEachIndexed { i, t ->
            val e = expected[i]
            assertEquals(e[0], t.id)
            assertEquals(e[1], t.name)
            assertEquals(e[2], t.w)
            assertEquals(e[3], t.h)
            assertEquals(e[4], t.fps)
            assertEquals(e[5], t.frames)
            assertEquals(e[6], t.paper)
            assertEquals(e[7], t.desc)
        }
    }

    @Test
    fun fromTemplate_mirrorsProjectFromTemplate() {
        // projectFromTemplate (i.html:1125-1130)
        val ids = LayerIdGenerator()
        val project = ProjectTemplates.fromTemplate(ProjectTemplates.ALL[1], ids) // "hd"
        assertEquals("HD animation", project.name)
        assertEquals(1280, project.w)
        assertEquals(720, project.h)
        assertEquals(12, project.fps)
        assertEquals("#fff0f3", project.paper)
        assertEquals(12, project.frames.size)
        assertEquals(List(12) { 1 }, project.holds)
        assertEquals(0, project.cur)
        assertTrue(project.frames.all { it.layers.single().name == "Layer 1" })
        // every blank frame mints a fresh layer id (i.html:1127 -> newFrame -> __lid++)
        assertEquals(12, project.frames.map { it.layers.single().id }.distinct().size)
    }

    @Test
    fun fromTemplate_clampsFrameCount() {
        val ids = LayerIdGenerator()
        val hd = ProjectTemplates.ALL[1]
        assertEquals(120, ProjectTemplates.fromTemplate(hd.copy(frames = 200), ids).frames.size)
        assertEquals(1, ProjectTemplates.fromTemplate(hd.copy(frames = 0), ids).frames.size)
        assertEquals(Caps.W0, ProjectTemplates.fromTemplate(hd.copy(w = 0), ids).w)
        assertEquals(Caps.DEFAULT_FPS, ProjectTemplates.fromTemplate(hd.copy(fps = 0), ids).fps)
        assertEquals(Caps.DEFAULT_PROJECT_NAME, ProjectTemplates.fromTemplate(hd.copy(name = ""), ids).name)
    }
}
