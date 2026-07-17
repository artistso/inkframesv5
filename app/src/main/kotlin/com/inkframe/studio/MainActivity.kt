package com.inkframe.studio

import android.graphics.Rect
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.inkframe.core.model.CanvasSpec
import com.inkframe.core.model.Layer
import com.inkframe.core.model.Project
import com.inkframe.core.model.RgbaColor
import com.inkframe.core.model.Scene
import com.inkframe.feature.canvas.CanvasView
import com.inkframe.feature.canvas.GlassHorizonScreen
import com.inkframe.feature.canvas.StudioState

/**
 * Native InkFrame application host.
 *
 * Kotlin, Compose and OpenGL own the complete application surface. No WebView, JavaScript bridge,
 * browser storage, or packaged web application participates in startup.
 */
class MainActivity : ComponentActivity() {

    private val studioState by viewModels<StudioState>()
    private lateinit var stylusLens: StylusLensOverlayView
    private var nativeCanvas: CanvasView? = null

    private val decorLayoutListener = View.OnLayoutChangeListener { view, _, _, _, _, _, _, _, _ ->
        if (::stylusLens.isInitialized) stylusLens.layout(0, 0, view.width, view.height)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        restoreOriginalDefaultsIfPristine()

        setContent {
            MaterialTheme {
                GlassHorizonScreen(state = studioState)
            }
        }

        installStylusLens()
        hideSystemBars()
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        observeStylus(event)
        return super.dispatchTouchEvent(event)
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        observeStylus(event)
        return super.dispatchGenericMotionEvent(event)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars() else if (::stylusLens.isInitialized) stylusLens.hideLens()
    }

    override fun onDestroy() {
        if (::stylusLens.isInitialized) {
            val decor = window.decorView as ViewGroup
            decor.removeOnLayoutChangeListener(decorLayoutListener)
            decor.overlay.remove(stylusLens)
        }
        super.onDestroy()
    }

    /**
     * The retired native prototype started with a 1280×720, 24 FPS, 24-frame placeholder.
     * Replace only that untouched placeholder with the original Glass Horizon document contract.
     * A loaded, renamed, resized, animated, layered, or drawn project is never modified here.
     */
    private fun restoreOriginalDefaultsIfPristine() {
        val project = studioState.project
        val scene = project.activeScene ?: return
        val untouchedLegacyPlaceholder =
            project.name == "Untitled" &&
                project.scenes.size == 1 &&
                project.canvas.widthPx == 1280 &&
                project.canvas.heightPx == 720 &&
                project.canvas.fps == 24 &&
                scene.frameCount == 24 &&
                scene.layers.size == 1 &&
                scene.layers.all { it.cels.isEmpty() }

        if (!untouchedLegacyPlaceholder) return

        val layer = Layer(name = "Layer 1")
        studioState.replaceProject(
            Project(
                name = "Canvas",
                canvas = CanvasSpec(
                    widthPx = 1024,
                    heightPx = 768,
                    fps = 12,
                    backgroundColor = RgbaColor.fromArgb(0xFFFFF0F3.toInt()),
                ),
                scenes = listOf(
                    Scene(
                        name = "Scene 1",
                        frameCount = 1,
                        layers = listOf(layer),
                    ),
                ),
            ),
        )
    }

    private fun installStylusLens() {
        val decor = window.decorView as ViewGroup
        stylusLens = StylusLensOverlayView(this)
        decor.overlay.add(stylusLens)
        decor.addOnLayoutChangeListener(decorLayoutListener)
        decor.post { stylusLens.layout(0, 0, decor.width, decor.height) }
    }

    private fun observeStylus(event: MotionEvent) {
        if (!::stylusLens.isInitialized || event.pointerCount <= 0) return

        val pointerIndex = event.firstStylusPointerIndex()
        if (pointerIndex < 0) {
            if (
                event.actionMasked == MotionEvent.ACTION_DOWN ||
                event.actionMasked == MotionEvent.ACTION_CANCEL ||
                event.actionMasked == MotionEvent.ACTION_HOVER_EXIT
            ) {
                stylusLens.hideLens()
            }
            return
        }

        val canvas = currentNativeCanvas()
        val overCanvas = canvas?.containsWindowPoint(
            event.getX(pointerIndex),
            event.getY(pointerIndex),
        ) == true
        stylusLens.observe(event, pointerIndex, overCanvas)
    }

    private fun currentNativeCanvas(): CanvasView? {
        nativeCanvas?.takeIf { it.isAttachedToWindow }?.let { return it }
        nativeCanvas = findViewById<ViewGroup>(android.R.id.content).findCanvasView()
        return nativeCanvas
    }

    private fun hideSystemBars() {
        WindowCompat.getInsetsController(window, window.decorView).apply {
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }
}

private fun MotionEvent.firstStylusPointerIndex(): Int {
    for (index in 0 until pointerCount) {
        val tool = getToolType(index)
        if (tool == MotionEvent.TOOL_TYPE_STYLUS || tool == MotionEvent.TOOL_TYPE_ERASER) {
            return index
        }
    }
    return -1
}

private fun CanvasView.containsWindowPoint(windowX: Float, windowY: Float): Boolean {
    val bounds = Rect()
    if (!getGlobalVisibleRect(bounds)) return false

    val decorLocation = IntArray(2)
    rootView.getLocationOnScreen(decorLocation)
    val screenX = windowX + decorLocation[0]
    val screenY = windowY + decorLocation[1]
    return bounds.contains(screenX.toInt(), screenY.toInt())
}

private fun View.findCanvasView(): CanvasView? {
    if (this is CanvasView) return this
    if (this !is ViewGroup) return null

    for (index in 0 until childCount) {
        childAt(index).findCanvasView()?.let { return it }
    }
    return null
}
