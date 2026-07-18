from pathlib import Path
import json


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


screen = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/GlassHorizonScreen.kt"

replace_once(
    screen,
    "import androidx.compose.foundation.Canvas\n",
    "import androidx.activity.compose.rememberLauncherForActivityResult\n"
    "import androidx.activity.result.contract.ActivityResultContracts\n"
    "import androidx.compose.foundation.Canvas\n",
)
replace_once(
    screen,
    "import androidx.compose.ui.platform.LocalLifecycleOwner\n",
    "import androidx.compose.ui.platform.LocalContext\n"
    "import androidx.compose.ui.platform.LocalLifecycleOwner\n",
)
replace_once(
    screen,
    "import com.inkframe.core.model.DefaultBrushes\n"
    "import com.inkframe.core.model.RgbaColor\n",
    "import com.inkframe.core.model.DefaultBrushes\n"
    "import com.inkframe.core.model.ExportPlanner\n"
    "import com.inkframe.core.model.InkFrameDefaults\n"
    "import com.inkframe.core.model.MediaTypes\n"
    "import com.inkframe.core.model.RgbaColor\n",
)
replace_once(
    screen,
    "    PROJECTS, NEW, OPEN, SAVE,\n",
    "    PROJECTS, NEW, OPEN, SAVE, EXPORT,\n",
)

replace_once(
    screen,
    """    var canvasView by remember { mutableStateOf<CanvasView?>(null) }
    var openNode by rememberSaveable { mutableStateOf<PrimaryNode?>(null) }
    var overlay by rememberSaveable { mutableStateOf<OverlayKind?>(null) }

    LaunchedEffect(state.isPlaying) {
""",
    """    var canvasView by remember { mutableStateOf<CanvasView?>(null) }
    var openNode by rememberSaveable { mutableStateOf<PrimaryNode?>(null) }
    var overlay by rememberSaveable { mutableStateOf<OverlayKind?>(null) }
    var pendingExportFormat by remember { mutableStateOf<ExportManager.ExportFormat?>(null) }
    val context = LocalContext.current
    val resolver = context.contentResolver

    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(MediaTypes.DocumentKind.PROJECT.mimeType),
    ) { uri ->
        val view = canvasView
        when {
            uri == null -> state.statusMessage = "SAVE CANCELLED"
            view == null -> state.statusMessage = "CANVAS NOT READY"
            else -> {
                val snapshot = state.project
                val out = runCatching { resolver.openOutputStream(uri) }.getOrNull()
                if (out == null) {
                    state.statusMessage = "COULD NOT OPEN SAVE DESTINATION"
                } else {
                    state.setBusy(true)
                    state.statusMessage = "SAVING ${snapshot.name.uppercase()}…"
                    view.saveProjectTo(snapshot, out) { result ->
                        view.post {
                            state.setBusy(false)
                            state.statusMessage = result.fold(
                                onSuccess = { "SAVED ${snapshot.name.uppercase()}" },
                                onFailure = { "SAVE FAILED · ${it.message ?: "UNKNOWN ERROR"}" },
                            )
                        }
                    }
                }
            }
        }
    }

    val openLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        val view = canvasView
        when {
            uri == null -> state.statusMessage = "OPEN CANCELLED"
            view == null -> state.statusMessage = "CANVAS NOT READY"
            else -> {
                val input = runCatching { resolver.openInputStream(uri) }.getOrNull()
                if (input == null) {
                    state.statusMessage = "COULD NOT OPEN ARCHIVE"
                } else {
                    state.setBusy(true)
                    state.statusMessage = "OPENING ARCHIVE…"
                    view.loadProjectFrom(input) { result ->
                        view.post {
                            state.setBusy(false)
                            result.fold(
                                onSuccess = { loaded ->
                                    state.replaceProject(loaded)
                                    view.requestRender()
                                    state.statusMessage = "OPENED ${loaded.name.uppercase()}"
                                },
                                onFailure = { state.statusMessage = "OPEN FAILED · ${it.message ?: "UNKNOWN ERROR"}" },
                            )
                        }
                    }
                }
            }
        }
    }

    fun runExport(format: ExportManager.ExportFormat, uri: android.net.Uri) {
        val view = canvasView ?: run {
            state.statusMessage = "CANVAS NOT READY"
            return
        }
        val plan = ExportPlanner.plan(state.scene, state.project.canvas, ExportPlanner.Range.PLAYBACK)
        state.setBusy(true)
        state.statusMessage = "EXPORTING 0 / ${plan.frameCount}"
        val progress: (Int, Int) -> Unit = { done, total ->
            view.post { state.statusMessage = "EXPORTING $done / $total" }
        }
        val completed: (Result<Unit>) -> Unit = { result ->
            view.post {
                state.setBusy(false)
                state.statusMessage = result.fold(
                    onSuccess = { "EXPORTED ${format.name.replace('_', ' ')}" },
                    onFailure = { "EXPORT FAILED · ${it.message ?: "UNKNOWN ERROR"}" },
                )
            }
        }
        when (format) {
            ExportManager.ExportFormat.MP4 -> {
                val pfd = runCatching { resolver.openFileDescriptor(uri, "rw") }.getOrNull()
                if (pfd == null) {
                    state.setBusy(false)
                    state.statusMessage = "COULD NOT OPEN VIDEO DESTINATION"
                    return
                }
                view.exportAnimationTo(
                    plan = plan,
                    format = format,
                    out = null,
                    fd = pfd.fileDescriptor,
                    drawListFor = state::buildExportDrawList,
                    onProgress = progress,
                ) { result ->
                    runCatching { pfd.close() }
                    completed(result)
                }
            }
            ExportManager.ExportFormat.GIF, ExportManager.ExportFormat.PNG_SEQUENCE -> {
                val out = runCatching { resolver.openOutputStream(uri) }.getOrNull()
                if (out == null) {
                    state.setBusy(false)
                    state.statusMessage = "COULD NOT OPEN EXPORT DESTINATION"
                    return
                }
                view.exportAnimationTo(
                    plan = plan,
                    format = format,
                    out = out,
                    fd = null,
                    drawListFor = state::buildExportDrawList,
                    onProgress = progress,
                    onResult = completed,
                )
            }
        }
    }

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream"),
    ) { uri ->
        val format = pendingExportFormat
        pendingExportFormat = null
        if (uri == null || format == null) {
            state.statusMessage = "EXPORT CANCELLED"
        } else {
            runExport(format, uri)
        }
    }

    fun launchExport(format: ExportManager.ExportFormat) {
        pendingExportFormat = format
        val kind = when (format) {
            ExportManager.ExportFormat.MP4 -> MediaTypes.DocumentKind.MP4
            ExportManager.ExportFormat.GIF -> MediaTypes.DocumentKind.GIF
            ExportManager.ExportFormat.PNG_SEQUENCE -> MediaTypes.DocumentKind.PNG_SEQUENCE
        }
        exportLauncher.launch(MediaTypes.suggestedFileName(state.project.name, kind))
    }

    LaunchedEffect(state.isPlaying) {
""",
)

replace_once(
    screen,
    """            actions = listOf(
                RadialAction("Projects") { overlay = OverlayKind.GALLERY; openNode = null },
                RadialAction("New") { state.statusMessage = "New-project workflow is being connected natively" },
                RadialAction("Open") { state.statusMessage = "Native archive picker is preserved and being moved into Gallery" },
                RadialAction("Save") { state.statusMessage = "Native archive save is preserved and being moved into Gallery" },
            ),
""",
    """            actions = listOf(
                RadialAction("Projects") { overlay = OverlayKind.GALLERY; openNode = null },
                RadialAction("New") {
                    canvasView?.runOnEngine { it.resetForLoad() }
                    state.replaceProject(InkFrameDefaults.newProject())
                    canvasView?.requestRender()
                    state.statusMessage = "NEW CLASSIC CANVAS"
                    openNode = null
                },
                RadialAction("Open") {
                    openLauncher.launch(MediaTypes.PROJECT_OPEN_MIME_TYPES)
                    openNode = null
                },
                RadialAction("Save") {
                    saveLauncher.launch(
                        MediaTypes.suggestedFileName(state.project.name, MediaTypes.DocumentKind.PROJECT),
                    )
                    openNode = null
                },
                RadialAction("GIF") { launchExport(ExportManager.ExportFormat.GIF); openNode = null },
                RadialAction("Video") { launchExport(ExportManager.ExportFormat.MP4); openNode = null },
                RadialAction("PNG") { launchExport(ExportManager.ExportFormat.PNG_SEQUENCE); openNode = null },
            ),
""",
)

replace_once(
    screen,
    """    label == "Save" -> RadialGlyph.SAVE
    else -> RadialGlyph.BRUSH
""",
    """    label == "Save" -> RadialGlyph.SAVE
    label == "GIF" || label == "Video" || label == "PNG" -> RadialGlyph.EXPORT
    else -> RadialGlyph.BRUSH
""",
)

replace_once(
    screen,
    """            RadialGlyph.SAVE -> {
                drawRoundRect(white, Offset(w * .20f, h * .18f), Size(w * .60f, h * .64f), androidx.compose.ui.geometry.CornerRadius(3f), style = Stroke(thin))
                drawRect(white, Offset(w * .32f, h * .20f), Size(w * .36f, h * .20f), style = Stroke(thin))
                drawCircle(white, w * .10f, Offset(w * .50f, h * .64f), style = Stroke(thin))
            }
""",
    """            RadialGlyph.SAVE -> {
                drawRoundRect(white, Offset(w * .20f, h * .18f), Size(w * .60f, h * .64f), androidx.compose.ui.geometry.CornerRadius(3f), style = Stroke(thin))
                drawRect(white, Offset(w * .32f, h * .20f), Size(w * .36f, h * .20f), style = Stroke(thin))
                drawCircle(white, w * .10f, Offset(w * .50f, h * .64f), style = Stroke(thin))
            }
            RadialGlyph.EXPORT -> {
                drawRoundRect(white, Offset(w * .18f, h * .36f), Size(w * .64f, h * .46f), androidx.compose.ui.geometry.CornerRadius(3f), style = Stroke(thin))
                line(.50f, .68f, .50f, .18f)
                line(.50f, .18f, .34f, .34f)
                line(.50f, .18f, .66f, .34f)
            }
""",
)

registry = {
    "schema": 1,
    "binding_reference": "web/index.html",
    "production_surface": "GlassHorizonScreen",
    "status_vocabulary": {
        "verified": "Implemented and physically validated on the target Galaxy Tab",
        "implemented_unverified": "Implemented and covered by build/tests but awaiting physical validation",
        "partial": "Some required behavior exists; original parity is incomplete",
        "missing": "Not yet implemented in the native Glass Horizon runtime",
        "blocked": "Implementation exists but requires an external prerequisite",
    },
    "features": [
        {"id": "native-runtime", "status": "verified", "evidence": ["MainActivity.kt"]},
        {"id": "no-webview", "status": "verified", "evidence": ["android.yml"]},
        {"id": "atmosphere", "status": "partial", "evidence": ["GlassHorizonScreen.kt"]},
        {"id": "title", "status": "implemented_unverified", "evidence": ["web/index.html:69-73", "HorizonTitle"]},
        {"id": "stage-geometry", "status": "partial", "evidence": ["GlassStage"]},
        {"id": "frame-glass", "status": "partial", "evidence": ["GlassStage"]},
        {"id": "perimeter-frame-board", "status": "partial", "evidence": ["PerimeterFrameBoard"]},
        {"id": "timeline-transport", "status": "implemented_unverified", "evidence": ["TimelineRail", "StudioState.togglePlay"]},
        {"id": "frame-holds", "status": "partial", "evidence": ["TimelineOps"]},
        {"id": "eight-primary-nodes", "status": "implemented_unverified", "evidence": ["PrimaryNode"]},
        {"id": "node-dragging", "status": "verified", "evidence": ["Galaxy Tab recordings"]},
        {"id": "native-vector-glyphs", "status": "partial", "evidence": ["NodeGlyph", "RadialActionGlyph"]},
        {"id": "edge-aware-radials", "status": "partial", "evidence": ["radialOffset"]},
        {"id": "stylus-lens", "status": "verified", "evidence": ["StylusLensOverlayView.kt"]},
        {"id": "visible-drawing", "status": "implemented_unverified", "evidence": ["CpuStrokeRasterizer.kt", "commit f750ca4"]},
        {"id": "pressure", "status": "partial", "evidence": ["CanvasView.kt", "StrokeProcessor.kt"]},
        {"id": "tilt", "status": "missing", "evidence": []},
        {"id": "physical-eraser", "status": "missing", "evidence": []},
        {"id": "undo-redo", "status": "implemented_unverified", "evidence": ["PaintEngine.kt", "UndoStack"]},
        {"id": "frame-local-artwork", "status": "implemented_unverified", "evidence": ["StudioState.ensureActiveCel"]},
        {"id": "layers", "status": "partial", "evidence": ["StudioState.kt", "LAYERS radial"]},
        {"id": "onion-skin", "status": "partial", "evidence": ["OnionSkinPlanner", "STUDIO radial"]},
        {"id": "project-new", "status": "implemented_unverified", "evidence": ["GALLERY radial"]},
        {"id": "project-open", "status": "implemented_unverified", "evidence": ["CanvasView.loadProjectFrom"]},
        {"id": "project-save", "status": "implemented_unverified", "evidence": ["CanvasView.saveProjectTo"]},
        {"id": "autosave-recovery", "status": "missing", "evidence": []},
        {"id": "gif-export", "status": "implemented_unverified", "evidence": ["ExportManager.kt"]},
        {"id": "mp4-export", "status": "implemented_unverified", "evidence": ["Mp4Encoder"]},
        {"id": "png-sequence-export", "status": "implemented_unverified", "evidence": ["ExportManager.kt"]},
        {"id": "brush-lab", "status": "missing", "evidence": []},
        {"id": "color-picker", "status": "partial", "evidence": ["COLOR swatches"]},
        {"id": "stylus-diagnostics", "status": "partial", "evidence": ["StylusLensOverlayView.kt"]},
        {"id": "start-templates", "status": "missing", "evidence": []},
        {"id": "project-gallery", "status": "partial", "evidence": ["GALLERY overlay"]},
        {"id": "help-overlay", "status": "missing", "evidence": []},
        {"id": "theme-worlds", "status": "missing", "evidence": []},
        {"id": "canvas-resize-handles", "status": "missing", "evidence": []},
        {"id": "pinch-pan-rotate", "status": "implemented_unverified", "evidence": ["CanvasView.kt", "ViewportTransform.kt"]},
        {"id": "egl-context-recovery", "status": "implemented_unverified", "evidence": ["SurfaceBackupStore", "CanvasRenderer"]},
        {"id": "production-signing", "status": "blocked", "evidence": ["four long-lived Actions secrets"]},
        {"id": "owner-visual-approval", "status": "blocked", "evidence": ["issue 136"]},
    ],
}
Path("docs/FEATURE_PARITY_REGISTRY.json").write_text(json.dumps(registry, indent=2) + "\n")
