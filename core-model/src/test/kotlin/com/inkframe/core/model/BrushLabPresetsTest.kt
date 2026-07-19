package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BrushLabPresetsTest {

    @Test
    fun primaryPresetsOnlyChangeStrokeFeel() {
        val source = DefaultBrushes.marker.copy(
            sizePx = 73f,
            minSizePx = 9f,
            opacity = 0.42f,
            flow = 0.61f,
            hardness = 0.27f,
            pressureToSize = false,
            pressureToOpacity = true,
            buildUp = true,
        )

        BrushLabPreset.entries.forEach { preset ->
            val tuned = BrushLabPresets.apply(source, preset)
            assertEquals(source.id, tuned.id)
            assertEquals(source.name, tuned.name)
            assertEquals(source.kind, tuned.kind)
            assertEquals(source.sizePx, tuned.sizePx, 0f)
            assertEquals(source.minSizePx, tuned.minSizePx, 0f)
            assertEquals(source.opacity, tuned.opacity, 0f)
            assertEquals(source.flow, tuned.flow, 0f)
            assertEquals(source.hardness, tuned.hardness, 0f)
            assertEquals(source.pressureToSize, tuned.pressureToSize)
            assertEquals(source.pressureToOpacity, tuned.pressureToOpacity)
            assertEquals(source.buildUp, tuned.buildUp)
        }
    }

    @Test
    fun presetsStayInsideEngineRangesAndCanBeIdentified() {
        BrushLabPreset.entries.forEach { preset ->
            val tuned = BrushLabPresets.apply(DefaultBrushes.ink, preset)
            assertTrue(tuned.spacing in BrushAdjustments.SPACING_RANGE)
            assertTrue(tuned.smoothing in BrushAdjustments.SMOOTHING_RANGE)
            assertEquals(preset, BrushLabPresets.closestExact(tuned))
        }
    }

    @Test
    fun customStrokeFeelDoesNotPretendToBePreset() {
        val custom = DefaultBrushes.ink.copy(spacing = 0.123f, smoothing = 0.456f)
        assertNull(BrushLabPresets.closestExact(custom))
    }
}
