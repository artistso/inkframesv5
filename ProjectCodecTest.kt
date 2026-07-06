package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProjectCodecTest {

    private fun sampleProject(): Project {
        val layer1 = Layer(
            id = "layer-1",
            name = "Background",
            opacity = 0.8f,
            visible = true,
            locked = false,
            blendMode = BlendMode.MULTIPLY,
            cels = mapOf(
                0 to Cel(id = "cel-a", surfaceId = 100L),
                5 to Cel(id = "cel-b", surfaceId = 101L, transform = CelTransform(tx = 3f, rotationDeg = 45f)),
            ),
        )
        val layer2 = Layer(id = "layer-2", name = "Ink", cels = emptyMap())
        val scene = Scene(
            id = "scene-1",
            name = "Shot 01",
            frameCount = 36,
            layers = listOf(layer1, layer2),
            playbackRange = 2..30,
            loop = false,
        )
        return Project(
            id = "proj-1",
            name = "My Film",
            canvas = CanvasSpec(widthPx = 1920, heightPx = 1080, fps = 30, pixelAspect = 1.0f),
            scenes = listOf(scene),
            activeSceneId = "scene-1",
            createdAtEpochMs = 1_000L,
            modifiedAtEpochMs = 2_000L,
        )
    }

    @Test
    fun roundTrip_preservesEverything() {
        val original = sampleProject()
        val json = ProjectCodec.toJsonString(original)
        val restored = ProjectCodec.fromJsonString(json)

        assertEquals(original.id, restored.id)
        assertEquals(original.name, restored.name)
        assertEquals(original.canvas, restored.canvas)
        assertEquals(original.activeSceneId, restored.activeSceneId)
        assertEquals(original.createdAtEpochMs, restored.createdAtEpochMs)
        assertEquals(original.modifiedAtEpochMs, restored.modifiedAtEpochMs)
        assertEquals(original.scenes, restored.scenes)
        // Deep equality of the whole document (data classes).
        assertEquals(original.copy(colorPalette = restored.colorPalette), restored)
    }

    @Test
    fun roundTrip_preservesCelTransformsAndFrameHolds() {
        val restored = ProjectCodec.fromJsonString(ProjectCodec.toJsonString(sampleProject()))
        val layer = restored.scenes[0].layers[0]
        assertEquals(2, layer.cels.size)
        assertEquals(100L, layer.cels[0]!!.surfaceId)
        assertEquals(101L, layer.cels[5]!!.surfaceId)
        assertEquals(45f, layer.cels[5]!!.transform.rotationDeg, 1e-4f)
        // Frame-hold still resolves after a round trip.
        assertEquals(100L, layer.celAt(3)?.surfaceId)
    }

    @Test
    fun roundTrip_preservesBlendModesAndPlaybackRange() {
        val restored = ProjectCodec.fromJsonString(ProjectCodec.toJsonString(sampleProject()))
        assertEquals(BlendMode.MULTIPLY, restored.scenes[0].layers[0].blendMode)
        assertEquals(2..30, restored.scenes[0].playbackRange)
        assertEquals(false, restored.scenes[0].loop)
    }

    @Test
    fun decode_toleratesMissingOptionalFields() {
        // A minimal document missing palette, transforms, optional layer flags.
        val minimal = """
            {
              "version": 1,
              "id": "p",
              "name": "Min",
              "canvas": {"width": 64, "height": 64, "fps": 12},
              "scenes": [
                {"id":"s","name":"S","frameCount":1,
                 "layers":[{"id":"l","name":"L","blendMode":"NORMAL",
                   "cels":[{"frame":0,"id":"c","surfaceId":7}]}]}
              ]
            }
        """.trimIndent()
        val p = ProjectCodec.fromJsonString(minimal)
        assertEquals("Min", p.name)
        assertEquals(64, p.canvas.widthPx)
        val cel = p.scenes[0].layers[0].cels[0]!!
        assertEquals(7L, cel.surfaceId)
        assertEquals(CelTransform(), cel.transform)
        assertEquals(1f, p.scenes[0].layers[0].opacity, 0f)
    }

    @Test(expected = IllegalArgumentException::class)
    fun decode_rejectsNewerFormatVersion() {
        val future = """{"version": 999, "id":"p","name":"x",
            "canvas":{"width":1,"height":1,"fps":1},"scenes":[]}"""
        ProjectCodec.fromJsonString(future)
    }

    @Test
    fun decode_emptyScenesYieldsNullActiveScene() {
        val doc = """{"version":1,"id":"p","name":"x",
            "canvas":{"width":1,"height":1,"fps":1},"scenes":[]}"""
        val p = ProjectCodec.fromJsonString(doc)
        assertNull(p.activeScene)
    }
}
