package com.inkframe.core.model

/**
 * Pure planning for exporting a scene to a frame sequence (PNG sequence, GIF, or video).
 *
 * The plan resolves *which* authored frames to render and *how long* each is shown,
 * independent of any GPU/Android work. Scene-level hold counts are represented both as
 * real-time durations for GIF/video and as discrete exposure ticks for PNG sequences.
 */
object ExportPlanner {

    /** One authored frame entry and its exported timing. */
    data class PlannedFrame(
        val frameIndex: Int,
        val durationMs: Int,
        /** Number of project timing ticks represented by this entry. */
        val exposureTicks: Int,
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
        val pngSequenceFrameCount: Int get() = frames.sumOf { it.exposureTicks }

        /** Timeline frame indices expanded once per exposure tick for PNG-sequence output. */
        fun expandedPngFrameIndices(): List<Int> = buildList(pngSequenceFrameCount) {
            for (frame in frames) repeat(frame.exposureTicks) { add(frame.frameIndex) }
        }
    }

    /** Which frames of a scene to export. */
    enum class Range { PLAYBACK, ALL }

    /**
     * Builds an [ExportPlan] for [scene] rendered at the project's [canvas] settings.
     *
     * [frameStep] selects every Nth authored frame. The selected entry absorbs the hold
     * ticks of every skipped source frame in its step window, preserving total timing.
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

        val tickMs = 1000.0 / fps
        val frames = ArrayList<PlannedFrame>()
        var idx = first
        var accumulatedMs = 0.0
        var emittedMs = 0

        while (idx <= last) {
            val windowEnd = minOf(last + 1, idx + frameStep)
            val holdTicks = (idx until windowEnd).sumOf { scene.holdAt(it) }
            accumulatedMs += tickMs * holdTicks
            val targetTotal = accumulatedMs.toInt()
            val durationMs = (targetTotal - emittedMs).coerceAtLeast(1)
            emittedMs += durationMs
            frames += PlannedFrame(
                frameIndex = idx,
                durationMs = durationMs,
                exposureTicks = holdTicks,
                gifDelayCs = msToCentisecondsRounded(durationMs),
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
