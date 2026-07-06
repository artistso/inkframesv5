package com.inkframe.core.model

/**
 * Pure metadata describing the document/media kinds InkFrame reads and writes, plus the
 * MIME types, file extensions and suggested file names the Storage Access Framework needs.
 *
 * Keeping this in pure Kotlin (no Android `Uri`/`Intent`) means the routing logic —
 * which MIME type and extension go with which export, how a project name becomes a safe
 * file name — is unit-tested on the JVM. The Android layer only translates the resulting
 * [DocumentKind] into SAF launcher calls.
 */
object MediaTypes {

    /** Every kind of file InkFrame can hand to / receive from the system file picker. */
    enum class DocumentKind(
        val mimeType: String,
        val extension: String,
    ) {
        /** The native project package (a ZIP of document.json + cel PNGs). */
        PROJECT("application/zip", ProjectPackage.EXTENSION),
        MP4("video/mp4", "mp4"),
        GIF("image/gif", "gif"),
        PNG_SEQUENCE("application/zip", "zip"),
    }

    /**
     * MIME types accepted when *opening* a project. Some pickers/providers report a
     * `.inkframe` zip as octet-stream, so we accept that too and validate on read.
     */
    val PROJECT_OPEN_MIME_TYPES: Array<String> =
        arrayOf("application/zip", "application/octet-stream", "*/*")

    /** A safe, extensioned file name to suggest in the SAF "create document" dialog. */
    fun suggestedFileName(baseName: String, kind: DocumentKind): String {
        val safe = sanitizeBaseName(baseName)
        return "$safe.${kind.extension}"
    }

    /** Strips characters illegal/awkward in file names; never returns empty. */
    fun sanitizeBaseName(name: String): String {
        val cleaned = name.trim()
            .map { if (it.isLetterOrDigit() || it == '-' || it == '_' || it == ' ') it else '_' }
            .joinToString("")
            .replace(Regex("\\s+"), "_")
            .trim('_')
        return cleaned.ifEmpty { "Untitled" }.take(80)
    }

    /** Best-effort extension extracted from a display name or path (lowercase, no dot). */
    fun extensionOf(displayName: String): String? {
        val dot = displayName.lastIndexOf('.')
        if (dot < 0 || dot == displayName.length - 1) return null
        return displayName.substring(dot + 1).lowercase()
    }

    /** True if [displayName] looks like an InkFrame project by extension. */
    fun isProjectFileName(displayName: String): Boolean =
        extensionOf(displayName) == ProjectPackage.EXTENSION
}
