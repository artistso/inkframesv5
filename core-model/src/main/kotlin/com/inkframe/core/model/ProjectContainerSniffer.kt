package com.inkframe.core.model

/** Physical container types that may use the `.inkframe` extension. */
enum class ProjectContainerKind {
    /** Native package: ZIP containing `document.json` and separate PNG surfaces. */
    NATIVE_ZIP,

    /** Historical web package: UTF-8 JSON with embedded PNG data URLs. */
    LEGACY_WEB_JSON,

    /** Content does not match a supported InkFrame container signature. */
    UNKNOWN,
}

/**
 * Deterministic, allocation-bounded content sniffing for project-open routing.
 *
 * File extensions and provider MIME types are not authoritative: both the native ZIP package and
 * the historical JSON archive use `.inkframe`, and Android document providers may report either as
 * `application/octet-stream`. Callers should read a small prefix, classify it here, then reopen or
 * replay the complete stream through the selected bounded decoder.
 */
object ProjectContainerSniffer {

    const val RECOMMENDED_PREFIX_BYTES = 8 * 1024

    fun sniff(prefix: ByteArray): ProjectContainerKind {
        if (hasZipSignature(prefix)) return ProjectContainerKind.NATIVE_ZIP

        val jsonOffset = firstJsonByte(prefix) ?: return ProjectContainerKind.UNKNOWN
        val end = (jsonOffset + RECOMMENDED_PREFIX_BYTES).coerceAtMost(prefix.size)
        val text = prefix.copyOfRange(jsonOffset, end).toString(Charsets.UTF_8)
        if (!text.startsWith('{')) return ProjectContainerKind.UNKNOWN
        return if (
            text.contains("\"inkframe-web-archive\"") ||
            (text.contains("\"projects\"") && text.contains("\"frames\""))
        ) {
            ProjectContainerKind.LEGACY_WEB_JSON
        } else {
            ProjectContainerKind.UNKNOWN
        }
    }

    private fun hasZipSignature(bytes: ByteArray): Boolean {
        if (bytes.size < 4 || bytes[0] != 'P'.code.toByte() || bytes[1] != 'K'.code.toByte()) {
            return false
        }
        val third = bytes[2].toInt() and 0xff
        val fourth = bytes[3].toInt() and 0xff
        return (third == 0x03 && fourth == 0x04) ||
            (third == 0x05 && fourth == 0x06) ||
            (third == 0x07 && fourth == 0x08)
    }

    private fun firstJsonByte(bytes: ByteArray): Int? {
        var index = 0
        if (
            bytes.size >= 3 &&
            (bytes[0].toInt() and 0xff) == 0xef &&
            (bytes[1].toInt() and 0xff) == 0xbb &&
            (bytes[2].toInt() and 0xff) == 0xbf
        ) {
            index = 3
        }
        while (index < bytes.size) {
            when (bytes[index].toInt() and 0xff) {
                0x09, 0x0a, 0x0d, 0x20 -> index++
                0x7b -> return index
                else -> return null
            }
        }
        return null
    }
}
