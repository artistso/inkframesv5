package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectSchemaV2Test {

    @Test
    fun roundTrip_preservesCanvasShapeAndExplicitHolds() {
        val scene = Scene(
            id = "scene",
            name = "Timing",
            frameCount = 4,
            layers = listOf(Layer(id = "layer", name = "Ink")),
            frameHolds = listOf(1, 2, 8, 3),
        )
        val project = Project(
            id = "project",
            name = "Circular timing",
            canvas = CanvasSpec(
                widthPx = 1024,
                heightPx = 768,
                fps = 24,
                shape = CanvasShape.CIRCLE,
            ),
            scenes = listOf(scene),
        )

        val json = ProjectCodec.toJsonString(project)
        val restored = ProjectCodec.fromJsonString(json)

        assertTrue(json.contains("\"version\": 2"))
        assertEquals(CanvasShape.CIRCLE, restored.canvas.shape)
        assertEquals(listOf(1, 2, 8, 3), restored.scenes.single().frameHolds)
        assertEquals(8, restored.scenes.single().holdAt(2))
    }

    @Test
    fun decodeV1_defaultsToSquareAndSingleFrameHolds() {
        val legacy = """
            {
              "version": 1,
              "id": "legacy",
              "name": "Legacy",
              "canvas": {"width": 320, "height": 240, "fps": 12},
              "scenes": [
                {"id":"scene","name":"Scene","frameCount":3,
                 "layers":[]}
              ]
            }
        """.trimIndent()

        val restored = ProjectCodec.fromJsonString(legacy)

        assertEquals(CanvasShape.SQUARE, restored.canvas.shape)
        assertEquals(listOf(1, 1, 1), restored.scenes.single().frameHolds)
    }

    @Test(expected = IllegalArgumentException::class)
    fun decode_rejectsHoldArrayWithWrongLength() {
        val malformed = """
            {
              "version": 2,
              "id": "bad",
              "name": "Bad",
              "canvas": {"width": 64, "height": 64, "fps": 12, "shape":"SQUARE"},
              "scenes": [
                {"id":"scene","name":"Scene","frameCount":3,
                 "holds":[1,2],"layers":[]}
              ]
            }
        """.trimIndent()

        ProjectCodec.fromJsonString(malformed)
    }

    @Test(expected = IllegalArgumentException::class)
    fun scene_rejectsHoldOutsideArtistContract() {
        Scene(name = "Bad", frameCount = 1, frameHolds = listOf(9))
    }

    @Test
    fun timelineInsertAndRemove_keepHoldsAlignedWithFrames() {
        val scene = Scene(
            id = "scene",
            name = "Scene",
            frameCount = 4,
            frameHolds = listOf(2, 3, 4, 5),
        )

        val inserted = TimelineOps.insertFrames(scene, at = 2, count = 2)
        assertEquals(6, inserted.frameCount)
        assertEquals(listOf(2, 3, 1, 1, 4, 5), inserted.frameHolds)

        val removed = TimelineOps.removeFrames(inserted, at = 1, count = 3)
        assertEquals(3, removed.frameCount)
        assertEquals(listOf(2, 4, 5), removed.frameHolds)
    }

    @Test
    fun setFrameHold_clampsToWebTimingBounds() {
        val scene = Scene(name = "Scene", frameCount = 2)

        val high = TimelineOps.setFrameHold(scene, frame = 0, hold = 99)
        val low = TimelineOps.setFrameHold(high, frame = 1, hold = -4)

        assertEquals(listOf(8, 1), low.frameHolds)
    }
}
