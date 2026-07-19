package com.inkframe.feature.canvas

import com.inkframe.core.model.Cel
import com.inkframe.core.model.CustomProjectSpec
import com.inkframe.core.model.NativeProjectTemplates
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectCanvasRecreationTest {

    @Test
    fun blankDimensionChangeRequestsCanvasRecreation() {
        val current = NativeProjectTemplates.create(
            NativeProjectTemplates.byId("classic")!!,
        )
        val next = NativeProjectTemplates.create(
            NativeProjectTemplates.byId("phone")!!,
        )

        val decision = ProjectCanvasRecreation.observe(
            ProjectCanvasRecreation.signature(current),
            next,
        )

        assertTrue(decision.recreate)
        assertEquals("1080x1920@1.0", decision.nextSignature)
    }

    @Test
    fun nonblankArchiveDimensionChangeRetainsLoadedEngine() {
        val current = NativeProjectTemplates.create(
            NativeProjectTemplates.byId("classic")!!,
        )
        val blankLoaded = NativeProjectTemplates.createCustom(
            CustomProjectSpec("Loaded", 2048, 1024, 12, 1),
        )
        val scene = blankLoaded.activeScene!!
        val layer = scene.layers.single()
        val loaded = blankLoaded.copy(
            scenes = listOf(
                scene.copy(
                    layers = listOf(
                        layer.copy(cels = mapOf(0 to Cel(surfaceId = 41L))),
                    ),
                ),
            ),
        )

        val decision = ProjectCanvasRecreation.observe(
            ProjectCanvasRecreation.signature(current),
            loaded,
        )

        assertFalse(decision.recreate)
        assertEquals("2048x1024@1.0", decision.nextSignature)
    }

    @Test
    fun sameDimensionsNeverRequestObservedRecreation() {
        val current = NativeProjectTemplates.create(
            NativeProjectTemplates.byId("classic")!!,
        )
        val replacement = NativeProjectTemplates.create(
            NativeProjectTemplates.byId("classic")!!,
        )

        val decision = ProjectCanvasRecreation.observe(
            ProjectCanvasRecreation.signature(current),
            replacement,
        )

        assertFalse(decision.recreate)
    }
}
