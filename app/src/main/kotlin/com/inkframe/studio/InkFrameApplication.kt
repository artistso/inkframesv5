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
import com.inkframe.core.model.StudioBrushContext
import com.inkframe.core.model.StudioCanvasGeometry
import com.inkframe.core.model.StudioCanvasShape
import com.inkframe.core.model.StudioContextMirror
import com.inkframe.core.model.StudioContextSnapshot
import com.inkframe.core.model.StudioContextUpdate
import com.inkframe.core.model.StudioStrokeBinding
import com.inkframe.core.model.StudioStrokeValidation
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
    private val contextMirror = StudioContextMirror()
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
        contextMirror.clear()
        overlay.onStrokeComplete = null
        overlay.clearConfiguration()
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
            rejectConfiguration("invalid JSON", error)
            return
        }
        val snapshot = parseContextSnapshot(value)
        if (snapshot == null) {
            rejectConfiguration("invalid schema or context")
            return
        }
        if (contextMirror.update(snapshot) == StudioContextUpdate.REJECTED_INVALID) {
            rejectConfiguration("rejected by Kotlin context mirror")
            return
        }

        val viewportWidth = value.optDouble("viewportWidth", 0.0)
        val viewportHeight = value.optDouble("viewportHeight", 0.0)
        if (!viewportWidth.isFinite() || !viewportHeight.isFinite() || viewportWidth <= 0.0 || viewportHeight <= 0.0) {
            rejectConfiguration("invalid viewport geometry")
            return
        }

        val scaleX = webView.width.toDouble() / viewportWidth
        val scaleY = webView.height.toDouble() / viewportHeight
        val rawLeft = (snapshot.geometry.left * scaleX).roundToInt()
        val rawTop = (snapshot.geometry.top * scaleY).roundToInt()
        val rawWidth = (snapshot.geometry.width * scaleX).roundToInt()
        val rawHeight = (snapshot.geometry.height * scaleY).roundToInt()

        val left = rawLeft.coerceIn(0, host.width.coerceAtLeast(1) - 1)
        val top = rawTop.coerceIn(0, host.height.coerceAtLeast(1) - 1)
        val width = rawWidth.coerceAtLeast(1).coerceAtMost(host.width - left)
        val height = rawHeight.coerceAtLeast(1).coerceAtMost(host.height - top)
        val brushScale = width.toFloat() / snapshot.canvasWidth.toFloat()

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
                context = snapshot,
                brushSizeDisplayPx = snapshot.brush.sizeCanvasPx.toFloat() * brushScale,
            ),
        )
        pendingConfiguration = null
    }

    private fun rejectConfiguration(reason: String, error: Throwable? = null) {
        contextMirror.clear()
        overlay.clearConfiguration()
        if (error == null) {
            Log.w(TAG, "Ignoring studio canvas configuration: $reason")
        } else {
            Log.w(TAG, "Ignoring studio canvas configuration: $reason", error)
        }
    }

    private fun replayCompletedStroke(payload: String) {
        if (destroyed) {
            overlay.cancelStroke()
            return
        }
        val binding = parseStrokeBinding(payload)
        val validation = if (binding == null) {
            StudioStrokeValidation.INVALID_STROKE_CONTEXT
        } else {
            contextMirror.validate(binding)
        }
        if (validation != StudioStrokeValidation.ACCEPTED) {
            Log.w(TAG, "Native stroke rejected by Kotlin studio mirror: $validation")
            overlay.finishReplay()
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

    private fun parseContextSnapshot(value: JSONObject): StudioContextSnapshot? {
        if (value.optInt("schema", 0) != StudioContextSnapshot.CURRENT_SCHEMA) return null
        return StudioContextSnapshot(
            schema = value.optInt("schema", 0),
            enabled = value.optBoolean("enabled", false),
            contextToken = value.optString("contextToken", ""),
            baseContextToken = value.optString("baseContextToken", ""),
            contextRevision = value.optInt("contextRevision", -1),
            projectIndex = value.optInt("projectIndex", -1),
            frameIndex = value.optInt("frameIndex", -1),
            layerIndex = value.optInt("layerIndex", Int.MIN_VALUE),
            layerCount = value.optInt("layerCount", -1),
            backgroundActive = value.optBoolean("backgroundActive", false),
            canvasWidth = value.optInt("canvasWidth", 0),
            canvasHeight = value.optInt("canvasHeight", 0),
            shape = canvasShape(value.optString("shape", "")) ?: return null,
            geometry = StudioCanvasGeometry(
                left = value.optDouble("left", Double.NaN),
                top = value.optDouble("top", Double.NaN),
                width = value.optDouble("width", Double.NaN),
                height = value.optDouble("height", Double.NaN),
            ),
            brush = StudioBrushContext(
                id = value.optString("brushId", ""),
                colorArgb = value.optInt("brushColor", DEFAULT_INK_COLOR),
                paperColorArgb = value.optInt("paperColor", DEFAULT_PAPER_COLOR),
                sizeCanvasPx = value.optDouble("brushSize", Double.NaN),
                opacity = value.optDouble("opacity", Double.NaN),
            ),
        ).validatedOrNull()
    }

    private fun parseStrokeBinding(serialized: String): StudioStrokeBinding? {
        val value = try {
            JSONObject(serialized)
        } catch (_: Throwable) {
            return null
        }
        if (value.optInt("schema", 0) != StudioContextSnapshot.CURRENT_SCHEMA) return null
        return StudioStrokeBinding(
            schema = value.optInt("schema", 0),
            contextToken = value.optString("contextToken", ""),
            contextRevision = value.optInt("contextRevision", -1),
            projectIndex = value.optInt("projectIndex", -1),
            frameIndex = value.optInt("frameIndex", -1),
            layerIndex = value.optInt("layerIndex", Int.MIN_VALUE),
            layerCount = value.optInt("layerCount", -1),
            backgroundActive = value.optBoolean("backgroundActive", false),
            canvasWidth = value.optInt("canvasWidth", 0),
            canvasHeight = value.optInt("canvasHeight", 0),
            shape = canvasShape(value.optString("shape", "")) ?: return null,
            geometry = StudioCanvasGeometry(
                left = value.optDouble("canvasLeft", Double.NaN),
                top = value.optDouble("canvasTop", Double.NaN),
                width = value.optDouble("canvasDisplayWidth", Double.NaN),
                height = value.optDouble("canvasDisplayHeight", Double.NaN),
            ),
            brush = StudioBrushContext(
                id = value.optString("brushId", ""),
                colorArgb = value.optInt("brushColor", DEFAULT_INK_COLOR),
                paperColorArgb = value.optInt("paperColor", DEFAULT_PAPER_COLOR),
                sizeCanvasPx = value.optDouble("brushSize", Double.NaN),
                opacity = value.optDouble("opacity", Double.NaN),
            ),
        ).validatedOrNull()
    }

    private fun canvasShape(value: String): StudioCanvasShape? = when (value) {
        "square" -> StudioCanvasShape.SQUARE
        "circle" -> StudioCanvasShape.CIRCLE
        else -> null
    }

    private inner class StudioBridge {
        @JavascriptInterface
        fun bridgeVersion(): Int = 2

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
