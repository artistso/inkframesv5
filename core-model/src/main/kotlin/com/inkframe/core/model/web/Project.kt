package com.inkframe.core.model.web

import kotlin.math.max

/**
 * One gallery project: web `{frames, holds, cur, w, h, fps, name, paper}` (factory
 * `newProject` i.html:1114-1116) plus the injector-era session fields [canvasShape] and
 * [background] (autosave.js:132-138; absent in v3 archives).
 *
 * - [frames]: 1..[Caps.MAX_FRAMES]; always non-empty (web substitutes one blank frame
 *   whenever a payload lacks frames, i.html:4553).
 * - [holds]: per-frame exposure ticks (1..8 by UI, see [Caps.HOLD_RANGE]); on import any
 *   length mismatch degrades to all-1 (SPEC §WebArchiveCodec.decode; autosave.js:192).
 * - [cur]: clamped at boundaries (`Math.min(Math.max(0,P.cur|0),frames.length-1)`,
 *   i.html:4568); read defensively via [frames].getOrElse at call sites, as the web does.
 * - [fps]: the dial constrains 1..24 (i.html:3976) but import stores the raw value
 *   (`fps:P.fps||12`, i.html:4569) — this class does not re-clamp it.
 */
data class Project(
    val name: String = Caps.DEFAULT_PROJECT_NAME,
    val w: Int = Caps.W0,
    val h: Int = Caps.H0,
    val fps: Int = Caps.DEFAULT_FPS,
    val paper: String = Caps.DEFAULT_PAPER,
    val frames: List<Frame>,
    val holds: List<Int>,
    val cur: Int = 0,
    val canvasShape: CanvasShape = CanvasShape.SQUARE,
    val background: Background? = null,
) {
    init {
        require(frames.isNotEmpty()) { "Project requires at least one frame" }
    }

    /**
     * Per-frame hold ticks, floored at 1 with an out-of-range fallback of 1:
     * `hOf=i=>Math.max(1,Math.round((holds&&holds[i])||1))` (i.html:1227). [holds] entries
     * are already [Int], so the web's `Math.round` is the identity here.
     */
    fun hOf(i: Int): Int = max(1, holds.getOrElse(i) { 1 })

    companion object {
        /**
         * `newProject()` (i.html:1114-1116): one blank frame, holds [1], cur 0, 1024x768,
         * 12 fps, name "Canvas", cream paper.
         */
        fun blank(ids: LayerIdGenerator): Project = Project(
            frames = listOf(Frame.blank(ids)),
            holds = listOf(1),
        )
    }
}
