package com.inkframe.feature.canvas

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.hypot

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
    fun rayFanProjectsDownwardAcrossBothSides() {
        val directions = GlassHorizonThemeWorld.raySpecs.map(GlassHorizonThemeWorld::rayDirection)

        assertTrue(directions.all { it.y > 0f })
        assertTrue(directions.any { it.x < 0f })
        assertTrue(directions.any { it.x > 0f })
    }

    @Test
    fun drawTimeFeatheringPreservesOpacityBudgetWithoutRenderEffect() {
        val feathers = GlassHorizonThemeWorld.rayFeathers

        assertEquals(1f, feathers.sumOf { it.alphaShare.toDouble() }.toFloat(), 0.0001f)
        assertEquals(1f, feathers.last().spreadScale, 0f)
        assertTrue(feathers.zipWithNext().all { (outer, inner) -> outer.spreadScale > inner.spreadScale })
        assertTrue(feathers.all { it.alphaShare > 0f })
    }

    @Test
    fun landscapeRadiusSamplesTheDeepestStopAtTheFarthestCorner() {
        val width = 2800f
        val height = 1752f
        val center = Offset(width * 0.5f, -height * 0.12f)
        val radius = GlassHorizonThemeWorld.farthestCornerRadius(width, height, center)
        val expected = maxOf(
            hypot(center.x, center.y),
            hypot(width - center.x, center.y),
            hypot(center.x, height - center.y),
            hypot(width - center.x, height - center.y),
        )

        assertEquals(expected, radius, 0.001f)
        assertTrue(radius < width * 1.20f)
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
