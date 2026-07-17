package com.inkframe.feature.canvas

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Colorize
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FitScreen
import androidx.compose.material.icons.filled.GridOn
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush as UiBrush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.inkframe.core.model.DefaultBrushes
import kotlinx.coroutines.delay

private val HorizonRose = Color(0xFFF7CAC9)
private val HorizonAccent = Color(0xFFBB0037)
private val HorizonDeep = Color(0xFF2A001A)
private val HorizonInk = Color(0xFF100009)
private val HorizonText = Color(0xFFFFF0F3)
private val HorizonDim = Color(0xFFE8B9C6)
private val GlassFill = Color(0x2EF7CAC9)
private val GlassStrong = Color(0x4AF7CAC9)
private val GlassStroke = Color(0x77F7CAC9)

private enum class GlassPanel {
    TOOLS,
    COLOR,
    LAYERS,
    ACTIONS,
    FRAMES,
    STUDIO,
    GALLERY,
}

/**
 * Native Kotlin translation target for InkFrame's Glass Horizon / Glass Canvas workspace.
 *
 * This deliberately does not reuse the old rail + toolbar + side-panel composition. The existing
 * OpenGL canvas remains underneath while the production shell is rebuilt around the visual and
 * interaction language of the original Glass Canvas reference.
 */
@Composable
fun GlassCanvasScreen(state: StudioState = viewModel()) {
    var canvasView by remember { mutableStateOf<CanvasView?>(null) }
    var openPanel by remember { mutableStateOf<GlassPanel?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                UiBrush.radialGradient(
                    colors = listOf(
                        Color(0xFFFFD9E2),
                        HorizonRose,
                        Color(0xFFD77FA0),
                        Color(0xFFA52766),
                        Color(0xFF4D0A33),
                        Color(0xFF1A001A),
                    ),
                    radius = 1900f,
                ),
            ),
    ) {
        HorizonAtmosphere()

        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "INKFRAME",
                color = HorizonText,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 4.sp,
            )
            Text(
                text = "THE GLASS CANVAS",
                color = HorizonDim,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 3.sp,
            )
        }

        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth(0.78f)
                .fillMaxHeight(0.74f),
        ) {
            PerimeterTimeline(
                frameCount = state.scene.frameCount,
                currentFrame = state.currentFrame,
                holdAt = state.scene::holdAt,
                modifier = Modifier.fillMaxSize(),
            )

            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .fillMaxWidth(0.91f)
                    .fillMaxHeight(0.86f)
                    .clip(RoundedCornerShape(30.dp))
                    .background(
                        UiBrush.linearGradient(
                            listOf(GlassStrong, GlassFill, Color(0x24100009)),
                        ),
                    )
                    .border(1.dp, GlassStroke, RoundedCornerShape(30.dp))
                    .padding(14.dp),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFFFFF0F3))
                        .border(1.dp, Color(0x66100009), RoundedCornerShape(16.dp)),
                ) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { context ->
                            CanvasView(
                                context = context,
                                canvasWidth = state.project.canvas.widthPx,
                                canvasHeight = state.project.canvas.heightPx,
                                sceneProvider = { state.buildDrawList() },
                                strokeConfig = {
                                    val surfaceId = state.ensureActiveCel()
                                    CanvasView.StrokeConfig(surfaceId, state.brush, state.color)
                                },
                                onEngineReady = { engine -> state.bindEngine(engine) },
                            ).also { view ->
                                canvasView = view
                                state.onUiInvalidate = { view.requestRender() }
                                view.onViewportChanged = { scale -> view.post { state.setZoom(scale) } }
                                state.postEngineWork = { block -> view.runOnEngine(block) }
                                view.onContextRestored = {
                                    view.requestRender()
                                    state.statusMessage = "Glass Canvas restored after display reset"
                                }
                            }
                        },
                    )
                }
            }
        }

        GlassOrb(
            icon = Icons.Filled.Brush,
            label = "Tools",
            selected = openPanel == GlassPanel.TOOLS,
            onClick = { openPanel = openPanel.toggle(GlassPanel.TOOLS) },
            modifier = Modifier.align(Alignment.CenterStart).offset(x = 22.dp, y = (-150).dp),
        )
        GlassOrb(
            icon = Icons.Filled.Tune,
            label = "Line",
            selected = openPanel == GlassPanel.ACTIONS,
            onClick = { openPanel = openPanel.toggle(GlassPanel.ACTIONS) },
            modifier = Modifier.align(Alignment.CenterStart).offset(x = 22.dp, y = (-55).dp),
        )
        GlassOrb(
            icon = Icons.Filled.Settings,
            label = "Studio",
            selected = openPanel == GlassPanel.STUDIO,
            onClick = { openPanel = openPanel.toggle(GlassPanel.STUDIO) },
            modifier = Modifier.align(Alignment.BottomStart).offset(x = 22.dp, y = (-20).dp),
        )
        GlassOrb(
            icon = Icons.Filled.GridOn,
            label = "Gallery",
            selected = openPanel == GlassPanel.GALLERY,
            onClick = { openPanel = openPanel.toggle(GlassPanel.GALLERY) },
            modifier = Modifier.align(Alignment.BottomStart).offset(x = 104.dp, y = (-20).dp),
        )

        GlassOrb(
            icon = Icons.Filled.Colorize,
            label = "Color",
            selected = openPanel == GlassPanel.COLOR,
            onClick = { openPanel = openPanel.toggle(GlassPanel.COLOR) },
            modifier = Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = (-155).dp),
        )
        GlassOrb(
            icon = Icons.Filled.Layers,
            label = "Layers",
            selected = openPanel == GlassPanel.LAYERS,
            onClick = { openPanel = openPanel.toggle(GlassPanel.LAYERS) },
            modifier = Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = (-55).dp),
        )
        GlassOrb(
            icon = Icons.AutoMirrored.Filled.Undo,
            label = "Actions",
            selected = openPanel == GlassPanel.ACTIONS,
            onClick = { openPanel = openPanel.toggle(GlassPanel.ACTIONS) },
            modifier = Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = 50.dp),
        )
        GlassOrb(
            icon = Icons.Filled.Movie,
            label = "Frames",
            selected = openPanel == GlassPanel.FRAMES,
            onClick = { openPanel = openPanel.toggle(GlassPanel.FRAMES) },
            modifier = Modifier.align(Alignment.BottomCenter).offset(y = (-18).dp),
        )

        openPanel?.let { panel ->
            GlassPanelOverlay(
                panel = panel,
                state = state,
                canvasView = canvasView,
                onDismiss = { openPanel = null },
            )
        }

        state.statusMessage?.let { message ->
            Surface(
                modifier = Modifier.align(Alignment.BottomCenter).offset(y = (-96).dp),
                shape = RoundedCornerShape(999.dp),
                color = Color(0xCC100009),
                border = androidx.compose.foundation.BorderStroke(1.dp, GlassStroke),
                shadowElevation = 8.dp,
            ) {
                Text(
                    text = message,
                    modifier = Modifier.padding(horizontal = 18.dp, vertical = 9.dp),
                    color = HorizonText,
                    fontSize = 11.sp,
                )
            }
        }
    }

    LaunchedEffect(state.isPlaying, state.project.canvas.fps, state.currentFrame) {
        if (state.isPlaying) {
            val hold = state.scene.holdAt(state.currentFrame).coerceAtLeast(1)
            delay(state.frameDurationMs * hold)
            state.advancePlayback()
            canvasView?.requestRender()
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
private fun HorizonAtmosphere() {
    Canvas(Modifier.fillMaxSize()) {
        drawRect(
            brush = UiBrush.verticalGradient(
                listOf(Color.Transparent, Color(0x15000000), Color(0x77100009)),
            ),
        )
        val center = Offset(size.width * 0.5f, size.height * 0.42f)
        drawCircle(
            brush = UiBrush.radialGradient(
                listOf(Color.Transparent, Color(0x18100009), Color(0x77100009)),
                center = center,
                radius = maxOf(size.width, size.height) * 0.72f,
            ),
            radius = maxOf(size.width, size.height) * 0.72f,
            center = center,
        )
    }
}

@Composable
private fun PerimeterTimeline(
    frameCount: Int,
    currentFrame: Int,
    holdAt: (Int) -> Int,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier) {
        val count = frameCount.coerceAtLeast(1)
        val inset = 18.dp.toPx()
        val slotRadius = 5.dp.toPx()
        val activeRadius = 8.dp.toPx()

        for (index in 0 until count) {
            val point = perimeterPoint(index, count, size.width, size.height, inset)
            val isCurrent = index == currentFrame
            val held = holdAt(index) > 1
            drawCircle(
                color = if (isCurrent) HorizonText else Color(0x88F7CAC9),
                radius = if (isCurrent) activeRadius else slotRadius,
                center = point,
            )
            drawCircle(
                color = if (isCurrent) HorizonAccent else Color(0x552A001A),
                radius = if (isCurrent) activeRadius - 2.dp.toPx() else slotRadius - 1.dp.toPx(),
                center = point,
            )
            if (held) {
                drawCircle(
                    color = HorizonRose,
                    radius = 2.2.dp.toPx(),
                    center = point + Offset(slotRadius, -slotRadius),
                )
            }
        }
    }
}

private fun perimeterPoint(index: Int, count: Int, width: Float, height: Float, inset: Float): Offset {
    val usableWidth = (width - inset * 2f).coerceAtLeast(1f)
    val usableHeight = (height - inset * 2f).coerceAtLeast(1f)
    val perimeter = 2f * (usableWidth + usableHeight)
    var distance = (index.toFloat() / count.toFloat()) * perimeter

    return when {
        distance <= usableWidth -> Offset(inset + distance, inset)
        distance <= usableWidth + usableHeight -> {
            distance -= usableWidth
            Offset(width - inset, inset + distance)
        }
        distance <= usableWidth * 2f + usableHeight -> {
            distance -= usableWidth + usableHeight
            Offset(width - inset - distance, height - inset)
        }
        else -> {
            distance -= usableWidth * 2f + usableHeight
            Offset(inset, height - inset - distance)
        }
    }
}

@Composable
private fun BoxScope.GlassOrb(
    icon: ImageVector,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Surface(
            modifier = Modifier
                .size(58.dp)
                .clickable(onClick = onClick),
            shape = CircleShape,
            color = if (selected) Color(0x77BB0037) else Color(0x4A2A001A),
            border = androidx.compose.foundation.BorderStroke(
                if (selected) 2.dp else 1.dp,
                if (selected) HorizonText else GlassStroke,
            ),
            shadowElevation = if (selected) 18.dp else 10.dp,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = HorizonText,
                    modifier = Modifier.size(26.dp),
                )
            }
        }
        Text(
            text = label.uppercase(),
            modifier = Modifier.padding(top = 5.dp),
            color = HorizonDim,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.2.sp,
        )
    }
}

@Composable
private fun GlassPanelOverlay(
    panel: GlassPanel,
    state: StudioState,
    canvasView: CanvasView?,
    onDismiss: () -> Unit,
) {
    val alignment = if (panel == GlassPanel.FRAMES) Alignment.BottomCenter else Alignment.CenterEnd
    val modifier = if (panel == GlassPanel.FRAMES) {
        Modifier
            .fillMaxWidth(0.72f)
            .offset(y = (-92).dp)
    } else {
        Modifier
            .widthIn(min = 250.dp, max = 340.dp)
            .fillMaxHeight(0.68f)
            .offset(x = (-98).dp)
    }

    Box(Modifier.fillMaxSize(), contentAlignment = alignment) {
        Surface(
            modifier = modifier,
            shape = RoundedCornerShape(26.dp),
            color = Color(0xD92A001A),
            border = androidx.compose.foundation.BorderStroke(1.dp, GlassStroke),
            shadowElevation = 22.dp,
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = panel.name,
                        color = HorizonText,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 2.sp,
                    )
                    Text(
                        text = "CLOSE",
                        modifier = Modifier.clickable(onClick = onDismiss).padding(6.dp),
                        color = HorizonDim,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }

                when (panel) {
                    GlassPanel.TOOLS -> ToolPanel(state)
                    GlassPanel.COLOR -> ColorPanel(state, canvasView)
                    GlassPanel.LAYERS -> LayersPanel(state, canvasView)
                    GlassPanel.ACTIONS -> ActionsPanel(state, canvasView)
                    GlassPanel.FRAMES -> FramesPanel(state, canvasView)
                    GlassPanel.STUDIO -> StudioPanel(state)
                    GlassPanel.GALLERY -> GalleryPanel(state)
                }
            }
        }
    }
}

@Composable
private fun ToolPanel(state: StudioState) {
    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DefaultBrushes.all.forEach { brush ->
            GlassChoice(
                text = "${brush.name} · ${brush.sizePx.toInt()} px",
                selected = state.brush.id == brush.id,
                onClick = { state.brush = brush },
            )
        }
    }
}

@Composable
private fun ColorPanel(state: StudioState, canvasView: CanvasView?) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("ACTIVE COLOR", color = HorizonDim, fontSize = 9.sp, fontWeight = FontWeight.Bold)
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            state.project.colorPalette.forEach { swatch ->
                val color = Color(swatch.toArgb())
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(color)
                        .border(
                            if (state.color.toArgb() == swatch.toArgb()) 3.dp else 1.dp,
                            if (state.color.toArgb() == swatch.toArgb()) HorizonText else GlassStroke,
                            CircleShape,
                        )
                        .clickable {
                            state.commitColor(swatch)
                            canvasView?.requestRender()
                        },
                )
            }
        }
        Text(
            text = "#${"%08X".format(state.color.toArgb())}",
            color = HorizonText,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun LayersPanel(state: StudioState, canvasView: CanvasView?) {
    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        state.scene.layers.asReversed().forEach { layer ->
            val selected = layer.id == state.activeLayerId
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { state.activeLayerId = layer.id },
                shape = RoundedCornerShape(14.dp),
                color = if (selected) Color(0x66BB0037) else Color(0x33100009),
                border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) HorizonText else GlassStroke),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = {
                        state.toggleLayerVisible(layer.id)
                        canvasView?.requestRender()
                    }) {
                        Icon(
                            imageVector = if (layer.visible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                            contentDescription = "Toggle visibility",
                            tint = HorizonText,
                        )
                    }
                    Text(
                        text = layer.name,
                        modifier = Modifier.weight(1f),
                        color = HorizonText,
                        fontSize = 12.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    )
                    Text(
                        text = "${(layer.opacity * 100f).toInt()}%",
                        color = HorizonDim,
                        fontSize = 10.sp,
                    )
                }
            }
        }
        Button(
            onClick = { state.addLayer(); canvasView?.requestRender() },
            colors = ButtonDefaults.buttonColors(containerColor = HorizonAccent),
        ) {
            Icon(Icons.Filled.Add, contentDescription = null)
            Spacer(Modifier.width(6.dp))
            Text("ADD LAYER")
        }
    }
}

@Composable
private fun ActionsPanel(state: StudioState, canvasView: CanvasView?) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        GlassAction("UNDO", Icons.AutoMirrored.Filled.Undo, state.canUndo) { canvasView?.undo() }
        GlassAction("REDO", Icons.AutoMirrored.Filled.Redo, state.canRedo) { canvasView?.redo() }
        GlassAction("FIT CANVAS", Icons.Filled.FitScreen, true) { canvasView?.fitToScreen() }
        GlassAction("RESET 100%", Icons.Filled.Tune, true) { canvasView?.resetZoom() }
        GlassChoice(
            text = if (state.onionSkin.enabled) "Onion skin · ON" else "Onion skin · OFF",
            selected = state.onionSkin.enabled,
            onClick = {
                state.onionSkin = state.onionSkin.copy(enabled = !state.onionSkin.enabled)
                canvasView?.requestRender()
            },
        )
    }
}

@Composable
private fun FramesPanel(state: StudioState, canvasView: CanvasView?) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IconButton(onClick = { state.togglePlay() }) {
                Icon(
                    imageVector = if (state.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = if (state.isPlaying) "Pause" else "Play",
                    tint = HorizonText,
                )
            }
            IconButton(onClick = { state.insertFrame(); canvasView?.requestRender() }) {
                Icon(Icons.Filled.Add, contentDescription = "Insert frame", tint = HorizonText)
            }
            IconButton(onClick = { state.removeFrame(); canvasView?.requestRender() }) {
                Icon(Icons.Filled.Delete, contentDescription = "Remove frame", tint = HorizonText)
            }
            Button(
                onClick = { state.extendExposure(); canvasView?.requestRender() },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0x66BB0037)),
            ) {
                Text("HOLD +1")
            }
            Text(
                text = "${state.currentFrame + 1} / ${state.scene.frameCount}",
                color = HorizonText,
                fontWeight = FontWeight.Bold,
            )
        }
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            repeat(state.scene.frameCount) { frame ->
                Surface(
                    modifier = Modifier
                        .size(42.dp)
                        .clickable {
                            state.setFrame(frame)
                            canvasView?.requestRender()
                        },
                    shape = CircleShape,
                    color = if (frame == state.currentFrame) HorizonAccent else Color(0x44100009),
                    border = androidx.compose.foundation.BorderStroke(
                        if (frame == state.currentFrame) 2.dp else 1.dp,
                        if (frame == state.currentFrame) HorizonText else GlassStroke,
                    ),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = if (state.scene.holdAt(frame) > 1) {
                                "${frame + 1}\n×${state.scene.holdAt(frame)}"
                            } else {
                                "${frame + 1}"
                            },
                            color = HorizonText,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StudioPanel(state: StudioState) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(state.project.name, color = HorizonText, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text(
            "${state.project.canvas.widthPx} × ${state.project.canvas.heightPx} · ${state.project.canvas.fps} fps",
            color = HorizonDim,
            fontSize = 11.sp,
        )
        Text(
            "Native Glass Canvas shell. Save, open, export, project management, and full Glass Horizon motion behavior are restored in subsequent parity gates—not by returning to the legacy flat studio.",
            color = HorizonText,
            fontSize = 11.sp,
            lineHeight = 16.sp,
        )
    }
}

@Composable
private fun GalleryPanel(state: StudioState) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("ACTIVE CANVAS", color = HorizonDim, fontSize = 9.sp, fontWeight = FontWeight.Bold)
        Text(state.project.name, color = HorizonText, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Text(
            "The multi-canvas gallery will be translated as a native glass overlay. This shell intentionally does not expose the old conventional project panel.",
            color = HorizonText,
            fontSize = 11.sp,
            lineHeight = 16.sp,
        )
    }
}

@Composable
private fun GlassChoice(text: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        color = if (selected) Color(0x66BB0037) else Color(0x33100009),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) HorizonText else GlassStroke),
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            color = HorizonText,
            fontSize = 11.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
        )
    }
}

@Composable
private fun GlassAction(text: String, icon: ImageVector, enabled: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        color = if (enabled) Color(0x44100009) else Color(0x22100009),
        border = androidx.compose.foundation.BorderStroke(1.dp, GlassStroke),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = if (enabled) HorizonText else HorizonDim)
            Spacer(Modifier.width(8.dp))
            Text(text, color = if (enabled) HorizonText else HorizonDim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

private fun GlassPanel?.toggle(panel: GlassPanel): GlassPanel? = if (this == panel) null else panel
