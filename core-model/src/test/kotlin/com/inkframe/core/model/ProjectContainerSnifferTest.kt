package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectContainerSnifferTest {

    @Test
    fun sniff_recognizesNativeZipSignatures() {
        assertEquals(
            ProjectContainerKind.NATIVE_ZIP,
            ProjectContainerSniffer.sniff(byteArrayOf(0x50, 0x4b, 0x03, 0x04, 0x00)),
        )
        assertEquals(
            ProjectContainerKind.NATIVE_ZIP,
            ProjectContainerSniffer.sniff(byteArrayOf(0x50, 0x4b, 0x05, 0x06)),
        )
    }

    @Test
    fun sniff_recognizesLegacyJsonWithWhitespaceAndBom() {
        val json = """
            {"v":4,"kind":"inkframe-web-archive","projects":[]}
        """.trimIndent()
        val bytes = byteArrayOf(0xef.toByte(), 0xbb.toByte(), 0xbf.toByte(), 0x20) +
            json.toByteArray(Charsets.UTF_8)

        assertEquals(
            ProjectContainerKind.LEGACY_WEB_JSON,
            ProjectContainerSniffer.sniff(bytes),
        )
    }

    @Test
    fun sniff_rejectsArbitraryJsonAndUnknownBinary() {
        assertEquals(
            ProjectContainerKind.UNKNOWN,
            ProjectContainerSniffer.sniff("{\"hello\":1}".toByteArray()),
        )
        assertEquals(
            ProjectContainerKind.UNKNOWN,
            ProjectContainerSniffer.sniff(byteArrayOf(0x00, 0x01, 0x02, 0x03)),
        )
    }
}
