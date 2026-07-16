package com.inkframe.studio.nativeink

import android.content.ClipData
import android.content.ClipboardManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.annotation.RequiresApi
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Debug-only entry point for a controlled comparison between ordinary HWUI drawing and AndroidX
 * front-buffer rendering. Both modes consume the same Kotlin InkSample and InkMetrics pipeline.
 */
class NativeInkLabActivity : ComponentActivity() {
    private enum class RendererMode {
        BUFFERED,
        FRONT_BUFFER,
    }

    private lateinit var surfaceHost: FrameLayout
    private lateinit var inkSurface: InkLabSurface
    private lateinit var metricsText: TextView
    private lateinit var rendererHelp: TextView
    private lateinit var pointsButton: Button
    private lateinit var modeButton: Button
    private var rendererMode = RendererMode.BUFFERED

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        surfaceHost = FrameLayout(this).apply {
            setBackgroundColor(0xFF100A12.toInt())
        }
        metricsText = textView(sizeSp = 12f, color = 0xFFFFE9F0.toInt()).apply {
            typeface = android.graphics.Typeface.MONOSPACE
            setLineSpacing(0f, 1.08f)
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        val title = textView(sizeSp = 17f, color = Color.WHITE).apply {
            text = "NATIVE INK LAB · CONTROLLED RENDERER A/B"
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        val instructions = textView(sizeSp = 11f, color = 0xFFD8BCC9.toInt()).apply {
            text = "Run the same S Pen sequence in each mode · pressure, history, hover, eraser and palm handling remain identical"
        }
        rendererHelp = textView(sizeSp = 10f, color = 0xFFAEDDE8.toInt()).apply {
            setLineSpacing(0f, 1.08f)
        }

        modeButton = controlButton("MODE: BUFFERED") {
            val requested = when (rendererMode) {
                RendererMode.BUFFERED -> RendererMode.FRONT_BUFFER
                RendererMode.FRONT_BUFFER -> RendererMode.BUFFERED
            }
            installRenderer(requested, announce = true)
        }
        val clearButton = controlButton("CLEAR") {
            inkSurface.clearInk()
            refreshMetrics(inkSurface, inkSurface.metricsSnapshot())
            toast("Native ink and metrics cleared")
        }
        pointsButton = controlButton("POINTS OFF") {
            inkSurface.showSamplePoints = !inkSurface.showSamplePoints
            updatePointsButton()
        }
        val copyButton = controlButton("COPY METRICS") {
            val report = comparisonReport()
            val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("InkFrame native renderer metrics", report))
            toast("Renderer comparison metrics copied")
        }
        val closeButton = controlButton("CLOSE") { finish() }

        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            addView(modeButton)
            addView(clearButton)
            addView(pointsButton)
            addView(copyButton)
            addView(closeButton)
        }

        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            backgroundTintList = ColorStateList.valueOf(0xE81D101B.toInt())
            setBackgroundColor(0xE81D101B.toInt())
            elevation = dp(8).toFloat()
            addView(title)
            addView(instructions, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(3) })
            addView(rendererHelp, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(5) })
            addView(metricsText, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(8) })
            addView(controls, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(8) })
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(0xFF100A12.toInt())
            addView(surfaceHost, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ))
            addView(panel, FrameLayout.LayoutParams(
                minOf(dp(720), resources.displayMetrics.widthPixels - dp(28)),
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.START,
            ).apply {
                leftMargin = dp(14)
                topMargin = dp(14)
            })
        }

        setContentView(root)
        installRenderer(RendererMode.BUFFERED, announce = false)
        hideSystemBars()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onPause() {
        if (::inkSurface.isInitialized) inkSurface.cancelActiveInput()
        super.onPause()
    }

    override fun onDestroy() {
        if (::inkSurface.isInitialized) inkSurface.release()
        super.onDestroy()
    }

    private fun installRenderer(requestedMode: RendererMode, announce: Boolean) {
        val supportedMode = if (
            requestedMode == RendererMode.FRONT_BUFFER &&
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
        ) {
            RendererMode.BUFFERED
        } else {
            requestedMode
        }
        val pointsVisible = if (::inkSurface.isInitialized) inkSurface.showSamplePoints else false

        if (::inkSurface.isInitialized) {
            inkSurface.metricsListener = null
            inkSurface.cancelActiveInput()
            inkSurface.release()
        }
        surfaceHost.removeAllViews()

        rendererMode = supportedMode
        val installedSurface: InkLabSurface = when (supportedMode) {
            RendererMode.BUFFERED -> NativeInkSurfaceView(this)
            RendererMode.FRONT_BUFFER -> createFrontBufferedSurface()
        }
        inkSurface = installedSurface
        installedSurface.showSamplePoints = pointsVisible
        installedSurface.metricsListener = { snapshot ->
            if (::inkSurface.isInitialized && inkSurface === installedSurface) {
                refreshMetrics(installedSurface, snapshot)
            }
        }
        surfaceHost.addView(
            installedSurface.displayView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        refreshMetrics(installedSurface, installedSurface.metricsSnapshot())
        updateModeControls()
        updatePointsButton()

        if (announce) {
            if (requestedMode != supportedMode) {
                toast("Front buffering requires Android 10 or newer")
            } else {
                toast("Renderer changed; ink and metrics restarted")
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun createFrontBufferedSurface(): InkLabSurface = FrontBufferedInkSurfaceView(this)

    private fun refreshMetrics(surface: InkLabSurface, snapshot: InkMetricsSnapshot) {
        metricsText.text = buildString {
            appendLine(surface.rendererLabel)
            append(snapshot.compactText())
        }
    }

    private fun updateModeControls() {
        modeButton.text = when (rendererMode) {
            RendererMode.BUFFERED -> "MODE: BUFFERED"
            RendererMode.FRONT_BUFFER -> "MODE: FRONT"
        }
        modeButton.isActivated = rendererMode == RendererMode.FRONT_BUFFER
        modeButton.isEnabled = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        modeButton.contentDescription = when {
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ->
                "Buffered renderer active. Front buffering requires Android 10 or newer."
            rendererMode == RendererMode.BUFFERED ->
                "Buffered renderer active. Activate to switch to front-buffer rendering and reset the test."
            else ->
                "Front-buffer renderer active. Activate to switch to buffered rendering and reset the test."
        }
        rendererHelp.text = when {
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ->
                "Buffered HWUI baseline · unbuffered MotionEvent delivery requested · front buffer unavailable below API 29"
            rendererMode == RendererMode.BUFFERED ->
                "Buffered HWUI baseline · unbuffered MotionEvent delivery requested · tap MODE to start a fresh front-buffer test"
            else ->
                "AndroidX front buffer 1.0.4 · active segments render immediately, then commit on pen-up · no motion prediction"
        }
    }

    private fun updatePointsButton() {
        val visible = ::inkSurface.isInitialized && inkSurface.showSamplePoints
        pointsButton.text = if (visible) "POINTS ON" else "POINTS OFF"
        pointsButton.isActivated = visible
        pointsButton.contentDescription = if (visible) {
            "Sample point visualization enabled"
        } else {
            "Sample point visualization disabled"
        }
    }

    private fun comparisonReport(): String = buildString {
        appendLine("InkFrame Native Renderer Comparison")
        appendLine("device=${Build.MANUFACTURER} ${Build.MODEL}")
        appendLine("android=${Build.VERSION.RELEASE}")
        appendLine("sdk=${Build.VERSION.SDK_INT}")
        appendLine("rendererLabel=${inkSurface.rendererLabel}")
        append(inkSurface.rendererReport())
        append(inkSurface.metricsSnapshot().reportText())
        appendLine("note=Delivery latency is MotionEvent delivery delay, not full pen-to-photon latency.")
        appendLine("motionPrediction=false")
    }

    private fun hideSystemBars() {
        WindowCompat.getInsetsController(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun controlButton(label: String, action: () -> Unit): Button = Button(this).apply {
        text = label
        textSize = 10f
        isAllCaps = false
        setTextColor(Color.WHITE)
        backgroundTintList = ColorStateList.valueOf(0xFF6A1646.toInt())
        minHeight = dp(38)
        minWidth = dp(88)
        setPadding(dp(10), 0, dp(10), 0)
        setOnClickListener { action() }
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            dp(40),
        ).apply { marginStart = dp(6) }
    }

    private fun textView(sizeSp: Float, color: Int): TextView = TextView(this).apply {
        textSize = sizeSp
        setTextColor(color)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
