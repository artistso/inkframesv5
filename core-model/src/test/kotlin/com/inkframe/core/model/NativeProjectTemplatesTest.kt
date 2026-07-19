package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeProjectTemplatesTest {

    @Test
    fun starterTemplatesPreserveReferenceValues() {
        val expected = listOf(
            "classic" to listOf(1024, 768, 12, 1),
            "hd" to listOf(1280, 720, 12, 12),
            "square" to listOf(1080, 1080, 12, 1),
            "phone" to listOf(1080, 1920, 12, 1),
            "pixel" to listOf(512, 512, 8, 8),
            "neon" to listOf(1280, 720, 12, 16),
        )

        assertEquals(expected.map { it.first }, NativeProjectTemplates.all.map { it.id })
        expected.forEach { (id, values) ->
            val template = NativeProjectTemplates.byId(id)!!
            assertEquals(values[0], template.widthPx)
            assertEquals(values[1], template.heightPx)
            assertEquals(values[2], template.fps)
            assertEquals(values[3], template.frameCount)
        }
    }

    @Test
    fun templateCreatesBlankNativeProject() {
        val template = NativeProjectTemplates.byId("hd")!!
        val project = NativeProjectTemplates.create(template)

        assertEquals("HD animation", project.name)
        assertEquals(1280, project.canvas.widthPx)
        assertEquals(720, project.canvas.heightPx)
        assertEquals(12, project.canvas.fps)
        assertEquals(12, project.activeScene!!.frameCount)
        assertEquals(12, project.activeScene!!.holds.size)
        assertTrue(project.activeScene!!.holds.all { it == 1 })
        assertEquals(1, project.activeScene!!.layers.size)
        assertTrue(project.activeScene!!.layers.single().cels.isEmpty())
    }

    @Test
    fun everyCreationGetsFreshDocumentAndLayerIds() {
        val template = NativeProjectTemplates.byId("square")!!
        val first = NativeProjectTemplates.create(template)
        val second = NativeProjectTemplates.create(template)

        assertNotEquals(first.id, second.id)
        assertNotEquals(
            first.activeScene!!.layers.single().id,
            second.activeScene!!.layers.single().id,
        )
    }

    @Test
    fun customProjectTrimsNameAndAppliesPaper() {
        val project = NativeProjectTemplates.createCustom(
            CustomProjectSpec(
                name = "  My loop  ",
                widthPx = 1440,
                heightPx = 1440,
                fps = 18,
                frameCount = 24,
                paper = ProjectPaper.GRAPHITE,
            ),
        )

        assertEquals("My loop", project.name)
        assertEquals(1440, project.canvas.widthPx)
        assertEquals(1440, project.canvas.heightPx)
        assertEquals(18, project.canvas.fps)
        assertEquals(24, project.activeScene!!.frameCount)
        assertEquals(ProjectPaper.GRAPHITE.color.toArgb(), project.canvas.backgroundColor.toArgb())
    }

    @Test
    fun blankCustomNameUsesStableFallback() {
        val project = NativeProjectTemplates.createCustom(
            CustomProjectSpec("   ", 1024, 768, 12, 1),
        )
        assertEquals(NativeProjectTemplates.DEFAULT_CUSTOM_NAME, project.name)
    }

    @Test
    fun customBoundsRejectUnsafeValues() {
        assertThrows(IllegalArgumentException::class.java) {
            NativeProjectTemplates.createCustom(CustomProjectSpec("Too small", 255, 768, 12, 1))
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeProjectTemplates.createCustom(CustomProjectSpec("Too large", 1024, 4097, 12, 1))
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeProjectTemplates.createCustom(CustomProjectSpec("Bad fps", 1024, 768, 25, 1))
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeProjectTemplates.createCustom(CustomProjectSpec("Bad frames", 1024, 768, 12, 121))
        }
    }

    @Test
    fun templateAspectLabelsAreHumanReadable() {
        assertEquals("4:3", NativeProjectTemplates.byId("classic")!!.aspectLabel)
        assertEquals("16:9", NativeProjectTemplates.byId("hd")!!.aspectLabel)
        assertEquals("1:1", NativeProjectTemplates.byId("square")!!.aspectLabel)
        assertEquals("9:16", NativeProjectTemplates.byId("phone")!!.aspectLabel)
    }
}
