package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RadialDockingTest {
    private val canvas = RadialDockRect(left = 300f, top = 100f, right = 900f, bottom = 700f)

    @Test
    fun leftNodeCannotEnterCanvas() {
        val result = clampRadialDockOffset(
            originX = 120f, originY = 220f, requestedOffset = RadialDockOffset(900f, 0f),
            nodeWidth = 58f, nodeHeight = 76f, workspaceWidth = 1200f, workspaceHeight = 800f,
            canvas = canvas, region = RadialDockRegion.LEFT, edgePadding = 12f, canvasGap = 12f,
        )
        assertEquals(230f, 120f + result.x, 0.001f)
    }

    @Test
    fun rightNodeCannotEnterCanvas() {
        val result = clampRadialDockOffset(
            originX = 980f, originY = 220f, requestedOffset = RadialDockOffset(-900f, 0f),
            nodeWidth = 58f, nodeHeight = 76f, workspaceWidth = 1200f, workspaceHeight = 800f,
            canvas = canvas, region = RadialDockRegion.RIGHT, edgePadding = 12f, canvasGap = 12f,
        )
        assertEquals(912f, 980f + result.x, 0.001f)
    }

    @Test
    fun bottomNodeCannotEnterCanvas() {
        val result = clampRadialDockOffset(
            originX = 570f, originY = 720f, requestedOffset = RadialDockOffset(0f, -500f),
            nodeWidth = 58f, nodeHeight = 76f, workspaceWidth = 1200f, workspaceHeight = 900f,
            canvas = canvas, region = RadialDockRegion.BOTTOM, edgePadding = 12f, canvasGap = 12f,
        )
        assertEquals(712f, 720f + result.y, 0.001f)
    }

    @Test
    fun nodeAlwaysRemainsOnScreen() {
        val result = clampRadialDockOffset(
            originX = 120f, originY = 220f, requestedOffset = RadialDockOffset(-5000f, 5000f),
            nodeWidth = 58f, nodeHeight = 76f, workspaceWidth = 1200f, workspaceHeight = 800f,
            canvas = canvas, region = RadialDockRegion.LEFT, edgePadding = 12f, canvasGap = 12f,
        )
        val x = 120f + result.x
        val y = 220f + result.y
        assertTrue(x >= 12f)
        assertTrue(y <= 712f)
    }

    @Test
    fun validOriginalPositionRemainsUnchanged() {
        val result = clampRadialDockOffset(
            originX = 120f, originY = 220f, requestedOffset = RadialDockOffset(0f, 0f),
            nodeWidth = 58f, nodeHeight = 76f, workspaceWidth = 1200f, workspaceHeight = 800f,
            canvas = canvas, region = RadialDockRegion.LEFT, edgePadding = 12f, canvasGap = 12f,
        )
        assertEquals(0f, result.x, 0.001f)
        assertEquals(0f, result.y, 0.001f)
    }
}
