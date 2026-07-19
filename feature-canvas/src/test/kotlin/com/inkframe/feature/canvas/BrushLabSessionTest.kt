package com.inkframe.feature.canvas

import com.inkframe.core.model.Brush
import com.inkframe.core.model.BrushKind
import com.inkframe.core.model.DefaultBrushes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class BrushLabSessionTest {

    @Test
    fun editsSurviveSwitchingAwayAndBack() {
        val session = BrushLabSession()
        val ink = session.observe(DefaultBrushes.ink)
        val editedInk = session.record(ink.copy(sizePx = 83f, opacity = 0.47f, smoothing = 0.72f))

        val marker = session.observe(DefaultBrushes.marker)
        assertEquals(DefaultBrushes.marker, marker)

        val restoredInk = session.observe(DefaultBrushes.ink)
        assertEquals(editedInk, restoredInk)
        assertEquals(83f, restoredInk.sizePx, 0f)
        assertEquals(0.47f, restoredInk.opacity, 0f)
        assertEquals(0.72f, restoredInk.smoothing, 0f)
    }

    @Test
    fun eachBrushKeepsIndependentProfile() {
        val session = BrushLabSession()
        val ink = session.record(session.observe(DefaultBrushes.ink).copy(hardness = 0.2f))
        val marker = session.record(session.observe(DefaultBrushes.marker).copy(hardness = 0.9f))

        assertEquals(ink, session.observe(DefaultBrushes.ink))
        assertEquals(marker, session.observe(DefaultBrushes.marker))
        assertEquals(0.2f, session.profile("ink")!!.hardness, 0f)
        assertEquals(0.9f, session.profile("marker")!!.hardness, 0f)
    }

    @Test
    fun resetOnlyReplacesCurrentBrushProfile() {
        val session = BrushLabSession()
        session.record(session.observe(DefaultBrushes.ink).copy(sizePx = 99f))
        val markerEdit = session.record(session.observe(DefaultBrushes.marker).copy(sizePx = 71f))
        val resetMarker = session.reset(markerEdit)

        assertEquals(DefaultBrushes.marker, resetMarker)
        assertEquals(99f, session.observe(DefaultBrushes.ink).sizePx, 0f)
        assertEquals(DefaultBrushes.marker, session.observe(DefaultBrushes.marker))
    }

    @Test
    fun unknownBrushIsAcceptedWithoutFactoryLookup() {
        val session = BrushLabSession(emptyList())
        val custom = Brush("custom", "Custom", BrushKind.ROUND, sizePx = 18f)
        assertSame(custom, session.observe(custom))
        assertEquals(custom, session.profile("custom"))
    }
}
