package com.inkframe.feature.canvas

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush as UiBrush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import com.inkframe.core.model.DefaultBrushes
import com.inkframe.core.model.ExportPlanner
import com.inkframe.core.model.InkFrameDefaults
import com.inkframe.core.model.MediaTypes
import com.inkframe.core.model.RgbaColor
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Closed-beta Glass Horizon shell.
 *
 * This is the native Kotlin target for the Play closed-beta screenshots: glass world,
 * top command cluster, perimeter frame board, bottom scrub rail and radial controls.
 */
@Composable
fun ClosedBetaGlassHorizonScreen(state: StudioState = viewModel()) {
    val context = LocalContext.current
    val themePreferences = remember(context) {
        context.getSharedPreferences("glass-horizon-world", android.content.Context.MODE_PRIVATE)
    }
    val storedTheme = remember(themePreferences) {
        themePreferences.getString("theme", BetaTheme.PLUM.name)
    }
    var canvasView by remember { mutableStateOf<CanvasView?>(null) }
    var openNode by rememberSaveable { mutableStateOf<BetaNode?>(BetaNode.TOOLS) }
    var theme by rememberSaveable {
        mutableStateOf(BetaTheme.entries.firstOrNull { it.name == storedTheme } ?: BetaTheme.PLUM)
    }
    var glintPulse by remember { mutableStateOf(false) }
    var pendingExportFormat by remember { mutableStateOf<ExportManager.ExportFormat?>(null) }

    val glintAlpha by animateFloatAsState(
        targetValue = if (glintPulse) 0.72f else 0f,
        animationSpec = tween(durationMillis = if (glintPulse) 120 else 360),
        label = "Glass Horizon interaction glint",
    )
    val palette = betaPalette(theme)
    val resolver = context.contentResolver

    fun selectTheme(next: BetaTheme) {
        if (theme == next) return
        theme = next
        themePreferences.edit().putString("theme", next.name).apply()
        glintPulse = true
        state.statusMessage = "THEME · ${next.name}"
    }

    val recoveryController = remember(context, state) {
        ProjectRecoveryController(
            context = context,
            projectProvider = { state.project },
            shouldRestore = state::claimRecoveryRestore,
            onRestored = { loaded ->
                state.replaceProject(loaded)
                canvasView?.requestRender()
            },
            onStatus = { message -> state.statusMessage = message },
        )
    }

    LaunchedEffect(state.project.modifiedAtEpochMs) {
        recoveryController.schedule()
    }

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

    val openLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
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
        val completed: (Result<Unit>) -> Unit = { result ->
            view.post {
                state.setBusy(false)
                state.statusMessage = result.fold(
                    onSuccess = { "EXPORTED ${format.name.replace('_', ' ')}" },
                    onFailure = { "EXPORT FAILED · ${it.message ?: "UNKNOWN ERROR"}" },
                )
            }
        }
        val progress: (Int, Int) -> Unit = { done, total ->
            view.post { state.statusMessage = "EXPORTING $done / $total" }
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

    fun requestFrame(frame: Int) {
        state.setFrame(frame)
        canvasView?.requestRender()
    }

    LaunchedEffect(state.isPlaying) {
        while (state.isPlaying) {
            delay(state.frameDurationMs)
            state.advancePlayback()
            canvasView?.requestRender()
        }
    }

    LaunchedEffect(glintPulse) {
        if (glintPulse) {
            delay(180)
            glintPulse = false
        }
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.violet),
    ) {
        GlassHorizonAtmosphere(
            isBlue = theme == BetaTheme.BLUE,
            glintAlpha = glintAlpha,
            modifier = Modifier.fillMaxSize(),
        )

        val documentAspect = state.project.canvas.aspectRatio
        val localDensity = LocalDensity.current
        val stagePlacement = GlassHorizonStageLayout.place(
            viewportWidthDp = maxWidth.value,
            viewportHeightDp = maxHeight.value,
            documentAspect = documentAspect,
            fontScale = localDensity.fontScale,
            density = localDensity.density,
        )
        val hostWidth = stagePlacement.hostWidthDp.dp
        val hostHeight = stagePlacement.hostHeightDp.dp
        val canvasWidth = stagePlacement.canvasWidthDp.dp
        val canvasHeight = stagePlacement.canvasHeightDp.dp
        val frameWidth = stagePlacement.frameWidthDp.dp
        val frameHeight = stagePlacement.frameHeightDp.dp
        val frameLeft = stagePlacement.frameLeftDp.dp
        val frameTop = stagePlacement.frameTopDp.dp

        GlassHorizonTitle(
            accent = palette.accent,
            rose = palette.rose,
            dim = palette.dim,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(y = GlassHorizonTitleSpec.TOP_OFFSET_DP.dp),
        )

        ClosedBetaTopCluster(
            palette = palette,
            state = state,
            compact = stagePlacement.compactCommands,
            onFit = { canvasView?.fitToScreen() },
            onTheme = { selectTheme(if (theme == BetaTheme.PLUM) BetaTheme.BLUE else BetaTheme.PLUM) },
            modifier = Modifier.align(Alignment.TopCenter).offset(y = stagePlacement.commandTopDp.dp),
        )

        ClosedBetaStage(
            state = state,
            palette = palette,
            stageVisible = stagePlacement.stageVisible,
            hostWidth = hostWidth,
            hostHeight = hostHeight,
            canvasWidth = canvasWidth,
            canvasHeight = canvasHeight,
            frameWidth = frameWidth,
            frameHeight = frameHeight,
            onFrame = ::requestFrame,
            onAddFrame = {
                state.insertFrame()
                canvasView?.requestRender()
            },
            onCanvasReady = { view ->
                canvasView = view
                recoveryController.attach(view)
            },
            onArtworkChanged = state::markArtworkModified,
            modifier = Modifier.align(Alignment.TopStart).offset(x = frameLeft, y = frameTop),
        )

        ClosedBetaScrubRail(
            state = state,
            palette = palette,
            onFrame = ::requestFrame,
            onAddFrame = {
                state.insertFrame()
                canvasView?.requestRender()
            },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .offset(y = (-18).dp)
                .fillMaxWidth(0.96f),
        )

        val leftX = 54.dp
        val rightX = maxWidth - 56.dp
        val bottomY = maxHeight - 54.dp
        val centerX = maxWidth / 2
        val topNodeY = if (stagePlacement.compactCommands) {
            (stagePlacement.commandBottomDp + GlassHorizonStageLayout.COMPACT_NODE_GAP_DP).dp
        } else {
            92.dp
        }
        val lineNodeY = if (stagePlacement.compactCommands) topNodeY + 128.dp else 220.dp
        val fxNodeY = if (stagePlacement.compactCommands) topNodeY + 104.dp else 196.dp
        val themesNodeY = if (stagePlacement.compactCommands) topNodeY + 196.dp else maxHeight * 0.50f

        ClosedBetaNode(
            node = BetaNode.TOOLS,
            palette = palette,
            open = openNode == BetaNode.TOOLS,
            onToggle = { openNode = openNode.toggle(BetaNode.TOOLS) },
            actions = DefaultBrushes.all.take(6).map { brush ->
                BetaAction(brush.name.uppercase(), selected = state.brush.id == brush.id) {
                    state.brush = brush
                    state.statusMessage = "BRUSH · ${brush.name.uppercase()}"
                }
            },
            fan = Fan.RIGHT,
            modifier = Modifier.align(Alignment.TopStart).offset(x = leftX, y = topNodeY),
        )
        ClosedBetaNode(
            node = BetaNode.LINE,
            palette = palette,
            open = openNode == BetaNode.LINE,
            onToggle = { openNode = openNode.toggle(BetaNode.LINE) },
            actions = listOf(
                BetaAction("OPACITY 100") { state.statusMessage = "OPACITY · 100" },
                BetaAction("SIZE ${state.brush.sizePx.roundToInt()}") {},
                BetaAction("SIZE +") { state.updateBrush { it.copy(sizePx = (it.sizePx + 2f).coerceAtMost(240f)) } },
                BetaAction("SIZE −") { state.updateBrush { it.copy(sizePx = (it.sizePx - 2f).coerceAtLeast(1f)) } },
                BetaAction("ONION", selected = state.onionSkin.enabled) {
                    state.onionSkin = state.onionSkin.copy(enabled = !state.onionSkin.enabled)
                    canvasView?.requestRender()
                },
                BetaAction("CLEAR") {
                    state.clearCelAtCurrentFrame()
                    canvasView?.requestRender()
                },
                BetaAction("UNDO", selected = state.canUndo) { canvasView?.undo() },
                BetaAction("REDO", selected = state.canRedo) { canvasView?.redo() },
            ),
            fan = Fan.RIGHT_DOWN,
            modifier = Modifier.align(Alignment.TopStart).offset(x = leftX, y = lineNodeY),
        )

        ClosedBetaNode(
            node = BetaNode.COLOR,
            palette = palette,
            open = openNode == BetaNode.COLOR,
            onToggle = { openNode = openNode.toggle(BetaNode.COLOR) },
            actions = betaSwatches.map { argb ->
                BetaAction("COLOR", color = Color(argb), selected = state.color.toArgb() == argb) {
                    state.commitColor(RgbaColor.fromArgb(argb))
                    canvasView?.requestRender()
                }
            },
            fan = Fan.LEFT_DOWN,
            modifier = Modifier.align(Alignment.TopStart).offset(x = rightX, y = topNodeY),
        )
        ClosedBetaNode(
            node = BetaNode.FX,
            palette = palette,
            open = openNode == BetaNode.FX,
            onToggle = { openNode = openNode.toggle(BetaNode.FX) },
            actions = listOf(
                BetaAction("CHECKER", selected = state.showChecker) {
                    state.showChecker = !state.showChecker
                    canvasView?.setShowChecker(state.showChecker)
                },
                BetaAction("FIT") { canvasView?.fitToScreen() },
                BetaAction("100") { canvasView?.resetZoom() },
                BetaAction("REPORT") { state.statusMessage = "REPORT READY" },
            ),
            fan = Fan.LEFT,
            modifier = Modifier.align(Alignment.TopStart).offset(x = rightX, y = fxNodeY),
        )
        ClosedBetaNode(
            node = BetaNode.THEMES,
            palette = palette,
            open = openNode == BetaNode.THEMES,
            onToggle = { openNode = openNode.toggle(BetaNode.THEMES) },
            actions = listOf(
                BetaAction("PLUM", color = betaPalette(BetaTheme.PLUM).accent, selected = theme == BetaTheme.PLUM) { selectTheme(BetaTheme.PLUM) },
                BetaAction("BLUE", color = betaPalette(BetaTheme.BLUE).accent, selected = theme == BetaTheme.BLUE) { selectTheme(BetaTheme.BLUE) },
            ),
            fan = Fan.LEFT_UP,
            modifier = Modifier.align(Alignment.TopStart).offset(x = rightX, y = themesNodeY),
        )

        ClosedBetaNode(
            node = BetaNode.STUDIO,
            palette = palette,
            open = openNode == BetaNode.STUDIO,
            onToggle = { openNode = openNode.toggle(BetaNode.STUDIO) },
            actions = listOf(BetaAction("ABOUT") { state.statusMessage = "INKFRAME · THE GLASS HORIZON" }),
            fan = Fan.UP,
            modifier = Modifier.align(Alignment.TopStart).offset(x = 54.dp, y = bottomY),
        )
        ClosedBetaNode(
            node = BetaNode.GALLERY,
            palette = palette,
            open = openNode == BetaNode.GALLERY,
            onToggle = { openNode = openNode.toggle(BetaNode.GALLERY) },
            actions = listOf(
                BetaAction("NEW") {
                    canvasView?.runOnEngine { it.resetForLoad() }
                    state.replaceProject(InkFrameDefaults.newProject())
                    canvasView?.requestRender()
                },
                BetaAction("OPEN") { openLauncher.launch(MediaTypes.PROJECT_OPEN_MIME_TYPES) },
                BetaAction("SAVE") { saveLauncher.launch(MediaTypes.suggestedFileName(state.project.name, MediaTypes.DocumentKind.PROJECT)) },
                BetaAction("GIF") { launchExport(ExportManager.ExportFormat.GIF) },
                BetaAction("VIDEO") { launchExport(ExportManager.ExportFormat.MP4) },
                BetaAction("PNG") { launchExport(ExportManager.ExportFormat.PNG_SEQUENCE) },
            ),
            fan = Fan.UP_RIGHT,
            modifier = Modifier.align(Alignment.TopStart).offset(x = 124.dp, y = bottomY),
        )
        ClosedBetaNode(
            node = BetaNode.FRAMES,
            palette = palette,
            open = openNode == BetaNode.FRAMES,
            onToggle = { openNode = openNode.toggle(BetaNode.FRAMES) },
            actions = listOf(
                BetaAction("PLAY", selected = state.isPlaying) { state.togglePlay() },
                BetaAction("ADD") { state.insertFrame(); canvasView?.requestRender() },
                BetaAction("DUP") { state.duplicateCelToNextFrame(); canvasView?.requestRender() },
                BetaAction("CUT") { state.cutCel(); canvasView?.requestRender() },
                BetaAction("COPY") { state.copyCel() },
                BetaAction("PASTE", selected = state.canPaste) { state.pasteCel(); canvasView?.requestRender() },
                BetaAction("DEL") { state.removeFrame(); canvasView?.requestRender() },
                BetaAction("LOOP", selected = state.scene.loop) { state.toggleLoop() },
            ),
            fan = Fan.UP_RIGHT,
            modifier = Modifier.align(Alignment.TopStart).offset(x = centerX - 150.dp, y = bottomY),
        )
        ClosedBetaNode(
            node = BetaNode.LAYERS,
            palette = palette,
            open = openNode == BetaNode.LAYERS,
            onToggle = { openNode = openNode.toggle(BetaNode.LAYERS) },
            actions = listOf(
                BetaAction("ADD") { state.addLayer(); canvasView?.requestRender() },
                BetaAction("NEXT") {
                    val layers = state.scene.layers
                    val current = layers.indexOfFirst { it.id == state.activeLayerId }.coerceAtLeast(0)
                    state.activeLayerId = layers[(current + 1) % layers.size].id
                    canvasView?.requestRender()
                },
                BetaAction("VISIBLE", selected = state.activeLayer.visible) { state.toggleLayerVisible(state.activeLayerId); canvasView?.requestRender() },
                BetaAction("DELETE") { state.deleteLayer(state.activeLayerId); canvasView?.requestRender() },
            ),
            fan = Fan.UP,
            modifier = Modifier.align(Alignment.TopStart).offset(x = centerX, y = bottomY),
        )
        ClosedBetaNode(
            node = BetaNode.SELECT,
            palette = palette,
            open = openNode == BetaNode.SELECT,
            onToggle = { openNode = openNode.toggle(BetaNode.SELECT) },
            actions = listOf(
                BetaAction("FIT") { canvasView?.fitToScreen() },
                BetaAction("100") { canvasView?.resetZoom() },
                BetaAction("CENTER") { canvasView?.fitToScreen() },
            ),
            fan = Fan.UP_LEFT,
            modifier = Modifier.align(Alignment.TopStart).offset(x = centerX + 96.dp, y = bottomY),
        )
        ClosedBetaNode(
            node = BetaNode.REPORT,
            palette = palette,
            open = openNode == BetaNode.REPORT,
            onToggle = { openNode = openNode.toggle(BetaNode.REPORT) },
            actions = listOf(
                BetaAction("STATE") { state.statusMessage = "${state.currentFrame + 1} / ${state.scene.frameCount} · ${state.scene.layers.size} LAYERS" },
                BetaAction("SAVE") { saveLauncher.launch(MediaTypes.suggestedFileName(state.project.name, MediaTypes.DocumentKind.PROJECT)) },
            ),
            fan = Fan.UP_LEFT,
            modifier = Modifier.align(Alignment.TopStart).offset(x = maxWidth - 58.dp, y = bottomY),
        )

        state.statusMessage?.let { message ->
            ClosedBetaHint(
                text = message,
                palette = palette,
                modifier = Modifier.align(Alignment.BottomCenter).offset(y = (-96).dp),
            )
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> {
                    recoveryController.saveNow()
                    canvasView?.onPause()
                }
                Lifecycle.Event.ON_RESUME -> canvasView?.onResume()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            recoveryController.close()
            state.stop()
        }
    }
}

private enum class BetaTheme { PLUM, BLUE }

private data class BetaPalette(
    val accent: Color,
    val accentDeep: Color,
    val rose: Color,
    val blush: Color,
    val violet: Color,
    val dim: Color,
    val glassFill: Color,
    val glassStrong: Color,
    val stroke: Color,
    val rim: Color,
)

private fun betaPalette(theme: BetaTheme): BetaPalette = when (theme) {
    BetaTheme.PLUM -> BetaPalette(
        accent = Color(0xFFBB0037),
        accentDeep = Color(0xFF880057),
        rose = Color(0xFFF7CAC9),
        blush = Color(0xFFFFF0F3),
        violet = Color(0xFF1A001A),
        dim = Color(0xFFE8B9C6),
        glassFill = Color(0x1FF7CAC9),
        glassStrong = Color(0x33F7CAC9),
        stroke = Color(0x66F7CAC9),
        rim = Color(0x99FFF0F3),
    )
    BetaTheme.BLUE -> BetaPalette(
        accent = Color(0xFF2D75FF),
        accentDeep = Color(0xFF08235F),
        rose = Color(0xFFBFD7FF),
        blush = Color(0xFFFFF0F3),
        violet = Color(0xFF071032),
        dim = Color(0xFFC8D7F7),
        glassFill = Color(0x1FBFD7FF),
        glassStrong = Color(0x38BFD7FF),
        stroke = Color(0x66BFD7FF),
        rim = Color(0xB9E8F0FF),
    )
}

private val betaSwatches = listOf(
    0xFFBB0037.toInt(), 0xFF008A78.toInt(), 0xFF2D75FF.toInt(),
    0xFFE85D1A.toInt(), 0xFF7B2CBF.toInt(), 0xFF2F2F34.toInt(),
    0xFFC39A18.toInt(), 0xFF000000.toInt(), 0xFFFFFFFF.toInt(),
)

private enum class BetaNode(val label: String, val glyph: String) {
    TOOLS("TOOLS", "⌁"),
    LINE("LINE", "⌁"),
    COLOR("COLOR", "◌"),
    FX("FX", "★"),
    THEMES("THEMES", "◐"),
    STUDIO("STUDIO · STEVEN", "◎"),
    GALLERY("GALLERY", "▣"),
    FRAMES("FRAMES", "▦"),
    LAYERS("LAYERS", "▱"),
    SELECT("SELECT", "□"),
    REPORT("REPORT", "▣"),
}

private enum class Fan { RIGHT, LEFT, UP, UP_LEFT, UP_RIGHT, LEFT_UP, LEFT_DOWN, RIGHT_DOWN }

private data class BetaAction(
    val label: String,
    val glyph: String = label.take(1),
    val selected: Boolean = false,
    val color: Color? = null,
    val onClick: () -> Unit,
)

private fun BetaNode?.toggle(node: BetaNode): BetaNode? = if (this == node) null else node

@Composable
private fun ClosedBetaTopCluster(
    palette: BetaPalette,
    state: StudioState,
    compact: Boolean,
    onFit: () -> Unit,
    onTheme: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (compact) {
        Row(
            modifier = modifier,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ClosedBetaPill(if (state.isPlaying) "PAUSE" else "PLAY", palette, compact = true) {
                state.togglePlay()
            }
            ClosedBetaPill("CENTER", palette, compact = true) { onFit() }
            ClosedBetaPill("THEME", palette, compact = true) { onTheme() }
        }
    } else {
        Column(
            modifier,
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                ClosedBetaPill("Engine · V2", palette, selected = true) {
                    state.statusMessage = "ENGINE · V2"
                }
                ClosedBetaPill("Brush Lab", palette, selected = true) {
                    state.showBrushSettings = true
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                ClosedBetaPill(if (state.isPlaying) "PAUSE" else "PLAY", palette) { state.togglePlay() }
                ClosedBetaPill("CENTER", palette) { onFit() }
                ClosedBetaPill("ALL RINGS", palette) { state.statusMessage = "ALL RINGS" }
                ClosedBetaPill("SCRUB", palette) { state.statusMessage = "SCRUB" }
                ClosedBetaPill("THEME", palette) { onTheme() }
            }
        }
    }
}

@Composable
private fun ClosedBetaPill(
    text: String,
    palette: BetaPalette,
    selected: Boolean = false,
    compact: Boolean = false,
    onClick: () -> Unit,
) {
    val pillHeight = if (compact) 34.dp else if (selected) 42.dp else 34.dp
    val pillWidth = if (compact) 64.dp else if (selected) 92.dp else 78.dp
    Box(
        modifier = Modifier
            .height(pillHeight)
            .width(pillWidth)
            .shadow(16.dp, RoundedCornerShape(18.dp), clip = false)
            .clip(RoundedCornerShape(18.dp))
            .background(
                if (selected) UiBrush.linearGradient(listOf(palette.accent, palette.accentDeep))
                else UiBrush.linearGradient(listOf(Color(0x6614000E), palette.glassStrong)),
            )
            .border(1.dp, palette.rim, RoundedCornerShape(18.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(
            text = text,
            color = Color.White,
            fontSize = if (compact) 8.sp else 9.sp,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ClosedBetaStage(
    state: StudioState,
    palette: BetaPalette,
    stageVisible: Boolean,
    hostWidth: Dp,
    hostHeight: Dp,
    canvasWidth: Dp,
    canvasHeight: Dp,
    frameWidth: Dp,
    frameHeight: Dp,
    onFrame: (Int) -> Unit,
    onAddFrame: () -> Unit,
    onCanvasReady: (CanvasView) -> Unit,
    onArtworkChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val containerWidth = if (stageVisible) frameWidth else hostWidth
    val containerHeight = if (stageVisible) frameHeight else hostHeight
    val frameShape = RoundedCornerShape(30.dp)
    val canvasShape = RoundedCornerShape(16.dp)

    Box(modifier.size(containerWidth, containerHeight), contentAlignment = Alignment.Center) {
        if (stageVisible) {
            ClosedBetaFrameBoard(
                state = state,
                palette = palette,
                width = frameWidth,
                height = frameHeight,
                onFrame = onFrame,
                onAddFrame = onAddFrame,
                modifier = Modifier.align(Alignment.Center),
            )
        }

        key("persistent-gl-host") {
            val frameModifier = Modifier
                .size(containerWidth, containerHeight)
                .let { base ->
                    if (stageVisible) {
                        base
                            .shadow(30.dp, frameShape, clip = false)
                            .clip(frameShape)
                            .background(
                                UiBrush.linearGradient(
                                    listOf(palette.glassStrong, palette.glassFill, Color(0x5514000E)),
                                ),
                            )
                            .border(1.dp, palette.stroke, frameShape)
                    } else {
                        base
                    }
                }

            Box(frameModifier) {
                val hostModifier = Modifier
                    .size(hostWidth, hostHeight)
                    .align(Alignment.Center)
                    .let { base ->
                        if (stageVisible) {
                            base
                                .clip(canvasShape)
                                .background(palette.blush)
                                .border(1.dp, Color(0x6614000E), canvasShape)
                        } else {
                            base
                        }
                    }

                Box(hostModifier) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { context ->
                            CanvasView(
                                context = context,
                                canvasWidth = state.project.canvas.widthPx,
                                canvasHeight = state.project.canvas.heightPx,
                                sceneProvider = { state.buildDrawList() },
                                backgroundColorProvider = { state.project.canvas.backgroundColor },
                                strokeConfig = {
                                    CanvasView.StrokeConfig(
                                        targetSurfaceId = state.ensureActiveCel(),
                                        brush = state.brush,
                                        color = state.color,
                                    )
                                },
                                onEngineReady = state::bindEngine,
                            ).also { view ->
                                onCanvasReady(view)
                                view.setShowChecker(state.showChecker)
                                state.onUiInvalidate = { view.post { view.requestRender() } }
                                state.postEngineWork = { block -> view.runOnEngine(block) }
                                view.onViewportChanged = { scale -> view.post { state.setZoom(scale) } }
                                view.onContextRestored = {
                                    view.requestRender()
                                    state.statusMessage = "ARTWORK RESTORED"
                                }
                                view.onStrokeInput = { status -> state.statusMessage = status }
                                view.onArtworkChanged = onArtworkChanged
                                view.onColorSampled = { sampled ->
                                    state.eyedropperActive = false
                                    view.eyedropperActive = false
                                    sampled?.let { state.commitColor(it.withAlpha(1f)) }
                                }
                                view.onFilled = {
                                    state.fillActive = false
                                    view.fillActive = false
                                }
                            }
                        },
                        update = { view ->
                            view.eyedropperActive = state.eyedropperActive
                            view.fillActive = state.fillActive
                            view.setShowChecker(state.showChecker)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ClosedBetaFrameBoard(
    state: StudioState,
    palette: BetaPalette,
    width: Dp,
    height: Dp,
    onFrame: (Int) -> Unit,
    onAddFrame: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val capacity = 120
    val slotCount = maxOf(state.scene.frameCount + 1, 24).coerceAtMost(capacity)
    Box(modifier.size(width, height)) {
        repeat(slotCount) { index ->
            val point = betaPerimeterPoint(index, slotCount, width, height)
            val existing = index < state.scene.frameCount
            val next = index == state.scene.frameCount && state.scene.frameCount < capacity
            val current = existing && index == state.currentFrame
            val filled = existing && state.activeLayer.cels.containsKey(index)
            val shape = RoundedCornerShape(6.dp)
            Box(
                modifier = Modifier
                    .offset(x = point.first - 9.dp, y = point.second - 9.dp)
                    .size(18.dp)
                    .shadow(if (current) 14.dp else 5.dp, shape, clip = false)
                    .clip(shape)
                    .background(
                        when {
                            current -> UiBrush.linearGradient(listOf(Color.White, palette.rose, palette.accent))
                            filled -> UiBrush.linearGradient(listOf(palette.rose.copy(alpha = .72f), palette.accentDeep.copy(alpha = .52f)))
                            next -> UiBrush.linearGradient(listOf(palette.glassStrong, palette.accent.copy(alpha = .34f)))
                            existing -> UiBrush.linearGradient(listOf(Color(0x3DFFF0F3), Color(0x3814000E)))
                            else -> UiBrush.linearGradient(listOf(Color(0x18FFF0F3), Color(0x1114000E)))
                        },
                    )
                    .border(if (current) 2.dp else 1.dp, if (current) Color.White else palette.stroke, shape)
                    .clickable(enabled = existing || next) { if (existing) onFrame(index) else onAddFrame() },
                contentAlignment = Alignment.Center,
            ) {
                androidx.compose.material3.Text(
                    text = if (existing) "${index + 1}" else if (next) "+" else "",
                    color = if (current) palette.violet else Color.White,
                    fontSize = if (next) 11.sp else 8.sp,
                    fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center,
                )
            }
        }
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .offset(y = 30.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xB314000E))
                .border(1.dp, palette.stroke, RoundedCornerShape(999.dp))
                .padding(horizontal = 12.dp, vertical = 5.dp),
        ) {
            androidx.compose.material3.Text(
                text = "${state.currentFrame + 1} / ${state.scene.frameCount}",
                color = Color.White,
                fontSize = 10.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.1.sp,
            )
        }
    }
}

private fun betaPerimeterPoint(index: Int, count: Int, width: Dp, height: Dp): Pair<Dp, Dp> {
    val w = width.value
    val h = height.value
    val perimeter = 2f * (w + h)
    var d = ((index + 0.5f) / count.toFloat()) * perimeter
    return when {
        d <= w -> d.dp to 0.dp
        d <= w + h -> {
            d -= w
            width to d.dp
        }
        d <= 2f * w + h -> {
            d -= w + h
            (w - d).dp to height
        }
        else -> {
            d -= 2f * w + h
            0.dp to (h - d).dp
        }
    }
}

@Composable
private fun ClosedBetaScrubRail(
    state: StudioState,
    palette: BetaPalette,
    onFrame: (Int) -> Unit,
    onAddFrame: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .height(28.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(Color(0x6614000E))
            .border(1.dp, palette.stroke.copy(alpha = .52f), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(maxOf(state.scene.frameCount + 1, 36).coerceAtMost(120)) { index ->
            val existing = index < state.scene.frameCount
            val next = index == state.scene.frameCount
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(if (existing && index == state.currentFrame) 10.dp else 5.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                        when {
                            existing && index == state.currentFrame -> palette.accent
                            existing && state.activeLayer.cels.containsKey(index) -> palette.rose.copy(alpha = .55f)
                            next -> palette.rose.copy(alpha = .28f)
                            else -> Color.White.copy(alpha = .18f)
                        },
                    )
                    .clickable(enabled = existing || next) { if (existing) onFrame(index) else onAddFrame() },
            )
        }
    }
}

@Composable
private fun ClosedBetaNode(
    node: BetaNode,
    palette: BetaPalette,
    open: Boolean,
    onToggle: () -> Unit,
    actions: List<BetaAction>,
    fan: Fan,
    modifier: Modifier = Modifier,
) {
    Box(modifier, contentAlignment = Alignment.Center) {
        if (open) {
            val density = LocalDensity.current
            actions.forEachIndexed { index, action ->
                val offset = betaFanOffset(index, fan)
                val popupOffset = with(density) {
                    IntOffset(
                        x = (offset.first + 5.dp).roundToPx(),
                        y = (offset.second + 5.dp).roundToPx(),
                    )
                }
                Popup(
                    alignment = Alignment.TopStart,
                    offset = popupOffset,
                    properties = PopupProperties(
                        focusable = false,
                        clippingEnabled = false,
                    ),
                ) {
                    ClosedBetaKid(action, palette)
                }
            }
        }
        val shape = CircleShape
        Box(
            modifier = Modifier
                .size(58.dp)
                .shadow(if (open) 24.dp else 14.dp, shape, clip = false)
                .clip(shape)
                .background(UiBrush.radialGradient(listOf(palette.glassStrong, palette.glassFill, Color(0x4614000E))))
                .border(1.dp, if (open) palette.rim else palette.stroke, shape)
                .clickable(onClick = onToggle),
            contentAlignment = Alignment.Center,
        ) {
            androidx.compose.material3.Text(
                text = node.glyph,
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                style = TextStyle(shadow = Shadow(Color(0xCC000000), Offset(0f, 1f), blurRadius = 8f)),
            )
            androidx.compose.material3.Text(
                text = node.label,
                color = palette.dim,
                fontSize = 9.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.1.sp,
                modifier = Modifier.align(Alignment.BottomCenter).offset(y = 22.dp),
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun ClosedBetaKid(action: BetaAction, palette: BetaPalette, modifier: Modifier = Modifier) {
    val shape = CircleShape
    Box(
        modifier = modifier
            .size(48.dp)
            .shadow(16.dp, shape, clip = false)
            .clip(shape)
            .background(
                when {
                    action.color != null -> UiBrush.radialGradient(listOf(action.color, Color(0xAA14000E)))
                    action.selected -> UiBrush.linearGradient(listOf(palette.accent, palette.accentDeep))
                    else -> UiBrush.radialGradient(listOf(palette.glassStrong, palette.glassFill, Color(0x5514000E)))
                },
            )
            .border(if (action.selected) 2.dp else 1.dp, if (action.selected) palette.rim else palette.stroke, shape)
            .clickable(onClick = action.onClick),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(
            text = if (action.color != null) "" else action.glyph.uppercase(),
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center,
        )
        androidx.compose.material3.Text(
            text = action.label,
            color = palette.dim,
            fontSize = 8.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = .8.sp,
            modifier = Modifier.align(Alignment.BottomCenter).offset(y = 20.dp),
            maxLines = 1,
        )
    }
}

private fun betaFanOffset(index: Int, fan: Fan): Pair<Dp, Dp> {
    val step = 48f
    val radius = 72f + index * step
    val angle = when (fan) {
        Fan.RIGHT -> -22f + index * 14f
        Fan.LEFT -> 202f - index * 14f
        Fan.UP -> -90f + (index - 2) * 16f
        Fan.UP_LEFT -> -120f - index * 9f
        Fan.UP_RIGHT -> -60f + index * 9f
        Fan.LEFT_UP -> 180f + index * 13f
        Fan.LEFT_DOWN -> 160f - index * 13f
        Fan.RIGHT_DOWN -> 20f + index * 12f
    } / 180f * PI.toFloat()
    return (cos(angle) * radius).dp to (sin(angle) * radius).dp
}

@Composable
private fun ClosedBetaHint(text: String, palette: BetaPalette, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Color(0xB314000E))
            .border(1.dp, palette.stroke, RoundedCornerShape(999.dp))
            .padding(horizontal = 14.dp, vertical = 7.dp),
    ) {
        androidx.compose.material3.Text(text, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
    }
}
