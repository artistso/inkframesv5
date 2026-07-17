package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class InkFrameDefaultsTest {

    @Test
    fun newProject_matchesOriginalGlassHorizonContract() {
        val project = InkFrameDefaults.newProject()
        val scene = project.activeScene!!

        assertEquals("Canvas", project.name)
        assertEquals(1024, project.canvas.widthPx)
        assertEquals(768, project.canvas.heightPx)
        assertEquals(12, project.canvas.fps)
        assertEquals(0xFFFFF0F3.toInt(), project.canvas.backgroundColor.toArgb())
        assertEquals(1, scene.frameCount)
        assertEquals(1, scene.layers.size)
        assertEquals("Layer 1", scene.layers.single().name)
        assertTrue(scene.layers.single().cels.isEmpty())
    }

    @Test
    fun untouchedLegacyPlaceholder_isMigrated() {
        val legacy = legacyPlaceholder()

        val migrated = InkFrameDefaults.migrateUntouchedLegacyNativePlaceholder(legacy)

        assertEquals(1024, migrated.canvas.widthPx)
        assertEquals(768, migrated.canvas.heightPx)
        assertEquals(12, migrated.canvas.fps)
        assertEquals(1, migrated.activeScene!!.frameCount)
    }

    @Test
    fun drawnLegacySizedProject_isNeverReplaced() {
        val legacy = legacyPlaceholder()
        val scene = legacy.activeScene!!
        val layer = scene.layers.single().copy(cels = mapOf(0 to Cel(surfaceId = 41L)))
        val drawn = legacy.copy(scenes = listOf(scene.copy(layers = listOf(layer))))

        val result = InkFrameDefaults.migrateUntouchedLegacyNativePlaceholder(drawn)

        assertSame(drawn, result)
    }

    @Test
    fun renamedProject_isNeverReplaced() {
        val renamed = legacyPlaceholder().copy(name = "My animation")

        val result = InkFrameDefaults.migrateUntouchedLegacyNativePlaceholder(renamed)

        assertSame(renamed, result)
    }

    @Test
    fun resizedProject_isNeverReplaced() {
        val resized = legacyPlaceholder().copy(
            canvas = CanvasSpec(widthPx = 1920, heightPx = 1080, fps = 24),
        )

        val result = InkFrameDefaults.migrateUntouchedLegacyNativePlaceholder(resized)

        assertSame(resized, result)
    }

    private fun legacyPlaceholder(): Project {
        return Project(
            name = "Untitled",
            canvas = CanvasSpec(widthPx = 1280, heightPx = 720, fps = 24),
            scenes = listOf(
                Scene(
                    name = "Scene 1",
                    frameCount = 24,
                    layers = listOf(Layer(name = "Layer 1")),
                ),
            ),
        )
    }
}
