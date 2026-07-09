package com.inkframe.studio.vector

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VectorEngineTest {
    @Test
    fun simplificationReducesNoisyPolylineButKeepsEndpoints() {
        val points = listOf(
            VectorEngine.Vec2(0f, 0f),
            VectorEngine.Vec2(5f, 0.2f),
            VectorEngine.Vec2(10f, -0.1f),
            VectorEngine.Vec2(15f, 0.1f),
            VectorEngine.Vec2(20f, 0f),
        )

        val simplified = VectorEngine.simplify(points, tolerance = 0.5f)

        assertTrue(simplified.size < points.size)
        assertEquals(points.first(), simplified.first())
        assertEquals(points.last(), simplified.last())
    }

    @Test
    fun catmullRomProducesCubicSegments() {
        val points = listOf(
            VectorEngine.Vec2(0f, 0f),
            VectorEngine.Vec2(10f, 10f),
            VectorEngine.Vec2(20f, 0f),
            VectorEngine.Vec2(30f, 10f),
        )

        val cubics = VectorEngine.catmullRomToCubics(points)

        assertEquals(points.size - 1, cubics.size)
        assertEquals(points.first(), cubics.first().start)
        assertEquals(points.last(), cubics.last().end)
    }

    @Test
    fun vectorStrokePlanProducesAnchorsSamplesOutlineAndBounds() {
        val points = listOf(
            VectorEngine.Vec2(0f, 0f),
            VectorEngine.Vec2(12f, 8f),
            VectorEngine.Vec2(24f, -4f),
            VectorEngine.Vec2(36f, 12f),
            VectorEngine.Vec2(48f, 0f),
        )

        val plan = VectorEngine.planVectorStroke(
            rawPoints = points,
            simplificationTolerance = 0.1f,
            style = VectorEngine.VectorStyle(strokeWidth = 6f),
        )

        assertFalse(plan.anchors.isEmpty())
        assertFalse(plan.cubics.isEmpty())
        assertTrue(plan.samples.size >= plan.cubics.size)
        assertEquals(plan.samples.size, plan.outline.left.size)
        assertEquals(plan.samples.size, plan.outline.right.size)
        assertTrue(plan.bounds.width > 0f)
        assertTrue(plan.bounds.height > 0f)
    }

    @Test
    fun gridSnappingRoundsToNearestGridCell() {
        val snapped = VectorEngine.snapPoint(
            point = VectorEngine.Vec2(23f, 41f),
            config = VectorEngine.SnapConfig(
                mode = VectorEngine.SnapMode.Grid,
                gridSize = 16f,
            ),
        )

        assertEquals(16f, snapped.x, 0.0001f)
        assertEquals(48f, snapped.y, 0.0001f)
    }

    @Test
    fun angleSnappingConstrainsRelativeToPreviousPoint() {
        val previous = VectorEngine.Vec2(0f, 0f)
        val snapped = VectorEngine.snapPoint(
            point = VectorEngine.Vec2(10f, 3f),
            previous = previous,
            config = VectorEngine.SnapConfig(
                mode = VectorEngine.SnapMode.Angle,
                angleStepDegrees = 45f,
            ),
        )

        // 10,3 is closest to the 0-degree constraint, so y should flatten.
        assertEquals(0f, snapped.y, 0.0001f)
        assertTrue(snapped.x > 10f)
    }

    @Test
    fun quadSymmetryCreatesFourCopies() {
        val points = listOf(VectorEngine.Vec2(2f, 3f), VectorEngine.Vec2(4f, 5f))
        val copies = VectorEngine.symmetryCopies(
            points = points,
            mode = VectorEngine.SymmetryMode.Quad,
            center = VectorEngine.Vec2(10f, 10f),
        )

        assertEquals(4, copies.size)
        assertEquals(points, copies[0])
        assertEquals(VectorEngine.Vec2(18f, 3f), copies[1].first())
        assertEquals(VectorEngine.Vec2(2f, 17f), copies[2].first())
        assertEquals(VectorEngine.Vec2(18f, 17f), copies[3].first())
    }

    @Test
    fun svgPathDataExportsMoveAndCubicCommands() {
        val cubics = VectorEngine.catmullRomToCubics(
            listOf(
                VectorEngine.Vec2(0f, 0f),
                VectorEngine.Vec2(10f, 10f),
                VectorEngine.Vec2(20f, 0f),
            )
        )

        val svg = VectorEngine.svgPathData(cubics)

        assertTrue(svg.startsWith("M 0 0"))
        assertTrue(svg.contains(" C "))
    }
}
