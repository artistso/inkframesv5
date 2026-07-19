package com.inkframe.feature.canvas

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * Adds the explicit frame-exposure control to the native Glass Horizon workspace.
 *
 * The control sits outside the drawing stage and uses only Compose primitives. It does
 * not replace or approximate the Glass Horizon shell; it exposes the hold state now owned
 * by [StudioState] while the full radial timing hierarchy is ported in later slices.
 */
@Composable
fun HoldAwareGlassHorizonScreen(state: StudioState = viewModel()) {
    Box(Modifier.fillMaxSize()) {
        ClosedBetaGlassHorizonScreen(state = state)

        Row(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 78.dp, bottom = 86.dp)
                .clip(HoldPillShape)
                .background(Color(0xB31A001A))
                .border(1.dp, Color(0x99F7CAC9), HoldPillShape)
                .padding(horizontal = 7.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HoldGlassButton(
                label = "−",
                actionLabel = "Decrease frame hold",
                enabled = state.currentHold > 1,
            ) {
                state.adjustCurrentHold(-1)
            }
            BasicText(
                text = "HOLD ${state.currentHold}",
                modifier = Modifier.padding(horizontal = 4.dp),
                style = TextStyle(
                    color = Color(0xFFFFF0F3),
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    letterSpacing = 0.8.sp,
                ),
            )
            HoldGlassButton(
                label = "+",
                actionLabel = "Increase frame hold",
                enabled = state.currentHold < 8,
            ) {
                state.adjustCurrentHold(1)
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
