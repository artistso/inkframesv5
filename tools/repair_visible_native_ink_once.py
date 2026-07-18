from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


screen = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/GlassHorizonScreen.kt"
for line in (
    "import androidx.compose.foundation.gestures.detectDragGestures\n",
    "import androidx.compose.ui.input.pointer.pointerInput\n",
    "import androidx.compose.ui.unit.IntOffset\n",
    "import kotlin.math.roundToInt\n",
):
    replace_once(screen, line, "")

replace_once(
    screen,
    ".clip(RoundedCornerShape(16.dp))\n                    .background(HorizonBlush)\n                    .border(1.dp, Color(0x6614000E), RoundedCornerShape(16.dp)),",
    ".clip(RoundedCornerShape(16.dp))\n                    // GLSurfaceView is composited behind the Compose window. The host must\n                    // remain transparent or this fallback paper colour hides all GL output.\n                    .background(Color.Transparent)\n                    .border(1.dp, Color(0x6614000E), RoundedCornerShape(16.dp)),",
)

replace_once(
    screen,
    '''    var dragX by rememberSaveable("glass-device-layout-v3", node.name) { mutableStateOf(0f) }\n    var dragY by rememberSaveable("glass-device-layout-v3", node.name) { mutableStateOf(0f) }\n\n    Box(\n        modifier = modifier.offset { IntOffset(dragX.roundToInt(), dragY.roundToInt()) },\n        contentAlignment = Alignment.Center,\n    ) {\n''',
    '''    Box(\n        modifier = modifier,\n        contentAlignment = Alignment.Center,\n    ) {\n''',
)
replace_once(
    screen,
    '''            modifier = Modifier\n                .size(58.dp)\n                .pointerInput(node) {\n                    detectDragGestures { change, dragAmount ->\n                        change.consume()\n                        dragX += dragAmount.x\n                        dragY += dragAmount.y\n                    }\n                }\n                .shadow(if (isOpen) 22.dp else 14.dp, shape, clip = false)\n''',
    '''            modifier = Modifier\n                .size(58.dp)\n                .shadow(if (isOpen) 22.dp else 14.dp, shape, clip = false)\n''',
)
replace_once(
    screen,
    '''                            view.onStrokeInput = { status -> state.statusMessage = status }\n                            view.onArtworkChanged = onArtworkChanged\n''',
    '''                            view.onStrokeInput = { status -> state.statusMessage = status }\n                            view.onStrokeCommitted = { report ->\n                                state.statusMessage = if (report.nonTransparentPixels > 0) {\n                                    "INK VISIBLE · ${report.nonTransparentPixels} PX · CEL ${report.surfaceId}"\n                                } else {\n                                    "INK LOST · ${report.dabCount} DABS · CEL ${report.surfaceId}"\n                                }\n                            }\n                            view.onArtworkChanged = onArtworkChanged\n''',
)

canvas = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/CanvasView.kt"
replace_once(
    canvas,
    '''            backupStore = backupStore,\n            onContextRestored = { post { onContextRestored?.invoke() } },\n        )\n''',
    '''            backupStore = backupStore,\n            onContextRestored = { post { onContextRestored?.invoke() } },\n            onStrokeCommitted = { report -> post { onStrokeCommitted?.invoke(report) } },\n        )\n''',
)
replace_once(
    canvas,
    '''    /** Invoked on the main thread after pixels have changed and recovery should be refreshed. */\n    var onArtworkChanged: (() -> Unit)? = null\n''',
    '''    /** Invoked on the main thread after pixels have changed and recovery should be refreshed. */\n    var onArtworkChanged: (() -> Unit)? = null\n\n    /** GL-thread verified result after the cel texture has been written and read back. */\n    var onStrokeCommitted: ((PaintEngine.StrokeCommitReport) -> Unit)? = null\n''',
)
replace_once(
    canvas,
    '                    onStrokeInput?.invoke("INK COMMITTED · FRAME ${cfg.targetSurfaceId}")\n',
    '                    onStrokeInput?.invoke("INK QUEUED · CEL ${cfg.targetSurfaceId}")\n',
)

renderer = "engine-gl/src/main/kotlin/com/inkframe/engine/gl/CanvasRenderer.kt"
replace_once(
    renderer,
    '''    /** Invoked (on the GL thread) after surfaces are restored following context loss. */\n    private val onContextRestored: () -> Unit = {},\n) : GLSurfaceView.Renderer {\n''',
    '''    /** Invoked (on the GL thread) after surfaces are restored following context loss. */\n    private val onContextRestored: () -> Unit = {},\n    /** Invoked after a completed stroke has been written to and read back from its cel texture. */\n    private val onStrokeCommitted: (PaintEngine.StrokeCommitReport) -> Unit = {},\n) : GLSurfaceView.Renderer {\n''',
)
replace_once(
    renderer,
    '                EngineEvent.End -> e.endStroke()\n',
    '                EngineEvent.End -> e.endStroke()?.let(onStrokeCommitted)\n',
)

engine = "engine-gl/src/main/kotlin/com/inkframe/engine/gl/PaintEngine.kt"
replace_once(
    engine,
    '''    /** Notified after any change to the document so the host can request a redraw. */\n    var onHistoryChanged: (() -> Unit)? = null\n''',
    '''    /** Notified after any change to the document so the host can request a redraw. */\n    var onHistoryChanged: (() -> Unit)? = null\n\n    data class StrokeCommitReport(\n        val surfaceId: Long,\n        val dabCount: Int,\n        val nonTransparentPixels: Int,\n    )\n''',
)
replace_once(
    engine,
    '''    fun endStroke() {\n        val proc = activeStroke ?: return\n        val cel = strokeCel\n        val brush = strokeBrush\n        val celId = strokeCelId\n        if (cel != null && brush != null) {\n''',
    '''    fun endStroke(): StrokeCommitReport? {\n        val proc = activeStroke ?: return null\n        val cel = strokeCel\n        val brush = strokeBrush\n        val celId = strokeCelId\n        var report = StrokeCommitReport(celId, strokeDabs.size, 0)\n        if (cel != null && brush != null) {\n''',
)
replace_once(
    engine,
    '''                val after = cel.readPixels(glRect.x, glRect.y, glRect.w, glRect.h)\n                val snapshot = StrokeSnapshot(celId, glRect, before, after)\n''',
    '''                val after = cel.readPixels(glRect.x, glRect.y, glRect.w, glRect.h)\n                val alphaProbe = after.duplicate().apply { position(0) }\n                var nonTransparentPixels = 0\n                while (alphaProbe.remaining() >= 4) {\n                    alphaProbe.position(alphaProbe.position() + 3)\n                    if ((alphaProbe.get().toInt() and 0xFF) > 0) nonTransparentPixels++\n                }\n                report = StrokeCommitReport(celId, strokeDabs.size, nonTransparentPixels)\n                val snapshot = StrokeSnapshot(celId, glRect, before, after)\n''',
)
replace_once(
    engine,
    '''        strokeBrush = null\n        strokeDabs.clear()\n    }\n''',
    '''        strokeBrush = null\n        strokeDabs.clear()\n        return report\n    }\n''',
)

changelog = "CHANGELOG.md"
replace_once(
    changelog,
    "## [Unreleased]\n\n",
    "## [Unreleased]\n\n### Native Android — visible GL canvas repair\n- Made the Compose paper host transparent so the behind-window `GLSurfaceView` is no longer obscured by the fallback Glass Horizon paper colour.\n- Added GL readback diagnostics after each committed stroke, distinguishing queued input from verified non-transparent cel pixels.\n- Temporarily locked primary radial nodes to their designed positions so controls cannot be dragged across and obstruct the drawing surface.\n\n",
)
