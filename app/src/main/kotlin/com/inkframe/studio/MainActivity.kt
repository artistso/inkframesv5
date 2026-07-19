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
import com.inkframe.core.model.InkFrameDefaults
import com.inkframe.feature.canvas.CanvasView
import com.inkframe.feature.canvas.HoldAwareGlassHorizonScreen
import com.inkframe.feature.canvas.StudioState

/**
 * Native InkFrame application host.
 *
 * Kotlin, Compose and OpenGL own the complete application surface. No WebView, JavaScript bridge,
 * browser storage, or packaged web application participates in startup.
 *
 * [HoldAwareGlassHorizonScreen] is the artist-facing workspace. Android/Compose hit-testing owns
 * input arbitration: direct contact on the embedded [CanvasView] draws, while visible Compose
 * controls above or beside it retain priority. The Activity must never pre-route a gesture merely
 * because its coordinates fall inside CanvasView's global rectangle.
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
                HoldAwareGlassHorizonScreen(state = studioState)
            }
        }

        installStylusLens()
        window.decorView.post { currentNativeCanvas() }
        hideSystemBars()
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        observeStylus(event)
        // Normal hierarchy dispatch is mandatory here. Pre-routing by CanvasView's global bounds
        // bypasses Compose hit-testing and can turn a tap on a radial control into an ink stroke.
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

    private fun restoreOriginalDefaultsIfPristine() {
        val current = studioState.project
        val migrated = InkFrameDefaults.migrateUntouchedLegacyNativePlaceholder(current)
        if (migrated !== current) studioState.replaceProject(migrated)
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
        nativeCanvas = findViewById<ViewGroup>(android.R.id.content).findCanvasView()?.also { canvas ->
            canvas.isClickable = true
            canvas.isFocusable = true
        }
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
        getChildAt(index).findCanvasView()?.let { return it }
    }
    return null
}
