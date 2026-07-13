package com.inkframe.studio

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Native Glass Horizon handoff shown before the WebView studio starts.
 *
 * The supplied portrait artwork is rendered with CENTER_CROP because InkFrame is
 * landscape-first. Its focal nib and orbital arc remain centered on phones and
 * tablets without stretching the image into a different aspect ratio.
 */
class SplashActivity : ComponentActivity() {

    private var studioLaunched = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val splashArt = ImageView(this).apply {
            setImageResource(R.drawable.inkframe_splash)
            scaleType = ImageView.ScaleType.CENTER_CROP
            contentDescription = null
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        val root = FrameLayout(this).apply {
            setBackgroundColor(BACKGROUND_COLOR)
            addView(
                splashArt,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
            alpha = 0f
        }

        setContentView(root)
        hideSystemBars()

        root.animate()
            .alpha(1f)
            .setDuration(FADE_IN_MS)
            .start()

        root.postDelayed({ launchStudio(root) }, DISPLAY_MS)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    @Deprecated("Deprecated in Android API 33; retained for the minimum SDK surface.")
    override fun onBackPressed() {
        finishAffinity()
    }

    private fun launchStudio(root: View) {
        if (studioLaunched || isFinishing || isDestroyed) return
        studioLaunched = true

        root.animate()
            .alpha(0f)
            .setDuration(FADE_OUT_MS)
            .withEndAction {
                startActivity(
                    Intent(this, MainActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION),
                )
                @Suppress("DEPRECATION")
                overridePendingTransition(0, 0)
                finish()
            }
            .start()
    }

    private fun hideSystemBars() {
        WindowCompat.getInsetsController(window, window.decorView).apply {
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    private companion object {
        const val DISPLAY_MS = 650L
        const val FADE_IN_MS = 140L
        const val FADE_OUT_MS = 180L
        const val BACKGROUND_COLOR = 0xFF0A0010.toInt()
    }
}
