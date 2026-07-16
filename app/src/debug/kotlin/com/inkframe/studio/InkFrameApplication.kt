package com.inkframe.studio

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Application
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.util.WeakHashMap

/**
 * Debug-only native S Pen telemetry attachment.
 *
 * The production InkFrameApplication still installs the full-studio native canvas overlay. This
 * debug subclass adds non-consuming MotionEvent telemetry and the diagnostics JavaScript bridge.
 */
class DebugInkFrameApplication : InkFrameApplication(), Application.ActivityLifecycleCallbacks {
    private val attachments = WeakHashMap<WebView, Attachment>()

    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(this)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        if (!isDebuggable()) return
        activity.window.decorView.post { attachToFirstWebView(activity.window.decorView) }
    }

    @SuppressLint("AddJavascriptInterface")
    private fun attachToFirstWebView(root: View) {
        val webView = findWebView(root) ?: return
        if (attachments.containsKey(webView)) return

        val recorder = NativePenTraceRecorder()
        val capture = NativePenMotionCapture(recorder)
        val bridge = NativePenBridge(recorder)
        attachments[webView] = Attachment(recorder, capture, bridge)

        webView.addJavascriptInterface(bridge, BRIDGE_NAME)
        webView.setOnTouchListener { _, event ->
            capture.observe(webView, event)
            false
        }

        // addJavascriptInterface becomes visible on the next page load. The full-studio host also
        // performs one startup reload; this post executes only after the telemetry bridge exists.
        webView.post { webView.reload() }
    }

    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view !is ViewGroup) return null
        for (index in 0 until view.childCount) {
            findWebView(view.getChildAt(index))?.let { return it }
        }
        return null
    }

    private fun isDebuggable(): Boolean =
        (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    private class NativePenBridge(
        private val recorder: NativePenTraceRecorder,
    ) {
        @JavascriptInterface
        fun snapshotJson(): String = recorder.snapshotJson()

        @JavascriptInterface
        fun markWebPhase(phase: String?, pointerId: Int, webTimeStamp: Double) {
            recorder.markWebPhase(phase, pointerId, webTimeStamp)
        }

        @JavascriptInterface
        fun clear() {
            recorder.clear()
        }
    }

    private data class Attachment(
        val recorder: NativePenTraceRecorder,
        val capture: NativePenMotionCapture,
        val bridge: NativePenBridge,
    )

    override fun onActivityDestroyed(activity: Activity) {
        val root = activity.window.decorView
        findWebView(root)?.let { attachments.remove(it) }
    }

    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivityStopped(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit

    private companion object {
        const val BRIDGE_NAME = "InkFrameNativePenBridge"
    }
}
