package com.inkframe.feature.canvas

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush as UiBrush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
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
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

private val HorizonAccent = Color(0xFFBB0037)
private val HorizonAccentDeep = Color(0xFF880057)
private val HorizonRose = Color(0xFFF7CAC9)
private val HorizonBlush = Color(0xFFFFF0F3)
private val HorizonViolet = Color(0xFF2A001A)
private val HorizonInk = Color(0xFF0A000A)
private val HorizonDim = Color(0xFFE8B9C6)
private val GlassFill = Color(0x1FF7CAC9)
private val GlassStrong = Color(0x33F7CAC9)
private val GlassStroke = Color(0x66F7CAC9)
private val GlassRim = Color(0x99FFF0F3)

private enum class PrimaryNode(val label: String) {
    TOOLS("Tools"),
    LINE("Line"),
    COLOR("Color"),
    LAYERS("Layers"),
    ACTIONS("Actions"),
    FRAMES("Frames"),
    STUDIO("Studio"),
    GALLERY("Gallery"),
}

private enum class FanDirection { RIGHT, LEFT, UP }
private enum class OverlayKind { STUDIO, GALLERY }

private enum class RadialGlyph {
    BRUSH, SMALLER, SIZE, LARGER, SMOOTH,
    ADD, NEXT, VISIBLE, DELETE,
    UNDO, REDO, FIT, RESET,
    PREVIOUS, PLAY, PAUSE, FORWARD, INSERT, REMOVE, LOOP,
    ABOUT, CHECKER, ONION,
    PROJECTS, NEW, OPEN, SAVE, EXPORT,
}

private data class RadialAction(
    val label: String,
    val selected: Boolean = false,
    val color: Color? = null,
    val onClick: () -> Unit,
)

/**
 * Native Kotlin/Compose/OpenGL translation of InkFrame's original Glass Horizon workspace.
 * The original web implementation remains a design and behaviour specification only; no web
 * runtime participates in this screen.
 */
@Composable
fun GlassHorizonScreen(state: StudioState = viewModel()) {
    var canvasView by remember { mutableStateOf<CanvasView?>(null) }
    var openNode by rememberSaveable { mutableStateOf<PrimaryNode?>(null) }
    var overlay by rememberSaveable { mutableStateOf<OverlayKind?>(null) }
    var pendingExportFormat by remember { mutableStateOf<ExportManager.ExportFormat?>(null) }
    val context = LocalContext.current
    val resolver = context.contentResolver
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
        while (state.isPlaying) {
            delay(state.frameDurationMs)
            state.advancePlayback()
            canvasView?.requestRender()
        }
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(HorizonViolet),
    ) {
        HorizonAtmosphere(Modifier.fillMaxSize())
        HorizonTitle(Modifier.align(Alignment.TopCenter))

        // Preserve the command field around the fitted 4:3 drawing stage.
        val documentAspect = state.project.canvas.aspectRatio
        val canvasWidthLimit = maxWidth * 0.58f
        val canvasHeightLimit = maxHeight * 0.61f
        val canvasWidth = minOf(canvasWidthLimit, canvasHeightLimit * documentAspect)
        val canvasHeight = canvasWidth / documentAspect
        val frameWidth = canvasWidth + 28.dp
        val frameHeight = canvasHeight + 28.dp
        val stageCenterY = maxHeight / 2 - 8.dp
        val frameLeft = (maxWidth - frameWidth) / 2
        val frameTop = stageCenterY - frameHeight / 2
        val frameRight = frameLeft + frameWidth
        val frameBottom = frameTop + frameHeight
        val leftNodeX = (frameLeft - 88.dp).coerceAtLeast(18.dp)
        val rightNodeX = (frameRight + 30.dp).coerceAtMost(maxWidth - 76.dp)
        val topNodeY = (frameTop + 44.dp).coerceAtLeast(76.dp)
        val middleNodeY = topNodeY + 112.dp
        val lowerNodeY = (topNodeY + 224.dp).coerceAtMost(frameBottom - 72.dp)
        val bottomNodeY = (frameBottom + 28.dp).coerceAtMost(maxHeight - 82.dp)

        GlassStage(
            state = state,
            canvasWidth = canvasWidth,
            canvasHeight = canvasHeight,
            frameWidth = frameWidth,
            frameHeight = frameHeight,
            onCanvasReady = { view ->
                canvasView = view
                recoveryController.attach(view)
            },
            onArtworkChanged = state::markArtworkModified,
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = (-8).dp),
        )

        TimelineRail(
            state = state,
            onPrevious = {
                state.setFrame((state.currentFrame - 1).coerceAtLeast(0))
                canvasView?.requestRender()
            },
            onNext = {
                state.setFrame((state.currentFrame + 1).coerceAtMost(state.scene.frameCount - 1))
                canvasView?.requestRender()
            },
            modifier = Modifier
                .align(Alignment.BottomCenter)
      .offset(y = (-14).dp)
      .width(minOf(maxWidth * 0.52f, 620.dp)),
        )

        val activeLayers = state.scene.layers
        val nextLayer = {
            val current = activeLayers.indexOfFirst { it.id == state.activeLayerId }.coerceAtLeast(0)
            val next = activeLayers[(current + 1) % activeLayers.size]
            state.activeLayerId = next.id
            canvasView?.requestRender()
        }

        PrimaryGlassNode(
            node = PrimaryNode.TOOLS,
            direction = FanDirection.RIGHT,
            isOpen = openNode == PrimaryNode.TOOLS,
            actions = DefaultBrushes.all.map { brush ->
                RadialAction(brush.name, selected = state.brush.id == brush.id) {
                    state.brush = brush
                    openNode = null
                }
            },
            onToggle = { openNode = openNode.toggle(PrimaryNode.TOOLS) },
            modifier = Modifier.align(Alignment.TopStart).offset(x = leftNodeX, y = topNodeY),
        )

        PrimaryGlassNode(
            node = PrimaryNode.LINE,
            direction = FanDirection.RIGHT,
            isOpen = openNode == PrimaryNode.LINE,
            actions = listOf(
                RadialAction("Smaller") {
                    state.updateBrush { it.copy(sizePx = (it.sizePx - 2f).coerceAtLeast(1f)) }
                },
                RadialAction("${state.brush.sizePx.roundToInt()} px", selected = true) {},
                RadialAction("Larger") {
                    state.updateBrush { it.copy(sizePx = (it.sizePx + 2f).coerceAtMost(240f)) }
                },
                RadialAction("Smooth") {
                    state.updateBrush { it.copy(smoothing = (it.smoothing + 0.1f).coerceAtMost(1f)) }
                },
            ),
            onToggle = { openNode = openNode.toggle(PrimaryNode.LINE) },
            modifier = Modifier.align(Alignment.TopStart).offset(x = leftNodeX, y = middleNodeY),
        )

        val swatches = listOf(
            0xFF000000.toInt(), 0xFFFFFFFF.toInt(), 0xFFED1C2E.toInt(),
            0xFF2D8CE6.toInt(), 0xFF2DB36A.toInt(), 0xFFFFBE34.toInt(),
            0xFF8746B6.toInt(), 0xFFFF7A36.toInt(), HorizonAccent.value.toInt(),
        )
        PrimaryGlassNode(
            node = PrimaryNode.COLOR,
            direction = FanDirection.LEFT,
            isOpen = openNode == PrimaryNode.COLOR,
            actions = swatches.map { argb ->
                RadialAction(
                    label = "Color",
                    selected = state.color.toArgb() == argb,
                    color = Color(argb),
                ) {
                    state.commitColor(RgbaColor.fromArgb(argb))
                    canvasView?.requestRender()
                }
            },
            onToggle = { openNode = openNode.toggle(PrimaryNode.COLOR) },
            modifier = Modifier.align(Alignment.TopStart).offset(x = rightNodeX, y = topNodeY),
        )

        PrimaryGlassNode(
            node = PrimaryNode.LAYERS,
            direction = FanDirection.LEFT,
            isOpen = openNode == PrimaryNode.LAYERS,
            actions = listOf(
                RadialAction("Add") { state.addLayer(); canvasView?.requestRender() },
                RadialAction("Next") { nextLayer() },
                RadialAction("Visible", selected = state.activeLayer.visible) {
                    state.toggleLayerVisible(state.activeLayerId)
                    canvasView?.requestRender()
                },
                RadialAction("Delete") {
                    state.deleteLayer(state.activeLayerId)
                    canvasView?.requestRender()
                },
            ),
            onToggle = { openNode = openNode.toggle(PrimaryNode.LAYERS) },
            modifier = Modifier.align(Alignment.TopStart).offset(x = rightNodeX, y = middleNodeY),
        )

        PrimaryGlassNode(
            node = PrimaryNode.ACTIONS,
            direction = FanDirection.LEFT,
            isOpen = openNode == PrimaryNode.ACTIONS,
            actions = listOf(
                RadialAction("Undo", selected = state.canUndo) { canvasView?.undo() },
                RadialAction("Redo", selected = state.canRedo) { canvasView?.redo() },
                RadialAction("Fit") { canvasView?.fitToScreen() },
                RadialAction("100%") { canvasView?.resetZoom() },
            ),
            onToggle = { openNode = openNode.toggle(PrimaryNode.ACTIONS) },
            modifier = Modifier.align(Alignment.TopStart).offset(x = rightNodeX, y = lowerNodeY),
        )

        PrimaryGlassNode(
            node = PrimaryNode.FRAMES,
            direction = FanDirection.UP,
            isOpen = openNode == PrimaryNode.FRAMES,
            actions = listOf(
                RadialAction("‹") {
                    state.setFrame((state.currentFrame - 1).coerceAtLeast(0)); canvasView?.requestRender()
                },
                RadialAction(if (state.isPlaying) "Ⅱ" else "▶", selected = state.isPlaying) {
                    state.togglePlay()
                },
                RadialAction("›") {
                    state.setFrame((state.currentFrame + 1).coerceAtMost(state.scene.frameCount - 1)); canvasView?.requestRender()
                },
                RadialAction("+") { state.insertFrame(); canvasView?.requestRender() },
                RadialAction("−") { state.removeFrame(); canvasView?.requestRender() },
                RadialAction(if (state.scene.loop) "Loop On" else "Loop Off", selected = state.scene.loop) {
                    state.toggleLoop()
                },
            ),
            onToggle = { openNode = openNode.toggle(PrimaryNode.FRAMES) },
            modifier = Modifier.align(Alignment.TopStart).offset(x = (maxWidth - 58.dp) / 2, y = bottomNodeY),
        )

        PrimaryGlassNode(
            node = PrimaryNode.STUDIO,
            direction = FanDirection.RIGHT,
            isOpen = openNode == PrimaryNode.STUDIO,
            actions = listOf(
                RadialAction("About") { overlay = OverlayKind.STUDIO; openNode = null },
                RadialAction("Checker", selected = state.showChecker) {
                    state.showChecker = !state.showChecker
                    canvasView?.setShowChecker(state.showChecker)
                },
                RadialAction("Onion", selected = state.onionSkin.enabled) {
                    state.onionSkin = state.onionSkin.copy(enabled = !state.onionSkin.enabled)
                    canvasView?.requestRender()
                },
            ),
            onToggle = { openNode = openNode.toggle(PrimaryNode.STUDIO) },
            modifier = Modifier.align(Alignment.TopStart).offset(x = leftNodeX, y = lowerNodeY),
        )

        PrimaryGlassNode(
            node = PrimaryNode.GALLERY,
            direction = FanDirection.RIGHT,
            isOpen = openNode == PrimaryNode.GALLERY,
            actions = listOf(
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
            onToggle = { openNode = openNode.toggle(PrimaryNode.GALLERY) },
            modifier = Modifier.align(Alignment.TopStart).offset(x = frameLeft + 34.dp, y = bottomNodeY),
        )

        state.statusMessage?.let { message ->
            GlassHint(
                text = message,
                modifier = Modifier.align(Alignment.BottomCenter).offset(y = (-92).dp),
            )
        }

        when (overlay) {
            OverlayKind.STUDIO -> FrostedOverlay(
                title = "InkFrame",
                subtitle = "The Glass Horizon · A Calm Studio",
                body = listOf(
                    "Native Kotlin, Jetpack Compose and OpenGL ES.",
                    "Offline, account-free, ad-free and telemetry-free.",
                    "The original Glass Horizon remains the binding feature and design contract.",
                ),
                onClose = { overlay = null },
            )
            OverlayKind.GALLERY -> FrostedOverlay(
                title = "Projects",
                subtitle = "Gallery · Autosave · Recovery",
                body = listOf(
                    "Current project: ${state.project.name}",
                    "Canvas: ${state.project.canvas.widthPx} × ${state.project.canvas.heightPx}",
                    "Frames: ${state.scene.frameCount} · Layers: ${state.scene.layers.size}",
                    "Crash-safe local autosave and startup recovery are active for the native project.",
                ),
                onClose = { overlay = null },
            )
            null -> Unit
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

@Composable
private fun HorizonAtmosphere(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        drawRect(
            brush = UiBrush.radialGradient(
                colors = listOf(
                    Color(0xFFFFD9E2),
                    HorizonRose,
                    Color(0xFFD77FA0),
                    Color(0xFFA52766),
                    Color(0xFF4D0A33),
                    HorizonViolet,
                ),
                center = Offset(size.width * 0.5f, -size.height * 0.12f),
                radius = size.maxDimension * 0.95f,
            ),
        )

        val origin = Offset(size.width * 0.5f, -20f)
        val rayAngles = listOf(-64f, -42f, -18f, 8f, 30f, 52f)
        rayAngles.forEachIndexed { index, degrees ->
            val radians = degrees / 180f * PI.toFloat()
            val reach = size.maxDimension * 1.35f
            val center = Offset(origin.x + cos(radians) * reach, origin.y + sin(radians) * reach)
            val spread = size.width * if (index % 2 == 0) 0.08f else 0.05f
            val path = Path().apply {
                moveTo(origin.x, origin.y)
                lineTo(center.x - spread, center.y)
                lineTo(center.x + spread, center.y)
                close()
            }
            drawPath(
                path = path,
                color = Color.White,
                alpha = if (index % 2 == 0) 0.09f else 0.055f,
                blendMode = BlendMode.Screen,
            )
        }

        repeat(260) { i ->
            val x = ((i * 73) % 997) / 997f * size.width
            val y = ((i * 193) % 991) / 991f * size.height
            drawCircle(
                color = Color.White.copy(alpha = if (i % 3 == 0) 0.028f else 0.016f),
                radius = if (i % 5 == 0) 0.9f else 0.55f,
                center = Offset(x, y),
                blendMode = BlendMode.Overlay,
            )
        }

        drawRect(
            brush = UiBrush.radialGradient(
                0.52f to Color.Transparent,
                1f to Color(0x9914000E),
                center = Offset(size.width * 0.5f, size.height * 0.42f),
                radius = size.maxDimension * 0.78f,
            ),
        )
    }
}

@Composable
private fun HorizonTitle(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(top = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        androidx.compose.material3.Text(
            text = "INKFRAME",
            style = TextStyle(
                brush = UiBrush.verticalGradient(listOf(Color.White, HorizonRose, HorizonAccent)),
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 20.sp,
                letterSpacing = 4.4.sp,
                shadow = Shadow(Color(0xF02A001A), Offset(0f, 2.5f), blurRadius = 14f),
            ),
        )
        androidx.compose.material3.Text(
            text = "THE GLASS HORIZON",
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 2.8.sp,
            style = TextStyle(shadow = Shadow(Color(0xF02A001A), Offset(0f, 1.5f), blurRadius = 9f)),
        )
    }
}

@Composable
private fun GlassStage(
    state: StudioState,
    canvasWidth: Dp,
    canvasHeight: Dp,
    frameWidth: Dp,
    frameHeight: Dp,
    onCanvasReady: (CanvasView) -> Unit,
    onArtworkChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.size(frameWidth + 52.dp, frameHeight + 52.dp),
        contentAlignment = Alignment.Center,
    ) {
        PerimeterFrameBoard(
            frameCount = state.scene.frameCount,
            currentFrame = state.currentFrame,
            filledFrames = state.activeLayer.cels.keys,
            width = frameWidth,
            height = frameHeight,
            onFrame = state::setFrame,
            onAddFrame = state::insertFrame,
            modifier = Modifier.align(Alignment.Center),
        )

        val frameShape = RoundedCornerShape(30.dp)
        Box(
            modifier = Modifier
                .size(frameWidth, frameHeight)
                .shadow(28.dp, frameShape, clip = false)
                .clip(frameShape)
                .background(
                    UiBrush.linearGradient(
                        colors = listOf(GlassStrong, GlassFill, Color(0x5514000E)),
                    ),
                )
                .border(1.dp, GlassStroke, frameShape)
                .padding(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(16.dp))
                    .background(HorizonBlush)
                    .border(1.dp, Color(0x6614000E), RoundedCornerShape(16.dp)),
            ) {
                AndroidView(
                    modifier = Modifier.size(canvasWidth, canvasHeight),
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
                                state.statusMessage = "Artwork restored after display reset"
                            }
                            view.eyedropperActive = state.eyedropperActive
                            view.fillActive = state.fillActive
                            view.onColorSampled = { sampled ->
                                state.eyedropperActive = false
                                view.eyedropperActive = false
                                sampled?.let { state.commitColor(it.withAlpha(1f)) }
                            }
                            view.onFilled = {
                                state.fillActive = false
                                view.fillActive = false
                            }
                            view.onStrokeInput = { status -> state.statusMessage = status }
                            view.onArtworkChanged = onArtworkChanged
                        }
                    },
                )
            }

            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(GlassRim.copy(alpha = 0.6f)),
            )
        }
    }
}

@Composable
private fun PerimeterFrameBoard(
    frameCount: Int,
    currentFrame: Int,
    filledFrames: Set<Int>,
    width: Dp,
    height: Dp,
    onFrame: (Int) -> Unit,
    onAddFrame: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val capacity = 48
    val slotCount = maxOf(frameCount + 1, 24).coerceAtMost(capacity)
    Box(modifier.size(width, height)) {
        repeat(slotCount) { index ->
            val point = perimeterPoint(index, slotCount, width, height)
            val existing = index < frameCount
            val next = index == frameCount && frameCount < capacity
            val current = existing && index == currentFrame
            val filled = existing && index in filledFrames
            val shape = RoundedCornerShape(6.dp)
            Box(
                modifier = Modifier
                    .offset(x = point.first - 9.dp, y = point.second - 9.dp)
                    .size(18.dp)
                    .scale(if (current) 1.45f else 1f)
                    .shadow(if (current) 14.dp else 4.dp, shape, clip = false)
                    .clip(shape)
                    .background(
                        when {
                            current -> UiBrush.linearGradient(listOf(Color.White, HorizonRose, HorizonAccent))
                            filled -> UiBrush.linearGradient(listOf(HorizonRose.copy(alpha = 0.70f), HorizonAccentDeep.copy(alpha = 0.48f)))
                            next -> UiBrush.linearGradient(listOf(GlassStrong, HorizonAccent.copy(alpha = 0.32f)))
                            existing -> UiBrush.linearGradient(listOf(Color(0x3DFFF0F3), Color(0x3814000E)))
                            else -> UiBrush.linearGradient(listOf(Color(0x18FFF0F3), Color(0x1114000E)))
                        },
                    )
                    .border(
                        if (current) 1.5.dp else 1.dp,
                        when {
                            current -> Color.White
                            next -> GlassRim
                            filled -> HorizonRose.copy(alpha = 0.88f)
                            else -> GlassStroke.copy(alpha = if (existing) 1f else 0.50f)
                        },
                        shape,
                    )
                    .clickable(enabled = existing || next) {
                        if (existing) onFrame(index) else onAddFrame()
                    },
                contentAlignment = Alignment.Center,
            ) {
                androidx.compose.material3.Text(
                    text = when {
                        existing -> "${index + 1}"
                        next -> "+"
                        else -> ""
                    },
                    color = if (current) HorizonViolet else Color.White,
                    fontSize = if (next) 11.sp else 8.sp,
                    fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center,
                )
                if (filled && !current) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .offset(y = (-2).dp)
                            .size(3.dp)
                            .clip(CircleShape)
                            .background(Color.White),
                    )
                }
            }
        }

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .offset(y = 31.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xB314000E))
                .border(1.dp, GlassStroke.copy(alpha = 0.72f), RoundedCornerShape(999.dp))
                .padding(horizontal = 12.dp, vertical = 6.dp),
        ) {
            androidx.compose.material3.Text(
                text = "${currentFrame + 1} OF $frameCount  ·  $frameCount / $capacity FRAMES",
                color = HorizonBlush,
                fontSize = 9.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.1.sp,
            )
        }
    }
}

private fun perimeterPoint(index: Int, count: Int, width: Dp, height: Dp): Pair<Dp, Dp> {
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
private fun TimelineRail(
    state: StudioState,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(20.dp)
    Row(
        modifier = modifier
            .height(48.dp)
            .shadow(16.dp, shape, clip = false)
            .clip(shape)
            .background(UiBrush.linearGradient(listOf(GlassStrong, Color(0x8F14000E))))
            .border(1.dp, GlassStroke, shape)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        RailStep("‹", onPrevious)
        RailStep(if (state.isPlaying) "Ⅱ" else "▶") { state.togglePlay() }
        BoxWithConstraints(
            modifier = Modifier
                .weight(1f)
                .height(20.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0x6614000E))
                .border(1.dp, GlassStroke.copy(alpha = 0.48f), RoundedCornerShape(999.dp)),
        ) {
            val visibleSlots = maxOf(state.scene.frameCount + 1, 12).coerceAtMost(48)
            val slotWidth = maxWidth / visibleSlots
            val loopStart = state.scene.playbackRange.first.coerceIn(0, state.scene.frameCount - 1)
            val loopEnd = state.scene.playbackRange.last.coerceIn(loopStart, state.scene.frameCount - 1)

            if (state.scene.loop) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .offset(x = slotWidth * loopStart)
                        .width(slotWidth * (loopEnd - loopStart + 1))
                        .height(4.dp)
                        .background(HorizonRose.copy(alpha = 0.78f)),
                )
            }

            Row(Modifier.fillMaxSize()) {
                repeat(visibleSlots) { frame ->
                    val existing = frame < state.scene.frameCount
                    val next = frame == state.scene.frameCount
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .background(
                                when {
                                    existing && frame == state.currentFrame -> HorizonAccent.copy(alpha = 0.72f)
                                    existing && state.activeLayer.cels.containsKey(frame) -> HorizonRose.copy(alpha = 0.36f)
                                    next -> HorizonRose.copy(alpha = 0.12f)
                                    else -> Color.Transparent
                                },
                            )
                            .border(0.5.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(1.dp))
                            .clickable(enabled = existing || next) {
                                if (existing) state.setFrame(frame) else state.insertFrame()
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (next) {
                            androidx.compose.material3.Text(
                                text = "+",
                                color = HorizonBlush.copy(alpha = 0.82f),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Black,
                            )
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .offset(x = slotWidth * state.currentFrame + slotWidth / 2 - 1.5.dp)
                    .width(3.dp)
                    .fillMaxHeight()
                    .background(Color.White),
            )
        }
        RailStep("›", onNext)
        androidx.compose.material3.Text(
            text = "${state.currentFrame + 1} / ${state.scene.frameCount}  ·  ${state.project.canvas.fps} FPS",
            color = Color.White,
            fontSize = 11.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 0.8.sp,
        )
    }
}

@Composable
private fun RailStep(text: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(text, color = Color.White, fontSize = 24.sp)
    }
}

@Composable
private fun BoxScope.PrimaryGlassNode(
    node: PrimaryNode,
    direction: FanDirection,
    isOpen: Boolean,
    actions: List<RadialAction>,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var dragX by rememberSaveable("glass-device-layout-v3", node.name) { mutableStateOf(0f) }
    var dragY by rememberSaveable("glass-device-layout-v3", node.name) { mutableStateOf(0f) }

    Box(
        modifier = modifier.offset { IntOffset(dragX.roundToInt(), dragY.roundToInt()) },
        contentAlignment = Alignment.Center,
    ) {
        if (isOpen) {
            actions.forEachIndexed { index, action ->
                val offset = radialOffset(index, actions.size, direction)
                RadialChild(
                    action = action,
                    modifier = Modifier.offset(x = offset.first, y = offset.second),
                )
            }
        }

        val shape = CircleShape
        Box(
            modifier = Modifier
                .size(58.dp)
                .pointerInput(node) {
                    detectDragGestures { change, dragAmount ->
                        change.consume()
                        dragX += dragAmount.x
                        dragY += dragAmount.y
                    }
                }
                .shadow(if (isOpen) 22.dp else 14.dp, shape, clip = false)
                .clip(shape)
                .background(
                    UiBrush.radialGradient(
                        colors = listOf(GlassStrong, GlassFill, Color(0x7714000E)),
                    ),
                )
                .border(1.dp, if (isOpen) GlassRim else GlassStroke, shape)
                .clickable(onClick = onToggle),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.fillMaxSize()) {
                drawCircle(
                    brush = UiBrush.radialGradient(
                        colors = listOf(Color(0x5514000E), Color.Transparent),
                        center = Offset(size.width * 0.5f, size.height * 0.42f),
                    ),
                )
            }
            NodeGlyph(node, Modifier.size(26.dp))
        }

        androidx.compose.material3.Text(
            text = node.label.uppercase(),
            modifier = Modifier.offset(y = 40.dp),
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 1.35.sp,
            maxLines = 1,
            style = TextStyle(shadow = Shadow(Color(0xE62A001A), Offset(0f, 1.5f), blurRadius = 7f)),
        )
    }
}

@Composable
private fun RadialChild(action: RadialAction, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.width(68.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val shape = CircleShape
        Box(
            modifier = Modifier
                .size(48.dp)
                .shadow(if (action.selected) 15.dp else 9.dp, shape, clip = false)
                .clip(shape)
                .background(
                    action.color?.let {
                        UiBrush.radialGradient(listOf(it.copy(alpha = 0.98f), it.copy(alpha = 0.58f)))
                    } ?: UiBrush.linearGradient(
                        if (action.selected) listOf(HorizonAccent, HorizonAccentDeep)
                        else listOf(GlassStrong, Color(0x9414000E)),
                    ),
                )
                .border(1.dp, if (action.selected) GlassRim else GlassStroke, shape)
                .clickable(onClick = action.onClick),
            contentAlignment = Alignment.Center,
        ) {
            if (action.color == null) {
                RadialActionGlyph(
                    glyph = radialGlyphFor(action.label),
                    modifier = Modifier.size(25.dp),
                )
            }
        }
        androidx.compose.material3.Text(
            text = radialDisplayLabel(action.label),
            color = Color.White,
            fontSize = 8.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 0.45.sp,
            textAlign = TextAlign.Center,
            maxLines = 1,
            style = TextStyle(shadow = Shadow(Color(0xE62A001A), Offset(0f, 1f), blurRadius = 5f)),
        )
    }
}

private fun radialDisplayLabel(label: String): String = when (label) {
    "‹" -> "PREV"
    "›" -> "NEXT"
    "▶" -> "PLAY"
    "Ⅱ" -> "PAUSE"
    "+" -> "INSERT"
    "−" -> "REMOVE"
    else -> label.uppercase().take(9)
}

private fun radialGlyphFor(label: String): RadialGlyph = when {
    label == "Smaller" -> RadialGlyph.SMALLER
    label.endsWith(" px") -> RadialGlyph.SIZE
    label == "Larger" -> RadialGlyph.LARGER
    label == "Smooth" -> RadialGlyph.SMOOTH
    label == "Add" -> RadialGlyph.ADD
    label == "Next" -> RadialGlyph.NEXT
    label == "Visible" -> RadialGlyph.VISIBLE
    label == "Delete" -> RadialGlyph.DELETE
    label == "Undo" -> RadialGlyph.UNDO
    label == "Redo" -> RadialGlyph.REDO
    label == "Fit" -> RadialGlyph.FIT
    label == "100%" -> RadialGlyph.RESET
    label == "‹" -> RadialGlyph.PREVIOUS
    label == "▶" -> RadialGlyph.PLAY
    label == "Ⅱ" -> RadialGlyph.PAUSE
    label == "›" -> RadialGlyph.FORWARD
    label == "+" -> RadialGlyph.INSERT
    label == "−" -> RadialGlyph.REMOVE
    label.startsWith("Loop") -> RadialGlyph.LOOP
    label == "About" -> RadialGlyph.ABOUT
    label == "Checker" -> RadialGlyph.CHECKER
    label == "Onion" -> RadialGlyph.ONION
    label == "Projects" -> RadialGlyph.PROJECTS
    label == "New" -> RadialGlyph.NEW
    label == "Open" -> RadialGlyph.OPEN
    label == "Save" -> RadialGlyph.SAVE
    label == "GIF" || label == "Video" || label == "PNG" -> RadialGlyph.EXPORT
    else -> RadialGlyph.BRUSH
}

@Composable
private fun RadialActionGlyph(glyph: RadialGlyph, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val stroke = 1.8.dp.toPx()
        val thin = 1.35.dp.toPx()
        val white = Color.White
        fun line(x1: Float, y1: Float, x2: Float, y2: Float, width: Float = stroke) {
            drawLine(white, Offset(w * x1, h * y1), Offset(w * x2, h * y2), width, StrokeCap.Round)
        }
        when (glyph) {
            RadialGlyph.BRUSH -> {
                line(.24f, .76f, .68f, .32f)
                drawCircle(white, w * .10f, Offset(w * .72f, h * .28f), style = Stroke(stroke))
                drawCircle(white, w * .09f, Offset(w * .22f, h * .78f))
            }
            RadialGlyph.SMALLER -> {
                line(.20f, .50f, .80f, .50f)
                drawCircle(white, w * .30f, Offset(w * .50f, h * .50f), style = Stroke(thin))
            }
            RadialGlyph.SIZE -> {
                drawCircle(white, w * .28f, Offset(w * .50f, h * .50f), style = Stroke(stroke))
                drawCircle(white, w * .08f, Offset(w * .50f, h * .50f))
            }
            RadialGlyph.LARGER, RadialGlyph.ADD, RadialGlyph.INSERT -> {
                line(.20f, .50f, .80f, .50f)
                line(.50f, .20f, .50f, .80f)
            }
            RadialGlyph.SMOOTH -> {
                val path = Path().apply {
                    moveTo(w * .14f, h * .68f)
                    cubicTo(w * .34f, h * .18f, w * .62f, h * .82f, w * .86f, h * .32f)
                }
                drawPath(path, white, style = Stroke(stroke, cap = StrokeCap.Round))
            }
            RadialGlyph.NEXT, RadialGlyph.FORWARD -> {
                line(.35f, .22f, .68f, .50f)
                line(.68f, .50f, .35f, .78f)
            }
            RadialGlyph.PREVIOUS -> {
                line(.65f, .22f, .32f, .50f)
                line(.32f, .50f, .65f, .78f)
            }
            RadialGlyph.VISIBLE -> {
                val eye = Path().apply {
                    moveTo(w * .10f, h * .50f)
                    quadraticBezierTo(w * .50f, h * .12f, w * .90f, h * .50f)
                    quadraticBezierTo(w * .50f, h * .88f, w * .10f, h * .50f)
                }
                drawPath(eye, white, style = Stroke(thin))
                drawCircle(white, w * .10f, Offset(w * .50f, h * .50f))
            }
            RadialGlyph.DELETE, RadialGlyph.REMOVE -> {
                drawRoundRect(white, Offset(w * .30f, h * .31f), Size(w * .40f, h * .48f), androidx.compose.ui.geometry.CornerRadius(3f), style = Stroke(thin))
                line(.25f, .27f, .75f, .27f)
                line(.40f, .18f, .60f, .18f)
                if (glyph == RadialGlyph.REMOVE) line(.38f, .51f, .62f, .51f)
            }
            RadialGlyph.UNDO, RadialGlyph.REDO -> {
                val reverse = glyph == RadialGlyph.UNDO
                val path = Path().apply {
                    if (reverse) {
                        moveTo(w * .78f, h * .68f)
                        cubicTo(w * .64f, h * .30f, w * .31f, h * .29f, w * .20f, h * .57f)
                    } else {
                        moveTo(w * .22f, h * .68f)
                        cubicTo(w * .36f, h * .30f, w * .69f, h * .29f, w * .80f, h * .57f)
                    }
                }
                drawPath(path, white, style = Stroke(stroke, cap = StrokeCap.Round))
                if (reverse) {
                    line(.20f, .57f, .18f, .35f)
                    line(.20f, .57f, .38f, .49f)
                } else {
                    line(.80f, .57f, .82f, .35f)
                    line(.80f, .57f, .62f, .49f)
                }
            }
            RadialGlyph.FIT -> {
                line(.18f, .36f, .18f, .18f); line(.18f, .18f, .36f, .18f)
                line(.64f, .18f, .82f, .18f); line(.82f, .18f, .82f, .36f)
                line(.18f, .64f, .18f, .82f); line(.18f, .82f, .36f, .82f)
                line(.64f, .82f, .82f, .82f); line(.82f, .82f, .82f, .64f)
            }
            RadialGlyph.RESET -> {
                drawCircle(white, w * .30f, Offset(w * .50f, h * .50f), style = Stroke(thin))
                line(.50f, .28f, .50f, .72f)
                line(.28f, .50f, .72f, .50f)
            }
            RadialGlyph.PLAY -> {
                val path = Path().apply {
                    moveTo(w * .34f, h * .22f); lineTo(w * .76f, h * .50f); lineTo(w * .34f, h * .78f); close()
                }
                drawPath(path, white)
            }
            RadialGlyph.PAUSE -> {
                drawRoundRect(white, Offset(w * .30f, h * .22f), Size(w * .13f, h * .56f), androidx.compose.ui.geometry.CornerRadius(2f))
                drawRoundRect(white, Offset(w * .57f, h * .22f), Size(w * .13f, h * .56f), androidx.compose.ui.geometry.CornerRadius(2f))
            }
            RadialGlyph.LOOP -> {
                val path = Path().apply {
                    moveTo(w * .22f, h * .38f)
                    cubicTo(w * .35f, h * .18f, w * .68f, h * .18f, w * .78f, h * .42f)
                    moveTo(w * .78f, h * .62f)
                    cubicTo(w * .65f, h * .82f, w * .32f, h * .82f, w * .22f, h * .58f)
                }
                drawPath(path, white, style = Stroke(thin, cap = StrokeCap.Round))
                line(.78f, .42f, .66f, .32f, thin); line(.78f, .42f, .82f, .27f, thin)
                line(.22f, .58f, .34f, .68f, thin); line(.22f, .58f, .18f, .73f, thin)
            }
            RadialGlyph.ABOUT -> {
                drawCircle(white, w * .30f, Offset(w * .50f, h * .50f), style = Stroke(thin))
                drawCircle(white, w * .04f, Offset(w * .50f, h * .33f))
                line(.50f, .46f, .50f, .68f)
            }
            RadialGlyph.CHECKER -> {
                repeat(2) { row -> repeat(2) { col ->
                    if ((row + col) % 2 == 0) drawRect(white, Offset(w * (.23f + col * .27f), h * (.23f + row * .27f)), Size(w * .27f, h * .27f))
                    else drawRect(white.copy(alpha = .28f), Offset(w * (.23f + col * .27f), h * (.23f + row * .27f)), Size(w * .27f, h * .27f))
                } }
            }
            RadialGlyph.ONION -> {
                drawCircle(white, w * .25f, Offset(w * .42f, h * .54f), style = Stroke(thin))
                drawCircle(white.copy(alpha = .55f), w * .25f, Offset(w * .60f, h * .46f), style = Stroke(thin))
            }
            RadialGlyph.PROJECTS -> {
                repeat(2) { row -> repeat(2) { col ->
                    drawRoundRect(white, Offset(w * (.20f + col * .34f), h * (.20f + row * .34f)), Size(w * .24f, h * .24f), androidx.compose.ui.geometry.CornerRadius(2f), style = Stroke(thin))
                } }
            }
            RadialGlyph.NEW -> {
                drawRoundRect(white, Offset(w * .22f, h * .18f), Size(w * .56f, h * .64f), androidx.compose.ui.geometry.CornerRadius(3f), style = Stroke(thin))
                line(.50f, .36f, .50f, .66f); line(.35f, .51f, .65f, .51f)
            }
            RadialGlyph.OPEN -> {
                val folder = Path().apply {
                    moveTo(w * .14f, h * .36f); lineTo(w * .42f, h * .36f); lineTo(w * .50f, h * .27f); lineTo(w * .84f, h * .27f); lineTo(w * .76f, h * .75f); lineTo(w * .18f, h * .75f); close()
                }
                drawPath(folder, white, style = Stroke(thin))
            }
            RadialGlyph.SAVE -> {
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
        }
    }
}

private fun radialOffset(index: Int, count: Int, direction: FanDirection): Pair<Dp, Dp> {
    val spread = if (count <= 4) 78f else 118f
    val start = when (direction) {
        FanDirection.RIGHT -> -58f
        FanDirection.LEFT -> 122f
        FanDirection.UP -> 210f
    }
    val end = when (direction) {
        FanDirection.RIGHT -> 58f
        FanDirection.LEFT -> 238f
        FanDirection.UP -> 330f
    }
    val fraction = if (count <= 1) 0.5f else index.toFloat() / (count - 1).toFloat()
    val degrees = start + (end - start) * fraction
    val radians = degrees / 180f * PI.toFloat()
    return (cos(radians) * spread).dp to (sin(radians) * spread).dp
}

@Composable
private fun NodeGlyph(node: PrimaryNode, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val stroke = Stroke(width = 1.8.dp.toPx(), cap = StrokeCap.Round)
        val w = size.width
        val h = size.height
        when (node) {
            PrimaryNode.TOOLS -> {
                drawLine(Color.White, Offset(w * .28f, h * .72f), Offset(w * .67f, h * .33f), stroke.width, StrokeCap.Round)
                drawCircle(Color.White, radius = w * .11f, center = Offset(w * .72f, h * .28f), style = stroke)
                drawCircle(Color.White, radius = w * .10f, center = Offset(w * .24f, h * .76f))
            }
            PrimaryNode.LINE -> {
                drawLine(Color.White, Offset(w * .18f, h * .30f), Offset(w * .82f, h * .30f), stroke.width, StrokeCap.Round)
                drawLine(Color.White, Offset(w * .28f, h * .50f), Offset(w * .72f, h * .50f), stroke.width * 1.5f, StrokeCap.Round)
                drawLine(Color.White, Offset(w * .38f, h * .70f), Offset(w * .62f, h * .70f), stroke.width * 2f, StrokeCap.Round)
            }
            PrimaryNode.COLOR -> {
                drawLine(Color.White, Offset(w * .30f, h * .74f), Offset(w * .69f, h * .35f), stroke.width, StrokeCap.Round)
                drawCircle(Color.White, radius = w * .12f, center = Offset(w * .72f, h * .30f), style = stroke)
                drawLine(Color.White, Offset(w * .24f, h * .77f), Offset(w * .35f, h * .77f), stroke.width * 2f, StrokeCap.Round)
            }
            PrimaryNode.LAYERS -> {
                val top = Path().apply {
                    moveTo(w * .5f, h * .18f); lineTo(w * .82f, h * .38f); lineTo(w * .5f, h * .58f); lineTo(w * .18f, h * .38f); close()
                }
                drawPath(top, Color.White, style = stroke)
                drawLine(Color.White, Offset(w * .22f, h * .58f), Offset(w * .5f, h * .76f), stroke.width, StrokeCap.Round)
                drawLine(Color.White, Offset(w * .5f, h * .76f), Offset(w * .78f, h * .58f), stroke.width, StrokeCap.Round)
            }
            PrimaryNode.ACTIONS -> {
                val path = Path().apply {
                    moveTo(w * .78f, h * .62f)
                    cubicTo(w * .62f, h * .30f, w * .30f, h * .30f, w * .20f, h * .57f)
                }
                drawPath(path, Color.White, style = stroke)
                drawLine(Color.White, Offset(w * .20f, h * .57f), Offset(w * .18f, h * .35f), stroke.width, StrokeCap.Round)
                drawLine(Color.White, Offset(w * .20f, h * .57f), Offset(w * .38f, h * .50f), stroke.width, StrokeCap.Round)
            }
            PrimaryNode.FRAMES -> {
                drawRoundRect(Color.White, topLeft = Offset(w * .20f, h * .30f), size = Size(w * .60f, h * .45f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(3f), style = stroke)
                drawLine(Color.White, Offset(w * .20f, h * .30f), Offset(w * .33f, h * .18f), stroke.width, StrokeCap.Round)
                drawLine(Color.White, Offset(w * .40f, h * .30f), Offset(w * .53f, h * .18f), stroke.width, StrokeCap.Round)
                drawLine(Color.White, Offset(w * .60f, h * .30f), Offset(w * .73f, h * .18f), stroke.width, StrokeCap.Round)
            }
            PrimaryNode.STUDIO -> {
                drawCircle(Color.White, radius = w * .25f, center = Offset(w * .5f, h * .5f), style = stroke)
                drawCircle(Color.White, radius = w * .08f, center = Offset(w * .5f, h * .5f), style = stroke)
                repeat(6) { i ->
                    val a = i / 6f * 2f * PI.toFloat()
                    val p1 = Offset(w * .5f + cos(a) * w * .28f, h * .5f + sin(a) * h * .28f)
                    val p2 = Offset(w * .5f + cos(a) * w * .38f, h * .5f + sin(a) * h * .38f)
                    drawLine(Color.White, p1, p2, stroke.width, StrokeCap.Round)
                }
            }
            PrimaryNode.GALLERY -> {
                repeat(3) { row ->
                    repeat(3) { col ->
                        drawRoundRect(
                            Color.White,
                            topLeft = Offset(w * (.19f + col * .22f), h * (.19f + row * .22f)),
                            size = Size(w * .13f, h * .13f),
                            cornerRadius = androidx.compose.ui.geometry.CornerRadius(2f),
                            style = stroke,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun GlassHint(text: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .shadow(10.dp, RoundedCornerShape(16.dp), clip = false)
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xB31A001A))
            .border(1.dp, GlassStroke, RoundedCornerShape(16.dp))
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        androidx.compose.material3.Text(text, color = HorizonBlush, fontSize = 12.sp)
    }
}

@Composable
private fun BoxScope.FrostedOverlay(
    title: String,
    subtitle: String,
    body: List<String>,
    onClose: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0x99100010))
            .clickable(onClick = onClose),
        contentAlignment = Alignment.Center,
    ) {
        val shape = RoundedCornerShape(24.dp)
        Column(
            modifier = Modifier
                .fillMaxWidth(0.62f)
                .shadow(28.dp, shape, clip = false)
                .clip(shape)
                .background(UiBrush.linearGradient(listOf(Color(0x55F7CAC9), Color(0xDD14000E))))
                .border(1.dp, GlassStroke, shape)
                .clickable(enabled = false) {}
                .padding(horizontal = 34.dp, vertical = 30.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            androidx.compose.material3.Text(
                text = title.uppercase(),
                color = HorizonBlush,
                fontFamily = FontFamily.Serif,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 4.sp,
            )
            androidx.compose.material3.Text(
                text = subtitle.uppercase(),
                color = HorizonDim,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.2.sp,
            )
            Spacer(Modifier.height(20.dp))
            body.forEach { line ->
                androidx.compose.material3.Text(
                    text = line,
                    color = HorizonBlush,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(vertical = 4.dp),
                )
            }
            Spacer(Modifier.height(20.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(UiBrush.linearGradient(listOf(HorizonAccentDeep, HorizonAccent)))
                    .border(1.dp, GlassRim, RoundedCornerShape(14.dp))
                    .clickable(onClick = onClose)
                    .padding(horizontal = 24.dp, vertical = 11.dp),
            ) {
                androidx.compose.material3.Text(
                    text = "CLOSE",
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.5.sp,
                )
            }
        }
    }
}

private fun PrimaryNode?.toggle(node: PrimaryNode): PrimaryNode? = if (this == node) null else node
