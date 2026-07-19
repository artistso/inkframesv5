package com.inkframe.feature.canvas

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class GlassHorizonThemeWorldTest {

    @Test
    fun atmosphereUsesBindingLayerOrder() {
        assertEquals(
            listOf(
                GlassHorizonAtmosphereLayer.HORIZON,
                GlassHorizonAtmosphereLayer.RAYS,
                GlassHorizonAtmosphereLayer.GRAIN,
                GlassHorizonAtmosphereLayer.VIGNETTE,
                GlassHorizonAtmosphereLayer.GLINT,
            ),
            GlassHorizonThemeWorld.layerOrder,
        )
    }

    @Test
    fun plumHorizonMatchesBindingReferenceStops() {
        val expected = listOf(
            0.00f to 0xFFFFD9E2.toInt(),
            0.14f to 0xFFF7CAC9.toInt(),
            0.38f to 0xFFD77FA0.toInt(),
            0.64f to 0xFFA52766.toInt(),
            0.86f to 0xFF4D0A33.toInt(),
            1.00f to 0xFF1A001A.toInt(),
        )

        assertEquals(
            expected,
            GlassHorizonThemeWorld.plum.horizonStops.map { (stop, color) -> stop to color.toArgb() },
        )
        assertEquals(0x8C14000E.toInt(), GlassHorizonThemeWorld.plum.vignetteColor.toArgb())
    }

    @Test
    fun blueWorldIsCompleteAndDistinct() {
        val blue = GlassHorizonThemeWorld.blue
        val plum = GlassHorizonThemeWorld.plum

        assertEquals(6, blue.horizonStops.size)
        assertEquals(0f, blue.horizonStops.first().first)
        assertEquals(1f, blue.horizonStops.last().first)
        assertEquals(0xFFE7F0FF.toInt(), blue.horizonStops.first().second.toArgb())
        assertEquals(0xFF071032.toInt(), blue.horizonStops.last().second.toArgb())
        assertNotEquals(plum.horizonStops, blue.horizonStops)
        assertNotEquals(plum.vignetteColor.toArgb(), blue.vignetteColor.toArgb())
    }

    @Test
    fun paletteSelectionIsStable() {
        assertEquals(GlassHorizonThemeWorld.plum, GlassHorizonThemeWorld.palette(false))
        assertEquals(GlassHorizonThemeWorld.blue, GlassHorizonThemeWorld.palette(true))
    }

    @Test
    fun transientGlintRemainsSeparateFromStaticPaletteStops() {
        val staticColors = GlassHorizonThemeWorld.plum.horizonStops.map { it.second.toArgb() }
        assertNotEquals(Color.Transparent.toArgb(), GlassHorizonThemeWorld.plum.glintColor.toArgb())
        assertEquals(false, staticColors.contains(GlassHorizonThemeWorld.plum.glintColor.toArgb()))
    }
}
