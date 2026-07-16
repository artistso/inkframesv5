package com.inkframe.studio

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.FrameLayout
import com.inkframe.studio.nativeink.NativeStudioHostLayout
import com.inkframe.studio.nativeink.NativeStudioInkOverlay
import org.json.JSONObject
import java.util.WeakHashMap
import kotlin.math.roundToInt

/**
 * Application-level migration host for the full original InkFrame studio.
 *
 * The existing MainActivity, WebView UI, timelines, panels and export bridges remain untouched.
 * After MainActivity creates its WebView, this application wraps it with a transparent native S Pen
 * surface and installs the coarse JavaScript bridge used to replay completed strokes through the
 * original Brush Engine V2 project/frame/layer model.
 */
open class InkFrameStudioApplication : Application(), Application.ActivityLifecycleCallbacks {
    private val controllers = WeakHashMap<Activity, NativeStudioController>()

    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(this)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        if (activity !is MainActivity) return
        activity.window.decorView.post {
            if (activity.isFinishing || activity.isDestroyed || controllers.containsKey(activity)) return@post
            NativeStudioController.install(activity)?.let { controllers[activity] = it }
        }
    }

    override fun onActivityResumed(activity: Activity) {
        controllers[activity]?.resume()
    }

    override fun onActivityPaused(activity: Activity) {
        controllers[activity]?.pause()
    }

    override fun onActivityDestroyed(activity: Activity) {
        controllers.remove(activity)?.destroy()
    }

    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityStopped(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
}

private class NativeStudioController private constructor(
    private val activity: MainActivity,
    private val host: NativeStudioHostLayout,
    private val webView: WebView,
    private val overlay: NativeStudioInkOverlay,
) {
    private val bridge = StudioBridge()
    private var destroyed = false
    private var pendingConfiguration: String? = null

    init {
        webView.addJavascriptInterface(bridge, BRIDGE_NAME)
        overlay.onStrokeComplete = ::replayCompletedStroke
        // MainActivity begins loading immediately before ActivityLifecycleCallbacks runs. Restart the
        // bundled page once so the JavaScript interface is guaranteed to exist during script setup.
        webView.stopLoading()
        webView.loadUrl(STUDIO_URL)
    }

    fun resume() {
        if (destroyed) return
        pendingConfiguration?.let(::applyConfiguration)
    }

    fun pause() {
        overlay.cancelStroke()
    }

    fun destroy() {
        destroyed = true
        overlay.onStrokeComplete = null
        overlay.cancelStroke()
        webView.removeJavascriptInterface(BRIDGE_NAME)
    }

    private fun applyConfiguration(serialized: String) {
        if (destroyed) return
        if (host.width <= 0 || host.height <= 0 || webView.width <= 0 || webView.height <= 0) {
            pendingConfiguration = serialized
            host.post { pendingConfiguration?.let(::applyConfiguration) }
            return
        }

        val value = try {
            JSONObject(serialized)
        } catch (error: Throwable) {
            Log.w(TAG, "Ignoring invalid studio canvas configuration", error)
            return
        }
        if (value.optInt("schema", 0) != 1) return

        val viewportWidth = value.optDouble("viewportWidth", 0.0)
        val viewportHeight = value.optDouble("viewportHeight", 0.0)
        if (!viewportWidth.isFinite() || !viewportHeight.isFinite() || viewportWidth <= 0.0 || viewportHeight <= 0.0) {
            return
        }

        val scaleX = webView.width.toDouble() / viewportWidth
        val scaleY = webView.height.toDouble() / viewportHeight
        val rawLeft = (value.optDouble("left", 0.0) * scaleX).roundToInt()
        val rawTop = (value.optDouble("top", 0.0) * scaleY).roundToInt()
        val rawWidth = (value.optDouble("width", 0.0) * scaleX).roundToInt()
        val rawHeight = (value.optDouble("height", 0.0) * scaleY).roundToInt()

        val left = rawLeft.coerceIn(0, host.width.coerceAtLeast(1) - 1)
        val top = rawTop.coerceIn(0, host.height.coerceAtLeast(1) - 1)
        val width = rawWidth.coerceAtLeast(1).coerceAtMost(host.width - left)
        val height = rawHeight.coerceAtLeast(1).coerceAtMost(host.height - top)
        val canvasWidth = value.optInt("canvasWidth", 1).coerceAtLeast(1)
        val canvasHeight = value.optInt("canvasHeight", 1).coerceAtLeast(1)
        val brushSizeCanvasPx = value.optDouble("brushSize", 1.0).toFloat().coerceAtLeast(0.5f)
        val brushScale = width.toFloat() / canvasWidth.toFloat()

        val layout = (overlay.layoutParams as? FrameLayout.LayoutParams)
            ?: FrameLayout.LayoutParams(width, height)
        layout.width = width
        layout.height = height
        layout.leftMargin = left
        layout.topMargin = top
        overlay.layoutParams = layout
        overlay.bringToFront()

        overlay.applyConfiguration(
            NativeStudioInkOverlay.Configuration(
                enabled = value.optBoolean("enabled", false),
                contextToken = value.optString("contextToken", ""),
                canvasWidth = canvasWidth,
                canvasHeight = canvasHeight,
                brushColor = value.optInt("brushColor", DEFAULT_INK_COLOR),
                paperColor = value.optInt("paperColor", DEFAULT_PAPER_COLOR),
                brushSizeDisplayPx = brushSizeCanvasPx * brushScale,
                opacity = value.optDouble("opacity", 1.0).toFloat(),
                circularCanvas = value.optString("shape", "square") == "circle",
            ),
        )
        pendingConfiguration = null
    }

    private fun replayCompletedStroke(payload: String) {
        if (destroyed) {
            overlay.cancelStroke()
            return
        }
        val script = """
            (function(){
              if (!window.InkFrameNativeStudio || !window.InkFrameNativeStudio.replayStroke) {
                return JSON.stringify({ok:false,reason:'native-studio-js-unavailable'});
              }
              return window.InkFrameNativeStudio.replayStroke(${jsString(payload)});
            })();
        """.trimIndent()
        webView.evaluateJavascript(script) { result ->
            if (result != null && result.contains("\\\"ok\\\":false")) {
                Log.w(TAG, "Native stroke replay was rejected: $result")
            }
            overlay.finishReplay()
        }
    }

    private inner class StudioBridge {
        @JavascriptInterface
        fun bridgeVersion(): Int = 1

        @JavascriptInterface
        fun configureCanvas(serialized: String) {
            activity.runOnUiThread {
                pendingConfiguration = serialized
                applyConfiguration(serialized)
            }
        }
    }

    companion object {
        private const val TAG = "InkFrameNativeStudio"
        private const val BRIDGE_NAME = "InkFrameStudioNativeBridge"
        private const val STUDIO_URL = "file:///android_asset/index.html"
        private const val DEFAULT_PAPER_COLOR = 0xFFFFF0F3.toInt()
        private const val DEFAULT_INK_COLOR = 0xFF100A12.toInt()

        fun install(activity: MainActivity): NativeStudioController? {
            val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return null
            val webView = findWebView(content) ?: return null
            if (webView.parent is NativeStudioHostLayout) return null
            val parent = webView.parent as? ViewGroup ?: return null
            val index = parent.indexOfChild(webView)
            val originalLayout = webView.layoutParams

            parent.removeView(webView)
            val host = NativeStudioHostLayout(activity).apply {
                layoutParams = originalLayout
                setBackgroundColor(android.graphics.Color.TRANSPARENT)
            }
            webView.layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            val overlay = NativeStudioInkOverlay(activity).apply {
                layoutParams = FrameLayout.LayoutParams(1, 1)
            }
            host.addView(webView)
            host.addView(overlay)
            host.attachRouting(webView, overlay)
            parent.addView(host, index, originalLayout)
            return NativeStudioController(activity, host, webView, overlay)
        }

        private fun findWebView(view: View): WebView? {
            if (view is WebView) return view
            if (view !is ViewGroup) return null
            for (index in 0 until view.childCount) {
                findWebView(view.getChildAt(index))?.let { return it }
            }
            return null
        }

        private fun jsString(value: String): String = buildString {
            append('"')
            value.forEach { ch ->
                when (ch) {
                    '\\' -> append("\\\\")
                    '"' -> append("\\\"")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    '\t' -> append("\\t")
                    else -> append(ch)
                }
            }
            append('"')
        }
    }
}
