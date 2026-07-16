package com.inkframe.studio.nativeink

import android.content.ClipData
import android.content.ClipboardManager
import android.content.res.ColorStateList
import android.graphics.Color
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
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Debug-only entry point for measuring Kotlin/MotionEvent ink behavior on a
 * physical Android tablet before replacing the production WebView canvas.
 */
class NativeInkLabActivity : ComponentActivity() {
    private lateinit var inkSurface: NativeInkSurfaceView
    private lateinit var metricsText: TextView
    private lateinit var pointsButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        inkSurface = NativeInkSurfaceView(this)
        metricsText = textView(sizeSp = 12f, color = 0xFFFFE9F0.toInt()).apply {
            typeface = android.graphics.Typeface.MONOSPACE
            setLineSpacing(0f, 1.08f)
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        val title = textView(sizeSp = 17f, color = Color.WHITE).apply {
            text = "NATIVE INK LAB · KOTLIN / MOTIONEVENT"
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        val instructions = textView(sizeSp = 11f, color = 0xFFD8BCC9.toInt()).apply {
            text = "Draw with S Pen · hover to inspect range · reverse/eraser tool clears ink locally · finger contacts are ignored"
        }

        val clearButton = controlButton("CLEAR") {
            inkSurface.clearInk()
            toast("Native ink cleared")
        }
        pointsButton = controlButton("POINTS OFF") {
            inkSurface.showSamplePoints = !inkSurface.showSamplePoints
            pointsButton.text = if (inkSurface.showSamplePoints) "POINTS ON" else "POINTS OFF"
            pointsButton.isActivated = inkSurface.showSamplePoints
        }
        val copyButton = controlButton("COPY METRICS") {
            val report = inkSurface.metricsSnapshot().reportText()
            val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("InkFrame native ink metrics", report))
            toast("Native ink metrics copied")
        }
        val closeButton = controlButton("CLOSE") { finish() }

        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
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
            addView(inkSurface, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ))
            addView(panel, FrameLayout.LayoutParams(
                dp(520),
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.START,
            ).apply {
                leftMargin = dp(14)
                topMargin = dp(14)
            })
        }

        inkSurface.metricsListener = { snapshot -> metricsText.text = snapshot.compactText() }
        metricsText.text = inkSurface.metricsSnapshot().compactText()
        setContentView(root)
        hideSystemBars()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
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
