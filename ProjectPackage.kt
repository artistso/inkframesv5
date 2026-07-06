package com.inkframe.core.model

import java.io.InputStream
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * Reads and writes the `.inkframe` project package: a ZIP archive laid out as
 *
 * ```
 *   document.json          structural model (ProjectCodec JSON)
 *   cels/<surfaceId>.png    one image per cel surface (RGBA)
 * ```
 *
 * Pixel encoding/decoding is delegated to a [CelImageIO] so this class stays
 * platform-independent (the Android implementation bridges GPU surfaces <-> PNG, while
 * tests can supply an in-memory fake). The packaging/zip logic here is plain JVM and is
 * unit-tested directly.
 */
object ProjectPackage {

    const val DOCUMENT_ENTRY = "document.json"
    const val CELS_DIR = "cels/"
    const val EXTENSION = "inkframe"

    /** Bridges cel surface ids to/from encoded image bytes (PNG). */
    interface CelImageIO {
        /** Returns PNG bytes for the cel [surfaceId], or null to skip writing it. */
        fun encode(surfaceId: Long): ByteArray?
        /** Restores a cel surface from PNG [bytes] under the given [surfaceId]. */
        fun decode(surfaceId: Long, bytes: ByteArray)
    }

    /** The set of cel surface ids referenced anywhere in [project]. */
    fun referencedSurfaceIds(project: Project): Set<Long> =
        project.scenes
            .flatMap { it.layers }
            .flatMap { it.cels.values }
            .map { it.surfaceId }
            .toSet()

    /**
     * Writes [project] and all of its referenced cel images to [out] as a ZIP.
     * The stream is NOT closed (caller owns it).
     */
    fun write(project: Project, io: CelImageIO, out: OutputStream) {
        val zip = ZipOutputStream(out)

        // 1) document.json
        zip.putNextEntry(ZipEntry(DOCUMENT_ENTRY))
        zip.write(ProjectCodec.toJsonString(project, pretty = true).toByteArray(Charsets.UTF_8))
        zip.closeEntry()

        // 2) cels/<surfaceId>.png
        for (surfaceId in referencedSurfaceIds(project).sorted()) {
            val bytes = io.encode(surfaceId) ?: continue
            zip.putNextEntry(ZipEntry("$CELS_DIR$surfaceId.png"))
            zip.write(bytes)
            zip.closeEntry()
        }

        zip.finish()
    }

    /**
     * Reads a project from a ZIP [input], restoring cel images via [io]. The stream is
     * NOT closed (caller owns it). Returns the decoded [Project]; cel pixels are pushed
     * into [io] as they are read.
     */
    fun read(io: CelImageIO, input: InputStream): Project {
        var document: Project? = null
        val pendingCels = LinkedHashMap<Long, ByteArray>()

        val zip = ZipInputStream(input)
        while (true) {
            val entry = zip.nextEntry ?: break
            val name = entry.name
            when {
                name == DOCUMENT_ENTRY -> {
                    document = ProjectCodec.fromJsonString(zip.readBytes().toString(Charsets.UTF_8))
                }
                name.startsWith(CELS_DIR) && name.endsWith(".png") -> {
                    val id = name.removePrefix(CELS_DIR).removeSuffix(".png").toLongOrNull()
                    if (id != null) pendingCels[id] = zip.readBytes()
                }
            }
            zip.closeEntry()
        }

        val project = document ?: error("Package is missing $DOCUMENT_ENTRY")
        // Push pixels for cels the document actually references (ignore orphans).
        val referenced = referencedSurfaceIds(project)
        for ((id, bytes) in pendingCels) {
            if (id in referenced) io.decode(id, bytes)
        }
        return project
    }

    /** Reads only the document (skips images) — handy for project browser previews. */
    fun readDocumentOnly(input: InputStream): Project {
        val zip = ZipInputStream(input)
        while (true) {
            val entry = zip.nextEntry ?: break
            if (entry.name == DOCUMENT_ENTRY) {
                return ProjectCodec.fromJsonString(zip.readBytes().toString(Charsets.UTF_8))
            }
            zip.closeEntry()
        }
        error("Package is missing $DOCUMENT_ENTRY")
    }
}
