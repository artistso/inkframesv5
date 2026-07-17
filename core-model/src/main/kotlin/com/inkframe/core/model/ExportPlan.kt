package com.inkframe.core.model

/**
 * Pure planning for exporting a scene to a frame sequence (PNG sequence, GIF, or video).
 *
 * The plan resolves *which* timeline frames to render and *how long* each is shown,
 * independent of any GPU/Android work. Keeping this pure means the timing math — frame
 * range selection, per-frame durations, GIF centisecond rounding, total length — is
 * unit-tested without an emulator.
 */
object ExportPlanner {

    /** One entry to render: a timeline frame index and how long it is displayed. */
    data class PlannedFrame(
        val frameIndex: Int,
        val durationMs: Int,
        /** Centiseconds (1/100 s) for GIF Graphic Control Extension delay. */
        val gifDelayCs: Int,
    )

    data class ExportPlan(
        val widthPx: Int,
        val heightPx: Int,
        val fps: Int,
        val frames: List<PlannedFrame>,
        val loop: Boolean,
    ) {
        val frameCount: Int get() = frames.size
        val totalDurationMs: Int get() = frames.sumOf { it.durationMs }
    }

    /** Which frames of a scene to export. */
    enum class Range { PLAYBACK, ALL }

    /**
     * Builds an [ExportPlan] for [scene] rendered at the project's [canvas] settings.
     *
     * @param range PLAYBACK uses the scene's playback in/out; ALL uses every frame.
     * @param fpsOverride optional fps to retime the export (defaults to the canvas fps).
     * @param frameStep render every Nth frame (1 = all; 2 = on twos, etc.). A sampled
     * frame inherits the total display time of every source frame covered by that step.
     */
    fun plan(
        scene: Scene,
        canvas: CanvasSpec,
        range: Range = Range.PLAYBACK,
        fpsOverride: Int? = null,
        frameStep: Int = 1,
    ): ExportPlan {
        require(frameStep >= 1) { "frameStep must be >= 1" }
        val fps = (fpsOverride ?: canvas.fps).coerceIn(1, 120)

        val first: Int
        val last: Int
        when (range) {
            Range.ALL -> { first = 0; last = scene.frameCount - 1 }
            Range.PLAYBACK -> {
                first = scene.playbackRange.first.coerceIn(0, scene.frameCount - 1)
                last = scene.playbackRange.last.coerceIn(first, scene.frameCount - 1)
            }
        }

        val tickDurationMs = 1000.0 / fps
        val frames = ArrayList<PlannedFrame>()
        var idx = first
        // Accumulate fractional ms so total duration tracks the true frame rate without
        // drift (important for long exports — rounding each frame would accumulate error).
        var accumulatedMs = 0.0
        var emittedMs = 0
        while (idx <= last) {
            val coveredEndExclusive = (idx + frameStep).coerceAtMost(last + 1)
            var heldTicks = 0
            for (sourceFrame in idx until coveredEndExclusive) {
                heldTicks += scene.frameHolds[sourceFrame]
            }
            accumulatedMs += tickDurationMs * heldTicks
            val targetTotal = accumulatedMs.toInt()
            val durationMs = (targetTotal - emittedMs).coerceAtLeast(1)
            emittedMs += durationMs
            frames.add(
                PlannedFrame(
                    frameIndex = idx,
                    durationMs = durationMs,
                    gifDelayCs = msToCentisecondsRounded(durationMs),
                ),
            )
            idx += frameStep
        }

        return ExportPlan(
            widthPx = canvas.widthPx,
            heightPx = canvas.heightPx,
            fps = fps,
            frames = frames,
            loop = scene.loop,
        )
    }

    /**
     * Rounds milliseconds to GIF centiseconds. GIF delays are 1/100 s; most viewers clamp
     * a delay of 0 or 1 to ~10cs, so we round to nearest and guarantee a minimum of 2cs.
     */
    fun msToCentisecondsRounded(ms: Int): Int = ((ms + 5) / 10).coerceAtLeast(2)

    /** Zero-padded file name for a PNG-sequence frame, e.g. frame_0007.png. */
    fun frameFileName(prefix: String, ordinal: Int, total: Int, ext: String = "png"): String {
        val width = (total.toString().length).coerceAtLeast(4)
        return "%s_%0${width}d.%s".format(prefix, ordinal, ext)
    }
}
