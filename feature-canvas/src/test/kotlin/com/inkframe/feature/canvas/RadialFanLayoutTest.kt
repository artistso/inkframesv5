package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RadialFanLayoutTest {

    @Test
    fun mainNodeAnchorIsPreservedInsideExpandedBounds() {
        val bounds = RadialFanLayout.bounds(
            listOf(RadialFanOffset(72f, -40f), RadialFanOffset(120f, 24f)),
        )

        assertEquals(0f, bounds.minXDp + bounds.nodeXDp, 0f)
        assertEquals(0f, bounds.minYDp + bounds.nodeYDp, 0f)
    }

    @Test
    fun actionCirclesKeepHistoricalFanCoordinates() {
        val offsets = listOf(
            RadialFanOffset(-160f, -90f),
            RadialFanOffset(72f, 40f),
        )
        val bounds = RadialFanLayout.bounds(offsets)

        offsets.forEach { offset ->
            val globalCircleX = bounds.minXDp + bounds.actionXDp(offset)
            val globalCircleY = bounds.minYDp + bounds.actionYDp(offset)

            assertEquals(
                offset.xDp + RadialFanLayout.ACTION_POSITION_CORRECTION_DP,
                globalCircleX,
                0f,
            )
            assertEquals(
                offset.yDp + RadialFanLayout.ACTION_POSITION_CORRECTION_DP,
                globalCircleY,
                0f,
            )
        }
    }

    @Test
    fun boundsContainActionCirclesShadowsAndLabels() {
        val offsets = listOf(
            RadialFanOffset(-210f, -120f),
            RadialFanOffset(190f, 150f),
        )
        val bounds = RadialFanLayout.bounds(offsets)
        val maxX = bounds.minXDp + bounds.widthDp
        val maxY = bounds.minYDp + bounds.heightDp

        offsets.forEach { offset ->
            val circleX = offset.xDp + RadialFanLayout.ACTION_POSITION_CORRECTION_DP
            val circleY = offset.yDp + RadialFanLayout.ACTION_POSITION_CORRECTION_DP

            assertTrue(bounds.minXDp <= circleX - RadialFanLayout.ACTION_SHADOW_DP)
            assertTrue(bounds.minYDp <= circleY - RadialFanLayout.ACTION_SHADOW_DP)
            assertTrue(
                maxX >= circleX + RadialFanLayout.ACTION_EXTENT_DP +
                    RadialFanLayout.ACTION_SHADOW_DP,
            )
            assertTrue(
                maxY >= circleY + RadialFanLayout.ACTION_EXTENT_DP +
                    RadialFanLayout.ACTION_LABEL_BOTTOM_OVERFLOW_DP,
            )
        }
    }

    @Test
    fun closedNodeStillContainsItsOwnShadowAndLabel() {
        val bounds = RadialFanLayout.bounds(emptyList())

        assertTrue(bounds.minXDp <= -RadialFanLayout.NODE_SHADOW_DP)
        assertTrue(bounds.minYDp <= -RadialFanLayout.NODE_SHADOW_DP)
        assertTrue(
            bounds.minXDp + bounds.widthDp >=
                RadialFanLayout.NODE_EXTENT_DP + RadialFanLayout.NODE_SHADOW_DP,
        )
        assertTrue(
            bounds.minYDp + bounds.heightDp >=
                RadialFanLayout.NODE_EXTENT_DP + RadialFanLayout.NODE_LABEL_BOTTOM_OVERFLOW_DP,
        )
    }
}
