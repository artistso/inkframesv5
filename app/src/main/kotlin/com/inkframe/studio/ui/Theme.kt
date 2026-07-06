package com.inkframe.studio.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Accent = Color(0xFF4F9CF9)

private val DarkColors = darkColorScheme(
    primary = Accent,
    secondary = Color(0xFF8E6CEF),
    background = Color(0xFF1E1E22),
    surface = Color(0xFF26262B),
)

private val LightColors = lightColorScheme(
    primary = Accent,
    secondary = Color(0xFF8E6CEF),
)

@Composable
fun InkFrameTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
