package com.inkframe.feature.canvas

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

        val reservedWidth = 250.dp
        val reservedHeight = 190.dp
        val availableWidth = if (maxWidth > reservedWidth + 420.dp) maxWidth - reservedWidth else maxWidth * 0.72f
        val availableHeight = if (maxHeight > reservedHeight + 300.dp) maxHeight - reservedHeight else maxHeight * 0.65f
        val documentAspect = state.project.canvas.widthPx.toFloat() / state.project.canvas.heightPx.toFloat()
        val canvasWidth = minOf(availableWidth, availableHeight * documentAspect)
        val canvasHeight = canvasWidth / documentAspect
        val frameWidth = canvasWidth + 28.dp
        val frameHeight = canvasHeight + 28.dp

        GlassStage(
            state = state,
            canvasWidth = canvasWidth,
            canvasHeight = canvasHeight,
            frameWidth = frameWidth,
            frameHeight = frameHeight,
            onCanvasReady = { canvasView = it },
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = (-15).dp),
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
                .offset(y = (-34).dp)
                .width(minOf(maxWidth * 0.58f, 720.dp)),
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
            modifier = Modifier.align(Alignment.CenterStart).offset(x = 22.dp, y = (-150).dp),
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
            modifier = Modifier.align(Alignment.CenterStart).offset(x = 22.dp, y = (-55).dp),
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
            modifier = Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = (-155).dp),
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
            modifier = Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = (-55).dp),
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
            modifier = Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = 50.dp),
        )

        PrimaryGlassNode(
            node = PrimaryNode.FRAMES,
            direction = FanDirection.UP,
            isOpen = openNode == PrimaryNode.FRAMES,
            actions = listOf(
                RadialAction("Previous") {
                    state.setFrame((state.currentFrame - 1).coerceAtLeast(0)); canvasView?.requestRender()
                },
                RadialAction(if (state.isPlaying) "Pause" else "Play", selected = state.isPlaying) {
                    state.togglePlay()
                },
                RadialAction("Next") {
                    state.setFrame((state.currentFrame + 1).coerceAtMost(state.scene.frameCount - 1)); canvasView?.requestRender()
                },
                RadialAction("Insert") { state.insertFrame(); canvasView?.requestRender() },
                RadialAction("Remove") { state.removeFrame(); canvasView?.requestRender() },
            ),
            onToggle = { openNode = openNode.toggle(PrimaryNode.FRAMES) },
            modifier = Modifier.align(Alignment.BottomCenter).offset(y = (-36).dp),
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
            modifier = Modifier.align(Alignment.BottomStart).offset(x = 22.dp, y = (-22).dp),
        )

        PrimaryGlassNode(
            node = PrimaryNode.GALLERY,
            direction = FanDirection.RIGHT,
            isOpen = openNode == PrimaryNode.GALLERY,
            actions = listOf(
                RadialAction("Projects") { overlay = OverlayKind.GALLERY; openNode = null },
                RadialAction("New") { state.statusMessage = "New-project workflow is being connected natively" },
                RadialAction("Open") { state.statusMessage = "Native archive picker is preserved and being moved into Gallery" },
                RadialAction("Save") { state.statusMessage = "Native archive save is preserved and being moved into Gallery" },
            ),
            onToggle = { openNode = openNode.toggle(PrimaryNode.GALLERY) },
            modifier = Modifier.align(Alignment.BottomStart).offset(x = 106.dp, y = (-22).dp),
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
                    "Native project browsing, import, export and recovery remain required parity work.",
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
                Lifecycle.Event.ON_PAUSE -> canvasView?.onPause()
                Lifecycle.Event.ON_RESUME -> canvasView?.onResume()
                else -> Unit
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
        modifier = modifier.padding(top = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        androidx.compose.material3.Text(
            text = "INKFRAME",
            style = TextStyle(
                brush = UiBrush.verticalGradient(listOf(Color.White, HorizonRose, HorizonAccent)),
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.Bold,
                fontSize = 20.sp,
                letterSpacing = 4.4.sp,
                shadow = Shadow(Color.White.copy(alpha = 0.28f), blurRadius = 14f),
            ),
        )
        androidx.compose.material3.Text(
            text = "THE GLASS HORIZON",
            color = HorizonDim,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.8.sp,
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
    modifier: Modifier = Modifier,
) {
    Box(modifier.size(width, height)) {
        val count = frameCount.coerceAtMost(48)
        repeat(count) { index ->
            val point = perimeterPoint(index, count, width, height)
            val current = index == currentFrame
            val filled = index in filledFrames
            val shape = RoundedCornerShape(5.dp)
            Box(
                modifier = Modifier
                    .offset(x = point.first - 9.dp, y = point.second - 9.dp)
                    .size(18.dp)
                    .shadow(if (current) 10.dp else 3.dp, shape, clip = false)
                    .clip(shape)
                    .background(
                        when {
                            current -> UiBrush.linearGradient(listOf(HorizonBlush, HorizonAccent))
                            filled -> UiBrush.linearGradient(listOf(GlassStrong, HorizonAccent.copy(alpha = 0.22f)))
                            else -> UiBrush.linearGradient(listOf(Color(0x18FFF0F3), Color(0x120A000A)))
                        },
                    )
                    .border(1.dp, if (current) Color.White else GlassStroke, shape)
                    .clickable { onFrame(index) },
                contentAlignment = Alignment.Center,
            ) {
                androidx.compose.material3.Text(
                    text = "${index + 1}",
                    color = Color.White,
                    fontSize = 7.sp,
                    fontWeight = FontWeight.ExtraBold,
                    textAlign = TextAlign.Center,
                )
            }
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
    val shape = RoundedCornerShape(18.dp)
    Row(
        modifier = modifier
            .height(42.dp)
            .shadow(14.dp, shape, clip = false)
            .clip(shape)
            .background(UiBrush.linearGradient(listOf(GlassStrong, Color(0x7714000E))))
            .border(1.dp, GlassStroke, shape)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        RailStep("‹", onPrevious)
        Row(
            modifier = Modifier
                .weight(1f)
                .height(12.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0x4414000E)),
        ) {
            repeat(state.scene.frameCount) { frame ->
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .background(
                            if (frame == state.currentFrame) HorizonAccent
                            else if (state.activeLayer.cels.containsKey(frame)) HorizonRose.copy(alpha = 0.42f)
                            else Color.Transparent,
                        )
                        .clickable {
                            state.setFrame(frame)
                        },
                )
            }
        }
        RailStep("›", onNext)
        androidx.compose.material3.Text(
            text = "${state.currentFrame + 1} / ${state.scene.frameCount}",
            color = HorizonBlush,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
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
    var dragX by rememberSaveable(node.name) { mutableStateOf(0f) }
    var dragY by rememberSaveable(node.name) { mutableStateOf(0f) }

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
            NodeGlyph(node, Modifier.size(27.dp))
        }

        androidx.compose.material3.Text(
            text = node.label.uppercase(),
            modifier = Modifier.offset(y = 38.dp),
            color = HorizonDim,
            fontSize = 9.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 1.2.sp,
            maxLines = 1,
        )
    }
}

@Composable
private fun RadialChild(action: RadialAction, modifier: Modifier = Modifier) {
    val shape = CircleShape
    Box(
        modifier = modifier
            .size(48.dp)
            .shadow(if (action.selected) 14.dp else 8.dp, shape, clip = false)
            .clip(shape)
            .background(
                action.color?.let { UiBrush.radialGradient(listOf(it.copy(alpha = 0.95f), it.copy(alpha = 0.55f))) }
                    ?: UiBrush.linearGradient(
                        if (action.selected) listOf(HorizonAccent, HorizonAccentDeep)
                        else listOf(GlassStrong, Color(0x8814000E)),
                    ),
            )
            .border(1.dp, if (action.selected) GlassRim else GlassStroke, shape)
            .clickable(onClick = action.onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (action.color == null) {
            androidx.compose.material3.Text(
                text = action.label.take(3).uppercase(),
                color = Color.White,
                fontSize = 8.sp,
                fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center,
            )
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
