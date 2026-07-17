package com.inkframe.core.model

import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

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

/** Persistent project-canvas geometry. Circle is always a true inscribed circle, never an ellipse. */
enum class CanvasShape {
    SQUARE,
    CIRCLE,
}

/** Pixel dimensions, frame rate, pixel aspect, and shape of the working surface. */
data class CanvasSpec(
    val widthPx: Int,
    val heightPx: Int,
    val fps: Int = 24,
    val pixelAspect: Float = 1.0f,
    val backgroundColor: RgbaColor = RgbaColor.WHITE,
    val shape: CanvasShape = CanvasShape.SQUARE,
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

/** Canvas shape mirrored from the artist-facing Glass Horizon studio. */
enum class StudioCanvasShape {
    SQUARE,
    CIRCLE,
}

/** Canvas bounds in WebView CSS pixels at the time the context was published. */
data class StudioCanvasGeometry(
    val left: Double,
    val top: Double,
    val width: Double,
    val height: Double,
) {
    fun isValid(): Boolean =
        left.isFinite() && top.isFinite() && width.isFinite() && height.isFinite() &&
            width > 0.0 && height > 0.0
}

/** Brush state frozen into a native stroke at pen-down. */
data class StudioBrushContext(
    val id: String,
    val colorArgb: Int,
    val paperColorArgb: Int,
    val sizeCanvasPx: Double,
    val opacity: Double,
) {
    fun isValid(): Boolean =
        sizeCanvasPx.isFinite() && sizeCanvasPx > 0.0 &&
            opacity.isFinite() && opacity in 0.0..1.0
}

/**
 * Read-only snapshot of the original studio's active editing context.
 *
 * During migration the WebView remains authoritative. Kotlin mirrors this immutable snapshot so
 * native input can be rejected before JavaScript replay whenever project, frame, layer, brush, or
 * canvas geometry changed after pen-down.
 */
data class StudioContextSnapshot(
    val schema: Int,
    val enabled: Boolean,
    val contextToken: String,
    val baseContextToken: String,
    val contextRevision: Int,
    val projectIndex: Int,
    val frameIndex: Int,
    val layerIndex: Int,
    val layerCount: Int,
    val backgroundActive: Boolean,
    val canvasWidth: Int,
    val canvasHeight: Int,
    val shape: StudioCanvasShape,
    val geometry: StudioCanvasGeometry,
    val brush: StudioBrushContext,
) {
    val hasDrawableTarget: Boolean
        get() = backgroundActive || layerCount > 0

    fun validatedOrNull(): StudioContextSnapshot? {
        if (schema != CURRENT_SCHEMA) return null
        if (contextToken.isBlank()) return null
        if (contextRevision < 0 || projectIndex < 0 || frameIndex < 0) return null
        if (layerCount < 0 || canvasWidth <= 0 || canvasHeight <= 0) return null
        if (!geometry.isValid() || !brush.isValid()) return null
        if (backgroundActive) {
            if (layerIndex != BACKGROUND_LAYER_INDEX) return null
        } else if (layerCount == 0) {
            // The layer runtime may publish one initialization snapshot before its first layer is
            // available. It is valid mirror state but cannot accept a stroke.
            if (layerIndex != 0) return null
        } else if (layerIndex !in 0 until layerCount) {
            return null
        }
        return this
    }

    fun strokeBinding(): StudioStrokeBinding = StudioStrokeBinding(
        schema = schema,
        contextToken = contextToken,
        contextRevision = contextRevision,
        projectIndex = projectIndex,
        frameIndex = frameIndex,
        layerIndex = layerIndex,
        layerCount = layerCount,
        backgroundActive = backgroundActive,
        canvasWidth = canvasWidth,
        canvasHeight = canvasHeight,
        shape = shape,
        geometry = geometry,
        brush = brush,
    )

    companion object {
        const val CURRENT_SCHEMA = 2
        const val BACKGROUND_LAYER_INDEX = -1
    }
}

/** Exact studio context carried by one native stroke from pen-down through replay. */
data class StudioStrokeBinding(
    val schema: Int,
    val contextToken: String,
    val contextRevision: Int,
    val projectIndex: Int,
    val frameIndex: Int,
    val layerIndex: Int,
    val layerCount: Int,
    val backgroundActive: Boolean,
    val canvasWidth: Int,
    val canvasHeight: Int,
    val shape: StudioCanvasShape,
    val geometry: StudioCanvasGeometry,
    val brush: StudioBrushContext,
) {
    fun validatedOrNull(): StudioStrokeBinding? {
        val snapshot = StudioContextSnapshot(
            schema = schema,
            enabled = true,
            contextToken = contextToken,
            baseContextToken = contextToken,
            contextRevision = contextRevision,
            projectIndex = projectIndex,
            frameIndex = frameIndex,
            layerIndex = layerIndex,
            layerCount = layerCount,
            backgroundActive = backgroundActive,
            canvasWidth = canvasWidth,
            canvasHeight = canvasHeight,
            shape = shape,
            geometry = geometry,
            brush = brush,
        )
        return if (snapshot.validatedOrNull() == null || !snapshot.hasDrawableTarget) null else this
    }
}

enum class StudioContextUpdate {
    ACCEPTED_CHANGED,
    ACCEPTED_UNCHANGED,
    REJECTED_INVALID,
}

enum class StudioStrokeValidation {
    ACCEPTED,
    NO_CONTEXT,
    CONTEXT_DISABLED,
    STALE_CONTEXT,
    INVALID_STROKE_CONTEXT,
}

/**
 * Thread-safe shadow of the WebView's current studio context.
 *
 * It deliberately owns no artwork and performs no project writes. Its only responsibilities are
 * publishing an immutable Kotlin snapshot and validating that a completed native stroke still
 * targets exactly the state captured at pen-down.
 */
class StudioContextMirror {
    private val current = AtomicReference<StudioContextSnapshot?>(null)
    private val generationCounter = AtomicLong(0L)

    val generation: Long
        get() = generationCounter.get()

    fun snapshot(): StudioContextSnapshot? = current.get()

    fun update(candidate: StudioContextSnapshot): StudioContextUpdate {
        val validated = candidate.validatedOrNull() ?: return StudioContextUpdate.REJECTED_INVALID
        val previous = current.getAndSet(validated)
        return if (previous == validated) {
            StudioContextUpdate.ACCEPTED_UNCHANGED
        } else {
            generationCounter.incrementAndGet()
            StudioContextUpdate.ACCEPTED_CHANGED
        }
    }

    fun captureStrokeBinding(): StudioStrokeBinding? = current.get()
        ?.takeIf { it.enabled && it.hasDrawableTarget }
        ?.strokeBinding()

    fun validate(binding: StudioStrokeBinding): StudioStrokeValidation {
        val validatedBinding = binding.validatedOrNull()
            ?: return StudioStrokeValidation.INVALID_STROKE_CONTEXT
        val context = current.get() ?: return StudioStrokeValidation.NO_CONTEXT
        if (!context.enabled || !context.hasDrawableTarget) {
            return StudioStrokeValidation.CONTEXT_DISABLED
        }
        return if (validatedBinding == context.strokeBinding()) {
            StudioStrokeValidation.ACCEPTED
        } else {
            StudioStrokeValidation.STALE_CONTEXT
        }
    }

    fun clear() {
        if (current.getAndSet(null) != null) generationCounter.incrementAndGet()
    }
}
