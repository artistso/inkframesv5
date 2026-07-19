package com.inkframe.feature.canvas

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush as UiBrush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.inkframe.core.model.Brush
import com.inkframe.core.model.BrushAdjustments
import com.inkframe.core.model.BrushLabPreset
import com.inkframe.core.model.BrushLabPresets
import kotlin.math.roundToInt

private val LabPanelShape = RoundedCornerShape(28.dp)
private val LabControlShape = RoundedCornerShape(16.dp)
private val LabRose = Color(0xFFF7CAC9)
private val LabBlush = Color(0xFFFFF0F3)
private val LabPlum = Color(0xFF1A001A)
private val LabAccent = Color(0xFFBB0037)

/**
 * Native tablet-first Brush Lab for the Glass Horizon runtime.
 *
 * This intentionally ports the first behavioral slice only: size, minimum pressure size,
 * opacity, hardness, spacing, smoothing, pressure response, build-up, and the three primary
 * Direct/Balanced/Smooth presets. Advanced ghost-trail and diagnostic controls remain out of
 * scope until their native engine behavior exists.
 */
@Composable
internal fun GlassBrushLabDialog(
    brush: Brush,
    onChange: (((Brush) -> Brush) -> Unit),
    onPreset: (BrushLabPreset) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0x99080008))
                .padding(horizontal = 24.dp, vertical = 20.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth(0.84f)
                    .fillMaxHeight(0.92f)
                    .widthIn(min = 360.dp, max = 920.dp)
                    .heightIn(min = 420.dp)
                    .clip(LabPanelShape)
                    .background(
                        UiBrush.verticalGradient(
                            listOf(Color(0xFA2A001A), Color(0xFA140712)),
                        ),
                    )
                    .border(1.dp, Color(0x99F7CAC9), LabPanelShape)
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                LabHeader(brush = brush, onDismiss = onDismiss)
                LabBrushIdentity(brush)

                LabSectionTitle(
                    title = "STABILIZER",
                    subtitle = "Primary stroke-feel presets from the working Brush Lab",
                )
                val selectedPreset = BrushLabPresets.closestExact(brush)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    BrushLabPreset.entries.forEach { preset ->
                        LabAction(
                            label = preset.displayName.uppercase(),
                            selected = selectedPreset == preset,
                            modifier = Modifier.weight(1f),
                            onClick = { onPreset(preset) },
                        )
                    }
                }

                LabSectionTitle(
                    title = "STROKE",
                    subtitle = "Coverage, width, edge response, spacing, and smoothing",
                )
                LabSliderRow(
                    label = "Size",
                    value = brush.sizePx,
                    range = BrushAdjustments.SIZE_RANGE,
                    valueText = "${brush.sizePx.roundToInt()} px",
                    onValue = { value -> onChange { BrushAdjustments.withSize(it, value) } },
                )
                LabSliderRow(
                    label = "Min size",
                    value = brush.minSizePx,
                    range = 1f..brush.sizePx.coerceAtLeast(1f),
                    valueText = "${brush.minSizePx.roundToInt()} px",
                    onValue = { value -> onChange { BrushAdjustments.withMinSize(it, value) } },
                )
                LabSliderRow(
                    label = "Opacity",
                    value = brush.opacity,
                    range = BrushAdjustments.OPACITY_RANGE,
                    valueText = percent(brush.opacity),
                    onValue = { value -> onChange { BrushAdjustments.withOpacity(it, value) } },
                )
                LabSliderRow(
                    label = "Hard / soft",
                    value = brush.hardness,
                    range = BrushAdjustments.HARDNESS_RANGE,
                    valueText = percent(brush.hardness),
                    onValue = { value -> onChange { BrushAdjustments.withHardness(it, value) } },
                )
                LabSliderRow(
                    label = "Dab spacing",
                    value = brush.spacing,
                    range = BrushAdjustments.SPACING_RANGE,
                    valueText = percent(brush.spacing),
                    onValue = { value -> onChange { BrushAdjustments.withSpacing(it, value) } },
                )
                LabSliderRow(
                    label = "Smoothing",
                    value = brush.smoothing,
                    range = BrushAdjustments.SMOOTHING_RANGE,
                    valueText = percent(brush.smoothing),
                    onValue = { value -> onChange { BrushAdjustments.withSmoothing(it, value) } },
                )

                LabSectionTitle(
                    title = "PRESSURE",
                    subtitle = "S Pen response and continuous airbrush accumulation",
                )
                LabToggleRow(
                    label = "Pressure → size",
                    checked = brush.pressureToSize,
                    onChecked = { enabled -> onChange { BrushAdjustments.withPressureToSize(it, enabled) } },
                )
                LabToggleRow(
                    label = "Pressure → opacity",
                    checked = brush.pressureToOpacity,
                    onChecked = { enabled -> onChange { BrushAdjustments.withPressureToOpacity(it, enabled) } },
                )
                LabToggleRow(
                    label = "Build-up",
                    checked = brush.buildUp,
                    onChecked = { enabled -> onChange { BrushAdjustments.withBuildUp(it, enabled) } },
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    LabAction(
                        label = "RESET BRUSH",
                        modifier = Modifier.weight(1f),
                        onClick = onReset,
                    )
                    LabAction(
                        label = "DONE",
                        selected = true,
                        modifier = Modifier.weight(1f),
                        onClick = onDismiss,
                    )
                }
            }
        }
    }
}

@Composable
private fun LabHeader(brush: Brush, onDismiss: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = "BRUSH LAB",
                color = LabBlush,
                fontSize = 22.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 2.sp,
            )
            Text(
                text = brush.name.uppercase(),
                color = LabRose,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                letterSpacing = 1.sp,
            )
        }
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(Color(0x22FFF0F3))
                .border(1.dp, Color(0x66F7CAC9), CircleShape)
                .clickable(
                    role = Role.Button,
                    onClickLabel = "Close Brush Lab",
                    onClick = onDismiss,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text("×", color = LabBlush, fontSize = 26.sp, fontWeight = FontWeight.Light)
        }
    }
}

@Composable
private fun LabBrushIdentity(brush: Brush) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(LabControlShape)
            .background(Color(0x12FFF0F3))
            .border(1.dp, Color(0x28F7CAC9), LabControlShape)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        val previewSize = (18f + brush.sizePx.coerceIn(1f, 160f) / 4f).dp
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(CircleShape)
                .background(Color(0x18000000)),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(previewSize.coerceAtMost(58.dp))
                    .clip(CircleShape)
                    .background(LabAccent.copy(alpha = brush.opacity.coerceIn(0.12f, 1f)))
                    .border(1.dp, LabRose.copy(alpha = 0.35f + brush.hardness * 0.65f), CircleShape),
            )
        }
        Column(Modifier.weight(1f)) {
            Text(brush.name, color = LabBlush, fontWeight = FontWeight.Bold, fontSize = 17.sp)
            Text(
                "${brush.sizePx.roundToInt()} px · ${percent(brush.opacity)} opacity · ${percent(brush.hardness)} edge",
                color = Color(0xCCF7CAC9),
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
            )
        }
    }
}

@Composable
private fun LabSectionTitle(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            text = title,
            color = LabRose,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            fontSize = 12.sp,
            letterSpacing = 1.3.sp,
        )
        Text(text = subtitle, color = Color(0xAFFFF0F3), fontSize = 12.sp)
    }
}

@Composable
private fun LabSliderRow(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    valueText: String,
    onValue: (Float) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(LabControlShape)
            .background(Color(0x0FFFF0F3))
            .padding(horizontal = 14.dp, vertical = 9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = LabBlush, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(valueText, color = LabRose, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
        }
        Slider(
            value = value.coerceIn(range.start, range.endInclusive),
            onValueChange = onValue,
            valueRange = range,
            modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 48.dp),
        )
    }
}

@Composable
private fun LabToggleRow(label: String, checked: Boolean, onChecked: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(LabControlShape)
            .background(Color(0x0FFFF0F3))
            .clickable(
                role = Role.Switch,
                onClickLabel = label,
                onClick = { onChecked(!checked) },
            )
            .padding(horizontal = 14.dp, vertical = 7.dp)
            .sizeIn(minHeight = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = LabBlush, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChecked)
    }
}

@Composable
private fun LabAction(
    label: String,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    onClick: () -> Unit,
) {
    val fill = if (selected) {
        UiBrush.horizontalGradient(listOf(Color(0xCCBB0037), Color(0xCC69004E)))
    } else {
        UiBrush.horizontalGradient(listOf(Color(0x18FFF0F3), Color(0x0CFFF0F3)))
    }
    Box(
        modifier = modifier
            .sizeIn(minHeight = 48.dp)
            .clip(LabControlShape)
            .background(fill)
            .border(1.dp, if (selected) Color(0xAAFFD0DC) else Color(0x44F7CAC9), LabControlShape)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = LabBlush,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            fontSize = 11.sp,
            letterSpacing = 0.7.sp,
        )
    }
}

private fun percent(value: Float): String = "${(value.coerceIn(0f, 1f) * 100f).roundToInt()}%"
