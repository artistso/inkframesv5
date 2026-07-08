package com.inkframe.studio

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.inkframe.feature.canvas.StudioScreen

private val InkFrameColorScheme = darkColorScheme(
    primary = Color(0xFFBB5CFF),
    secondary = Color(0xFFFFC7E8),
    background = Color(0xFF1E1E22),
    surface = Color(0xFF26262B),
    onPrimary = Color.White,
    onSecondary = Color(0xFF1E1E22),
    onBackground = Color.White,
    onSurface = Color.White,
)

/**
 * InkFrame Studio — native Android entry point.
 *
 * The web prototype proved the Glass Horizon workflow; the production tablet app now boots
 * directly into the Kotlin/Compose studio backed by the OpenGL paint engine. This removes
 * WebView from the hot path so stylus input, canvas rendering, project IO, and exports can
 * use Android-native primitives.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContent {
            MaterialTheme(colorScheme = InkFrameColorScheme) {
                StudioScreen()
            }
        }

        hideSystemBars()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
    }

    private fun hideSystemBars() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }
}
