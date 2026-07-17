package com.inkframe.core.model

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * Native frame-local `.inkframe` package.
 *
 * Layout:
 *
 * ```text
 * document.json
 * rasters/<stable-raster-id>.png
 * previews/...                         optional and ignored by the document decoder
 * ```
 */
object FrameLocalProjectPackage {

    const val DOCUMENT_ENTRY = "document.json"
    const val RASTERS_DIR = "rasters/"
    const val PREVIEWS_DIR = "previews/"

    data class Limits(
        val maxEntries: Int = 8_192,
        val maxDocumentBytes: Int = 4 * 1024 * 1024,
        val maxRasterBytes: Int = 64 * 1024 * 1024,
        val maxTotalRasterBytes: Long = 512L * 1024L * 1024L,
        val maxPreviewBytes: Int = 16 * 1024 * 1024,
    )

    interface RasterIO {
        /** Returns encoded PNG bytes for a durable raster ID, or null when the asset is missing. */
        fun encode(id: RasterAssetId): ByteArray?

        /** Stages one fully validated PNG under its durable raster ID. */
        fun decode(id: RasterAssetId, pngBytes: ByteArray)
    }

    fun referencedRasterIds(project: FrameLocalProject): Set<RasterAssetId> {
        val ids = LinkedHashSet<RasterAssetId>()
        project.background.rasterId?.let(ids::add)
        for (scene in project.scenes) {
            for (frame in scene.frames) {
                for (layer in frame.layers) layer.rasterId?.let(ids::add)
            }
        }
        return ids
    }

    /** Writes a complete package. Every referenced raster is mandatory and must be a PNG. */
    fun write(
        project: FrameLocalProject,
        io: RasterIO,
        output: OutputStream,
        limits: Limits = Limits(),
    ) {
        val documentBytes = FrameLocalProjectCodec.toJsonString(project, pretty = true)
            .toByteArray(Charsets.UTF_8)
        require(documentBytes.size <= limits.maxDocumentBytes) {
            "document.json exceeds ${limits.maxDocumentBytes} bytes"
        }
        val rasterIds = referencedRasterIds(project).sortedBy { it.value }
        require(rasterIds.size + 1 <= limits.maxEntries) { "Package entry count exceeds ${limits.maxEntries}" }

        val encoded = LinkedHashMap<RasterAssetId, ByteArray>()
        var totalRasterBytes = 0L
        for (id in rasterIds) {
            val bytes = io.encode(id)
                ?: throw IllegalArgumentException("Missing referenced raster ${id.value}")
            validatePng(bytes, "raster ${id.value}")
            require(bytes.size <= limits.maxRasterBytes) {
                "Raster ${id.value} exceeds ${limits.maxRasterBytes} bytes"
            }
            totalRasterBytes += bytes.size
            require(totalRasterBytes <= limits.maxTotalRasterBytes) {
                "Raster payload exceeds ${limits.maxTotalRasterBytes} bytes"
            }
            encoded[id] = bytes
        }

        val zip = ZipOutputStream(output)
        zip.putNextEntry(ZipEntry(DOCUMENT_ENTRY))
        zip.write(documentBytes)
        zip.closeEntry()
        for ((id, bytes) in encoded) {
            zip.putNextEntry(ZipEntry(rasterEntry(id)))
            zip.write(bytes)
            zip.closeEntry()
        }
        zip.finish()
    }

    /**
     * Reads and validates an entire package before invoking [RasterIO.decode].
     *
     * The callback should stage assets in a temporary generation. If any callback fails, the caller
     * must discard that generation rather than publish a partially imported project.
     */
    fun read(
        io: RasterIO,
        input: InputStream,
        limits: Limits = Limits(),
    ): FrameLocalProject {
        val contents = readContents(input, limits)
        val project = FrameLocalProjectCodec.fromJsonString(contents.document.toString(Charsets.UTF_8))
        val referenced = referencedRasterIds(project)
        val available = contents.rasters.keys
        val missing = referenced - available
        require(missing.isEmpty()) {
            "Package is missing referenced rasters: ${missing.joinToString { it.value }}"
        }
        val orphaned = available - referenced
        require(orphaned.isEmpty()) {
            "Package contains orphan rasters: ${orphaned.joinToString { it.value }}"
        }

        for (id in referenced.sortedBy { it.value }) {
            val bytes = contents.rasters.getValue(id)
            try {
                io.decode(id, bytes.copyOf())
            } catch (error: Throwable) {
                throw IllegalArgumentException("Failed to stage raster ${id.value}", error)
            }
        }
        return project
    }

    fun readDocumentOnly(
        input: InputStream,
        limits: Limits = Limits(),
    ): FrameLocalProject {
        val contents = readContents(input, limits)
        return FrameLocalProjectCodec.fromJsonString(contents.document.toString(Charsets.UTF_8))
    }

    private data class Contents(
        val document: ByteArray,
        val rasters: Map<RasterAssetId, ByteArray>,
    )

    private fun readContents(input: InputStream, limits: Limits): Contents {
        var document: ByteArray? = null
        val rasters = LinkedHashMap<RasterAssetId, ByteArray>()
        var totalRasterBytes = 0L
        var entries = 0
        val zip = ZipInputStream(input)

        while (true) {
            val entry = zip.nextEntry ?: break
            entries++
            require(entries <= limits.maxEntries) { "Package has more than ${limits.maxEntries} entries" }
            val name = entry.name
            require(!name.startsWith('/') && !name.contains("\\") && name.split('/').none { it == ".." }) {
                "Unsafe package entry: $name"
            }
            when {
                entry.isDirectory -> Unit
                name == DOCUMENT_ENTRY -> {
                    require(document == null) { "Package contains duplicate $DOCUMENT_ENTRY" }
                    document = readBounded(zip, limits.maxDocumentBytes, DOCUMENT_ENTRY)
                }
                name.startsWith(RASTERS_DIR) && name.endsWith(".png") -> {
                    val encodedId = name.removePrefix(RASTERS_DIR).removeSuffix(".png")
                    require(encodedId.isNotEmpty() && !encodedId.contains('/')) { "Invalid raster entry: $name" }
                    val id = RasterAssetId(encodedId)
                    require(!rasters.containsKey(id)) { "Duplicate raster entry: ${id.value}" }
                    val bytes = readBounded(zip, limits.maxRasterBytes, name)
                    validatePng(bytes, name)
                    totalRasterBytes += bytes.size
                    require(totalRasterBytes <= limits.maxTotalRasterBytes) {
                        "Raster payload exceeds ${limits.maxTotalRasterBytes} bytes"
                    }
                    rasters[id] = bytes
                }
                name.startsWith(PREVIEWS_DIR) -> {
                    // Previews are disposable metadata and never document authority.
                    readBounded(zip, limits.maxPreviewBytes, name)
                }
                else -> throw IllegalArgumentException("Unsupported package entry: $name")
            }
            zip.closeEntry()
        }

        return Contents(
            document = document ?: error("Package is missing $DOCUMENT_ENTRY"),
            rasters = rasters,
        )
    }

    private fun readBounded(input: InputStream, maxBytes: Int, label: String): ByteArray {
        val output = ByteArrayOutputStream(minOf(maxBytes, 16 * 1024))
        val buffer = ByteArray(16 * 1024)
        var total = 0
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            require(total <= maxBytes) { "$label exceeds $maxBytes bytes" }
            output.write(buffer, 0, read)
        }
        return output.toByteArray()
    }

    private fun rasterEntry(id: RasterAssetId): String = "$RASTERS_DIR${id.value}.png"

    private fun validatePng(bytes: ByteArray, label: String) {
        require(bytes.size >= PNG_SIGNATURE.size) { "$label is too small to be a PNG" }
        require(PNG_SIGNATURE.indices.all { bytes[it] == PNG_SIGNATURE[it] }) {
            "$label does not have a PNG signature"
        }
    }

    private val PNG_SIGNATURE = byteArrayOf(
        0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    )
}
