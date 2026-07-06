package com.inkframe.feature.canvas

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.AddBox
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Colorize
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.CopyAll
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.FitScreen
import androidx.compose.material.icons.filled.MoreTime
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.FormatColorFill
import androidx.compose.material.icons.filled.GridOn
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.FirstPage
import androidx.compose.material.icons.filled.LastPage
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.TextButton
import com.inkframe.core.model.BrushAdjustments
import com.inkframe.core.model.OnionSkinSettings
import com.inkframe.core.model.TimelineDrag
import com.inkframe.core.model.Hsv
import com.inkframe.core.model.RgbaColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import com.inkframe.core.model.BlendMode
import com.inkframe.core.model.Brush
import com.inkframe.core.model.DefaultBrushes
import com.inkframe.core.model.ExportPlanner
import com.inkframe.core.model.MediaTypes
import kotlinx.coroutines.delay

/**
 * The top-level studio UI: a left tool rail (brushes), the central GL canvas, a right
 * panel (layers + color), and a bottom timeline with playback + onion skin toggle.
 */
@Composable
fun StudioScreen(state: StudioState = viewModel()) {
    var canvasView by remember { mutableStateOf<CanvasView?>(null) }
    val context = LocalContext.current
    val resolver = context.contentResolver

    // --- Save the project via SAF (system "create document" picker) ---
    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(MediaTypes.DocumentKind.PROJECT.mimeType),
    ) saveResult@{ uri ->
        val view = canvasView ?: return@saveResult
        if (uri == null) { state.statusMessage = "Save cancelled"; return@saveResult }
        val snapshot = state.project
        state.setBusy(true)
        val out = runCatching { resolver.openOutputStream(uri) }.getOrNull()
        if (out == null) { state.setBusy(false); state.statusMessage = "Couldn't open destination"; return@saveResult }
        view.saveProjectTo(snapshot, out) { result ->
            view.post {
                state.setBusy(false)
                state.statusMessage = result.fold(
                    onSuccess = { "Saved \u201c${snapshot.name}\u201d" },
                    onFailure = { "Save failed: ${it.message}" },
                )
            }
        }
    }

    // --- Open a project via SAF ("open document" picker) ---
    val openLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) openResult@{ uri ->
        val view = canvasView ?: return@openResult
        if (uri == null) { state.statusMessage = "Open cancelled"; return@openResult }
        state.setBusy(true)
        val input = runCatching { resolver.openInputStream(uri) }.getOrNull()
        if (input == null) { state.setBusy(false); state.statusMessage = "Couldn't open file"; return@openResult }
        view.loadProjectFrom(input) { result ->
            view.post {
                state.setBusy(false)
                result.fold(
                    onSuccess = { loaded ->
                        state.replaceProject(loaded)
                        view.requestRender()
                        state.statusMessage = "Opened \u201c${loaded.name}\u201d"
                    },
                    onFailure = { state.statusMessage = "Open failed: ${it.message}" },
                )
            }
        }
    }

    val onSave: () -> Unit = {
        saveLauncher.launch(MediaTypes.suggestedFileName(state.project.name, MediaTypes.DocumentKind.PROJECT))
    }
    val onOpen: () -> Unit = { openLauncher.launch(MediaTypes.PROJECT_OPEN_MIME_TYPES) }

    // --- Export via SAF ---------------------------------------------------
    var showExportDialog by remember { mutableStateOf(false) }
    // The format chosen in the dialog, remembered until the SAF picker returns a Uri.
    var pendingExportFormat by remember { mutableStateOf<ExportManager.ExportFormat?>(null) }

    fun runExport(format: ExportManager.ExportFormat, uri: android.net.Uri) {
        val view = canvasView ?: return
        val plan = ExportPlanner.plan(state.scene, state.project.canvas, ExportPlanner.Range.PLAYBACK)
        state.setBusy(true)
        state.statusMessage = "Exporting\u2026 0/${plan.frameCount}"
        val onDone: (Result<Unit>) -> Unit = { result ->
            view.post {
                state.setBusy(false)
                state.statusMessage = result.fold(
                    onSuccess = { "Exported \u201c${state.project.name}\u201d (${plan.frameCount} frames)" },
                    onFailure = { "Export failed: ${it.message}" },
                )
            }
        }
        val onProg: (Int, Int) -> Unit = { d, t -> view.post { state.statusMessage = "Exporting\u2026 $d/$t" } }
        if (format == ExportManager.ExportFormat.MP4) {
            // MediaMuxer needs a seekable fd; "rw" guarantees seekability.
            val pfd = runCatching { resolver.openFileDescriptor(uri, "rw") }.getOrNull()
            if (pfd == null) { state.setBusy(false); state.statusMessage = "Couldn't open destination"; return }
            view.exportAnimationTo(plan, format, out = null, fd = pfd.fileDescriptor,
                drawListFor = { f -> state.buildExportDrawList(f) }, onProgress = onProg) { r ->
                runCatching { pfd.close() }
                onDone(r)
            }
        } else {
            val out = runCatching { resolver.openOutputStream(uri) }.getOrNull()
            if (out == null) { state.setBusy(false); state.statusMessage = "Couldn't open destination"; return }
            view.exportAnimationTo(plan, format, out = out, fd = null,
                drawListFor = { f -> state.buildExportDrawList(f) }, onProgress = onProg, onResult = onDone)
        }
    }

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream"),
    ) exportResult@{ uri ->
        val format = pendingExportFormat
        pendingExportFormat = null
        if (uri == null) { state.statusMessage = "Export cancelled"; return@exportResult }
        if (format != null) runExport(format, uri)
    }

    val doExport: (ExportManager.ExportFormat) -> Unit = { format ->
        showExportDialog = false
        pendingExportFormat = format
        val kind = when (format) {
            ExportManager.ExportFormat.MP4 -> MediaTypes.DocumentKind.MP4
            ExportManager.ExportFormat.GIF -> MediaTypes.DocumentKind.GIF
            ExportManager.ExportFormat.PNG_SEQUENCE -> MediaTypes.DocumentKind.PNG_SEQUENCE
        }
        exportLauncher.launch(MediaTypes.suggestedFileName(state.project.name, kind))
    }

    if (showExportDialog) {
        ExportDialog(
            onDismiss = { showExportDialog = false },
            onMp4 = { doExport(ExportManager.ExportFormat.MP4) },
            onGif = { doExport(ExportManager.ExportFormat.GIF) },
            onPngSequence = { doExport(ExportManager.ExportFormat.PNG_SEQUENCE) },
        )
    }

    // Playback loop: advances frames at the project FPS while playing.
    LaunchedEffect(state.isPlaying, state.project.canvas.fps) {
        if (state.isPlaying) {
            while (state.isPlaying) {
                delay(state.frameDurationMs)
                state.advancePlayback()
                canvasView?.requestRender()
            }
        }
    }

    if (state.showBrushSettings) {
        BrushSettingsPanel(
            brush = state.brush,
            onChange = { transform -> state.updateBrush(transform) },
            onReset = { state.updateBrush { BrushAdjustments.resetToDefault(it) } },
            onDismiss = { state.showBrushSettings = false },
        )
    }

    if (state.showOnionSettings) {
        OnionSettingsPanel(
            settings = state.onionSkin,
            onChange = { state.onionSkin = it; canvasView?.requestRender() },
            onDismiss = { state.showOnionSettings = false },
        )
    }

    if (state.showColorPicker) {
        ColorPickerDialog(
            initial = state.color,
            onConfirm = { picked -> state.commitColor(picked); canvasView?.requestRender() },
            onDismiss = { state.showColorPicker = false },
        )
    }

    val renamingId = state.renamingLayerId
    if (renamingId != null) {
        val layer = state.scene.layerById(renamingId)
        if (layer != null) {
            RenameLayerDialog(
                currentName = layer.name,
                onConfirm = { name -> state.renameLayer(renamingId, name) },
                onDismiss = { state.renamingLayerId = null },
            )
        } else {
            state.renamingLayerId = null
        }
    }

    Row(Modifier.fillMaxSize().background(Color(0xFF1E1E22))) {
        BrushRail(
            current = state.brush,
            onSelect = { state.brush = it },
            onOpenSettings = { state.showBrushSettings = true },
            modifier = Modifier,
        )

        Column(Modifier.weight(1f)) {
            TopToolbar(
                state = state,
                onUndo = { canvasView?.undo() },
                onRedo = { canvasView?.redo() },
                onSave = onSave,
                onOpen = onOpen,
                onExport = { showExportDialog = true },
                onFit = { canvasView?.fitToScreen() },
                onReset100 = { canvasView?.resetZoom() },
                onToggleOnion = {
                    state.onionSkin = state.onionSkin.copy(enabled = !state.onionSkin.enabled)
                    canvasView?.requestRender()
                },
                onOpenOnionSettings = { state.showOnionSettings = true },
                onToggleEyedropper = {
                    state.eyedropperActive = !state.eyedropperActive
                    state.fillActive = false                       // tools are mutually exclusive
                    canvasView?.eyedropperActive = state.eyedropperActive
                    canvasView?.fillActive = false
                    state.statusMessage = if (state.eyedropperActive) "Eyedropper: tap the canvas" else null
                },
                onToggleFill = {
                    state.fillActive = !state.fillActive
                    state.eyedropperActive = false
                    canvasView?.fillActive = state.fillActive
                    canvasView?.eyedropperActive = false
                    state.statusMessage = if (state.fillActive) "Fill: tap an area" else null
                },
                onToggleChecker = {
                    state.showChecker = !state.showChecker
                    canvasView?.setShowChecker(state.showChecker)
                },
            )
            Box(Modifier.weight(1f)) {
                AndroidView(
                    factory = { ctx ->
                        CanvasView(
                            context = ctx,
                            canvasWidth = state.project.canvas.widthPx,
                            canvasHeight = state.project.canvas.heightPx,
                            sceneProvider = { state.buildDrawList() },
                            strokeConfig = {
                                val sid = state.ensureActiveCel()
                                CanvasView.StrokeConfig(sid, state.brush, state.color)
                            },
                            onEngineReady = { engine -> state.bindEngine(engine) },
                        ).also { view ->
                            canvasView = view
                            // Engine history callbacks fire on the GL thread; bounce a
                            // redraw request back so the toolbar reflects new state.
                            state.onUiInvalidate = { view.requestRender() }
                            // Reflect pan/zoom changes in the toolbar zoom indicator.
                            view.onViewportChanged = { scale -> view.post { state.setZoom(scale) } }
                            // Route timeline duplicate/paste GPU clones onto the GL thread.
                            state.postEngineWork = { block -> view.runOnEngine(block) }
                            // After GL-context loss + restore, redraw with recovered art.
                            view.onContextRestored = {
                                view.requestRender()
                                state.statusMessage = "Restored after display reset"
                            }
                            // Eyedropper: arm state -> view, and feed sampled colour back.
                            view.eyedropperActive = state.eyedropperActive
                            view.onColorSampled = { sampled ->
                                state.eyedropperActive = false   // one-shot: disarm after a pick
                                view.eyedropperActive = false
                                if (sampled != null) {
                                    state.commitColor(sampled.withAlpha(1f))
                                    state.statusMessage = "Picked #${"%08X".format(sampled.toArgb())}"
                                } else {
                                    state.statusMessage = "Nothing to pick there"
                                }
                            }
                            // Bucket: arm state -> view, report result.
                            view.fillActive = state.fillActive
                            view.onFilled = { changed ->
                                state.fillActive = false
                                view.fillActive = false
                                state.statusMessage = if (changed) "Filled" else "Nothing to fill there"
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                )
            }
            TimelineBar(
                state = state,
                onPlayToggle = { state.togglePlay() },
                onFrame = { f -> state.setFrame(f); canvasView?.requestRender() },
            )
        }

        SidePanel(state = state, onChanged = { canvasView?.requestRender() })
    }

    // Forward Activity lifecycle to the GL view so it can pause/resume rendering and back
    // up artwork before the EGL context may be destroyed.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> canvasView?.onPause()
                Lifecycle.Event.ON_RESUME -> canvasView?.onResume()
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            state.stop()
        }
    }
}

@Composable
private fun TopToolbar(
    state: StudioState,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onSave: () -> Unit,
    onOpen: () -> Unit,
    onExport: () -> Unit,
    onFit: () -> Unit,
    onReset100: () -> Unit,
    onToggleOnion: () -> Unit,
    onOpenOnionSettings: () -> Unit,
    onToggleEyedropper: () -> Unit,
    onToggleFill: () -> Unit,
    onToggleChecker: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().background(Color(0xFF26262B)).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        IconButton(onClick = onOpen, enabled = !state.isBusy) {
            Icon(Icons.Filled.FolderOpen, contentDescription = "Open", tint = Color.White)
        }
        IconButton(onClick = onSave, enabled = !state.isBusy) {
            Icon(Icons.Filled.Save, contentDescription = "Save", tint = Color.White)
        }
        IconButton(onClick = onExport, enabled = !state.isBusy) {
            Icon(Icons.Filled.Movie, contentDescription = "Export animation", tint = Color.White)
        }
        IconButton(onClick = onUndo, enabled = state.canUndo) {
            Icon(
                Icons.AutoMirrored.Filled.Undo,
                contentDescription = "Undo",
                tint = if (state.canUndo) Color.White else Color(0xFF55555C),
            )
        }
        IconButton(onClick = onRedo, enabled = state.canRedo) {
            Icon(
                Icons.AutoMirrored.Filled.Redo,
                contentDescription = "Redo",
                tint = if (state.canRedo) Color.White else Color(0xFF55555C),
            )
        }
        val title = state.statusMessage ?: state.project.name
        Text(title, color = Color.White, modifier = Modifier.weight(1f).padding(start = 8.dp))

        // Zoom controls: tap the % to reset to 100%, the frame icon to fit.
        Text(
            "${state.zoomPercent}%",
            color = Color.White,
            modifier = Modifier
                .clickableNoRipple(onReset100)
                .padding(horizontal = 6.dp),
        )
        IconButton(onClick = onFit) {
            Icon(Icons.Filled.FitScreen, contentDescription = "Fit to screen", tint = Color.White)
        }

        // Eyedropper: arm it, then tap the canvas to pick a colour.
        IconButton(onClick = onToggleEyedropper) {
            Icon(
                Icons.Filled.Colorize,
                contentDescription = "Eyedropper",
                tint = if (state.eyedropperActive) MaterialTheme.colorScheme.primary else Color.White,
            )
        }
        // Bucket fill: arm it, then tap an area to flood-fill with the current colour.
        IconButton(onClick = onToggleFill) {
            Icon(
                Icons.Filled.FormatColorFill,
                contentDescription = "Fill",
                tint = if (state.fillActive) MaterialTheme.colorScheme.primary else Color.White,
            )
        }

        // Tap toggles onion skin; the adjacent gear opens its multi-frame settings.
        IconButton(onClick = onToggleOnion) {
            Icon(
                Icons.Filled.Layers,
                contentDescription = "Onion skin",
                tint = if (state.onionSkin.enabled) MaterialTheme.colorScheme.primary else Color.White,
            )
        }
        IconButton(onClick = onOpenOnionSettings) {
            Icon(Icons.Filled.Tune, contentDescription = "Onion skin settings", tint = Color.White)
        }
        IconButton(onClick = onToggleChecker) {
            Icon(
                Icons.Filled.GridOn,
                contentDescription = "Transparency checker",
                tint = if (state.showChecker) MaterialTheme.colorScheme.primary else Color.White,
            )
        }
    }
}

@Composable
private fun BrushRail(
    current: Brush,
    onSelect: (Brush) -> Unit,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .width(60.dp)
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DefaultBrushes.all.forEach { b ->
            val selected = b.id == current.id
            Surface(
                color = if (selected) MaterialTheme.colorScheme.primary else Color(0xFF2C2C32),
                shape = CircleShape,
                modifier = Modifier.size(44.dp),
            ) {
                // Tapping the selected brush again opens its settings; tapping another selects it.
                IconButton(onClick = { if (selected) onOpenSettings() else onSelect(b) }) {
                    Text(b.name.take(1), color = Color.White)
                }
            }
        }
        // Explicit settings (tune) button so the gesture is discoverable.
        Surface(color = Color(0xFF2C2C32), shape = CircleShape, modifier = Modifier.size(44.dp)) {
            IconButton(onClick = onOpenSettings) {
                Icon(Icons.Filled.Tune, contentDescription = "Brush settings", tint = Color.White)
            }
        }
    }
}

@Composable
private fun BrushSettingsPanel(
    brush: Brush,
    onChange: ((Brush) -> Brush) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Brush — ${brush.name}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                LabeledSlider(
                    label = "Size", value = brush.sizePx, range = BrushAdjustments.SIZE_RANGE,
                    valueText = "${brush.sizePx.toInt()} px",
                ) { v -> onChange { BrushAdjustments.withSize(it, v) } }

                LabeledSlider(
                    label = "Min size", value = brush.minSizePx, range = BrushAdjustments.MIN_SIZE_RANGE,
                    valueText = "${brush.minSizePx.toInt()} px",
                ) { v -> onChange { BrushAdjustments.withMinSize(it, v) } }

                LabeledSlider(
                    label = "Opacity", value = brush.opacity, range = BrushAdjustments.OPACITY_RANGE,
                    valueText = percent(brush.opacity),
                ) { v -> onChange { BrushAdjustments.withOpacity(it, v) } }

                LabeledSlider(
                    label = "Flow", value = brush.flow, range = BrushAdjustments.FLOW_RANGE,
                    valueText = percent(brush.flow),
                ) { v -> onChange { BrushAdjustments.withFlow(it, v) } }

                LabeledSlider(
                    label = "Hardness", value = brush.hardness, range = BrushAdjustments.HARDNESS_RANGE,
                    valueText = percent(brush.hardness),
                ) { v -> onChange { BrushAdjustments.withHardness(it, v) } }

                LabeledSlider(
                    label = "Spacing", value = brush.spacing, range = BrushAdjustments.SPACING_RANGE,
                    valueText = percent(brush.spacing),
                ) { v -> onChange { BrushAdjustments.withSpacing(it, v) } }

                LabeledSlider(
                    label = "Smoothing", value = brush.smoothing, range = BrushAdjustments.SMOOTHING_RANGE,
                    valueText = percent(brush.smoothing),
                ) { v -> onChange { BrushAdjustments.withSmoothing(it, v) } }

                ToggleRow("Pressure → size", brush.pressureToSize) { e ->
                    onChange { BrushAdjustments.withPressureToSize(it, e) }
                }
                ToggleRow("Pressure → opacity", brush.pressureToOpacity) { e ->
                    onChange { BrushAdjustments.withPressureToOpacity(it, e) }
                }
                ToggleRow("Build-up (airbrush)", brush.buildUp) { e ->
                    onChange { BrushAdjustments.withBuildUp(it, e) }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
        dismissButton = { TextButton(onClick = onReset) { Text("Reset") } },
    )
}

@Composable
private fun LabeledSlider(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    valueText: String,
    onValue: (Float) -> Unit,
) {
    Column {
        Row {
            Text(label, modifier = Modifier.weight(1f))
            Text(valueText)
        }
        Slider(
            value = value.coerceIn(range.start, range.endInclusive),
            onValueChange = onValue,
            valueRange = range.start..range.endInclusive,
        )
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChecked: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChecked)
    }
}

private fun percent(v: Float): String = "${(v * 100f).toInt()}%"

@Composable
private fun OnionSettingsPanel(
    settings: OnionSkinSettings,
    onChange: (OnionSkinSettings) -> Unit,
    onDismiss: () -> Unit,
) {
    val maxR = OnionSkinSettings.MAX_RANGE.toFloat()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Onion skin") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                ToggleRow("Enabled", settings.enabled) { onChange(settings.copy(enabled = it)) }
                LabeledSlider(
                    label = "Frames before", value = settings.framesBefore.toFloat(),
                    range = 0f..maxR, valueText = "${settings.framesBefore}",
                ) { v -> onChange(settings.copy(framesBefore = v.toInt())) }
                LabeledSlider(
                    label = "Frames after", value = settings.framesAfter.toFloat(),
                    range = 0f..maxR, valueText = "${settings.framesAfter}",
                ) { v -> onChange(settings.copy(framesAfter = v.toInt())) }
                LabeledSlider(
                    label = "Near opacity", value = settings.nearOpacity,
                    range = 0f..1f, valueText = percent(settings.nearOpacity),
                ) { v -> onChange(settings.copy(nearOpacity = v)) }
                LabeledSlider(
                    label = "Far opacity", value = settings.farOpacity,
                    range = 0f..1f, valueText = percent(settings.farOpacity),
                ) { v -> onChange(settings.copy(farOpacity = v)) }
                LabeledSlider(
                    label = "Tint strength", value = settings.tintStrength,
                    range = 0f..1f, valueText = percent(settings.tintStrength),
                ) { v -> onChange(settings.copy(tintStrength = v)) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Tints", modifier = Modifier.weight(1f))
                    SwatchDot(settings.beforeTint); Text(" before  ")
                    SwatchDot(settings.afterTint); Text(" after")
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}

@Composable
private fun SwatchDot(color: RgbaColor) {
    Box(
        Modifier
            .size(16.dp)
            .clip(CircleShape)
            .background(Color(color.toArgb())),
    )
}

@Composable
private fun ColorPickerDialog(
    initial: RgbaColor,
    onConfirm: (RgbaColor) -> Unit,
    onDismiss: () -> Unit,
) {
    // Edit in HSV; seed from the incoming RGBA. Preserve the source alpha.
    var hsv by remember(initial) { mutableStateOf(Hsv.fromRgba(initial)) }
    val preview = hsv.toRgba()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Pick a colour") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                // Live preview swatch.
                Box(
                    Modifier
                        .fillMaxWidth()
                        .size(48.dp)
                        .clip(MaterialTheme.shapes.small)
                        .background(Color(preview.toArgb())),
                )
                LabeledSlider(
                    label = "Hue", value = hsv.h, range = 0f..360f,
                    valueText = "${hsv.h.toInt()}\u00B0",
                ) { v -> hsv = hsv.withHue(v) }
                LabeledSlider(
                    label = "Saturation", value = hsv.s, range = 0f..1f,
                    valueText = percent(hsv.s),
                ) { v -> hsv = hsv.withSaturation(v) }
                LabeledSlider(
                    label = "Brightness", value = hsv.v, range = 0f..1f,
                    valueText = percent(hsv.v),
                ) { v -> hsv = hsv.withValue(v) }
                LabeledSlider(
                    label = "Alpha", value = hsv.a, range = 0f..1f,
                    valueText = percent(hsv.a),
                ) { v -> hsv = hsv.withAlpha(v) }
                Text("#${hexOf(preview)}", color = Color.White)
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(preview); onDismiss() }) { Text("Select") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Uppercase ARGB hex without the leading "0x". */
private fun hexOf(c: RgbaColor): String = "%08X".format(c.toArgb())

@Composable
private fun TimelineBar(state: StudioState, onPlayToggle: () -> Unit, onFrame: (Int) -> Unit) {
    // Any edit mutates the document and needs a redraw; reuse onFrame's redraw via -1.
    val redraw: () -> Unit = { onFrame(state.currentFrame) }
    Row(
        Modifier.fillMaxWidth().background(Color(0xFF26262B)).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        IconButton(onClick = onPlayToggle) {
            Icon(
                if (state.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = if (state.isPlaying) "Pause" else "Play",
                tint = Color.White,
            )
        }
        Text(
            "${state.currentFrame + 1}/${state.scene.frameCount}",
            color = Color.White,
            modifier = Modifier.padding(end = 4.dp),
        )

        // --- Playback range + rate ---
        TimelineAction(Icons.Filled.FirstPage, "Set loop in-point") { state.setInPointToCurrent(); redraw() }
        TimelineAction(Icons.Filled.LastPage, "Set loop out-point") { state.setOutPointToCurrent(); redraw() }
        TimelineAction(Icons.Filled.Repeat, "Loop", tint = if (state.scene.loop) MaterialTheme.colorScheme.primary else Color.White) {
            state.toggleLoop(); redraw()
        }
        FpsStepper(fps = state.project.canvas.fps, onFps = { state.setFps(it); redraw() })

        // --- Exposure-sheet edit actions ---
        TimelineAction(Icons.Filled.AddBox, "Insert frame") { state.insertFrame(); redraw() }
        TimelineAction(Icons.Filled.ContentCopy, "Duplicate frame") { state.duplicateCelToNextFrame(); redraw() }
        TimelineAction(Icons.Filled.MoreTime, "Hold (extend exposure)") { state.extendExposure(); redraw() }
        TimelineAction(Icons.Filled.CopyAll, "Copy cel", enabled = state.hasCelAtCurrentFrame) { state.copyCel() }
        TimelineAction(Icons.Filled.ContentPaste, "Paste cel", enabled = state.canPaste) { state.pasteCel(); redraw() }
        TimelineAction(Icons.Filled.Clear, "Clear cel", enabled = state.hasCelAtCurrentFrame) { state.clearCelAtCurrentFrame(); redraw() }
        TimelineAction(Icons.Filled.Delete, "Remove frame") { state.removeFrame(); redraw() }

        FrameStrip(state = state, onFrame = onFrame, onMoved = { redraw() })
    }
}

/**
 * The scrollable row of frame cells. Tapping a cell seeks to it; dragging a cell that has
 * a drawing moves that cel to wherever you release (via the pure [TimelineDrag] math).
 */
@Composable
private fun FrameStrip(
    state: StudioState,
    onFrame: (Int) -> Unit,
    onMoved: () -> Unit,
) {
    val cellW = 14.dp
    val gap = 2.dp
    val density = LocalDensity.current
    val cellWpx = with(density) { cellW.toPx() }
    val gapPx = with(density) { gap.toPx() }
    val frameCount = state.scene.frameCount

    // Drag start + most-recent x, captured in the pointer scope (not recomposed state).
    val dragStartX = remember { floatArrayOf(-1f) }
    val dragLastX = remember { floatArrayOf(0f) }

    Row(
        Modifier
            .weight(1f)
            .padding(start = 6.dp)
            .pointerInput(frameCount) {
                detectDragGestures(
                    onDragStart = { offset -> dragStartX[0] = offset.x; dragLastX[0] = offset.x },
                    onDragEnd = {
                        val drag = TimelineDrag.resolveDrag(
                            startX = dragStartX[0],
                            endX = dragLastX[0],
                            frameCount = frameCount,
                            cellWidth = cellWpx,
                            spacing = gapPx,
                        ) { state.hasCelAt(it) }
                        if (drag != null && drag.isMove) {
                            state.moveCel(drag.from, drag.to)
                            onMoved()
                        }
                        dragStartX[0] = -1f
                    },
                    onDrag = { change, _ -> dragLastX[0] = change.position.x },
                )
            },
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        val range = state.scene.playbackRange
        for (f in 0 until frameCount) {
            val active = f == state.currentFrame
            val hasCel = state.activeLayer.cels.containsKey(f)
            val inRange = f in range
            val isEdge = f == range.first || f == range.last
            Box(
                Modifier
                    .size(width = cellW, height = 28.dp)
                    .clip(MaterialTheme.shapes.small)
                    .background(
                        when {
                            active -> MaterialTheme.colorScheme.primary
                            hasCel -> Color(0xFF4A4A52)
                            else -> Color(0xFF333339)
                        }.let { base -> if (inRange) base else base.copy(alpha = 0.4f) },
                    )
                    // Mark the loop in/out edges with a secondary accent underline bar.
                    .then(
                        if (isEdge) Modifier.border(
                            width = 2.dp,
                            color = MaterialTheme.colorScheme.secondary,
                            shape = MaterialTheme.shapes.small,
                        ) else Modifier,
                    )
                    .clickableNoRipple { onFrame(f) },
            )
        }
    }
}

@Composable
private fun TimelineAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    enabled: Boolean = true,
    tint: Color? = null,
    onClick: () -> Unit,
) {
    IconButton(onClick = onClick, enabled = enabled) {
        Icon(
            icon,
            contentDescription = description,
            tint = tint ?: if (enabled) Color.White else Color(0xFF55555C),
        )
    }
}

/** Compact −/value/+ stepper for the project frame rate. */
@Composable
private fun FpsStepper(fps: Int, onFps: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onFps(fps - 1) }, enabled = fps > 1, modifier = Modifier.size(28.dp)) {
            Icon(Icons.Filled.Remove, "Slower", tint = if (fps > 1) Color.White else Color(0xFF55555C))
        }
        Text("${fps}fps", color = Color.White)
        IconButton(onClick = { onFps(fps + 1) }, enabled = fps < 120, modifier = Modifier.size(28.dp)) {
            Icon(Icons.Filled.Add, "Faster", tint = if (fps < 120) Color.White else Color(0xFF55555C))
        }
    }
}

@Composable
private fun LayerRow(
    layer: com.inkframe.core.model.Layer,
    active: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    deletable: Boolean,
    onSelect: () -> Unit,
    onToggleVisible: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    Surface(
        color = if (active) Color(0xFF3A3A44) else Color(0xFF2C2C32),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(2.dp)) {
            IconButton(onClick = onToggleVisible, modifier = Modifier.size(32.dp)) {
                Icon(
                    if (layer.visible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                    contentDescription = if (layer.visible) "Hide layer" else "Show layer",
                    tint = if (layer.visible) Color.White else Color(0xFF777780),
                )
            }
            Text(
                layer.name,
                color = if (layer.visible) Color.White else Color(0xFF999AA2),
                maxLines = 1,
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 4.dp)
                    .clickableNoRipple(onSelect),
            )
            IconButton(onClick = onMoveUp, enabled = canMoveUp, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.KeyboardArrowUp, "Move up",
                    tint = if (canMoveUp) Color.White else Color(0xFF55555C))
            }
            IconButton(onClick = onMoveDown, enabled = canMoveDown, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.KeyboardArrowDown, "Move down",
                    tint = if (canMoveDown) Color.White else Color(0xFF55555C))
            }
            IconButton(onClick = onRename, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.Edit, "Rename layer", tint = Color.White)
            }
            IconButton(onClick = onDelete, enabled = deletable, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.Delete, "Delete layer",
                    tint = if (deletable) Color.White else Color(0xFF55555C))
            }
        }
    }
}

@Composable
private fun RenameLayerDialog(
    currentName: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var text by remember(currentName) { mutableStateOf(currentName) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rename layer") },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                singleLine = true,
                label = { Text("Layer name") },
            )
        },
        confirmButton = { TextButton(onClick = { onConfirm(text); onDismiss() }) { Text("Rename") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BlendModePicker(
    current: BlendMode,
    onSelect: (BlendMode) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Blend", color = Color.White, modifier = Modifier.weight(1f))
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it },
        ) {
            // A compact, tappable field showing the current mode.
            Surface(
                color = Color(0xFF2C2C32),
                shape = MaterialTheme.shapes.small,
                modifier = Modifier
                    .menuAnchor()
                    .widthIn(min = 110.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                ) {
                    Text(current.displayName, color = Color.White, modifier = Modifier.weight(1f))
                    Icon(Icons.Filled.ArrowDropDown, contentDescription = null, tint = Color.White)
                }
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                BlendMode.entries.forEach { mode ->
                    DropdownMenuItem(
                        text = { Text(mode.displayName) },
                        onClick = { onSelect(mode); expanded = false },
                    )
                }
            }
        }
    }
}

@Composable
private fun SidePanel(state: StudioState, onChanged: () -> Unit) {
    Column(
        Modifier.background(Color(0xFF26262B)).padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Layers", color = Color.White, modifier = Modifier.weight(1f))
            IconButton(onClick = { state.addLayer(); onChanged() }) {
                Icon(Icons.Filled.Add, contentDescription = "Add layer", tint = Color.White)
            }
        }
        // Top of the stack appears first in the panel (reversed list order).
        val layerCount = state.scene.layers.size
        state.scene.layers.asReversed().forEachIndexed { revIndex, layer ->
            val stackIndex = layerCount - 1 - revIndex
            LayerRow(
                layer = layer,
                active = layer.id == state.activeLayerId,
                canMoveUp = stackIndex < layerCount - 1,
                canMoveDown = stackIndex > 0,
                onSelect = { state.activeLayerId = layer.id; onChanged() },
                onToggleVisible = { state.toggleLayerVisible(layer.id); onChanged() },
                onMoveUp = { state.moveLayerUp(layer.id); onChanged() },
                onMoveDown = { state.moveLayerDown(layer.id); onChanged() },
                onRename = { state.renamingLayerId = layer.id },
                onDelete = { state.deleteLayer(layer.id); onChanged() },
                deletable = layerCount > 1,
            )
        }

        // Opacity + blend mode for the active layer.
        val active = state.activeLayer
        LabeledSlider(
            label = "Layer opacity", value = active.opacity, range = 0f..1f,
            valueText = percent(active.opacity),
        ) { v -> state.setLayerOpacity(active.id, v); onChanged() }
        BlendModePicker(
            current = active.blendMode,
            onSelect = { mode -> state.setLayerBlendMode(active.id, mode); onChanged() },
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Color", color = Color.White, modifier = Modifier.weight(1f))
            // Current colour swatch — tap to open the HSV picker.
            Box(
                Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(Color(state.color.toArgb()))
                    .border(2.dp, Color.White, CircleShape)
                    .clickableNoRipple { state.showColorPicker = true },
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            state.project.colorPalette.forEach { c ->
                Box(
                    Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(Color(c.toArgb()))
                        .clickableNoRipple { state.commitColor(c); onChanged() },
                )
            }
        }
        if (!state.recentColors.isEmpty()) {
            Text("Recent", color = Color.White)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                state.recentColors.colors.take(6).forEach { c ->
                    Box(
                        Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(Color(c.toArgb()))
                            .clickableNoRipple { state.commitColor(c); onChanged() },
                    )
                }
            }
        }
    }
}

@Composable
private fun ExportDialog(
    onDismiss: () -> Unit,
    onMp4: () -> Unit,
    onGif: () -> Unit,
    onPngSequence: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Export animation") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Exports use the scene's playback range at the project frame rate.")
                TextButton(onClick = onMp4, modifier = Modifier.fillMaxWidth()) { Text("Video (.mp4)") }
                TextButton(onClick = onGif, modifier = Modifier.fillMaxWidth()) { Text("Animated GIF") }
                TextButton(onClick = onPngSequence, modifier = Modifier.fillMaxWidth()) { Text("PNG sequence (.zip)") }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Simple tap handler used for palette swatches and layer rows. */
private fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier =
    this.clickable(
        interactionSource = MutableInteractionSource(),
        indication = null,
        onClick = onClick,
    )
