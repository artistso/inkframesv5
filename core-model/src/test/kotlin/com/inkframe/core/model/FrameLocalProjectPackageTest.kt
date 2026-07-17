package com.inkframe.core.model

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FrameLocalProjectPackageTest {

    @Test
    fun writeAndRead_roundTripsDocumentAndReferencedRasters() {
        val rasterA = RasterAssetId("raster-a")
        val rasterB = RasterAssetId("raster-b")
        val project = project(rasterA, rasterB)
        val source = mapOf(rasterA to PNG_BYTES, rasterB to PNG_BYTES)
        val output = ByteArrayOutputStream()

        FrameLocalProjectPackage.write(project, MapRasterIO(source), output)
        val packageBytes = output.toByteArray()

        assertEquals(
            ProjectContainerKind.NATIVE_ZIP,
            ProjectContainerSniffer.sniff(packageBytes.copyOfRange(0, minOf(packageBytes.size, 128))),
        )

        val decoded = LinkedHashMap<RasterAssetId, ByteArray>()
        val restored = FrameLocalProjectPackage.read(
            io = object : FrameLocalProjectPackage.RasterIO {
                override fun encode(id: RasterAssetId): ByteArray? = null
                override fun decode(id: RasterAssetId, pngBytes: ByteArray) {
                    decoded[id] = pngBytes
                }
            },
            input = ByteArrayInputStream(packageBytes),
        )

        assertEquals(project, restored)
        assertEquals(setOf(rasterA, rasterB), decoded.keys)
        assertTrue(decoded.values.all { it.contentEquals(PNG_BYTES) })
    }

    @Test(expected = IllegalArgumentException::class)
    fun write_rejectsMissingReferencedRaster() {
        val project = project(RasterAssetId("raster-a"), RasterAssetId("raster-b"))
        FrameLocalProjectPackage.write(
            project = project,
            io = MapRasterIO(mapOf(RasterAssetId("raster-a") to PNG_BYTES)),
            output = ByteArrayOutputStream(),
        )
    }

    @Test
    fun read_validatesCompleteReferenceSetBeforeAnyRasterDecode() {
        val rasterA = RasterAssetId("raster-a")
        val rasterB = RasterAssetId("raster-b")
        val document = FrameLocalProjectCodec.toJsonString(project(rasterA, rasterB)).toByteArray()
        val bytes = zip(
            FrameLocalProjectPackage.DOCUMENT_ENTRY to document,
            "rasters/${rasterA.value}.png" to PNG_BYTES,
        )
        var decoded = 0

        try {
            FrameLocalProjectPackage.read(
                io = object : FrameLocalProjectPackage.RasterIO {
                    override fun encode(id: RasterAssetId): ByteArray? = null
                    override fun decode(id: RasterAssetId, pngBytes: ByteArray) { decoded++ }
                },
                input = ByteArrayInputStream(bytes),
            )
            throw AssertionError("Expected missing raster rejection")
        } catch (_: IllegalArgumentException) {
            assertEquals(0, decoded)
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun read_rejectsOrphanRasterEntries() {
        val document = FrameLocalProjectCodec.toJsonString(project(null, null)).toByteArray()
        FrameLocalProjectPackage.read(
            io = MapRasterIO(emptyMap()),
            input = ByteArrayInputStream(
                zip(
                    FrameLocalProjectPackage.DOCUMENT_ENTRY to document,
                    "rasters/orphan.png" to PNG_BYTES,
                ),
            ),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun read_rejectsUnsafeEntryPaths() {
        val document = FrameLocalProjectCodec.toJsonString(project(null, null)).toByteArray()
        FrameLocalProjectPackage.read(
            io = MapRasterIO(emptyMap()),
            input = ByteArrayInputStream(
                zip(
                    FrameLocalProjectPackage.DOCUMENT_ENTRY to document,
                    "../document.json" to byteArrayOf(1),
                ),
            ),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun read_enforcesPerRasterByteLimit() {
        val raster = RasterAssetId("raster")
        val document = FrameLocalProjectCodec.toJsonString(project(raster, null)).toByteArray()
        FrameLocalProjectPackage.read(
            io = MapRasterIO(emptyMap()),
            input = ByteArrayInputStream(
                zip(
                    FrameLocalProjectPackage.DOCUMENT_ENTRY to document,
                    "rasters/raster.png" to PNG_BYTES,
                ),
            ),
            limits = FrameLocalProjectPackage.Limits(maxRasterBytes = 8),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun read_rejectsRasterWithoutPngSignature() {
        val raster = RasterAssetId("raster")
        val document = FrameLocalProjectCodec.toJsonString(project(raster, null)).toByteArray()
        FrameLocalProjectPackage.read(
            io = MapRasterIO(emptyMap()),
            input = ByteArrayInputStream(
                zip(
                    FrameLocalProjectPackage.DOCUMENT_ENTRY to document,
                    "rasters/raster.png" to ByteArray(32) { 7 },
                ),
            ),
        )
    }

    @Test
    fun readDocumentOnly_doesNotInvokeRasterCallbacks() {
        val raster = RasterAssetId("raster")
        val project = project(raster, null)
        val bytes = zip(
            FrameLocalProjectPackage.DOCUMENT_ENTRY to
                FrameLocalProjectCodec.toJsonString(project).toByteArray(),
            "rasters/raster.png" to PNG_BYTES,
        )
        var callbacks = 0

        val restored = FrameLocalProjectPackage.readDocumentOnly(ByteArrayInputStream(bytes))

        assertEquals(project, restored)
        assertEquals(0, callbacks)
    }

    private fun project(
        firstRaster: RasterAssetId?,
        backgroundRaster: RasterAssetId?,
    ): FrameLocalProject {
        val layer = FrameLayer(
            id = LayerId("layer"),
            name = "Ink",
            rasterId = firstRaster,
        )
        val frame = AnimationFrame(
            id = FrameId("frame"),
            layers = listOf(layer),
            activeLayerId = layer.id,
        )
        val scene = FrameLocalScene(
            id = SceneId("scene"),
            name = "Scene",
            frames = listOf(frame),
        )
        return FrameLocalProject(
            id = ProjectId("project"),
            name = "Project",
            canvas = CanvasSpec(64, 64, shape = CanvasShape.CIRCLE),
            background = StaticBackground(rasterId = backgroundRaster),
            scenes = listOf(scene),
            activeSceneId = scene.id,
            createdAtEpochMs = 1L,
            modifiedAtEpochMs = 2L,
        )
    }

    private fun zip(vararg entries: Pair<String, ByteArray>): ByteArray {
        val output = ByteArrayOutputStream()
        val zip = ZipOutputStream(output)
        for ((name, bytes) in entries) {
            zip.putNextEntry(ZipEntry(name))
            zip.write(bytes)
            zip.closeEntry()
        }
        zip.finish()
        return output.toByteArray()
    }

    private class MapRasterIO(
        private val source: Map<RasterAssetId, ByteArray>,
    ) : FrameLocalProjectPackage.RasterIO {
        override fun encode(id: RasterAssetId): ByteArray? = source[id]
        override fun decode(id: RasterAssetId, pngBytes: ByteArray) = Unit
    }

    private companion object {
        const val PNG_BASE64 =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        val PNG_BYTES: ByteArray = java.util.Base64.getDecoder().decode(PNG_BASE64)
    }
}
