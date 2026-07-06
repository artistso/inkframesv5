package com.inkframe.core.model

import com.inkframe.core.model.MediaTypes.DocumentKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaTypesTest {

    @Test
    fun documentKinds_haveExpectedMimeAndExtension() {
        assertEquals("video/mp4", DocumentKind.MP4.mimeType)
        assertEquals("mp4", DocumentKind.MP4.extension)
        assertEquals("image/gif", DocumentKind.GIF.mimeType)
        assertEquals("gif", DocumentKind.GIF.extension)
        assertEquals("application/zip", DocumentKind.PNG_SEQUENCE.mimeType)
        assertEquals("zip", DocumentKind.PNG_SEQUENCE.extension)
        assertEquals(ProjectPackage.EXTENSION, DocumentKind.PROJECT.extension)
    }

    @Test
    fun suggestedFileName_appendsExtension() {
        assertEquals("My_Film.mp4", MediaTypes.suggestedFileName("My Film", DocumentKind.MP4))
        assertEquals("Scene_1.gif", MediaTypes.suggestedFileName("Scene 1", DocumentKind.GIF))
        assertEquals(
            "Untitled.${ProjectPackage.EXTENSION}",
            MediaTypes.suggestedFileName("Untitled", DocumentKind.PROJECT),
        )
    }

    @Test
    fun sanitizeBaseName_replacesIllegalChars() {
        assertEquals("a_b_c", MediaTypes.sanitizeBaseName("a/b:c"))
        assertEquals("hello_world", MediaTypes.sanitizeBaseName("hello   world"))
        assertEquals("clean-name_1", MediaTypes.sanitizeBaseName("clean-name_1"))
    }

    @Test
    fun sanitizeBaseName_neverEmpty() {
        assertEquals("Untitled", MediaTypes.sanitizeBaseName(""))
        assertEquals("Untitled", MediaTypes.sanitizeBaseName("   "))
        assertEquals("Untitled", MediaTypes.sanitizeBaseName("///"))
    }

    @Test
    fun sanitizeBaseName_trimsLeadingTrailingUnderscores() {
        assertEquals("name", MediaTypes.sanitizeBaseName("***name***"))
    }

    @Test
    fun sanitizeBaseName_capsLength() {
        val long = "x".repeat(200)
        assertEquals(80, MediaTypes.sanitizeBaseName(long).length)
    }

    @Test
    fun extensionOf_parsesCommonCases() {
        assertEquals("mp4", MediaTypes.extensionOf("movie.mp4"))
        assertEquals("inkframe", MediaTypes.extensionOf("My Project.inkframe"))
        assertEquals("gz", MediaTypes.extensionOf("archive.tar.gz"))
        assertNull(MediaTypes.extensionOf("noextension"))
        assertNull(MediaTypes.extensionOf("trailingdot."))
    }

    @Test
    fun extensionOf_isLowercased() {
        assertEquals("png", MediaTypes.extensionOf("IMAGE.PNG"))
    }

    @Test
    fun isProjectFileName_detectsExtension() {
        assertTrue(MediaTypes.isProjectFileName("cartoon.${ProjectPackage.EXTENSION}"))
        assertFalse(MediaTypes.isProjectFileName("cartoon.zip"))
        assertFalse(MediaTypes.isProjectFileName("cartoon"))
    }

    @Test
    fun projectOpenMimeTypes_includeZipAndWildcard() {
        assertTrue(MediaTypes.PROJECT_OPEN_MIME_TYPES.contains("application/zip"))
        assertTrue(MediaTypes.PROJECT_OPEN_MIME_TYPES.contains("*/*"))
    }
}
