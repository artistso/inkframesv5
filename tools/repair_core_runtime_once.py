from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


canvas = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/CanvasView.kt"
replace_once(canvas, "import android.content.Context\n", "import android.content.Context\nimport android.graphics.PixelFormat\n")
replace_once(
    canvas,
    """        setEGLContextClientVersion(3)
        setEGLConfigChooser(8, 8, 8, 8, 0, 0)
""",
    """        setEGLContextClientVersion(3)
        setEGLConfigChooser(8, 8, 8, 8, 0, 0)
        setZOrderOnTop(true)
        holder.setFormat(PixelFormat.RGBA_8888)
        isClickable = true
        isFocusable = true
""",
)
replace_once(
    canvas,
    """            MotionEvent.ACTION_DOWN -> {
                when {
""",
    """            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                when {
""",
)

state = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/StudioState.kt"
replace_once(
    state,
    "    fun togglePlay() { isPlaying = !isPlaying }\n",
    """    fun togglePlay() {
        if (isPlaying) {
            isPlaying = false
            return
        }
        val range = PlaybackOps.clampRange(scene.playbackRange, scene.frameCount)
        if (PlaybackOps.length(range) <= 1) {
            isPlaying = false
            statusMessage = "ADD AT LEAST 2 FRAMES TO PLAY"
            return
        }
        if (currentFrame !in range || currentFrame == range.last) currentFrame = range.first
        isPlaying = true
    }
""",
)
replace_once(
    state,
    """    fun insertFrame() {
        updateScene { TimelineOps.insertFrames(it, currentFrame, 1) }
    }
""",
    """    fun insertFrame() {
        val insertionFrame = (currentFrame + 1).coerceAtMost(scene.frameCount)
        updateScene { currentScene ->
            val inserted = TimelineOps.insertFrames(currentScene, insertionFrame, 1)
            inserted.copy(playbackRange = PlaybackOps.fullRange(inserted.frameCount))
        }
        currentFrame = insertionFrame
        isPlaying = false
    }
""",
)

main = "app/src/main/kotlin/com/inkframe/studio/MainActivity.kt"
replace_once(main, "import com.inkframe.feature.canvas.GlassHorizonRecoveryScreen\n", "import com.inkframe.feature.canvas.GlassHorizonScreen\n")
replace_once(main, "                GlassHorizonRecoveryScreen(state = studioState)\n", "                GlassHorizonScreen(state = studioState)\n")
replace_once(
    main,
    """ *
 * The temporary [GlassHorizonRecoveryScreen] delegates to the real GlassHorizonScreen while basic
 * drawing and playback are revalidated on the Galaxy Tab. It is not a replacement design.
""",
    """ *
 * [GlassHorizonScreen] is the sole artist-facing workspace. Canvas contact is routed directly to
 * the native drawing surface so Compose overlays cannot swallow S Pen or finger strokes.
""",
)
replace_once(
    main,
    """    private lateinit var stylusLens: StylusLensOverlayView
    private var nativeCanvas: CanvasView? = null
""",
    """    private lateinit var stylusLens: StylusLensOverlayView
    private var nativeCanvas: CanvasView? = null
    private var routingCanvasGesture = false
""",
)
replace_once(
    main,
    """        installStylusLens()
        hideSystemBars()
""",
    """        installStylusLens()
        window.decorView.post { currentNativeCanvas() }
        hideSystemBars()
""",
)
replace_once(
    main,
    """    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        observeStylus(event)
        return super.dispatchTouchEvent(event)
    }
""",
    """    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        observeStylus(event)
        val canvas = currentNativeCanvas()
        if (canvas != null) {
            if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                routingCanvasGesture = canvas.containsWindowPoint(event.x, event.y)
            }
            if (routingCanvasGesture) {
                val routed = event.copyFor(canvas)
                val handled = canvas.dispatchTouchEvent(routed)
                routed.recycle()
                if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
                    routingCanvasGesture = false
                }
                if (handled) return true
            }
        }
        return super.dispatchTouchEvent(event)
    }
""",
)
replace_once(
    main,
    """    private fun currentNativeCanvas(): CanvasView? {
        nativeCanvas?.takeIf { it.isAttachedToWindow }?.let { return it }
        nativeCanvas = findViewById<ViewGroup>(android.R.id.content).findCanvasView()
        return nativeCanvas
    }
""",
    """    private fun currentNativeCanvas(): CanvasView? {
        nativeCanvas?.takeIf { it.isAttachedToWindow }?.let { return it }
        nativeCanvas = findViewById<ViewGroup>(android.R.id.content).findCanvasView()?.also { canvas ->
            canvas.isClickable = true
            canvas.isFocusable = true
        }
        return nativeCanvas
    }
""",
)
replace_once(
    main,
    "private fun MotionEvent.firstStylusPointerIndex(): Int {\n",
    """private fun MotionEvent.copyFor(canvas: CanvasView): MotionEvent {
    val copy = MotionEvent.obtain(this)
    val canvasLocation = IntArray(2)
    val rootLocation = IntArray(2)
    canvas.getLocationOnScreen(canvasLocation)
    canvas.rootView.getLocationOnScreen(rootLocation)
    copy.offsetLocation(
        (rootLocation[0] - canvasLocation[0]).toFloat(),
        (rootLocation[1] - canvasLocation[1]).toFloat(),
    )
    return copy
}

private fun MotionEvent.firstStylusPointerIndex(): Int {
""",
)

screen = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/GlassHorizonScreen.kt"
replace_once(screen, "modifier = modifier.padding(top = 8.dp)", "modifier = modifier.padding(top = 14.dp)")
replace_once(screen, "fontSize = 24.sp,\n                letterSpacing = 5.2.sp,", "fontSize = 20.sp,\n                letterSpacing = 4.4.sp,")
replace_once(screen, "fontSize = 11.sp,\n            fontWeight = FontWeight.ExtraBold,\n            letterSpacing = 3.1.sp,", "fontSize = 10.sp,\n            fontWeight = FontWeight.ExtraBold,\n            letterSpacing = 2.8.sp,")
replace_once(screen, ".offset(x = point.first - 10.dp, y = point.second - 10.dp)\n                    .size(20.dp)", ".offset(x = point.first - 9.dp, y = point.second - 9.dp)\n                    .size(18.dp)")
replace_once(screen, ".size(60.dp)\n                .pointerInput(node)", ".size(58.dp)\n                .pointerInput(node)")
replace_once(screen, "NodeGlyph(node, Modifier.size(29.dp))", "NodeGlyph(node, Modifier.size(26.dp))")
replace_once(screen, ".size(50.dp)\n                .shadow(if (action.selected)", ".size(48.dp)\n                .shadow(if (action.selected)")

test = Path("feature-canvas/src/test/kotlin/com/inkframe/feature/canvas/StudioStatePlaybackTest.kt")
test.write_text(
    """package com.inkframe.feature.canvas

import com.inkframe.core.model.InkFrameDefaults
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StudioStatePlaybackTest {
    @Test
    fun insertFrameAddsAfterCurrentAndExpandsPlaybackRange() {
        val state = StudioState()
        state.replaceProject(InkFrameDefaults.newProject())
        state.insertFrame()
        assertEquals(2, state.scene.frameCount)
        assertEquals(1, state.currentFrame)
        assertEquals(0..1, state.scene.playbackRange)
    }

    @Test
    fun playbackRestartsAtRangeStartWhenPressedAtEnd() {
        val state = StudioState()
        state.replaceProject(InkFrameDefaults.newProject())
        state.insertFrame()
        state.togglePlay()
        assertTrue(state.isPlaying)
        assertEquals(0, state.currentFrame)
        state.stop()
        assertFalse(state.isPlaying)
    }

    @Test
    fun oneFrameProjectDoesNotPretendToPlay() {
        val state = StudioState()
        state.replaceProject(InkFrameDefaults.newProject())
        state.togglePlay()
        assertFalse(state.isPlaying)
        assertEquals("ADD AT LEAST 2 FRAMES TO PLAY", state.statusMessage)
    }
}
"""
)
