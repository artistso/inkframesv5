package com.inkframe.feature.canvas

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * Adds the explicit frame-exposure control to the native Glass Horizon workspace.
 *
 * The compact vertical control sits in the right command field rather than above the
 * drawing stage. This keeps it outside CanvasView's direct MotionEvent routing on compact
 * landscape layouts while the full radial timing hierarchy is ported in later slices.
 */
@Composable
fun HoldAwareGlassHorizonScreen(state: StudioState = viewModel()) {
    Box(Modifier.fillMaxSize()) {
        ClosedBetaGlassHorizonScreen(state = state)

        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 8.dp)
                .clip(HoldPillShape)
                .background(Color(0xB31A001A))
                .border(1.dp, Color(0x99F7CAC9), HoldPillShape)
                .padding(horizontal = 5.dp, vertical = 7.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            HoldGlassButton(
                label = "+",
                actionLabel = "Increase frame hold",
                enabled = state.currentHold < 8,
            ) {
                state.adjustCurrentHold(1)
            }
            BasicText(
                text = "HOLD\n${state.currentHold}",
                modifier = Modifier.padding(vertical = 2.dp),
                style = TextStyle(
                    color = Color(0xFFFFF0F3),
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp,
                    lineHeight = 13.sp,
                    letterSpacing = 0.5.sp,
                    textAlign = TextAlign.Center,
                ),
            )
            HoldGlassButton(
                label = "−",
                actionLabel = "Decrease frame hold",
                enabled = state.currentHold > 1,
            ) {
                state.adjustCurrentHold(-1)
            }
        }
    }
}

private val HoldPillShape = RoundedCornerShape(percent = 50)

@Composable
private fun HoldGlassButton(
    label: String,
    actionLabel: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val foreground = if (enabled) Color(0xFFFFF0F3) else Color(0x66FFF0F3)
    val fill = if (enabled) Color(0x33F7CAC9) else Color(0x14F7CAC9)
    val stroke = if (enabled) Color(0x99F7CAC9) else Color(0x44F7CAC9)

    Box(
        modifier = Modifier
            .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
            .clip(HoldPillShape)
            .background(fill)
            .border(1.dp, stroke, HoldPillShape)
            .clickable(
                enabled = enabled,
                onClickLabel = actionLabel,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = label,
            style = TextStyle(
                color = foreground,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp,
            ),
        )
    }
}
