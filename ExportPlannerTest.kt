package com.inkframe.core.model

import com.inkframe.core.model.ExportPlanner.Range
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExportPlannerTest {

    private fun scene(frames: Int, playback: IntRange = 0 until frames, loop: Boolean = true) =
        Scene(id = "s", name = "S", frameCount = frames, playbackRange = playback, loop = loop,
              layers = listOf(Layer(id = "l", name = "L")))

    private val canvas = CanvasSpec(widthPx = 320, heightPx = 240, fps = 24)

    @Test
    fun allRange_coversEveryFrame() {
        val plan = ExportPlanner.plan(scene(10), canvas, range = Range.ALL)
        assertEquals(10, plan.frameCount)
        assertEquals(0, plan.frames.first().frameIndex)
        assertEquals(9, plan.frames.last().frameIndex)
    }

    @Test
    fun playbackRange_respectsInOut() {
        val plan = ExportPlanner.plan(scene(20, playback = 5..12), canvas, range = Range.PLAYBACK)
        assertEquals(8, plan.frameCount)
        assertEquals(5, plan.frames.first().frameIndex)
        assertEquals(12, plan.frames.last().frameIndex)
    }

    @Test
    fun totalDuration_tracksFrameRateWithoutDrift() {
        // 24 fps, 24 frames -> ~1000ms total, with no accumulated rounding error.
        val plan = ExportPlanner.plan(scene(24), canvas, range = Range.ALL)
        assertEquals(24, plan.frameCount)
        assertTrue("total ${plan.totalDurationMs} not ~1000ms", plan.totalDurationMs in 999..1001)
    }

    @Test
    fun fpsOverride_retimesExport() {
        val slow = ExportPlanner.plan(scene(12), canvas, range = Range.ALL, fpsOverride = 12)
        assertEquals(12, slow.fps)
        assertTrue("12fps/12frames ~1000ms", slow.totalDurationMs in 999..1001)
    }

    @Test
    fun frameStep_rendersOnTwos() {
        val plan = ExportPlanner.plan(scene(10), canvas, range = Range.ALL, frameStep = 2)
        assertEquals(listOf(0, 2, 4, 6, 8), plan.frames.map { it.frameIndex })
        // Each held frame lasts twice as long.
        assertTrue(plan.frames.all { it.durationMs in 82..84 }) // 1000/24*2 ≈ 83.3
    }

    @Test
    fun gifDelay_isCentisecondsWithMinimum() {
        assertEquals(2, ExportPlanner.msToCentisecondsRounded(0))
        assertEquals(2, ExportPlanner.msToCentisecondsRounded(10))
        assertEquals(4, ExportPlanner.msToCentisecondsRounded(42)) // ~4.2cs -> 4
        assertEquals(10, ExportPlanner.msToCentisecondsRounded(100))
    }

    @Test
    fun frameFileName_isZeroPadded() {
        assertEquals("frame_0007.png", ExportPlanner.frameFileName("frame", 7, 10))
        assertEquals("frame_0042.png", ExportPlanner.frameFileName("frame", 42, 100))
        // Width grows when total has more digits.
        assertEquals("f_01234.png", ExportPlanner.frameFileName("f", 1234, 12000))
    }

    @Test
    fun planCarriesCanvasDimensionsAndLoop() {
        val plan = ExportPlanner.plan(scene(5, loop = false), canvas, range = Range.ALL)
        assertEquals(320, plan.widthPx)
        assertEquals(240, plan.heightPx)
        assertTrue(!plan.loop)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsZeroFrameStep() {
        ExportPlanner.plan(scene(5), canvas, frameStep = 0)
    }
}
