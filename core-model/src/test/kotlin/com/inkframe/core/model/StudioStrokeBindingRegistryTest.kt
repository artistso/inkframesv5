package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StudioStrokeBindingRegistryTest {
    private fun snapshot(token: String, frame: Int = 0) = StudioContextSnapshot(
        schema = StudioContextSnapshot.CURRENT_SCHEMA,
        enabled = true,
        contextToken = token,
        baseContextToken = "base-$token",
        contextRevision = frame,
        projectIndex = 1,
        frameIndex = frame,
        layerIndex = 0,
        layerCount = 1,
        backgroundActive = false,
        canvasWidth = 1920,
        canvasHeight = 1080,
        shape = StudioCanvasShape.SQUARE,
        geometry = StudioCanvasGeometry(10.0, 20.0, 960.0, 540.0),
        brush = StudioBrushContext(
            id = "pen",
            colorArgb = 0xff3366cc.toInt(),
            paperColorArgb = 0xfffff0f3.toInt(),
            sizeCanvasPx = 12.0,
            opacity = 0.8,
        ),
    )

    @Test
    fun remembersAndResolvesExactBinding() {
        val registry = StudioStrokeBindingRegistry(capacity = 2)
        val expected = snapshot("a").strokeBinding()
        assertTrue(registry.remember(expected))
        assertEquals(expected, registry.resolve("a"))
        assertEquals(1, registry.size)
    }

    @Test
    fun evictsOldestBindingAtCapacity() {
        val registry = StudioStrokeBindingRegistry(capacity = 2)
        registry.remember(snapshot("a", frame = 1))
        registry.remember(snapshot("b", frame = 2))
        registry.remember(snapshot("c", frame = 3))
        assertNull(registry.resolve("a"))
        assertEquals(2, registry.size)
        assertEquals(2, registry.resolve("b")?.frameIndex)
        assertEquals(3, registry.resolve("c")?.frameIndex)
    }

    @Test
    fun rejectsInvalidOrUndrawableContext() {
        val registry = StudioStrokeBindingRegistry()
        assertFalse(registry.remember(snapshot("bad").copy(layerIndex = 9)))
        assertFalse(
            registry.remember(
                snapshot("blank").copy(layerCount = 0, layerIndex = 0, backgroundActive = false),
            ),
        )
        assertEquals(0, registry.size)
    }

    @Test
    fun clearRemovesAllBindings() {
        val registry = StudioStrokeBindingRegistry()
        registry.remember(snapshot("a"))
        registry.clear()
        assertNull(registry.resolve("a"))
        assertEquals(0, registry.size)
    }
}
