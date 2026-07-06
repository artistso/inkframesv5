package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LayerTest {

    @Test
    fun celAt_returnsExactCelWhenPresent() {
        val layer = Layer(
            name = "L",
            cels = mapOf(0 to Cel(surfaceId = 10), 5 to Cel(surfaceId = 20)),
        )
        assertEquals(10L, layer.celAt(0)?.surfaceId)
        assertEquals(20L, layer.celAt(5)?.surfaceId)
    }

    @Test
    fun celAt_holdsPreviousCelOnEmptyFrames() {
        val layer = Layer(
            name = "L",
            cels = mapOf(0 to Cel(surfaceId = 10), 5 to Cel(surfaceId = 20)),
        )
        // Frames 1..4 hold cel from frame 0.
        assertEquals(10L, layer.celAt(3)?.surfaceId)
        // Frames after 5 hold cel from frame 5.
        assertEquals(20L, layer.celAt(99)?.surfaceId)
    }

    @Test
    fun celAt_returnsNullBeforeFirstCel() {
        val layer = Layer(name = "L", cels = mapOf(5 to Cel(surfaceId = 20)))
        assertNull(layer.celAt(0))
        assertNull(layer.celAt(4))
        assertEquals(20L, layer.celAt(5)?.surfaceId)
    }

    @Test
    fun celAt_emptyLayerReturnsNull() {
        assertNull(Layer(name = "blank").celAt(0))
    }

    @Test(expected = IllegalArgumentException::class)
    fun layer_rejectsOpacityOutOfRange() {
        Layer(name = "bad", opacity = 1.5f)
    }

    @Test
    fun blendMode_fromOrdinalSafe_clampsToNormal() {
        assertEquals(BlendMode.MULTIPLY, BlendMode.fromOrdinalSafe(1))
        assertEquals(BlendMode.NORMAL, BlendMode.fromOrdinalSafe(999))
        assertEquals(BlendMode.NORMAL, BlendMode.fromOrdinalSafe(-1))
    }

    @Test
    fun scene_resolvesLayerById() {
        val a = Layer(name = "A")
        val b = Layer(name = "B")
        val scene = Scene(name = "S", frameCount = 10, layers = listOf(a, b))
        assertEquals("B", scene.layerById(b.id)?.name)
        assertNull(scene.layerById("missing"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun scene_requiresAtLeastOneFrame() {
        Scene(name = "S", frameCount = 0)
    }
}
