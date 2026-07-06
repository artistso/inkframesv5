package com.inkframe.core.model

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

/**
 * End-to-end save→load through the real [ProjectPackage] zip, verifying that the
 * document AND each cel's pixel payload survive together and stay correctly associated
 * with their surface ids. Uses a fake pixel store (no GL) so it runs on the JVM, but
 * exercises the actual JSON codec + zip packaging used in production.
 */
class SaveLoadIntegrationTest {

    /** Simulates per-surface pixel buffers; "encode" returns them, "decode" stores them. */
    private class PixelStore(initial: Map<Long, ByteArray> = emptyMap()) : ProjectPackage.CelImageIO {
        val pixels = HashMap<Long, ByteArray>().apply { putAll(initial) }
        override fun encode(surfaceId: Long): ByteArray? = pixels[surfaceId]
        override fun decode(surfaceId: Long, bytes: ByteArray) { pixels[surfaceId] = bytes }
    }

    @Test
    fun multiSceneMultiLayer_roundTripsDocumentAndPixels() {
        // Build a non-trivial document: 2 scenes, multiple layers, several cels.
        val sceneA = Scene(
            id = "A", name = "Intro", frameCount = 12,
            layers = listOf(
                Layer(
                    id = "a-bg", name = "BG", opacity = 0.5f, blendMode = BlendMode.SCREEN,
                    cels = mapOf(0 to Cel(surfaceId = 1L), 6 to Cel(surfaceId = 2L)),
                ),
                Layer(
                    id = "a-ink", name = "Ink",
                    cels = mapOf(0 to Cel(surfaceId = 3L)),
                ),
            ),
        )
        val sceneB = Scene(
            id = "B", name = "Action", frameCount = 24, loop = false, playbackRange = 4..20,
            layers = listOf(
                Layer(id = "b-1", name = "L1", cels = mapOf(0 to Cel(surfaceId = 4L), 12 to Cel(surfaceId = 5L))),
            ),
        )
        val original = Project(
            id = "film", name = "Saturday Cartoon",
            canvas = CanvasSpec(1280, 720, 24),
            scenes = listOf(sceneA, sceneB),
            activeSceneId = "B",
        )

        // Distinct pixel payloads per surface id.
        val store = PixelStore(
            mapOf(
                1L to byteArrayOf(1, 1, 1),
                2L to byteArrayOf(2, 2),
                3L to byteArrayOf(3),
                4L to byteArrayOf(4, 4, 4, 4),
                5L to byteArrayOf(5, 5),
            ),
        )

        // Save.
        val baos = ByteArrayOutputStream()
        ProjectPackage.write(original, store, baos)

        // Load into a fresh store.
        val loadStore = PixelStore()
        val restored = ProjectPackage.read(loadStore, ByteArrayInputStream(baos.toByteArray()))

        // Document identical (palette may default; compare normalized).
        assertEquals(original.copy(colorPalette = restored.colorPalette), restored)

        // Every surface's pixels restored and correctly associated.
        assertArrayEquals(byteArrayOf(1, 1, 1), loadStore.pixels[1L])
        assertArrayEquals(byteArrayOf(2, 2), loadStore.pixels[2L])
        assertArrayEquals(byteArrayOf(3), loadStore.pixels[3L])
        assertArrayEquals(byteArrayOf(4, 4, 4, 4), loadStore.pixels[4L])
        assertArrayEquals(byteArrayOf(5, 5), loadStore.pixels[5L])
        assertEquals(5, loadStore.pixels.size)
    }

    @Test
    fun emptyCels_documentSurvivesWithNoImages() {
        val original = Project(
            id = "p", name = "Blank",
            canvas = CanvasSpec(64, 64, 12),
            scenes = listOf(Scene(id = "s", name = "S", frameCount = 1, layers = listOf(Layer(id = "l", name = "L")))),
        )
        val baos = ByteArrayOutputStream()
        ProjectPackage.write(original, PixelStore(), baos)
        val loadStore = PixelStore()
        val restored = ProjectPackage.read(loadStore, ByteArrayInputStream(baos.toByteArray()))
        assertEquals(original.copy(colorPalette = restored.colorPalette), restored)
        assertEquals(0, loadStore.pixels.size)
    }
}
