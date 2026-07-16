package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
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
        assertEquals(10L, layer.celAt(3)?.surfaceId)
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

class StudioContextMirrorTest {
    private fun context(
        token: String = "p2-f7-l1",
        frame: Int = 7,
        layer: Int = 1,
        count: Int = 3,
        background: Boolean = false,
        enabled: Boolean = true,
        geometry: StudioCanvasGeometry = StudioCanvasGeometry(100.0, 40.0, 800.0, 400.0),
        brush: StudioBrushContext = StudioBrushContext("pen", 0xff3366cc.toInt(), 0xfffff0f3.toInt(), 24.0, 0.75),
    ) = StudioContextSnapshot(
        schema = 2,
        enabled = enabled,
        contextToken = token,
        baseContextToken = "base",
        contextRevision = 4,
        projectIndex = 2,
        frameIndex = frame,
        layerIndex = layer,
        layerCount = count,
        backgroundActive = background,
        canvasWidth = 1000,
        canvasHeight = 500,
        shape = StudioCanvasShape.CIRCLE,
        geometry = geometry,
        brush = brush,
    )

    @Test
    fun exactContextIsCapturedAndAccepted() {
        val mirror = StudioContextMirror()
        val current = context()
        assertEquals(StudioContextUpdate.ACCEPTED_CHANGED, mirror.update(current))
        assertEquals(current.strokeBinding(), mirror.captureStrokeBinding())
        assertEquals(StudioStrokeValidation.ACCEPTED, mirror.validate(current.strokeBinding()))
        assertEquals(StudioContextUpdate.ACCEPTED_UNCHANGED, mirror.update(current))
        assertEquals(1L, mirror.generation)
    }

    @Test
    fun frameLayerGeometryAndBrushChangesAreStale() {
        val mirror = StudioContextMirror()
        val current = context()
        mirror.update(current)
        listOf(
            current.copy(frameIndex = 8),
            current.copy(layerIndex = 2),
            current.copy(geometry = StudioCanvasGeometry(101.0, 40.0, 800.0, 400.0)),
            current.copy(brush = current.brush.copy(sizeCanvasPx = 25.0)),
        ).forEach {
            assertEquals(StudioStrokeValidation.STALE_CONTEXT, mirror.validate(it.strokeBinding()))
        }
    }

    @Test
    fun staticBackgroundIsSeparateAndDisabledTargetsDoNotCapture() {
        val mirror = StudioContextMirror()
        val background = context(token = "bg", layer = -1, background = true)
        mirror.update(background)
        assertEquals(StudioStrokeValidation.ACCEPTED, mirror.validate(background.strokeBinding()))
        assertEquals(StudioStrokeValidation.STALE_CONTEXT, mirror.validate(context(layer = 0).strokeBinding()))
        mirror.update(context(enabled = false))
        assertNull(mirror.captureStrokeBinding())
    }

    @Test
    fun invalidSnapshotDoesNotReplaceLastGoodContext() {
        val mirror = StudioContextMirror()
        val valid = context()
        mirror.update(valid)
        val invalid = valid.copy(layerIndex = 99, geometry = StudioCanvasGeometry(0.0, 0.0, 0.0, 1.0))
        assertEquals(StudioContextUpdate.REJECTED_INVALID, mirror.update(invalid))
        assertEquals(valid, mirror.snapshot())
        assertNotNull(mirror.captureStrokeBinding())
    }
}
