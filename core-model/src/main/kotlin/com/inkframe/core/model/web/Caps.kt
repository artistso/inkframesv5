package com.inkframe.core.model.web

/**
 * Hard caps and defaults of the web-v3 document model, ported from `web/index.html`.
 *
 * Line references (verified against `main @ 934f7ec`):
 * - [MAX_PROJECTS] / [MAX_FRAMES]: `MAX_PROJECTS=4` / `MAX_FRAMES=120` (i.html:1108-1109).
 * - [W0] / [H0]: `W0=1024,H0=768` default document size (i.html:802).
 * - [DEFAULT_FPS] / [FPS_RANGE]: `fps=12` boot default (i.html:911) and the FPS dial range
 *   `makeDial(fpsDial,1,24,...)` (i.html:3976). Enforced at the dial boundary only; archive
 *   import keeps the stored value (`fps:P.fps||12`, i.html:4569).
 * - [HOLD_RANGE]: per-frame hold ticks clamped `Math.max(1,Math.min(8,...))` in `adjustHolds`
 *   (i.html:3924-3927).
 * - [UNDO_CAP]: `pushU` drops the oldest snapshot beyond 40 (i.html:1223).
 * - [CANVAS_DIM_RANGE]: `MINDIM=256, MAXDIM=4096` in `reshapeDocument` (i.html:5029).
 * - [DEFAULT_PAPER]: `DEFAULT_PAPER='#fff0f3'` (i.html:1113).
 * - [DEFAULT_PROJECT_NAME] / [FIRST_LAYER_NAME]: `newProject` / `newFrame` defaults
 *   (i.html:1114-1116, 1077).
 */
object Caps {
    const val MAX_PROJECTS = 4
    const val MAX_FRAMES = 120
    const val W0 = 1024
    const val H0 = 768
    const val DEFAULT_FPS = 12
    val FPS_RANGE = 1..24
    val HOLD_RANGE = 1..8
    const val UNDO_CAP = 40
    val CANVAS_DIM_RANGE = 256..4096
    const val DEFAULT_PAPER = "#fff0f3"
    const val DEFAULT_PROJECT_NAME = "Canvas"
    const val FIRST_LAYER_NAME = "Layer 1"
}
