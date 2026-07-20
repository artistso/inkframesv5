package com.inkframe.feature.canvas

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CanvasViewportResizePolicyTest {

    @Test
    fun firstMeasuredSizeInitializesViewport() {
        assertTrue(
            CanvasViewportResizePolicy.shouldFit(
                viewportInitialized = false,
                oldWidthPx = 0,
                oldHeightPx = 0,
                newWidthPx = 900,
                newHeightPx = 600,
            ),
        )
    }

    @Test
    fun ordinaryVisibleResizePreservesArtistViewport() {
        assertFalse(
            CanvasViewportResizePolicy.shouldFit(
                viewportInitialized = true,
                oldWidthPx = 900,
                oldHeightPx = 600,
                newWidthPx = 1100,
                newHeightPx = 700,
            ),
        )
    }

    @Test
    fun collapsingToPersistentHostDoesNotOverwriteViewport() {
        assertFalse(
            CanvasViewportResizePolicy.shouldFit(
                viewportInitialized = true,
                oldWidthPx = 900,
                oldHeightPx = 600,
                newWidthPx = 1,
                newHeightPx = 1,
            ),
        )
    }

    @Test
    fun returningFromPersistentHostRefitsNewVisibleGeometry() {
        assertTrue(
            CanvasViewportResizePolicy.shouldFit(
                viewportInitialized = true,
                oldWidthPx = 1,
                oldHeightPx = 1,
                newWidthPx = 700,
                newHeightPx = 500,
            ),
        )
    }

    @Test
    fun oneCollapsedAxisStillRequiresRestorationRefit() {
        assertTrue(
            CanvasViewportResizePolicy.shouldFit(
                viewportInitialized = true,
                oldWidthPx = 1,
                oldHeightPx = 500,
                newWidthPx = 600,
                newHeightPx = 500,
            ),
        )
    }
}
