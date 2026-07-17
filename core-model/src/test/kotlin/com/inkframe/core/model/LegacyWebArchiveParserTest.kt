package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LegacyWebArchiveParserTest {

    @Test
    fun parseV4_preservesFrameLocalTopologyBackgroundShapeAndHolds() {
        val archive = LegacyWebArchiveParser.parse(
            """
            {
              "v":4,
              "app":"InkFrame Studio",
              "kind":"inkframe-web-archive",
              "savedAt":123456,
              "active":0,
              "projects":[{
                "name":"Orbit",
                "w":2,
                "h":2,
                "cur":1,
                "fps":24,
                "paper":"#fff0f3",
                "canvasShape":"circle",
                "background":{
                  "visible":true,
                  "opacity":0.5,
                  "blend":"multiply",
                  "png":"$PNG_DATA_URL"
                },
                "holds":[1,8],
                "frames":[
                  {"active":1,"layers":[
                    {"name":"Ink","visible":true,"opacity":1,"blend":"source-over","png":"$PNG_DATA_URL"},
                    {"name":"Glow","visible":false,"opacity":0.75,"blend":"lighter","png":"$PNG_DATA_URL"}
                  ]},
                  {"active":0,"layers":[
                    {"name":"Cleanup","visible":true,"opacity":0.8,"blend":"screen","png":"$PNG_DATA_URL"}
                  ]}
                ]
              }]
            }
            """.trimIndent(),
        )

        assertEquals(4, archive.version)
        assertEquals(123456L, archive.savedAtEpochMs)
        assertEquals(0, archive.activeProjectIndex)
        assertTrue(archive.warnings.isEmpty())

        val project = archive.projects.single()
        assertEquals("Orbit", project.name)
        assertEquals(CanvasShape.CIRCLE, project.canvasShape)
        assertEquals(listOf(1, 8), project.frameHolds)
        assertEquals(1, project.currentFrameIndex)
        assertEquals(BlendMode.MULTIPLY, project.background!!.blendMode)
        assertEquals(2, project.frames[0].layers.size)
        assertEquals(1, project.frames[0].activeLayerIndex)
        assertEquals("Glow", project.frames[0].layers[1].name)
        assertEquals(BlendMode.ADD, project.frames[0].layers[1].blendMode)
        assertFalse(project.frames[0].layers[1].visible)
        assertTrue(project.frames[0].layers[0].pngBytes!!.contentEquals(PNG_BYTES))
    }

    @Test
    fun parseV3_defaultsToSquareAndNoStaticBackground() {
        val archive = LegacyWebArchiveParser.parse(
            """
            {
              "v":3,
              "kind":"inkframe-web-archive",
              "active":0,
              "projects":[{
                "name":"Legacy",
                "w":16,
                "h":9,
                "fps":12,
                "holds":[2],
                "frames":[{"active":0,"layers":[{"png":"$PNG_DATA_URL"}]}]
              }]
            }
            """.trimIndent(),
        )

        val project = archive.projects.single()
        assertEquals(CanvasShape.SQUARE, project.canvasShape)
        assertNull(project.background)
        assertEquals("#fff0f3", project.paperColor)
        assertEquals(listOf(2), project.frameHolds)
    }

    @Test
    fun parse_acceptsSingletonProjectAndDirectFrameRaster() {
        val archive = LegacyWebArchiveParser.parse(
            """
            {
              "v":3,
              "kind":"inkframe-web-archive",
              "active":99,
              "project":{
                "w":4,
                "h":4,
                "cur":7,
                "fps":12,
                "frames":[{"png":"$PNG_DATA_URL"}]
              }
            }
            """.trimIndent(),
        )

        assertEquals(0, archive.activeProjectIndex)
        assertEquals(0, archive.projects.single().currentFrameIndex)
        assertEquals("Layer 1", archive.projects.single().frames.single().layers.single().name)
        assertTrue(archive.warnings.any { it.contains("singleton") })
        assertTrue(archive.warnings.any { it.contains("clamped") })
    }

    @Test(expected = LegacyWebArchiveException::class)
    fun parse_rejectsUnknownBlendInsteadOfSilentlyChangingRendering() {
        LegacyWebArchiveParser.parse(
            minimalArchive(
                layer = """{"blend":"color-dodge","png":"$PNG_DATA_URL"}""",
            ),
        )
    }

    @Test(expected = LegacyWebArchiveException::class)
    fun parse_rejectsNonPngDataUrl() {
        LegacyWebArchiveParser.parse(
            minimalArchive(
                layer = """{"png":"data:image/jpeg;base64,AAAA"}""",
            ),
        )
    }

    @Test(expected = LegacyWebArchiveException::class)
    fun parse_rejectsHoldArrayThatDoesNotMatchFrames() {
        LegacyWebArchiveParser.parse(
            """
            {
              "v":4,
              "kind":"inkframe-web-archive",
              "projects":[{
                "w":2,"h":2,"fps":12,
                "holds":[1,2],
                "frames":[{"layers":[{"png":"$PNG_DATA_URL"}]}]
              }]
            }
            """.trimIndent(),
        )
    }

    @Test(expected = LegacyWebArchiveException::class)
    fun parse_enforcesTotalSurfaceAllocationLimitBeforePublication() {
        LegacyWebArchiveParser.parse(
            minimalArchive(),
            LegacyWebArchiveParser.Limits(maxTotalSurfacePixels = 3),
        )
    }

    @Test
    fun contentSniff_distinguishesLegacyJsonFromNativeZipOrArbitraryJson() {
        assertTrue(LegacyWebArchiveParser.looksLikeLegacyJson(minimalArchive()))
        assertFalse(LegacyWebArchiveParser.looksLikeLegacyJson("PK\u0003\u0004"))
        assertFalse(LegacyWebArchiveParser.looksLikeLegacyJson("{\"hello\":\"world\"}"))
    }

    private fun minimalArchive(
        layer: String = """{"blend":"source-over","png":"$PNG_DATA_URL"}""",
    ): String =
        """
        {
          "v":4,
          "kind":"inkframe-web-archive",
          "projects":[{
            "w":2,
            "h":2,
            "fps":12,
            "holds":[1],
            "frames":[{"layers":[$layer]}]
          }]
        }
        """.trimIndent()

    private companion object {
        const val PNG_BASE64 =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        const val PNG_DATA_URL = "data:image/png;base64,$PNG_BASE64"
        val PNG_BYTES: ByteArray = java.util.Base64.getDecoder().decode(PNG_BASE64)
    }
}
