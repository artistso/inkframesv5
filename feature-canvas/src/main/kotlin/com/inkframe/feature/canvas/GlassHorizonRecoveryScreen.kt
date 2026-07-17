package com.inkframe.feature.canvas

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.inkframe.core.model.PlaybackOps

/**
 * Functional-recovery host for the Glass Horizon workspace.
 *
 * The original screen remains intact while the device regression is isolated. This wrapper adds
 * one directly accessible play/pause control over the existing timeline rail, avoiding the hidden
 * Frames submenu during recovery testing. It must not be treated as visual-parity approval.
 */
@Composable
fun GlassHorizonRecoveryScreen(state: StudioState = viewModel()) {
    Box(Modifier.fillMaxSize()) {
        GlassHorizonScreen(state = state)

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .offset(y = (-17).dp)
                .size(42.dp)
                .shadow(15.dp, CircleShape, clip = false)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0xFFFFF0F3),
                            Color(0xFFF7CAC9),
                            Color(0xFFBB0037),
                            Color(0xFF880057),
                        ),
                    ),
                )
                .border(1.dp, Color.White.copy(alpha = 0.88f), CircleShape)
                .clickable { toggleRecoveredPlayback(state) },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = if (state.isPlaying) "Ⅱ" else "▶",
                color = Color(0xFF2A001A),
                fontSize = if (state.isPlaying) 18.sp else 20.sp,
                fontWeight = FontWeight.Black,
            )
        }
    }
}

internal fun recoveredPlaybackStartFrame(
    currentFrame: Int,
    playbackRange: IntRange,
    frameCount: Int,
    loop: Boolean,
): Int {
    val range = PlaybackOps.clampRange(playbackRange, frameCount)
    return when {
        currentFrame !in range -> range.first
        !loop && currentFrame == range.last -> range.first
        else -> currentFrame
    }
}

private fun toggleRecoveredPlayback(state: StudioState) {
    if (state.isPlaying) {
        state.stop()
        state.statusMessage = "PLAYBACK PAUSED · FRAME ${state.currentFrame + 1}"
        return
    }

    val startFrame = recoveredPlaybackStartFrame(
        currentFrame = state.currentFrame,
        playbackRange = state.scene.playbackRange,
        frameCount = state.scene.frameCount,
        loop = state.scene.loop,
    )
    state.setFrame(startFrame)
    state.togglePlay()
    state.statusMessage =
        "PLAYING · ${state.project.canvas.fps} FPS · FRAMES ${state.scene.playbackRange.first + 1}–${state.scene.playbackRange.last + 1}"
}
