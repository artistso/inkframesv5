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
        val holds = List(36) { index -> if (index == 5) 3 else 1 }
        val scene = Scene(
            id = "scene-1",
            name = "Shot 01",
            frameCount = 36,
            layers = listOf(layer1, layer2),
            playbackRange = 2..30,
            loop = false,
            holds = holds,
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
        val restored = ProjectCodec.fromJsonString(ProjectCodec.toJsonString(original))

        assertEquals(original.id, restored.id)
        assertEquals(original.name, restored.name)
        assertEquals(original.canvas, restored.canvas)
        assertEquals(original.activeSceneId, restored.activeSceneId)
        assertEquals(original.createdAtEpochMs, restored.createdAtEpochMs)
        assertEquals(original.modifiedAtEpochMs, restored.modifiedAtEpochMs)
        assertEquals(original.scenes, restored.scenes)
        assertEquals(original.copy(colorPalette = restored.colorPalette), restored)
    }

    @Test
    fun roundTrip_preservesCelTransformsSparseCelsAndExplicitHolds() {
        val restored = ProjectCodec.fromJsonString(ProjectCodec.toJsonString(sampleProject()))
        val scene = restored.scenes[0]
        val layer = scene.layers[0]
        assertEquals(2, layer.cels.size)
        assertEquals(100L, layer.cels[0]!!.surfaceId)
        assertEquals(101L, layer.cels[5]!!.surfaceId)
        assertEquals(45f, layer.cels[5]!!.transform.rotationDeg, 1e-4f)
        assertEquals(100L, layer.celAt(3)?.surfaceId)
        assertEquals(3, scene.holdAt(5))
    }

    @Test
    fun roundTrip_preservesBlendModesAndPlaybackRange() {
        val restored = ProjectCodec.fromJsonString(ProjectCodec.toJsonString(sampleProject()))
        assertEquals(BlendMode.MULTIPLY, restored.scenes[0].layers[0].blendMode)
        assertEquals(2..30, restored.scenes[0].playbackRange)
        assertEquals(false, restored.scenes[0].loop)
    }

    @Test
    fun decode_v1WithoutHoldsMigratesToUnitExposure() {
        val minimal = """
            {
              "version": 1,
              "id": "p",
              "name": "Min",
              "canvas": {"width": 64, "height": 64, "fps": 12},
              "scenes": [
                {"id":"s","name":"S","frameCount":3,
                 "layers":[{"id":"l","name":"L","blendMode":"NORMAL",
                   "cels":[{"frame":0,"id":"c","surfaceId":7}]}]}
              ]
            }
        """.trimIndent()
        val p = ProjectCodec.fromJsonString(minimal)
        assertEquals("Min", p.name)
        assertEquals(64, p.canvas.widthPx)
        assertEquals(listOf(1, 1, 1), p.scenes[0].holds)
        val cel = p.scenes[0].layers[0].cels[0]!!
        assertEquals(7L, cel.surfaceId)
        assertEquals(CelTransform(), cel.transform)
        assertEquals(1f, p.scenes[0].layers[0].opacity, 0f)
    }

    @Test
    fun decode_normalizesMalformedHoldValuesAndLength() {
        val doc = projectWithHolds("[0,2,99]")
        val p = ProjectCodec.fromJsonString(doc)
        assertEquals(listOf(1, 2, 8, 1), p.scenes[0].holds)
    }

    @Test
    fun decode_nullOrNonArrayHoldsFallBackToUnitExposure() {
        for (holds in listOf("null", "\"not-an-array\"", "{}")) {
            val p = ProjectCodec.fromJsonString(projectWithHolds(holds))
            assertEquals(listOf(1, 1, 1, 1), p.scenes[0].holds)
        }
    }

    @Test
    fun decode_nonNumericHoldEntriesFallBackIndividually() {
        val p = ProjectCodec.fromJsonString(projectWithHolds("[2,\"bad\",null,true]"))
        assertEquals(listOf(2, 1, 1, 1), p.scenes[0].holds)
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

    private fun projectWithHolds(holds: String): String = """
        {
          "version": 2,
          "id":"p","name":"x",
          "canvas":{"width":1,"height":1,"fps":1},
          "scenes":[{"id":"s","name":"S","frameCount":4,
            "holds":$holds,"layers":[]}]
        }
    """.trimIndent()
}
