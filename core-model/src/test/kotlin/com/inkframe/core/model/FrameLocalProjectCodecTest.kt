package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FrameLocalProjectCodecTest {

    @Test
    fun roundTrip_preservesFrameLocalTopologyAndStableRasterIds() {
        val shared = RasterAssetId("shared-raster")
        val scene = FrameLocalScene(
            id = SceneId("scene"),
            name = "Shot",
            frames = listOf(
                AnimationFrame(
                    id = FrameId("frame-a"),
                    hold = 2,
                    layers = listOf(
                        FrameLayer(
                            id = LayerId("ink-a"),
                            name = "Ink",
                            rasterId = shared,
                        ),
                        FrameLayer(
                            id = LayerId("glow-a"),
                            name = "Glow",
                            opacity = 0.6f,
                            blendMode = BlendMode.ADD,
                            rasterId = RasterAssetId("glow-raster"),
                        ),
                    ),
                    activeLayerId = LayerId("glow-a"),
                ),
                AnimationFrame(
                    id = FrameId("frame-b"),
                    hold = 8,
                    layers = listOf(
                        FrameLayer(
                            id = LayerId("cleanup-b"),
                            name = "Cleanup",
                            visible = false,
                            locked = true,
                            blendMode = BlendMode.MULTIPLY,
                            rasterId = shared,
                        ),
                    ),
                ),
            ),
            activeFrameIndex = 1,
            playbackRange = 0..1,
            loop = false,
        )
        val project = FrameLocalProject(
            id = ProjectId("project"),
            name = "Orbit",
            canvas = CanvasSpec(
                widthPx = 1920,
                heightPx = 1080,
                fps = 24,
                backgroundColor = RgbaColor(0.1f, 0.2f, 0.3f, 1f),
                shape = CanvasShape.CIRCLE,
            ),
            background = StaticBackground(
                opacity = 0.4f,
                blendMode = BlendMode.SCREEN,
                rasterId = RasterAssetId("background-raster"),
            ),
            scenes = listOf(scene),
            activeSceneId = scene.id,
            createdAtEpochMs = 10L,
            modifiedAtEpochMs = 20L,
        )

        val json = FrameLocalProjectCodec.toJsonString(project)
        val restored = FrameLocalProjectCodec.fromJsonString(json)

        assertTrue(json.contains("\"version\": 3"))
        assertTrue(json.contains("\"topology\": \"frame-local\""))
        assertEquals(project, restored)
        assertEquals(shared, restored.scenes.single().frames[0].layers[0].rasterId)
        assertEquals(shared, restored.scenes.single().frames[1].layers[0].rasterId)
        assertEquals(8, restored.scenes.single().frames[1].hold)
        assertEquals(CanvasShape.CIRCLE, restored.canvas.shape)
    }

    @Test
    fun decode_allowsTransparentUnallocatedRaster() {
        val json = """
            {
              "format":"inkframe-project",
              "version":3,
              "topology":"frame-local",
              "id":"project",
              "name":"Blank",
              "canvas":{"width":64,"height":64,"fps":12,"shape":"SQUARE"},
              "scenes":[{
                "id":"scene","name":"Scene","activeFrame":0,
                "playbackStart":0,"playbackEnd":0,"loop":true,
                "frames":[{
                  "id":"frame","hold":1,"activeLayerId":"layer",
                  "layers":[{"id":"layer","name":"Layer","rasterId":null}]
                }]
              }]
            }
        """.trimIndent()

        val restored = FrameLocalProjectCodec.fromJsonString(json)

        assertNull(restored.background.rasterId)
        assertNull(restored.activeScene.activeFrame.activeLayer.rasterId)
    }

    @Test(expected = IllegalArgumentException::class)
    fun decode_rejectsOlderSparseTopologyInsteadOfGuessing() {
        FrameLocalProjectCodec.fromJsonString(
            """
            {
              "format":"inkframe-project",
              "version":2,
              "id":"project",
              "name":"Old",
              "canvas":{"width":64,"height":64,"fps":12},
              "scenes":[]
            }
            """.trimIndent(),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun decode_rejectsUnknownBlendMode() {
        FrameLocalProjectCodec.fromJsonString(
            """
            {
              "format":"inkframe-project",
              "version":3,
              "topology":"frame-local",
              "id":"project",
              "name":"Bad",
              "canvas":{"width":64,"height":64,"fps":12},
              "scenes":[{
                "id":"scene","name":"Scene","frames":[{
                  "id":"frame","activeLayerId":"layer",
                  "layers":[{"id":"layer","name":"Layer","blendMode":"COLOR_DODGE"}]
                }]
              }]
            }
            """.trimIndent(),
        )
    }
}
