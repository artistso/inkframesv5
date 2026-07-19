package com.inkframe.feature.canvas

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
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
import com.inkframe.core.model.BrushAdjustments
import com.inkframe.core.model.BrushLabPresets

/**
 * Adds the bounded parity controls currently layered over the native Glass Horizon shell.
 *
 * Hold timing, new-project, and Brush Lab launchers sit in the right command field, outside
 * CanvasView's direct MotionEvent routing. Dialog windows intercept input so S Pen interaction
 * with their controls cannot leak through and paint on the artwork beneath them.
 */
@Composable
fun HoldAwareGlassHorizonScreen(state: StudioState = viewModel()) {
    val brushSession = remember(state) { BrushLabSessionRegistry.forState(state) }
    var showBrushLab by rememberSaveable { mutableStateOf(false) }
    var showProjectCreator by rememberSaveable { mutableStateOf(false) }
    val observedBrush = state.brush

    // ClosedBetaGlassHorizonScreen still selects factory brushes directly. Reconcile that
    // brush-id transition with the ViewModel-associated session cache so each brush regains
    // its own live edits after tool switches and Activity configuration changes.
    LaunchedEffect(observedBrush) {
        val restored = brushSession.observe(observedBrush)
        if (restored != observedBrush) state.updateBrush { restored }
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        // CanvasView is constructed with immutable pixel dimensions. A fresh Project UUID is
        // therefore the correct recreation boundary for template/custom canvas size changes.
        key(state.project.id) {
            ClosedBetaGlassHorizonScreen(state = state)
        }
        val compactHeight = maxHeight < 420.dp

        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (compactHeight) {
                CompactHoldControl(
                    hold = state.currentHold,
                    onIncrease = { state.adjustCurrentHold(1) },
                    onDecrease = { state.adjustCurrentHold(-1) },
                )
            } else {
                HoldControl(
                    hold = state.currentHold,
                    onIncrease = { state.adjustCurrentHold(1) },
                    onDecrease = { state.adjustCurrentHold(-1) },
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                GlassCommandButton(
                    label = "NEW",
                    actionLabel = "Create a new project",
                    selected = showProjectCreator,
                    onClick = {
                        showBrushLab = false
                        showProjectCreator = true
                    },
                )
                GlassCommandButton(
                    label = "LAB",
                    actionLabel = "Open Brush Lab",
                    selected = showBrushLab,
                    onClick = {
                        state.updateBrush { current ->
                            brushSession.record(BrushAdjustments.normalized(current))
                        }
                        showProjectCreator = false
                        showBrushLab = true
                    },
                )
            }
        }
    }

    if (showBrushLab) {
        GlassBrushLabDialog(
            brush = state.brush,
            onChange = { transform ->
                state.updateBrush { current -> brushSession.record(transform(current)) }
            },
            onPreset = { preset ->
                state.updateBrush { current ->
                    brushSession.record(BrushLabPresets.apply(current, preset))
                }
                state.statusMessage = "BRUSH LAB · ${preset.displayName.uppercase()}"
            },
            onReset = {
                state.updateBrush { current -> brushSession.reset(current) }
                state.statusMessage = "BRUSH LAB · RESET ${state.brush.name.uppercase()}"
            },
            onDismiss = { showBrushLab = false },
        )
    }

    if (showProjectCreator) {
        GlassProjectCreatorDialog(
            onCreate = { project ->
                showProjectCreator = false
                state.replaceProject(project)
                state.statusMessage = buildString {
                    append("NEW · ")
                    append(project.name.uppercase())
                    append(" · ")
                    append(project.canvas.widthPx)
                    append("×")
                    append(project.canvas.heightPx)
                }
            },
            onDismiss = { showProjectCreator = false },
        )
    }
}

@Composable
private fun HoldControl(
    hold: Int,
    onIncrease: () -> Unit,
    onDecrease: () -> Unit,
) {
    Column(
        modifier = Modifier
            .clip(CommandPillShape)
            .background(Color(0xB31A001A))
            .border(1.dp, Color(0x99F7CAC9), CommandPillShape)
            .padding(horizontal = 5.dp, vertical = 7.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        HoldGlassButton(
            label = "+",
            actionLabel = "Increase frame hold",
            enabled = hold < 8,
            onClick = onIncrease,
        )
        HoldLabel(hold = hold, stacked = true)
        HoldGlassButton(
            label = "−",
            actionLabel = "Decrease frame hold",
            enabled = hold > 1,
            onClick = onDecrease,
        )
    }
}

/** Compact-height reflow that stays clear of the lower-right Glass Horizon command node. */
@Composable
private fun CompactHoldControl(
    hold: Int,
    onIncrease: () -> Unit,
    onDecrease: () -> Unit,
) {
    Row(
        modifier = Modifier
            .clip(CommandButtonShape)
            .background(Color(0xB31A001A))
            .border(1.dp, Color(0x99F7CAC9), CommandButtonShape)
            .padding(horizontal = 5.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HoldGlassButton(
            label = "−",
            actionLabel = "Decrease frame hold",
            enabled = hold > 1,
            onClick = onDecrease,
        )
        HoldLabel(hold = hold, stacked = false)
        HoldGlassButton(
            label = "+",
            actionLabel = "Increase frame hold",
            enabled = hold < 8,
            onClick = onIncrease,
        )
    }
}

@Composable
private fun HoldLabel(hold: Int, stacked: Boolean) {
    BasicText(
        text = if (stacked) "HOLD\n$hold" else "H$hold",
        modifier = Modifier.padding(horizontal = 2.dp, vertical = 2.dp),
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
}

private val CommandPillShape = RoundedCornerShape(percent = 50)
private val CommandButtonShape = RoundedCornerShape(18.dp)

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
            .clip(CommandPillShape)
            .background(fill)
            .border(1.dp, stroke, CommandPillShape)
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

@Composable
private fun GlassCommandButton(
    label: String,
    actionLabel: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .sizeIn(minWidth = 56.dp, minHeight = 48.dp)
            .clip(CommandButtonShape)
            .background(if (selected) Color(0xCCBB0037) else Color(0xB31A001A))
            .border(
                width = 1.dp,
                color = if (selected) Color(0xCCFFD0DC) else Color(0x99F7CAC9),
                shape = CommandButtonShape,
            )
            .clickable(
                role = Role.Button,
                onClickLabel = actionLabel,
                onClick = onClick,
            )
            .padding(horizontal = 8.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = label,
            style = TextStyle(
                color = Color(0xFFFFF0F3),
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                letterSpacing = 0.8.sp,
                textAlign = TextAlign.Center,
            ),
        )
    }
}
