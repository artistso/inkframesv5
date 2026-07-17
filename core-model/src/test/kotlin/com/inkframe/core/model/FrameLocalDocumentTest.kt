package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class FrameLocalDocumentTest {

    @Test
    fun duplicateFrame_preservesTopologyAndUsesCopyOnWriteRasterReferences() {
        val rasterA = RasterAssetId("raster-a")
        val rasterB = RasterAssetId("raster-b")
        val layerA = FrameLayer(
            id = LayerId("layer-a"),
            name = "Ink",
            rasterId = rasterA,
        )
        val layerB = FrameLayer(
            id = LayerId("layer-b"),
            name = "Glow",
            opacity = 0.5f,
            blendMode = BlendMode.ADD,
            rasterId = rasterB,
        )
        val frame = AnimationFrame(
            id = FrameId("frame-a"),
            hold = 4,
            layers = listOf(layerA, layerB),
            activeLayerId = layerB.id,
        )
        val scene = FrameLocalScene(
            id = SceneId("scene"),
            name = "Scene",
            frames = listOf(frame),
        )

        val duplicated = FrameLocalOps.duplicateFrame(
            scene = scene,
            sourceIndex = 0,
            newFrameId = FrameId("frame-b"),
            newLayerIds = listOf(LayerId("layer-c"), LayerId("layer-d")),
        )

        assertEquals(2, duplicated.frames.size)
        assertEquals(1, duplicated.activeFrameIndex)
        assertEquals(4, duplicated.frames[1].hold)
        assertEquals(LayerId("layer-d"), duplicated.frames[1].activeLayerId)
        assertEquals(rasterA, duplicated.frames[1].layers[0].rasterId)
        assertEquals(rasterB, duplicated.frames[1].layers[1].rasterId)
        assertEquals(BlendMode.ADD, duplicated.frames[1].layers[1].blendMode)

        val project = project(duplicated)
        assertEquals(2, FrameLocalOps.rasterReferenceCounts(project)[rasterA])
        assertEquals(2, FrameLocalOps.rasterReferenceCounts(project)[rasterB])
        assertTrue(FrameLocalOps.requiresCopyOnWrite(project, rasterA))

        val detached = FrameLocalOps.replaceLayerRaster(
            project = project,
            sceneId = duplicated.id,
            frameId = FrameId("frame-b"),
            layerId = LayerId("layer-c"),
            rasterId = RasterAssetId("raster-c"),
            modifiedAtEpochMs = 50L,
        )
        assertFalse(FrameLocalOps.requiresCopyOnWrite(detached, rasterA))
        assertEquals(rasterA, detached.scenes.single().frames[0].layers[0].rasterId)
        assertEquals(
            RasterAssetId("raster-c"),
            detached.scenes.single().frames[1].layers[0].rasterId,
        )
    }

    @Test
    fun insertAndRemoveFrame_keepSelectionAndPlaybackRangeValid() {
        val frameA = frame("frame-a", "layer-a")
        val frameB = frame("frame-b", "layer-b")
        val frameC = frame("frame-c", "layer-c")
        val scene = FrameLocalScene(
            id = SceneId("scene"),
            name = "Scene",
            frames = listOf(frameA, frameB, frameC),
            activeFrameIndex = 1,
            playbackRange = 1..2,
        )

        val inserted = FrameLocalOps.insertBlankFrame(
            scene = scene,
            at = 1,
            frameId = FrameId("inserted"),
            layerId = LayerId("inserted-layer"),
        )
        assertEquals(4, inserted.frames.size)
        assertEquals(2, inserted.activeFrameIndex)
        assertEquals(2..3, inserted.playbackRange)
        assertEquals(FrameId("frame-b"), inserted.activeFrame.id)

        val removed = FrameLocalOps.removeFrame(inserted, frameIndex = 2)
        assertEquals(3, removed.frames.size)
        assertEquals(2, removed.activeFrameIndex)
        assertEquals(FrameId("frame-c"), removed.activeFrame.id)
        assertEquals(2..2, removed.playbackRange)
    }

    @Test
    fun frameLocalLayerOperations_doNotRequireCrossFrameIdentity() {
        val first = AnimationFrame(
            id = FrameId("frame-a"),
            layers = listOf(
                FrameLayer(id = LayerId("a-bottom"), name = "Bottom"),
                FrameLayer(id = LayerId("a-top"), name = "Top"),
            ),
            activeLayerId = LayerId("a-top"),
        )
        val second = frame("frame-b", "b-only")
        val scene = FrameLocalScene(
            id = SceneId("scene"),
            name = "Scene",
            frames = listOf(first, second),
        )

        val editedFirst = FrameLocalOps.deleteLayer(first, LayerId("a-top"))
        val updated = FrameLocalOps.replaceFrame(scene, 0, editedFirst)

        assertEquals(listOf("Bottom"), updated.frames[0].layers.map { it.name })
        assertEquals(LayerId("a-bottom"), updated.frames[0].activeLayerId)
        assertSame(second, updated.frames[1])
        assertEquals(LayerId("b-only"), updated.frames[1].activeLayerId)
    }

    @Test
    fun rasterReferenceCounts_includeStaticBackground() {
        val shared = RasterAssetId("shared")
        val scene = FrameLocalScene(
            id = SceneId("scene"),
            name = "Scene",
            frames = listOf(
                AnimationFrame(
                    id = FrameId("frame"),
                    layers = listOf(
                        FrameLayer(
                            id = LayerId("layer"),
                            name = "Ink",
                            rasterId = shared,
                        ),
                    ),
                ),
            ),
        )
        val project = FrameLocalProject(
            id = ProjectId("project"),
            name = "Project",
            canvas = CanvasSpec(64, 64),
            background = StaticBackground(rasterId = shared),
            scenes = listOf(scene),
            activeSceneId = scene.id,
            createdAtEpochMs = 1L,
            modifiedAtEpochMs = 1L,
        )

        assertEquals(2, FrameLocalOps.rasterReferenceCounts(project)[shared])
        assertTrue(FrameLocalOps.requiresCopyOnWrite(project, shared))
    }

    @Test(expected = IllegalArgumentException::class)
    fun project_rejectsDuplicateLayerIdsAcrossFrames() {
        val duplicate = LayerId("duplicate")
        val scene = FrameLocalScene(
            name = "Scene",
            frames = listOf(
                AnimationFrame(
                    id = FrameId("a"),
                    layers = listOf(FrameLayer(id = duplicate, name = "A")),
                ),
                AnimationFrame(
                    id = FrameId("b"),
                    layers = listOf(FrameLayer(id = duplicate, name = "B")),
                ),
            ),
        )
        project(scene)
    }

    @Test(expected = IllegalArgumentException::class)
    fun frame_rejectsActiveLayerOutsideItsOwnTopology() {
        AnimationFrame(
            id = FrameId("frame"),
            layers = listOf(FrameLayer(id = LayerId("layer"), name = "Ink")),
            activeLayerId = LayerId("missing"),
        )
    }

    private fun frame(frameId: String, layerId: String): AnimationFrame =
        AnimationFrame(
            id = FrameId(frameId),
            layers = listOf(FrameLayer(id = LayerId(layerId), name = "Layer")),
        )

    private fun project(scene: FrameLocalScene): FrameLocalProject =
        FrameLocalProject(
            id = ProjectId("project"),
            name = "Project",
            canvas = CanvasSpec(64, 64),
            scenes = listOf(scene),
            activeSceneId = scene.id,
            createdAtEpochMs = 1L,
            modifiedAtEpochMs = 1L,
        )
}
