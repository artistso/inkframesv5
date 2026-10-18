package com.inkframe.feature.canvas

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush as UiBrush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
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
 * This is the native Kotlin Glass Horizon workspace: atmospheric paper stage, perimeter frame
 * board, an accessible timeline rail, and the canonical eight optical command nodes.
 */
@Composable
fun ClosedBetaGlassHorizonScreen(
    state: StudioState = viewModel(),
    onNewProject: (() -> Unit)? = null,
    onOpenBrushLab: () -> Unit = { state.showBrushSettings = true },
) {
    val context = LocalContext.current
    val themePreferences = remember(context) {
        context.getSharedPreferences("glass-horizon-world", android.content.Context.MODE_PRIVATE)
    }
    val storedTheme = remember(themePreferences) {
        themePreferences.getString("theme", BetaTheme.PLUM.name)
    }
    var canvasView by remember { mutableStateOf<CanvasView?>(null) }
    var openNode by rememberSaveable { mutableStateOf<BetaNode?>(null) }
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

        // Keep enough of the tablet viewport free for the floating command orbs and the
        // separate scrub rail instead of letting the drawing frame consume the whole screen.
        val documentAspect = state.project.canvas.aspectRatio
        val nodeCellWidth = 92.dp
        val nodeCellHeight = 84.dp
        val nodeGap = 20.dp
        val radialMenuExtent = 156.dp + 25.dp + nodeGap + nodeCellWidth / 2f + 8.dp
        val canvasWidthLimit = minOf(
            maxWidth * 0.48f,
            (maxWidth - radialMenuExtent * 2 - 28.dp).coerceAtLeast(160.dp),
        )
        val canvasHeightLimit = minOf(
            maxHeight * 0.74f,
            (maxHeight - 208.dp).coerceAtLeast(160.dp),
        )
        val canvasWidth = minOf(canvasWidthLimit, canvasHeightLimit * documentAspect)
        val canvasHeight = canvasWidth / documentAspect
        val frameWidth = canvasWidth + 28.dp
        val frameHeight = canvasHeight + 28.dp
        val frameLeft = (maxWidth - frameWidth) / 2
        val frameTop = (maxHeight - frameHeight) / 2 + 6.dp
        val frameRight = frameLeft + frameWidth

        ClosedBetaTitle(
            palette = palette,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        ClosedBetaStage(
            state = state,
            palette = palette,
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
                .offset(y = (-16).dp)
                .fillMaxWidth(0.96f),
        )

        val leftX = (frameLeft - nodeCellWidth - nodeGap).coerceAtLeast(8.dp)
        val rightX = (frameRight + nodeGap).coerceAtMost(maxWidth - nodeCellWidth - 8.dp)
        val verticalRange = frameHeight - nodeCellHeight
        val nodeY0 = frameTop
        val nodeY1 = frameTop + verticalRange / 3f
        val nodeY2 = frameTop + verticalRange * (2f / 3f)
        val nodeY3 = frameTop + verticalRange

        ClosedBetaNode(
            node = BetaNode.TOOLS,
            palette = palette,
            open = openNode == BetaNode.TOOLS,
            onToggle = { openNode = openNode.toggle(BetaNode.TOOLS) },
            onActionComplete = { openNode = null },
            actions = DefaultBrushes.all.map { brush ->
                BetaAction(brush.name.uppercase(), selected = state.brush.id == brush.id) {
                    state.brush = brush
                    state.statusMessage = "BRUSH · ${brush.name.uppercase()}"
                }
            },
            fan = Fan.LEFT_DOWN,
            modifier = Modifier.align(Alignment.TopStart).offset(x = leftX, y = nodeY0),
        )
        ClosedBetaNode(
            node = BetaNode.LINE,
            palette = palette,
            open = openNode == BetaNode.LINE,
            onToggle = { openNode = openNode.toggle(BetaNode.LINE) },
            onActionComplete = { openNode = null },
            actions = listOf(
                BetaAction("SIZE −", glyph = "−") {
                    state.updateBrush { it.copy(sizePx = (it.sizePx - 2f).coerceAtLeast(1f)) }
                },
                BetaAction("SIZE ${state.brush.sizePx.roundToInt()}", selected = true) {
                    state.statusMessage = "BRUSH SIZE · ${state.brush.sizePx.roundToInt()} PX"
                },
                BetaAction("SIZE +", glyph = "+") {
                    state.updateBrush { it.copy(sizePx = (it.sizePx + 2f).coerceAtMost(240f)) }
                },
                BetaAction("SOFT −") {
                    state.updateBrush { it.copy(smoothing = (it.smoothing - 0.1f).coerceAtLeast(0f)) }
                },
                BetaAction("SOFT +") {
                    state.updateBrush { it.copy(smoothing = (it.smoothing + 0.1f).coerceAtMost(1f)) }
                },
                BetaAction("CLEAR", glyph = "×") {
                    state.clearCelAtCurrentFrame()
                    canvasView?.requestRender()
                },
            ),
            fan = Fan.LEFT,
            modifier = Modifier.align(Alignment.TopStart).offset(x = leftX + 12.dp, y = nodeY1),
        )
        ClosedBetaNode(
            node = BetaNode.STUDIO,
            palette = palette,
            open = openNode == BetaNode.STUDIO,
            onToggle = { openNode = openNode.toggle(BetaNode.STUDIO) },
            onActionComplete = { openNode = null },
            actions = listOf(
                BetaAction("LAB", glyph = "∿") { onOpenBrushLab() },
                BetaAction("PLUM", color = betaPalette(BetaTheme.PLUM).accent, selected = theme == BetaTheme.PLUM) {
                    selectTheme(BetaTheme.PLUM)
                },
                BetaAction("BLUE", color = betaPalette(BetaTheme.BLUE).accent, selected = theme == BetaTheme.BLUE) {
                    selectTheme(BetaTheme.BLUE)
                },
                BetaAction("ABOUT", glyph = "◎") { state.statusMessage = "INKFRAME · THE GLASS HORIZON" },
            ),
            fan = Fan.LEFT_UP,
            modifier = Modifier.align(Alignment.TopStart).offset(x = leftX, y = nodeY2),
        )
        ClosedBetaNode(
            node = BetaNode.FRAMES,
            palette = palette,
            open = openNode == BetaNode.FRAMES,
            onToggle = { openNode = openNode.toggle(BetaNode.FRAMES) },
            onActionComplete = { openNode = null },
            actions = listOf(
                BetaAction("PLAY", selected = state.isPlaying, glyph = if (state.isPlaying) "Ⅱ" else "▶") {
                    state.togglePlay()
                },
                BetaAction("ADD", glyph = "+") { state.insertFrame(); canvasView?.requestRender() },
                BetaAction("DUP", glyph = "⧉") { state.duplicateCelToNextFrame(); canvasView?.requestRender() },
                BetaAction("CUT", glyph = "✂") { state.cutCel(); canvasView?.requestRender() },
                BetaAction("COPY", glyph = "▢") { state.copyCel() },
                BetaAction("PASTE", selected = state.canPaste, glyph = "▣") { state.pasteCel(); canvasView?.requestRender() },
                BetaAction("DEL", glyph = "×") { state.removeFrame(); canvasView?.requestRender() },
                BetaAction("LOOP", selected = state.scene.loop, glyph = "↻") { state.toggleLoop() },
            ),
            fan = Fan.LEFT_UP,
            modifier = Modifier.align(Alignment.TopStart).offset(x = leftX + 12.dp, y = nodeY3),
        )
        ClosedBetaNode(
            node = BetaNode.COLOR,
            palette = palette,
            open = openNode == BetaNode.COLOR,
            onToggle = { openNode = openNode.toggle(BetaNode.COLOR) },
            onActionComplete = { openNode = null },
            actions = betaSwatches.map { (label, argb) ->
                BetaAction(label, color = Color(argb), selected = state.color.toArgb() == argb) {
                    state.commitColor(RgbaColor.fromArgb(argb))
                    canvasView?.requestRender()
                }
            },
            fan = Fan.RIGHT,
            modifier = Modifier.align(Alignment.TopStart).offset(x = rightX, y = nodeY0),
        )
        ClosedBetaNode(
            node = BetaNode.LAYERS,
            palette = palette,
            open = openNode == BetaNode.LAYERS,
            onToggle = { openNode = openNode.toggle(BetaNode.LAYERS) },
            onActionComplete = { openNode = null },
            actions = listOf(
                BetaAction("ADD", glyph = "+") { state.addLayer(); canvasView?.requestRender() },
                BetaAction("NEXT", glyph = "⇄") {
                    val layers = state.scene.layers
                    val current = layers.indexOfFirst { it.id == state.activeLayerId }.coerceAtLeast(0)
                    state.activeLayerId = layers[(current + 1) % layers.size].id
                    canvasView?.requestRender()
                },
                BetaAction("VISIBLE", selected = state.activeLayer.visible, glyph = "◉") {
                    state.toggleLayerVisible(state.activeLayerId)
                    canvasView?.requestRender()
                },
                BetaAction("DELETE", glyph = "×") { state.deleteLayer(state.activeLayerId); canvasView?.requestRender() },
            ),
            fan = Fan.RIGHT,
            modifier = Modifier.align(Alignment.TopStart).offset(x = rightX - 12.dp, y = nodeY1),
        )
        ClosedBetaNode(
            node = BetaNode.ACTIONS,
            palette = palette,
            open = openNode == BetaNode.ACTIONS,
            onToggle = { openNode = openNode.toggle(BetaNode.ACTIONS) },
            onActionComplete = { openNode = null },
            actions = listOf(
                BetaAction("UNDO", selected = state.canUndo, glyph = "↶") { canvasView?.undo() },
                BetaAction("REDO", selected = state.canRedo, glyph = "↷") { canvasView?.redo() },
                BetaAction("FIT", glyph = "⌗") { canvasView?.fitToScreen() },
                BetaAction("100%", glyph = "1:1") { canvasView?.resetZoom() },
                BetaAction("CHECKER", selected = state.showChecker, glyph = "▦") {
                    state.showChecker = !state.showChecker
                    canvasView?.setShowChecker(state.showChecker)
                },
                BetaAction("ONION", selected = state.onionSkin.enabled, glyph = "◉") {
                    state.onionSkin = state.onionSkin.copy(enabled = !state.onionSkin.enabled)
                    canvasView?.requestRender()
                },
                BetaAction("PICK", selected = state.eyedropperActive, glyph = "◌") {
                    state.eyedropperActive = !state.eyedropperActive
                    if (state.eyedropperActive) {
                        state.fillActive = false
                        canvasView?.fillActive = false
                    }
                    canvasView?.eyedropperActive = state.eyedropperActive
                },
                BetaAction("FILL", selected = state.fillActive, glyph = "◍") {
                    state.fillActive = !state.fillActive
                    if (state.fillActive) {
                        state.eyedropperActive = false
                        canvasView?.eyedropperActive = false
                    }
                    canvasView?.fillActive = state.fillActive
                },
            ),
            fan = Fan.RIGHT_UP,
            modifier = Modifier.align(Alignment.TopStart).offset(x = rightX, y = nodeY2),
        )
        ClosedBetaNode(
            node = BetaNode.GALLERY,
            palette = palette,
            open = openNode == BetaNode.GALLERY,
            onToggle = { openNode = openNode.toggle(BetaNode.GALLERY) },
            onActionComplete = { openNode = null },
            actions = listOf(
                BetaAction("NEW", glyph = "+") {
                    if (onNewProject != null) {
                        onNewProject()
                    } else {
                        canvasView?.runOnEngine { it.resetForLoad() }
                        state.replaceProject(InkFrameDefaults.newProject())
                        canvasView?.requestRender()
                    }
                },
                BetaAction("OPEN", glyph = "↗") { openLauncher.launch(MediaTypes.PROJECT_OPEN_MIME_TYPES) },
                BetaAction("SAVE", glyph = "↓") {
                    saveLauncher.launch(MediaTypes.suggestedFileName(state.project.name, MediaTypes.DocumentKind.PROJECT))
                },
                BetaAction("GIF", glyph = "▧") { launchExport(ExportManager.ExportFormat.GIF) },
                BetaAction("VIDEO", glyph = "▶") { launchExport(ExportManager.ExportFormat.MP4) },
                BetaAction("PNG", glyph = "▧") { launchExport(ExportManager.ExportFormat.PNG_SEQUENCE) },
            ),
            fan = Fan.RIGHT_UP,
            modifier = Modifier.align(Alignment.TopStart).offset(x = rightX - 12.dp, y = nodeY3),
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
    "ROSE" to 0xFFBB0037.toInt(),
    "TEAL" to 0xFF008A78.toInt(),
    "BLUE" to 0xFF2D75FF.toInt(),
    "ORANGE" to 0xFFE85D1A.toInt(),
    "VIOLET" to 0xFF7B2CBF.toInt(),
    "SLATE" to 0xFF2F2F34.toInt(),
    "GOLD" to 0xFFC39A18.toInt(),
    "BLACK" to 0xFF000000.toInt(),
    "WHITE" to 0xFFFFFFFF.toInt(),
)

private enum class BetaNode(val label: String) {
    TOOLS("TOOLS"),
    LINE("LINE"),
    COLOR("COLOR"),
    LAYERS("LAYERS"),
    ACTIONS("ACTIONS"),
    FRAMES("FRAMES"),
    STUDIO("STUDIO"),
    GALLERY("GALLERY"),
}

private enum class Fan { RIGHT, LEFT, LEFT_UP, LEFT_DOWN, RIGHT_UP, RIGHT_DOWN }

private data class BetaAction(
    val label: String,
    val glyph: String = label.take(1),
    val selected: Boolean = false,
    val color: Color? = null,
    val onClick: () -> Unit,
)

private fun BetaNode?.toggle(node: BetaNode): BetaNode? = if (this == node) null else node

@Composable
private fun ClosedBetaTitle(
    palette: BetaPalette,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(top = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        androidx.compose.material3.Text(
            text = "INKFRAME",
            style = TextStyle(
                brush = UiBrush.verticalGradient(listOf(Color.White, palette.rose, palette.accent)),
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 20.sp,
                letterSpacing = 4.4.sp,
                shadow = Shadow(Color(0xF02A001A), Offset(0f, 2.5f), blurRadius = 14f),
            ),
        )
        androidx.compose.material3.Text(
            text = "THE GLASS HORIZON",
            color = palette.dim,
            fontSize = 10.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 2.8.sp,
            style = TextStyle(shadow = Shadow(Color(0xF02A001A), Offset(0f, 1.5f), blurRadius = 9f)),
        )
    }
}

@Composable
private fun ClosedBetaStage(
    state: StudioState,
    palette: BetaPalette,
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
    Box(modifier.size(frameWidth, frameHeight), contentAlignment = Alignment.Center) {
        ClosedBetaFrameBoard(
            state = state,
            palette = palette,
            width = frameWidth,
            height = frameHeight,
            onFrame = onFrame,
            onAddFrame = onAddFrame,
            modifier = Modifier.align(Alignment.Center),
        )
        val frameShape = RoundedCornerShape(30.dp)
        Box(
            modifier = Modifier
                .size(frameWidth, frameHeight)
                .shadow(30.dp, frameShape, clip = false)
                .clip(frameShape)
                .background(UiBrush.linearGradient(listOf(palette.glassStrong, palette.glassFill, Color(0x5514000E))))
                .border(1.dp, palette.stroke, frameShape)
                .padding(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(canvasWidth, canvasHeight)
                    .align(Alignment.Center)
                    .clip(RoundedCornerShape(16.dp))
                    .background(palette.blush)
                    .border(1.dp, Color(0x6614000E), RoundedCornerShape(16.dp)),
            ) {
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
                if (current && state.currentHold > 1) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .offset(y = (-1).dp)
                            .size(4.dp)
                            .clip(CircleShape)
                            .background(palette.rose),
                    )
                }
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
    val railShape = RoundedCornerShape(22.dp)
    Row(
        modifier = modifier
            .height(52.dp)
            .shadow(18.dp, railShape, clip = false)
            .clip(railShape)
            .background(UiBrush.linearGradient(listOf(palette.glassStrong, Color(0xB314000E))))
            .border(1.dp, palette.stroke, railShape)
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        ClosedBetaRailButton("‹", "Previous frame", palette) {
            onFrame((state.currentFrame - 1).coerceAtLeast(0))
        }
        ClosedBetaRailButton(
            label = if (state.isPlaying) "Ⅱ" else "▶",
            actionLabel = if (state.isPlaying) "Pause playback" else "Play animation",
            palette = palette,
            selected = state.isPlaying,
        ) { state.togglePlay() }

        BoxWithConstraints(
            modifier = Modifier
                .weight(1f)
                .height(22.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0x6614000E))
                .border(1.dp, palette.stroke.copy(alpha = 0.52f), RoundedCornerShape(999.dp)),
        ) {
            val slotCount = maxOf(state.scene.frameCount + 1, 12).coerceAtMost(120)
            val slotWidth = maxWidth / slotCount.toFloat()
            val loopStart = state.scene.playbackRange.first.coerceIn(0, state.scene.frameCount - 1)
            val loopEnd = state.scene.playbackRange.last.coerceIn(loopStart, state.scene.frameCount - 1)

            if (state.scene.loop) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .offset(x = slotWidth * loopStart)
                        .width(slotWidth * (loopEnd - loopStart + 1))
                        .height(4.dp)
                        .background(palette.rose.copy(alpha = 0.72f)),
                )
            }

            Row(Modifier.fillMaxSize()) {
                repeat(slotCount) { frame ->
                    val existing = frame < state.scene.frameCount
                    val next = frame == state.scene.frameCount
                    val current = existing && frame == state.currentFrame
                    val filled = existing && state.activeLayer.cels.containsKey(frame)
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxSize()
                            .background(
                                when {
                                    current -> palette.accent.copy(alpha = 0.78f)
                                    filled -> palette.rose.copy(alpha = 0.30f)
                                    next -> palette.rose.copy(alpha = 0.13f)
                                    else -> Color.Transparent
                                },
                            )
                            .border(0.5.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(1.dp))
                            .clickable(
                                enabled = existing || next,
                                onClickLabel = if (next) "Add frame" else "Select frame ${frame + 1}",
                                role = Role.Button,
                            ) {
                                if (existing) onFrame(frame) else onAddFrame()
                            },
                    )
                }
            }

            Box(
                modifier = Modifier
                    .offset(x = slotWidth * state.currentFrame + slotWidth / 2 - 1.dp)
                    .width(2.dp)
                    .fillMaxHeight()
                    .background(Color.White.copy(alpha = 0.92f)),
            )
        }

        ClosedBetaRailButton("›", "Next frame", palette) {
            onFrame((state.currentFrame + 1).coerceAtMost(state.scene.frameCount - 1))
        }
        Column(
            modifier = Modifier.width(50.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            androidx.compose.material3.Text(
                text = "${state.currentFrame + 1} / ${state.scene.frameCount}",
                color = Color.White,
                fontSize = 9.sp,
                fontWeight = FontWeight.Black,
                maxLines = 1,
            )
            androidx.compose.material3.Text(
                text = "${state.project.canvas.fps} FPS",
                color = palette.dim,
                fontSize = 7.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.7.sp,
                maxLines = 1,
            )
        }
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0x5514000E))
                .border(1.dp, palette.stroke.copy(alpha = 0.70f), RoundedCornerShape(999.dp))
                .padding(horizontal = 3.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            ClosedBetaRailButton(
                label = "−",
                actionLabel = "Decrease frame hold",
                palette = palette,
                enabled = state.currentHold > 1,
            ) { state.adjustCurrentHold(-1) }
            androidx.compose.material3.Text(
                text = "H${state.currentHold}",
                modifier = Modifier.width(26.dp),
                color = Color.White,
                fontSize = 9.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
            ClosedBetaRailButton(
                label = "+",
                actionLabel = "Increase frame hold",
                palette = palette,
                enabled = state.currentHold < 8,
            ) { state.adjustCurrentHold(1) }
        }
        ClosedBetaRailButton(
            label = "↻",
            actionLabel = if (state.scene.loop) "Disable loop" else "Enable loop",
            palette = palette,
            selected = state.scene.loop,
        ) { state.toggleLoop() }
    }
}

@Composable
private fun ClosedBetaRailButton(
    label: String,
    actionLabel: String,
    palette: BetaPalette,
    selected: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val shape = CircleShape
    Box(
        modifier = Modifier
            .size(32.dp)
            .shadow(if (selected) 8.dp else 3.dp, shape, clip = false)
            .clip(shape)
            .background(
                when {
                    !enabled -> Color(0x2214000E)
                    selected -> UiBrush.linearGradient(listOf(palette.accent, palette.accentDeep))
                    else -> UiBrush.linearGradient(listOf(palette.glassStrong, Color(0x7714000E)))
                },
            )
            .border(1.dp, if (selected) palette.rim else palette.stroke.copy(alpha = 0.8f), shape)
            .clickable(
                enabled = enabled,
                onClickLabel = actionLabel,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(
            text = label,
            color = if (enabled) Color.White else Color.White.copy(alpha = 0.38f),
            fontSize = 17.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ClosedBetaNode(
    node: BetaNode,
    palette: BetaPalette,
    open: Boolean,
    onToggle: () -> Unit,
    onActionComplete: () -> Unit,
    actions: List<BetaAction>,
    fan: Fan,
    modifier: Modifier = Modifier,
) {
    val menuProgress by animateFloatAsState(
        targetValue = if (open) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 420f),
        label = "${node.label.lowercase()} radial menu",
    )
    Box(
        modifier = modifier.size(92.dp, 84.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (menuProgress > 0.01f) {
            actions.forEachIndexed { index, action ->
                val offset = betaFanOffset(index, actions.size, fan)
                ClosedBetaKid(
                    action = action.copy(
                        onClick = {
                            action.onClick()
                            onActionComplete()
                        },
                    ),
                    palette = palette,
                    modifier = Modifier
                        .offset(x = offset.first * menuProgress, y = offset.second * menuProgress)
                        .scale(menuProgress)
                        .alpha(menuProgress),
                )
            }
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            val shape = CircleShape
            Box(
                modifier = Modifier
                    .size(58.dp)
                    .shadow(if (open) 24.dp else 14.dp, shape, clip = false)
                    .clip(shape)
                    .background(UiBrush.linearGradient(listOf(palette.glassStrong, palette.glassFill, Color(0x4614000E))))
                    .border(1.dp, if (open) palette.rim else palette.stroke, shape)
                    .clickable(
                        onClickLabel = if (open) "Close ${node.label.lowercase()} controls" else "Open ${node.label.lowercase()} controls",
                        role = Role.Button,
                        onClick = onToggle,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    drawCircle(
                        brush = UiBrush.radialGradient(
                            colors = listOf(Color(0x6614000E), Color.Transparent),
                            center = Offset(size.width * 0.5f, size.height * 0.42f),
                        ),
                    )
                }
                ClosedBetaGlyph(node, Modifier.size(27.dp))
            }
            androidx.compose.material3.Text(
                text = node.label,
                modifier = Modifier.padding(top = 3.dp),
                color = Color.White,
                fontSize = 8.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.0.sp,
                textAlign = TextAlign.Center,
                maxLines = 1,
                style = TextStyle(shadow = Shadow(Color(0xE62A001A), Offset(0f, 1f), blurRadius = 6f)),
            )
        }
    }
}

@Composable
private fun ClosedBetaKid(
    action: BetaAction,
    palette: BetaPalette,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.width(50.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val shape = CircleShape
        val itemSize = if (action.color != null) 40.dp else 48.dp
        Box(
            modifier = Modifier
                .size(itemSize)
                .shadow(if (action.selected) 15.dp else 8.dp, shape, clip = false)
                .clip(shape)
                .background(
                    action.color?.let { color ->
                        UiBrush.radialGradient(listOf(color, color.copy(alpha = 0.74f)))
                    } ?: if (action.selected) {
                        UiBrush.linearGradient(listOf(palette.accent, palette.accentDeep))
                    } else {
                        UiBrush.radialGradient(listOf(palette.glassStrong, palette.glassFill, Color(0x5514000E)))
                    },
                )
                .border(
                    width = if (action.selected) 2.dp else 1.dp,
                    color = if (action.selected) Color.White else palette.stroke,
                    shape = shape,
                )
                .clickable(
                    onClickLabel = action.label,
                    role = Role.Button,
                    onClick = action.onClick,
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (action.color == null) {
                androidx.compose.material3.Text(
                    text = action.glyph,
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                )
            }
        }
        androidx.compose.material3.Text(
            text = action.label.uppercase().take(8),
            modifier = Modifier.fillMaxWidth(),
            color = Color.White,
            fontSize = 7.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.3.sp,
            textAlign = TextAlign.Center,
            maxLines = 1,
            style = TextStyle(shadow = Shadow(Color(0xE62A001A), Offset(0f, 1f), blurRadius = 4f)),
        )
    }
}

@Composable
private fun ClosedBetaGlyph(node: BetaNode, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val white = Color.White
        val stroke = Stroke(width = 1.8.dp.toPx(), cap = StrokeCap.Round)
        val w = size.width
        val h = size.height

        fun line(x1: Float, y1: Float, x2: Float, y2: Float, width: Float = stroke.width) {
            drawLine(
                color = white,
                start = Offset(w * x1, h * y1),
                end = Offset(w * x2, h * y2),
                strokeWidth = width,
                cap = StrokeCap.Round,
            )
        }

        when (node) {
            BetaNode.TOOLS -> {
                line(.27f, .75f, .68f, .34f)
                drawCircle(white, radius = w * .11f, center = Offset(w * .72f, h * .28f), style = stroke)
                drawCircle(white, radius = w * .08f, center = Offset(w * .24f, h * .78f))
            }
            BetaNode.LINE -> {
                line(.19f, .30f, .81f, .30f, stroke.width * .75f)
                line(.26f, .50f, .74f, .50f, stroke.width * 1.25f)
                line(.35f, .70f, .65f, .70f, stroke.width * 1.8f)
            }
            BetaNode.COLOR -> {
                val droplet = Path().apply {
                    moveTo(w * .50f, h * .14f)
                    cubicTo(w * .35f, h * .36f, w * .22f, h * .48f, w * .22f, h * .63f)
                    cubicTo(w * .22f, h * .83f, w * .38f, h * .91f, w * .50f, h * .91f)
                    cubicTo(w * .67f, h * .91f, w * .80f, h * .78f, w * .80f, h * .62f)
                    cubicTo(w * .80f, h * .47f, w * .64f, h * .32f, w * .50f, h * .14f)
                    close()
                }
                drawPath(droplet, white, style = stroke)
                drawCircle(white, radius = w * .06f, center = Offset(w * .44f, h * .59f))
            }
            BetaNode.LAYERS -> {
                val diamond = Path().apply {
                    moveTo(w * .50f, h * .16f)
                    lineTo(w * .83f, h * .37f)
                    lineTo(w * .50f, h * .57f)
                    lineTo(w * .17f, h * .37f)
                    close()
                }
                drawPath(diamond, white, style = stroke)
                line(.20f, .56f, .50f, .76f)
                line(.50f, .76f, .80f, .56f)
                line(.25f, .68f, .50f, .84f)
                line(.50f, .84f, .75f, .68f)
            }
            BetaNode.ACTIONS -> {
                val undo = Path().apply {
                    moveTo(w * .24f, h * .40f)
                    lineTo(w * .43f, h * .21f)
                    lineTo(w * .43f, h * .35f)
                    cubicTo(w * .68f, h * .30f, w * .82f, h * .48f, w * .77f, h * .70f)
                }
                drawPath(undo, white, style = stroke)
                line(.23f, .40f, .42f, .40f)
            }
            BetaNode.FRAMES -> {
                drawRoundRect(
                    color = white,
                    topLeft = Offset(w * .19f, h * .25f),
                    size = Size(w * .62f, h * .55f),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(w * .04f),
                    style = stroke,
                )
                line(.39f, .27f, .39f, .78f, stroke.width * .65f)
                line(.61f, .27f, .61f, .78f, stroke.width * .65f)
            }
            BetaNode.STUDIO -> {
                drawCircle(white, radius = w * .25f, center = Offset(w * .50f, h * .50f), style = stroke)
                drawCircle(white, radius = w * .08f, center = Offset(w * .50f, h * .50f), style = stroke)
                line(.50f, .05f, .50f, .19f)
                line(.50f, .81f, .50f, .95f)
                line(.05f, .50f, .19f, .50f)
                line(.81f, .50f, .95f, .50f)
            }
            BetaNode.GALLERY -> {
                repeat(3) { row ->
                    repeat(3) { col ->
                        drawRoundRect(
                            color = white,
                            topLeft = Offset(w * (.17f + col * .23f), h * (.17f + row * .23f)),
                            size = Size(w * .13f, h * .13f),
                            cornerRadius = androidx.compose.ui.geometry.CornerRadius(w * .02f),
                            style = stroke,
                        )
                    }
                }
            }
        }
    }
}

private fun betaFanOffset(index: Int, count: Int, fan: Fan): Pair<Dp, Dp> {
    if (count <= 0) return 0.dp to 0.dp
    val centerDegrees = when (fan) {
        Fan.RIGHT -> 0f
        Fan.LEFT -> 180f
        Fan.LEFT_UP -> 235f
        Fan.LEFT_DOWN -> 125f
        Fan.RIGHT_UP -> 305f
        Fan.RIGHT_DOWN -> 55f
    }
    val baseSpan = when {
        count <= 1 -> 0f
        count <= 3 -> 80f
        count <= 4 -> 100f
        count <= 6 -> 120f
        else -> 160f
    }
    // Diagonal fans stay on the safe side of the canvas instead of sending child buttons
    // across the paper surface where drawing input has priority.
    val diagonalFan = fan == Fan.LEFT_UP || fan == Fan.LEFT_DOWN || fan == Fan.RIGHT_UP || fan == Fan.RIGHT_DOWN
    val span = if (diagonalFan) minOf(baseSpan, 90f) else baseSpan

    val radius: Float
    val angleIndex: Int
    val angleCount: Int
    when {
        count == 9 -> {
            // A tight 3 x 3 color palette uses smaller swatches around a broad outer arc.
            radius = 130f
            angleIndex = index
            angleCount = count
        }
        count > 6 -> {
            // Larger menus use two short arcs so the 48 dp glass children remain distinct.
            val innerCount = minOf(count, 4)
            val inInnerArc = index < innerCount
            radius = if (inInnerArc) 104f else 156f
            angleIndex = if (inInnerArc) index else index - innerCount
            angleCount = if (inInnerArc) innerCount else count - innerCount
        }
        else -> {
            radius = when {
                count <= 3 -> 88f
                count <= 4 -> 98f
                else -> if (diagonalFan) 138f else 122f
            }
            angleIndex = index
            angleCount = count
        }
    }
    val fraction = if (angleCount <= 1) 0.5f else angleIndex.toFloat() / (angleCount - 1).toFloat()
    val degrees = centerDegrees - span / 2f + span * fraction
    val radians = degrees / 180f * PI.toFloat()
    return (cos(radians) * radius).dp to (sin(radians) * radius).dp
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
