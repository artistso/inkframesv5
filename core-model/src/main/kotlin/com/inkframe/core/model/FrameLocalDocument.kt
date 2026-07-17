package com.inkframe.core.model

import java.util.UUID

@JvmInline
value class ProjectId(val value: String) {
    init { requireDocumentId(value, "ProjectId") }
    companion object { fun random(): ProjectId = ProjectId(UUID.randomUUID().toString()) }
}

@JvmInline
value class SceneId(val value: String) {
    init { requireDocumentId(value, "SceneId") }
    companion object { fun random(): SceneId = SceneId(UUID.randomUUID().toString()) }
}

@JvmInline
value class FrameId(val value: String) {
    init { requireDocumentId(value, "FrameId") }
    companion object { fun random(): FrameId = FrameId(UUID.randomUUID().toString()) }
}

@JvmInline
value class LayerId(val value: String) {
    init { requireDocumentId(value, "LayerId") }
    companion object { fun random(): LayerId = LayerId(UUID.randomUUID().toString()) }
}

@JvmInline
value class RasterAssetId(val value: String) {
    init { requireDocumentId(value, "RasterAssetId") }
    companion object { fun random(): RasterAssetId = RasterAssetId(UUID.randomUUID().toString()) }
}

/** One project-wide editable raster composited between paper and frame layers. */
data class StaticBackground(
    val visible: Boolean = true,
    val opacity: Float = 1f,
    val blendMode: BlendMode = BlendMode.NORMAL,
    val rasterId: RasterAssetId? = null,
) {
    init {
        require(opacity.isFinite() && opacity in 0f..1f) { "background opacity must be finite and in 0..1" }
    }
}

/** One frame-local layer. A null raster is a transparent, lazily unallocated surface. */
data class FrameLayer(
    val id: LayerId = LayerId.random(),
    val name: String,
    val visible: Boolean = true,
    val locked: Boolean = false,
    val opacity: Float = 1f,
    val blendMode: BlendMode = BlendMode.NORMAL,
    val rasterId: RasterAssetId? = null,
) {
    init {
        require(name.length <= MAX_NAME_CHARS) { "layer name exceeds $MAX_NAME_CHARS characters" }
        require(opacity.isFinite() && opacity in 0f..1f) { "layer opacity must be finite and in 0..1" }
    }

    companion object {
        const val MAX_NAME_CHARS = 256
    }
}

/** A complete editable frame with its own ordered layer topology and timing hold. */
data class AnimationFrame(
    val id: FrameId = FrameId.random(),
    val hold: Int = Scene.MIN_FRAME_HOLD,
    val layers: List<FrameLayer>,
    val activeLayerId: LayerId = layers.firstOrNull()?.id
        ?: throw IllegalArgumentException("A frame needs at least one layer"),
) {
    init {
        require(hold in Scene.MIN_FRAME_HOLD..Scene.MAX_FRAME_HOLD) {
            "frame hold must be in ${Scene.MIN_FRAME_HOLD}..${Scene.MAX_FRAME_HOLD}"
        }
        require(layers.isNotEmpty()) { "A frame needs at least one layer" }
        requireUnique(layers.map { it.id }, "layer ids within frame ${id.value}")
        require(layers.count { it.id == activeLayerId } == 1) {
            "activeLayerId must identify exactly one layer"
        }
    }

    val activeLayer: FrameLayer
        get() = layers.first { it.id == activeLayerId }
}

/** One animation clip with ordered frames and inclusive playback bounds. */
data class FrameLocalScene(
    val id: SceneId = SceneId.random(),
    val name: String,
    val frames: List<AnimationFrame>,
    val activeFrameIndex: Int = 0,
    val playbackRange: IntRange = 0..frames.lastIndex,
    val loop: Boolean = true,
) {
    init {
        require(name.length <= MAX_NAME_CHARS) { "scene name exceeds $MAX_NAME_CHARS characters" }
        require(frames.isNotEmpty()) { "A scene needs at least one frame" }
        require(activeFrameIndex in frames.indices) { "activeFrameIndex out of range" }
        require(playbackRange.first in frames.indices) { "playback start out of range" }
        require(playbackRange.last in frames.indices) { "playback end out of range" }
        require(playbackRange.first <= playbackRange.last) { "playback range must be ordered" }
        requireUnique(frames.map { it.id }, "frame ids within scene ${id.value}")
        requireUnique(frames.flatMap { frame -> frame.layers.map { it.id } }, "layer ids within scene ${id.value}")
    }

    val activeFrame: AnimationFrame
        get() = frames[activeFrameIndex]

    companion object {
        const val MAX_NAME_CHARS = 256
    }
}

/**
 * Canonical frame-local document foundation for native schema v3.
 *
 * This type is additive while the prototype runtime is migrated. It deliberately does not expose
 * process-local OpenGL surface handles; every raster reference is durable project identity.
 */
data class FrameLocalProject(
    val id: ProjectId = ProjectId.random(),
    val name: String,
    val canvas: CanvasSpec,
    val background: StaticBackground = StaticBackground(),
    val scenes: List<FrameLocalScene>,
    val activeSceneId: SceneId = scenes.firstOrNull()?.id
        ?: throw IllegalArgumentException("A project needs at least one scene"),
    val colorPalette: List<RgbaColor> = DefaultPalette.entries,
    val createdAtEpochMs: Long = System.currentTimeMillis(),
    val modifiedAtEpochMs: Long = createdAtEpochMs,
) {
    init {
        require(name.length <= MAX_NAME_CHARS) { "project name exceeds $MAX_NAME_CHARS characters" }
        require(scenes.isNotEmpty()) { "A project needs at least one scene" }
        require(scenes.count { it.id == activeSceneId } == 1) {
            "activeSceneId must identify exactly one scene"
        }
        requireUnique(scenes.map { it.id }, "scene ids")
        requireUnique(scenes.flatMap { it.frames }.map { it.id }, "frame ids")
        requireUnique(
            scenes.flatMap { scene -> scene.frames.flatMap { frame -> frame.layers.map { it.id } } },
            "layer ids",
        )
        require(createdAtEpochMs >= 0L && modifiedAtEpochMs >= 0L) {
            "timestamps must be non-negative"
        }
    }

    val activeScene: FrameLocalScene
        get() = scenes.first { it.id == activeSceneId }

    companion object {
        const val MAX_NAME_CHARS = 256
    }
}

private val DOCUMENT_ID_PATTERN = Regex("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")

private fun requireDocumentId(value: String, label: String) {
    require(DOCUMENT_ID_PATTERN.matches(value)) {
        "$label must be 1..128 safe identifier characters"
    }
}

private fun <T> requireUnique(values: List<T>, label: String) {
    require(values.toSet().size == values.size) { "$label must be unique" }
}
