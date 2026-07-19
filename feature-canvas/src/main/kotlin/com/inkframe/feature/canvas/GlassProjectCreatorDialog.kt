package com.inkframe.feature.canvas

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush as UiBrush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.inkframe.core.model.CustomProjectSpec
import com.inkframe.core.model.NativeProjectTemplate
import com.inkframe.core.model.NativeProjectTemplates
import com.inkframe.core.model.Project
import com.inkframe.core.model.ProjectPaper

private enum class CreatorMode { TEMPLATES, CUSTOM }

private val CreatorPanelShape = RoundedCornerShape(28.dp)
private val CreatorCardShape = RoundedCornerShape(18.dp)
private val CreatorRose = Color(0xFFF7CAC9)
private val CreatorBlush = Color(0xFFFFF0F3)

/** Native, tablet-first project creation workflow for Glass Horizon. */
@Composable
internal fun GlassProjectCreatorDialog(
    onCreate: (Project) -> Unit,
    onDismiss: () -> Unit,
) {
    var modeName by rememberSaveable { mutableStateOf(CreatorMode.TEMPLATES.name) }
    var selectedTemplateId by rememberSaveable { mutableStateOf(NativeProjectTemplates.all.first().id) }
    var customName by rememberSaveable { mutableStateOf(NativeProjectTemplates.DEFAULT_CUSTOM_NAME) }
    var widthText by rememberSaveable { mutableStateOf("1024") }
    var heightText by rememberSaveable { mutableStateOf("768") }
    var fpsText by rememberSaveable { mutableStateOf("12") }
    var frameText by rememberSaveable { mutableStateOf("1") }
    var paperName by rememberSaveable { mutableStateOf(ProjectPaper.BLUSH.name) }

    val mode = CreatorMode.valueOf(modeName)
    val selectedTemplate = NativeProjectTemplates.byId(selectedTemplateId)
        ?: NativeProjectTemplates.all.first()
    val paper = ProjectPaper.valueOf(paperName)
    val width = widthText.toIntOrNull()
    val height = heightText.toIntOrNull()
    val fps = fpsText.toIntOrNull()
    val frames = frameText.toIntOrNull()
    val widthValid = width in NativeProjectTemplates.DIMENSION_RANGE
    val heightValid = height in NativeProjectTemplates.DIMENSION_RANGE
    val fpsValid = fps in NativeProjectTemplates.FPS_RANGE
    val framesValid = frames in NativeProjectTemplates.FRAME_COUNT_RANGE
    val customValid = widthValid && heightValid && fpsValid && framesValid

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xB3080008))
                .padding(horizontal = 22.dp, vertical = 18.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth(0.90f)
                    .fillMaxHeight(0.94f)
                    .widthIn(min = 420.dp, max = 980.dp)
                    .heightIn(min = 430.dp)
                    .clip(CreatorPanelShape)
                    .background(
                        UiBrush.verticalGradient(
                            listOf(Color(0xFC2A001A), Color(0xFC140712)),
                        ),
                    )
                    .border(1.dp, Color(0x99F7CAC9), CreatorPanelShape)
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                CreatorHeader(onDismiss)
                CreatorModeTabs(mode = mode, onMode = { modeName = it.name })

                when (mode) {
                    CreatorMode.TEMPLATES -> TemplateWorkspace(
                        selectedId = selectedTemplateId,
                        onSelected = { selectedTemplateId = it },
                    )

                    CreatorMode.CUSTOM -> CustomWorkspace(
                        name = customName,
                        onName = { customName = it.take(80) },
                        widthText = widthText,
                        onWidth = { widthText = it.take(8) },
                        widthValid = widthValid,
                        heightText = heightText,
                        onHeight = { heightText = it.take(8) },
                        heightValid = heightValid,
                        fpsText = fpsText,
                        onFps = { fpsText = it.take(8) },
                        fpsValid = fpsValid,
                        frameText = frameText,
                        onFrames = { frameText = it.take(8) },
                        framesValid = framesValid,
                        paper = paper,
                        onPaper = { paperName = it.name },
                    )
                }

                val previewWidth = if (mode == CreatorMode.TEMPLATES) selectedTemplate.widthPx else width ?: 1
                val previewHeight = if (mode == CreatorMode.TEMPLATES) selectedTemplate.heightPx else height ?: 1
                CreatorPreview(
                    name = if (mode == CreatorMode.TEMPLATES) {
                        selectedTemplate.name
                    } else {
                        customName.trim().ifEmpty { NativeProjectTemplates.DEFAULT_CUSTOM_NAME }
                    },
                    widthPx = previewWidth,
                    heightPx = previewHeight,
                    fps = if (mode == CreatorMode.TEMPLATES) selectedTemplate.fps else fps ?: 0,
                    frames = if (mode == CreatorMode.TEMPLATES) selectedTemplate.frameCount else frames ?: 0,
                    paper = if (mode == CreatorMode.TEMPLATES) selectedTemplate.paper else paper,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CreatorAction(
                        label = "CANCEL",
                        modifier = Modifier.weight(1f),
                        onClick = onDismiss,
                    )
                    CreatorAction(
                        label = "CREATE PROJECT",
                        selected = true,
                        enabled = mode == CreatorMode.TEMPLATES || customValid,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            val project = when (mode) {
                                CreatorMode.TEMPLATES -> NativeProjectTemplates.create(selectedTemplate)
                                CreatorMode.CUSTOM -> NativeProjectTemplates.createCustom(
                                    CustomProjectSpec(
                                        name = customName,
                                        widthPx = requireNotNull(width),
                                        heightPx = requireNotNull(height),
                                        fps = requireNotNull(fps),
                                        frameCount = requireNotNull(frames),
                                        paper = paper,
                                    ),
                                )
                            }
                            onCreate(project)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun CreatorHeader(onDismiss: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = "NEW PROJECT",
                color = CreatorBlush,
                fontSize = 22.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 2.sp,
            )
            Text(
                text = "NATIVE GLASS HORIZON DOCUMENT",
                color = CreatorRose,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
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
                    onClickLabel = "Close project creator",
                    onClick = onDismiss,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text("×", color = CreatorBlush, fontSize = 26.sp, fontWeight = FontWeight.Light)
        }
    }
}

@Composable
private fun CreatorModeTabs(mode: CreatorMode, onMode: (CreatorMode) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        CreatorAction(
            label = "STARTERS",
            selected = mode == CreatorMode.TEMPLATES,
            modifier = Modifier.weight(1f),
            onClick = { onMode(CreatorMode.TEMPLATES) },
        )
        CreatorAction(
            label = "CUSTOM CANVAS",
            selected = mode == CreatorMode.CUSTOM,
            modifier = Modifier.weight(1f),
            onClick = { onMode(CreatorMode.CUSTOM) },
        )
    }
}

@Composable
private fun TemplateWorkspace(selectedId: String, onSelected: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = "STARTER TEMPLATES",
            color = CreatorRose,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            fontSize = 12.sp,
            letterSpacing = 1.2.sp,
        )
        NativeProjectTemplates.all.chunked(2).forEach { rowTemplates ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                rowTemplates.forEach { template ->
                    TemplateCard(
                        template = template,
                        selected = template.id == selectedId,
                        modifier = Modifier.weight(1f),
                        onClick = { onSelected(template.id) },
                    )
                }
                if (rowTemplates.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun TemplateCard(
    template: NativeProjectTemplate,
    selected: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .sizeIn(minHeight = 118.dp)
            .clip(CreatorCardShape)
            .background(if (selected) Color(0x55BB0037) else Color(0x12FFF0F3))
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) Color(0xCCFFD0DC) else Color(0x44F7CAC9),
                shape = CreatorCardShape,
            )
            .selectable(
                selected = selected,
                role = Role.RadioButton,
                onClick = onClick,
            )
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Text(template.name, color = CreatorBlush, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Text(
            "${template.widthPx} × ${template.heightPx} · ${template.aspectLabel}",
            color = CreatorRose,
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
        )
        Text(
            "${template.fps} fps · ${template.frameCount} frame${if (template.frameCount == 1) "" else "s"}",
            color = Color(0xCCFFF0F3),
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
        )
        Text(template.description, color = Color(0xAFFFF0F3), fontSize = 11.sp)
    }
}

@Composable
private fun CustomWorkspace(
    name: String,
    onName: (String) -> Unit,
    widthText: String,
    onWidth: (String) -> Unit,
    widthValid: Boolean,
    heightText: String,
    onHeight: (String) -> Unit,
    heightValid: Boolean,
    fpsText: String,
    onFps: (String) -> Unit,
    fpsValid: Boolean,
    frameText: String,
    onFrames: (String) -> Unit,
    framesValid: Boolean,
    paper: ProjectPaper,
    onPaper: (ProjectPaper) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = "CUSTOM DOCUMENT",
            color = CreatorRose,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            fontSize = 12.sp,
            letterSpacing = 1.2.sp,
        )
        CreatorTextField(
            value = name,
            onValue = onName,
            label = "Project name",
            numeric = false,
            valid = true,
            supporting = "Stored in the native .inkframe project",
            modifier = Modifier.fillMaxWidth(),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            CreatorTextField(
                value = widthText,
                onValue = onWidth,
                label = "Width (px)",
                valid = widthValid,
                supporting = "Whole number · 256–4096",
                modifier = Modifier.weight(1f),
            )
            CreatorTextField(
                value = heightText,
                onValue = onHeight,
                label = "Height (px)",
                valid = heightValid,
                supporting = "Whole number · 256–4096",
                modifier = Modifier.weight(1f),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            CreatorTextField(
                value = fpsText,
                onValue = onFps,
                label = "Frame rate",
                valid = fpsValid,
                supporting = "Whole number · 1–24 fps",
                modifier = Modifier.weight(1f),
            )
            CreatorTextField(
                value = frameText,
                onValue = onFrames,
                label = "Starter frames",
                valid = framesValid,
                supporting = "Whole number · 1–120",
                modifier = Modifier.weight(1f),
            )
        }
        Text("PAPER", color = CreatorRose, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ProjectPaper.entries.forEach { option ->
                PaperChoice(
                    paper = option,
                    selected = option == paper,
                    modifier = Modifier.weight(1f),
                    onClick = { onPaper(option) },
                )
            }
        }
    }
}

@Composable
private fun CreatorTextField(
    value: String,
    onValue: (String) -> Unit,
    label: String,
    valid: Boolean,
    supporting: String,
    modifier: Modifier,
    numeric: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValue,
        label = { Text(label) },
        supportingText = { Text(supporting) },
        singleLine = true,
        isError = !valid,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (numeric) KeyboardType.Number else KeyboardType.Text,
        ),
        modifier = modifier.sizeIn(minHeight = 64.dp),
    )
}

@Composable
private fun PaperChoice(
    paper: ProjectPaper,
    selected: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .sizeIn(minHeight = 72.dp)
            .clip(CreatorCardShape)
            .background(Color(0x10FFF0F3))
            .border(
                if (selected) 2.dp else 1.dp,
                if (selected) Color(0xCCFFD0DC) else Color(0x44F7CAC9),
                CreatorCardShape,
            )
            .selectable(
                selected = selected,
                role = Role.RadioButton,
                onClick = onClick,
            )
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(
            Modifier
                .size(30.dp)
                .clip(CircleShape)
                .background(Color(paper.color.toArgb()))
                .border(1.dp, Color(0x66FFF0F3), CircleShape),
        )
        Text(
            paper.displayName.uppercase(),
            color = CreatorBlush,
            fontFamily = FontFamily.Monospace,
            fontSize = 9.sp,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun CreatorPreview(
    name: String,
    widthPx: Int,
    heightPx: Int,
    fps: Int,
    frames: Int,
    paper: ProjectPaper,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(CreatorCardShape)
            .background(Color(0x12FFF0F3))
            .border(1.dp, Color(0x36F7CAC9), CreatorCardShape)
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val safeRatio = (widthPx.coerceAtLeast(1).toFloat() / heightPx.coerceAtLeast(1))
            .coerceIn(0.45f, 2.2f)
        Box(
            modifier = Modifier
                .sizeIn(maxWidth = 110.dp, maxHeight = 76.dp)
                .fillMaxWidth(0.20f)
                .aspectRatio(safeRatio)
                .clip(RoundedCornerShape(8.dp))
                .background(Color(paper.color.toArgb()))
                .border(1.dp, Color(0x66F7CAC9), RoundedCornerShape(8.dp)),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(name, color = CreatorBlush, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(
                "$widthPx × $heightPx · $fps fps · $frames frame${if (frames == 1) "" else "s"}",
                color = CreatorRose,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
            )
            Text(
                "A new project replaces the current workspace after CREATE PROJECT.",
                color = Color(0xAFFFF0F3),
                fontSize = 11.sp,
            )
        }
    }
}

@Composable
private fun CreatorAction(
    label: String,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val fill = when {
        !enabled -> UiBrush.horizontalGradient(listOf(Color(0x0AFFF0F3), Color(0x06FFF0F3)))
        selected -> UiBrush.horizontalGradient(listOf(Color(0xCCBB0037), Color(0xCC69004E)))
        else -> UiBrush.horizontalGradient(listOf(Color(0x18FFF0F3), Color(0x0CFFF0F3)))
    }
    Box(
        modifier = modifier
            .sizeIn(minHeight = 48.dp)
            .clip(CreatorCardShape)
            .background(fill)
            .border(
                1.dp,
                if (selected && enabled) Color(0xAAFFD0DC) else Color(0x44F7CAC9),
                CreatorCardShape,
            )
            .clickable(
                enabled = enabled,
                role = Role.Button,
                onClickLabel = label,
                onClick = onClick,
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (enabled) CreatorBlush else Color(0x66FFF0F3),
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            fontSize = 11.sp,
            letterSpacing = 0.7.sp,
            textAlign = TextAlign.Center,
        )
    }
}
