from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:220]!r}")
    p.write_text(text.replace(old, new, 1))


screen = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/GlassHorizonScreen.kt"
replace_once(
    screen,
    "import androidx.compose.ui.platform.LocalLifecycleOwner\n",
    "import androidx.compose.ui.platform.LocalDensity\nimport androidx.compose.ui.platform.LocalLifecycleOwner\n",
)
replace_once(
    screen,
    '''private data class RadialAction(\n    val label: String,\n    val selected: Boolean = false,\n    val color: Color? = null,\n    val onClick: () -> Unit,\n)\n''',
    '''private data class RadialAction(\n    val label: String,\n    val selected: Boolean = false,\n    val color: Color? = null,\n    val onClick: () -> Unit,\n)\n\nprivate data class RadialDockSpec(\n    val region: RadialDockRegion,\n    val originX: Dp,\n    val originY: Dp,\n    val workspaceWidth: Dp,\n    val workspaceHeight: Dp,\n    val canvasLeft: Dp,\n    val canvasTop: Dp,\n    val canvasRight: Dp,\n    val canvasBottom: Dp,\n)\n''',
)
replace_once(
    screen,
    '''    var openNode by rememberSaveable { mutableStateOf<PrimaryNode?>(null) }\n    var overlay by rememberSaveable { mutableStateOf<OverlayKind?>(null) }\n''',
    '''    var openNode by rememberSaveable { mutableStateOf<PrimaryNode?>(null) }\n    var overlay by rememberSaveable { mutableStateOf<OverlayKind?>(null) }\n    var nodeLayoutEpoch by rememberSaveable { mutableStateOf(0) }\n''',
)
replace_once(
    screen,
    '''        val bottomNodeY = (frameBottom + 28.dp).coerceAtMost(maxHeight - 82.dp)\n\n        GlassStage(\n''',
    '''        val bottomNodeY = (frameBottom + 28.dp).coerceAtMost(maxHeight - 82.dp)\n\n        fun radialDock(region: RadialDockRegion, originX: Dp, originY: Dp) = RadialDockSpec(\n            region = region,\n            originX = originX,\n            originY = originY,\n            workspaceWidth = maxWidth,\n            workspaceHeight = maxHeight,\n            canvasLeft = frameLeft,\n            canvasTop = frameTop,\n            canvasRight = frameRight,\n            canvasBottom = frameBottom,\n        )\n\n        GlassStage(\n''',
)

node_replacements = [
    (
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.TOOLS) },\n            modifier = Modifier.align(Alignment.TopStart).offset(x = leftNodeX, y = topNodeY),\n''',
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.TOOLS) },\n            dock = radialDock(RadialDockRegion.LEFT, leftNodeX, topNodeY),\n            layoutEpoch = nodeLayoutEpoch,\n            modifier = Modifier.align(Alignment.TopStart).offset(x = leftNodeX, y = topNodeY),\n''',
    ),
    (
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.LINE) },\n            modifier = Modifier.align(Alignment.TopStart).offset(x = leftNodeX, y = middleNodeY),\n''',
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.LINE) },\n            dock = radialDock(RadialDockRegion.LEFT, leftNodeX, middleNodeY),\n            layoutEpoch = nodeLayoutEpoch,\n            modifier = Modifier.align(Alignment.TopStart).offset(x = leftNodeX, y = middleNodeY),\n''',
    ),
    (
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.COLOR) },\n            modifier = Modifier.align(Alignment.TopStart).offset(x = rightNodeX, y = topNodeY),\n''',
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.COLOR) },\n            dock = radialDock(RadialDockRegion.RIGHT, rightNodeX, topNodeY),\n            layoutEpoch = nodeLayoutEpoch,\n            modifier = Modifier.align(Alignment.TopStart).offset(x = rightNodeX, y = topNodeY),\n''',
    ),
    (
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.LAYERS) },\n            modifier = Modifier.align(Alignment.TopStart).offset(x = rightNodeX, y = middleNodeY),\n''',
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.LAYERS) },\n            dock = radialDock(RadialDockRegion.RIGHT, rightNodeX, middleNodeY),\n            layoutEpoch = nodeLayoutEpoch,\n            modifier = Modifier.align(Alignment.TopStart).offset(x = rightNodeX, y = middleNodeY),\n''',
    ),
    (
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.ACTIONS) },\n            modifier = Modifier.align(Alignment.TopStart).offset(x = rightNodeX, y = lowerNodeY),\n''',
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.ACTIONS) },\n            dock = radialDock(RadialDockRegion.RIGHT, rightNodeX, lowerNodeY),\n            layoutEpoch = nodeLayoutEpoch,\n            modifier = Modifier.align(Alignment.TopStart).offset(x = rightNodeX, y = lowerNodeY),\n''',
    ),
    (
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.FRAMES) },\n            modifier = Modifier.align(Alignment.TopStart).offset(x = (maxWidth - 58.dp) / 2, y = bottomNodeY),\n''',
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.FRAMES) },\n            dock = radialDock(RadialDockRegion.BOTTOM, (maxWidth - 58.dp) / 2, bottomNodeY),\n            layoutEpoch = nodeLayoutEpoch,\n            modifier = Modifier.align(Alignment.TopStart).offset(x = (maxWidth - 58.dp) / 2, y = bottomNodeY),\n''',
    ),
    (
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.STUDIO) },\n            modifier = Modifier.align(Alignment.TopStart).offset(x = leftNodeX, y = lowerNodeY),\n''',
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.STUDIO) },\n            dock = radialDock(RadialDockRegion.LEFT, leftNodeX, lowerNodeY),\n            layoutEpoch = nodeLayoutEpoch,\n            modifier = Modifier.align(Alignment.TopStart).offset(x = leftNodeX, y = lowerNodeY),\n''',
    ),
    (
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.GALLERY) },\n            modifier = Modifier.align(Alignment.TopStart).offset(x = frameLeft + 34.dp, y = bottomNodeY),\n''',
        '''            onToggle = { openNode = openNode.toggle(PrimaryNode.GALLERY) },\n            dock = radialDock(RadialDockRegion.BOTTOM, frameLeft + 34.dp, bottomNodeY),\n            layoutEpoch = nodeLayoutEpoch,\n            modifier = Modifier.align(Alignment.TopStart).offset(x = frameLeft + 34.dp, y = bottomNodeY),\n''',
    ),
]
for old, new in node_replacements:
    replace_once(screen, old, new)

replace_once(
    screen,
    '''                RadialAction("Onion", selected = state.onionSkin.enabled) {\n                    state.onionSkin = state.onionSkin.copy(enabled = !state.onionSkin.enabled)\n                    canvasView?.requestRender()\n                },\n            ),\n''',
    '''                RadialAction("Onion", selected = state.onionSkin.enabled) {\n                    state.onionSkin = state.onionSkin.copy(enabled = !state.onionSkin.enabled)\n                    canvasView?.requestRender()\n                },\n                RadialAction("Reset UI") {\n                    nodeLayoutEpoch += 1\n                    openNode = null\n                    state.statusMessage = "CONTROL LAYOUT RESET"\n                },\n            ),\n''',
)

replace_once(
    screen,
    '''private fun BoxScope.PrimaryGlassNode(\n    node: PrimaryNode,\n    direction: FanDirection,\n    isOpen: Boolean,\n    actions: List<RadialAction>,\n    onToggle: () -> Unit,\n    modifier: Modifier = Modifier,\n) {\n    var dragX by rememberSaveable("glass-device-layout-v3", node.name) { mutableStateOf(0f) }\n    var dragY by rememberSaveable("glass-device-layout-v3", node.name) { mutableStateOf(0f) }\n''',
    '''private fun BoxScope.PrimaryGlassNode(\n    node: PrimaryNode,\n    direction: FanDirection,\n    isOpen: Boolean,\n    actions: List<RadialAction>,\n    onToggle: () -> Unit,\n    dock: RadialDockSpec,\n    layoutEpoch: Int,\n    modifier: Modifier = Modifier,\n) {\n    val density = LocalDensity.current\n    var dragX by rememberSaveable(\n        "glass-device-layout-v4", node.name, layoutEpoch, dock.workspaceWidth.value, dock.workspaceHeight.value,\n    ) { mutableStateOf(0f) }\n    var dragY by rememberSaveable(\n        "glass-device-layout-v4", node.name, layoutEpoch, dock.workspaceWidth.value, dock.workspaceHeight.value,\n    ) { mutableStateOf(0f) }\n''',
)
replace_once(
    screen,
    '''                .pointerInput(node) {\n                    detectDragGestures { change, dragAmount ->\n                        change.consume()\n                        dragX += dragAmount.x\n                        dragY += dragAmount.y\n                    }\n                }\n''',
    '''                .pointerInput(node, dock, layoutEpoch) {\n                    val originX = with(density) { dock.originX.toPx() }\n                    val originY = with(density) { dock.originY.toPx() }\n                    val workspaceWidth = with(density) { dock.workspaceWidth.toPx() }\n                    val workspaceHeight = with(density) { dock.workspaceHeight.toPx() }\n                    val canvas = RadialDockRect(\n                        left = with(density) { dock.canvasLeft.toPx() },\n                        top = with(density) { dock.canvasTop.toPx() },\n                        right = with(density) { dock.canvasRight.toPx() },\n                        bottom = with(density) { dock.canvasBottom.toPx() },\n                    )\n                    val nodeWidth = with(density) { 58.dp.toPx() }\n                    val nodeHeight = with(density) { 76.dp.toPx() }\n                    val edgePadding = with(density) { 12.dp.toPx() }\n                    val canvasGap = with(density) { 12.dp.toPx() }\n                    detectDragGestures { change, dragAmount ->\n                        change.consume()\n                        val bounded = clampRadialDockOffset(\n                            originX = originX,\n                            originY = originY,\n                            requestedOffset = RadialDockOffset(\n                                x = dragX + dragAmount.x,\n                                y = dragY + dragAmount.y,\n                            ),\n                            nodeWidth = nodeWidth,\n                            nodeHeight = nodeHeight,\n                            workspaceWidth = workspaceWidth,\n                            workspaceHeight = workspaceHeight,\n                            canvas = canvas,\n                            region = dock.region,\n                            edgePadding = edgePadding,\n                            canvasGap = canvasGap,\n                        )\n                        dragX = bounded.x\n                        dragY = bounded.y\n                    }\n                }\n''',
)
replace_once(
    screen,
    '    label == "100%" -> RadialGlyph.RESET\n',
    '    label == "100%" || label == "Reset UI" -> RadialGlyph.RESET\n',
)

helper = Path("feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/RadialDocking.kt")
helper.write_text('''package com.inkframe.feature.canvas\n\nimport kotlin.math.max\nimport kotlin.math.min\n\ninternal enum class RadialDockRegion { LEFT, RIGHT, BOTTOM }\n\ninternal data class RadialDockRect(\n    val left: Float,\n    val top: Float,\n    val right: Float,\n    val bottom: Float,\n)\n\ninternal data class RadialDockOffset(val x: Float, val y: Float)\n\n/**\n * Clamps a radial node to a screen-safe command zone while keeping its body out of the\n * drawing stage. Offsets are relative to the node's original Glass Horizon position.\n */\ninternal fun clampRadialDockOffset(\n    originX: Float,\n    originY: Float,\n    requestedOffset: RadialDockOffset,\n    nodeWidth: Float,\n    nodeHeight: Float,\n    workspaceWidth: Float,\n    workspaceHeight: Float,\n    canvas: RadialDockRect,\n    region: RadialDockRegion,\n    edgePadding: Float,\n    canvasGap: Float,\n): RadialDockOffset {\n    require(nodeWidth > 0f && nodeHeight > 0f)\n    require(workspaceWidth > 0f && workspaceHeight > 0f)\n\n    val edge = edgePadding.coerceAtLeast(0f)\n    val gap = canvasGap.coerceAtLeast(0f)\n    val screenMinX = edge\n    val screenMinY = edge\n    val screenMaxX = max(screenMinX, workspaceWidth - nodeWidth - edge)\n    val screenMaxY = max(screenMinY, workspaceHeight - nodeHeight - edge)\n    val requestedX = originX + requestedOffset.x\n    val requestedY = originY + requestedOffset.y\n\n    fun clampOrFallback(value: Float, minValue: Float, maxValue: Float, fallback: Float): Float =\n        if (minValue <= maxValue) value.coerceIn(minValue, maxValue)\n        else fallback.coerceIn(screenMinX, screenMaxX)\n\n    val absoluteX: Float\n    val absoluteY: Float\n    when (region) {\n        RadialDockRegion.LEFT -> {\n            val maxX = min(screenMaxX, canvas.left - nodeWidth - gap)\n            absoluteX = clampOrFallback(requestedX, screenMinX, maxX, screenMinX)\n            absoluteY = requestedY.coerceIn(screenMinY, screenMaxY)\n        }\n        RadialDockRegion.RIGHT -> {\n            val minX = max(screenMinX, canvas.right + gap)\n            absoluteX = if (minX <= screenMaxX) requestedX.coerceIn(minX, screenMaxX) else screenMaxX\n            absoluteY = requestedY.coerceIn(screenMinY, screenMaxY)\n        }\n        RadialDockRegion.BOTTOM -> {\n            absoluteX = requestedX.coerceIn(screenMinX, screenMaxX)\n            val minY = max(screenMinY, canvas.bottom + gap)\n            absoluteY = if (minY <= screenMaxY) requestedY.coerceIn(minY, screenMaxY) else screenMaxY\n        }\n    }\n\n    return RadialDockOffset(absoluteX - originX, absoluteY - originY)\n}\n''')

test = Path("feature-canvas/src/test/kotlin/com/inkframe/feature/canvas/RadialDockingTest.kt")
test.parent.mkdir(parents=True, exist_ok=True)
test.write_text('''package com.inkframe.feature.canvas\n\nimport org.junit.Assert.assertEquals\nimport org.junit.Assert.assertTrue\nimport org.junit.Test\n\nclass RadialDockingTest {\n    private val canvas = RadialDockRect(left = 300f, top = 100f, right = 900f, bottom = 700f)\n\n    @Test\n    fun leftNodeCannotEnterCanvas() {\n        val result = clampRadialDockOffset(\n            originX = 120f, originY = 220f, requestedOffset = RadialDockOffset(900f, 0f),\n            nodeWidth = 58f, nodeHeight = 76f, workspaceWidth = 1200f, workspaceHeight = 800f,\n            canvas = canvas, region = RadialDockRegion.LEFT, edgePadding = 12f, canvasGap = 12f,\n        )\n        assertEquals(230f, 120f + result.x, 0.001f)\n    }\n\n    @Test\n    fun rightNodeCannotEnterCanvas() {\n        val result = clampRadialDockOffset(\n            originX = 980f, originY = 220f, requestedOffset = RadialDockOffset(-900f, 0f),\n            nodeWidth = 58f, nodeHeight = 76f, workspaceWidth = 1200f, workspaceHeight = 800f,\n            canvas = canvas, region = RadialDockRegion.RIGHT, edgePadding = 12f, canvasGap = 12f,\n        )\n        assertEquals(912f, 980f + result.x, 0.001f)\n    }\n\n    @Test\n    fun bottomNodeCannotEnterCanvas() {\n        val result = clampRadialDockOffset(\n            originX = 570f, originY = 720f, requestedOffset = RadialDockOffset(0f, -500f),\n            nodeWidth = 58f, nodeHeight = 76f, workspaceWidth = 1200f, workspaceHeight = 900f,\n            canvas = canvas, region = RadialDockRegion.BOTTOM, edgePadding = 12f, canvasGap = 12f,\n        )\n        assertEquals(712f, 720f + result.y, 0.001f)\n    }\n\n    @Test\n    fun nodeAlwaysRemainsOnScreen() {\n        val result = clampRadialDockOffset(\n            originX = 120f, originY = 220f, requestedOffset = RadialDockOffset(-5000f, 5000f),\n            nodeWidth = 58f, nodeHeight = 76f, workspaceWidth = 1200f, workspaceHeight = 800f,\n            canvas = canvas, region = RadialDockRegion.LEFT, edgePadding = 12f, canvasGap = 12f,\n        )\n        val x = 120f + result.x\n        val y = 220f + result.y\n        assertTrue(x >= 12f)\n        assertTrue(y <= 712f)\n    }\n\n    @Test\n    fun validOriginalPositionRemainsUnchanged() {\n        val result = clampRadialDockOffset(\n            originX = 120f, originY = 220f, requestedOffset = RadialDockOffset(0f, 0f),\n            nodeWidth = 58f, nodeHeight = 76f, workspaceWidth = 1200f, workspaceHeight = 800f,\n            canvas = canvas, region = RadialDockRegion.LEFT, edgePadding = 12f, canvasGap = 12f,\n        )\n        assertEquals(0f, result.x, 0.001f)\n        assertEquals(0f, result.y, 0.001f)\n    }\n}\n''')

registry = "docs/FEATURE_PARITY_REGISTRY.json"
replace_once(
    registry,
    '{"id":"node-dragging","status":"verified","evidence":["Galaxy Tab recordings"]}',
    '{"id":"node-dragging","status":"implemented_unverified","evidence":["Galaxy Tab recordings","RadialDocking.kt","RadialDockingTest.kt"]}',
)
replace_once(
    registry,
    '{"id":"visible-drawing","status":"implemented_unverified","evidence":["engine-gl/src/main/kotlin/com/inkframe/engine/gl/CpuStrokeRasterizer.kt","commit f750ca4"]}',
    '{"id":"visible-drawing","status":"implemented_unverified","evidence":["CanvasView.kt:setZOrderOnTop","CpuStrokeRasterizer.kt"]}',
)

changelog = "CHANGELOG.md"
replace_once(
    changelog,
    "## [Unreleased]\n\n",
    "## [Unreleased]\n\n### Native Android — bounded radial docking\n- Preserved movable Glass Horizon primary nodes while constraining each to its left, right, or lower command zone.\n- Prevented node bodies from covering the drawing stage or leaving the visible workspace.\n- Added a Studio `Reset UI` action and unit-tested docking geometry across command zones.\n\n",
)
