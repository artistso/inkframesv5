package com.inkframe.feature.canvas

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.inkframe.core.model.BrushAdjustments
import com.inkframe.core.model.BrushLabPresets

/**
 * Adds project creation and Brush Lab workflows around the native Glass Horizon workspace.
 *
 * Hold timing is presented directly on the timeline rail; project and brush-lab entry points
 * live inside the Gallery and Studio radial nodes so they do not compete with the canvas.
 */
@Composable
fun HoldAwareGlassHorizonScreen(state: StudioState = viewModel()) {
    val brushSession = remember(state) { BrushLabSessionRegistry.forState(state) }
    var showBrushLab by rememberSaveable { mutableStateOf(false) }
    var showProjectCreator by rememberSaveable { mutableStateOf(false) }
    var blankCanvasGeneration by rememberSaveable { mutableLongStateOf(0L) }
    var canvasSignature by rememberSaveable {
        mutableStateOf(ProjectCanvasRecreation.signature(state.project))
    }
    val observedBrush = state.brush
    val observedProject = state.project

    // Reconcile factory-brush selection with the ViewModel-associated session cache so each
    // brush regains its live edits after tool switches and Activity configuration changes.
    LaunchedEffect(observedBrush) {
        val restored = brushSession.observe(observedBrush)
        if (restored != observedBrush) state.updateBrush { restored }
    }

    // Archive open/recovery restores pixels into the existing engine before replacing the
    // Project model. Only blank projects whose dimensions change recreate the native canvas.
    LaunchedEffect(observedProject.id) {
        val decision = ProjectCanvasRecreation.observe(canvasSignature, observedProject)
        canvasSignature = decision.nextSignature
        if (decision.recreate) blankCanvasGeneration += 1L
    }

    Box(Modifier.fillMaxSize()) {
        key(blankCanvasGeneration) {
            ClosedBetaGlassHorizonScreen(
                state = state,
                onNewProject = {
                    showBrushLab = false
                    showProjectCreator = true
                },
                onOpenBrushLab = {
                    state.updateBrush { current ->
                        brushSession.record(BrushAdjustments.normalized(current))
                    }
                    showProjectCreator = false
                    showBrushLab = true
                },
            )
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
                canvasSignature = ProjectCanvasRecreation.signature(project)
                blankCanvasGeneration += 1L
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
