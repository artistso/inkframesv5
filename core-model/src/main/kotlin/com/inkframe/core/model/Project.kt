package com.inkframe.core.model

import java.util.UUID

/**
 * Root document model for an InkFrame project. Mirrors the conceptual hierarchy of a
 * traditional 2D bitmap animation suite:
 *
 *   Project
 *     └─ Scene (a "clip" with its own timeline & playback range)
 *          └─ Layer (a stack of drawing/anim layers)
 *               └─ Frame instances laid out along the timeline
 *
 * Models are immutable data classes; mutations are performed through the
 * command/document layer so that undo-redo and serialization stay consistent.
 */
data class Project(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val canvas: CanvasSpec,
    val scenes: List<Scene> = emptyList(),
    val activeSceneId: String? = scenes.firstOrNull()?.id,
    val colorPalette: List<RgbaColor> = DefaultPalette.entries,
    val createdAtEpochMs: Long = System.currentTimeMillis(),
    val modifiedAtEpochMs: Long = createdAtEpochMs,
) {
    val activeScene: Scene? get() = scenes.firstOrNull { it.id == activeSceneId } ?: scenes.firstOrNull()
}

/** Pixel dimensions, frame rate, and pixel aspect of the working surface. */
data class CanvasSpec(
    val widthPx: Int,
    val heightPx: Int,
    val fps: Int = 24,
    val pixelAspect: Float = 1.0f,
    val backgroundColor: RgbaColor = RgbaColor.WHITE,
) {
    init {
        require(widthPx in 1..16384) { "widthPx out of range: $widthPx" }
        require(heightPx in 1..16384) { "heightPx out of range: $heightPx" }
        require(fps in 1..120) { "fps out of range: $fps" }
    }

    val aspectRatio: Float get() = (widthPx * pixelAspect) / heightPx
}

object DefaultPalette {
    val entries: List<RgbaColor> = listOf(
        RgbaColor.BLACK,
        RgbaColor.WHITE,
        RgbaColor(0.90f, 0.10f, 0.16f),
        RgbaColor(0.13f, 0.55f, 0.95f),
        RgbaColor(0.18f, 0.71f, 0.35f),
        RgbaColor(0.98f, 0.75f, 0.18f),
        RgbaColor(0.55f, 0.27f, 0.68f),
        RgbaColor(0.96f, 0.49f, 0.20f),
    )
}
