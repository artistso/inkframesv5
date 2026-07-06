package com.inkframe.studio

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color
import androidx.core.view.WindowCompat
import com.inkframe.feature.canvas.StudioScreen

/**
 * InkFrame Studio — entry point.
 *
 * The full experience is the native Kotlin/Compose UI backed by the OpenGL ES 3.0
 * paint engine (StudioScreen + CanvasView + PaintEngine). The old WebView shell has
 * been retired; all brushstroke logic now runs natively for proper pressure, tilt,
 * and velocity sensitivity.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Immersive canvas: draw behind system bars, keep screen on.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary   = Color(0xFFB388FF),
                    secondary = Color(0xFF7C4DFF),
                    background = Color(0xFF1A001A),
                    surface   = Color(0xFF26262B),
                ),
            ) {
                StudioScreen()
            }
        }
    }
}
