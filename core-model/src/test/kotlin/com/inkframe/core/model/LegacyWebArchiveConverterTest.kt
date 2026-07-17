package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LegacyWebArchiveConverterTest {

    @Test
    fun convert_preservesEveryFramesIndependentLayerTopology() {
        val archive = LegacyWebArchiveParser.parse(archiveJson())
        val stored = ArrayList<LegacyRasterPayload>()
        val converted = LegacyWebArchiveConverter.convert(
            archive = archive,
            rasterStore = LegacyRasterStore { payload ->
                stored += payload
                RasterAssetId("raster-${stored.size}")
            },
            idFactory = DeterministicIds,
            importedAtEpochMs = 999L,
        )

        assertEquals(0, converted.activeProjectIndex)
        val project = converted.projects.single()
        assertEquals(ProjectId("project-0"), project.id)
        assertEquals(CanvasShape.CIRCLE, project.canvas.shape)
        assertEquals(24, project.canvas.fps)
        assertEquals(123L, project.createdAtEpochMs)
        assertEquals(999L, project.modifiedAtEpochMs)
        assertEquals(RasterAssetId("raster-4"), project.background.rasterId)

        val scene = project.activeScene
        assertEquals(1, scene.activeFrameIndex)
        assertEquals(2, scene.frames.size)
        assertEquals(2, scene.frames[0].layers.size)
        assertEquals(1, scene.frames[1].layers.size)
        assertEquals(2, scene.frames[0].hold)
        assertEquals(8, scene.frames[1].hold)
        assertEquals(LayerId("layer-0-0-1"), scene.frames[0].activeLayerId)
        assertEquals(LayerId("layer-0-1-0"), scene.frames[1].activeLayerId)
        assertEquals("Glow", scene.frames[0].layers[1].name)
        assertEquals(BlendMode.ADD, scene.frames[0].layers[1].blendMode)
        assertFalse(scene.frames[1].layers[0].visible)

        assertEquals(
            listOf(
                "projects/0/frames/0/layers/0",
                "projects/0/frames/0/layers/1",
                "projects/0/frames/1/layers/0",
                "projects/0/background",
            ),
            stored.map { it.logicalPath },
        )
        assertTrue(stored.all { it.pngBytes.contentEquals(PNG_BYTES) })
    }

    @Test
    fun convert_keepsBlankLayersUnallocated() {
        val archive = LegacyWebArchiveParser.parse(
            """
            {
              "v":3,
              "kind":"inkframe-web-archive",
              "projects":[{
                "name":"Blank","w":64,"h":64,"fps":12,
                "holds":[1],
                "frames":[{"active":0,"layers":[{"name":"Layer"}]}]
              }]
            }
            """.trimIndent(),
        )
        var stores = 0
        val converted = LegacyWebArchiveConverter.convert(
            archive = archive,
            rasterStore = LegacyRasterStore {
                stores++
                RasterAssetId("unexpected")
            },
            idFactory = DeterministicIds,
            importedAtEpochMs = 1L,
        )

        assertEquals(0, stores)
        assertNull(converted.projects.single().activeScene.activeFrame.activeLayer.rasterId)
    }

    @Test
    fun parseCssHexColor_supportsShortLongAndAlphaForms() {
        assertEquals(
            RgbaColor(1f, 0f, 0.53333336f, 1f),
            LegacyWebArchiveConverter.parseCssHexColor("#f08"),
        )
        assertEquals(
            RgbaColor(1f, 0f, 0.53333336f, 0.6666667f),
            LegacyWebArchiveConverter.parseCssHexColor("#f08a"),
        )
        assertEquals(
            RgbaColor(0x12 / 255f, 0x34 / 255f, 0x56 / 255f, 0x78 / 255f),
            LegacyWebArchiveConverter.parseCssHexColor("#12345678"),
        )
    }

    @Test(expected = LegacyWebArchiveException::class)
    fun convert_rejectsUnsupportedPaperSyntax() {
        val archive = LegacyWebArchiveParser.parse(
            """
            {
              "v":3,
              "kind":"inkframe-web-archive",
              "projects":[{
                "w":64,"h":64,"fps":12,"paper":"rose",
                "holds":[1],"frames":[{"layers":[{}]}]
              }]
            }
            """.trimIndent(),
        )
        LegacyWebArchiveConverter.convert(
            archive = archive,
            rasterStore = LegacyRasterStore { RasterAssetId("raster") },
            idFactory = DeterministicIds,
            importedAtEpochMs = 1L,
        )
    }

    @Test(expected = LegacyWebArchiveException::class)
    fun convert_failsBeforePublishingWhenRasterStoreFails() {
        val archive = LegacyWebArchiveParser.parse(archiveJson())
        LegacyWebArchiveConverter.convert(
            archive = archive,
            rasterStore = LegacyRasterStore { throw IllegalStateException("disk full") },
            idFactory = DeterministicIds,
            importedAtEpochMs = 1L,
        )
    }

    private fun archiveJson(): String =
        """
        {
          "v":4,
          "kind":"inkframe-web-archive",
          "savedAt":123,
          "active":0,
          "projects":[{
            "name":"Orbit","w":320,"h":240,"cur":1,"fps":24,
            "paper":"#112233","canvasShape":"circle","holds":[2,8],
            "background":{"visible":true,"opacity":0.5,"blend":"screen","png":"$PNG_DATA_URL"},
            "frames":[
              {"active":1,"layers":[
                {"name":"Ink","visible":true,"opacity":1,"blend":"source-over","png":"$PNG_DATA_URL"},
                {"name":"Glow","visible":true,"opacity":0.6,"blend":"lighter","png":"$PNG_DATA_URL"}
              ]},
              {"active":0,"layers":[
                {"name":"Cleanup","visible":false,"opacity":0.8,"blend":"multiply","png":"$PNG_DATA_URL"}
              ]}
            ]
          }]
        }
        """.trimIndent()

    private object DeterministicIds : LegacyImportIdFactory {
        override fun projectId(projectIndex: Int): ProjectId = ProjectId("project-$projectIndex")
        override fun sceneId(projectIndex: Int): SceneId = SceneId("scene-$projectIndex")
        override fun frameId(projectIndex: Int, frameIndex: Int): FrameId =
            FrameId("frame-$projectIndex-$frameIndex")

        override fun layerId(projectIndex: Int, frameIndex: Int, layerIndex: Int): LayerId =
            LayerId("layer-$projectIndex-$frameIndex-$layerIndex")
    }

    private companion object {
        const val PNG_BASE64 =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        const val PNG_DATA_URL = "data:image/png;base64,$PNG_BASE64"
        val PNG_BYTES: ByteArray = java.util.Base64.getDecoder().decode(PNG_BASE64)
    }
}
