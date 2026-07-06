package com.inkframe.feature.canvas

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import com.inkframe.core.model.BlendMode
import com.inkframe.core.model.Brush
import com.inkframe.core.model.CanvasSpec
import com.inkframe.core.model.Cel
import com.inkframe.core.model.DefaultBrushes
import com.inkframe.core.model.Layer
import com.inkframe.core.model.LayerOps
import com.inkframe.core.model.PlaybackOps
import com.inkframe.core.model.OnionGhost
import com.inkframe.core.model.OnionSkinPlanner
import com.inkframe.core.model.OnionSkinSettings
import com.inkframe.core.model.Project
import com.inkframe.core.model.RecentColors
import com.inkframe.core.model.RgbaColor
import com.inkframe.core.model.Scene
import com.inkframe.core.model.TimelineOps
import com.inkframe.engine.gl.PaintEngine
import java.util.concurrent.atomic.AtomicLong

/**
 * Observable studio state. Holds the document [Project] plus the current editing
 * context (active scene/layer/frame, brush, color, playback state). The Compose UI
 * reads from here; the canvas writes pixels via the engine and only updates model
 * structure (which cel exists) through this class.
 */
class StudioState : ViewModel() {

    var project by mutableStateOf(newProject())
        private set

    var activeLayerId by mutableStateOf(project.activeScene!!.layers.first().id)
    var currentFrame by mutableStateOf(0)
        private set
    var brush by mutableStateOf<Brush>(DefaultBrushes.ink)
    var color by mutableStateOf(RgbaColor.BLACK)
    /** Most-recently-used colours for the picker's "recent" row. */
    var recentColors by mutableStateOf(RecentColors.empty())
        private set
    /** Whether the colour picker dialog is open. */
    var showColorPicker by mutableStateOf(false)
    /** Whether the eyedropper tool is armed (next canvas tap samples a colour). */
    var eyedropperActive by mutableStateOf(false)
    /** Whether the bucket/fill tool is armed (next canvas tap flood-fills). */
    var fillActive by mutableStateOf(false)
    /** Whether the brush settings panel is open. */
    var showBrushSettings by mutableStateOf(false)
    /** Id of the layer currently being renamed (shows the rename dialog), or null. */
    var renamingLayerId by mutableStateOf<String?>(null)

    /**
     * Sets the active colour and records the *previous* colour in recents, so the recent
     * row fills with colours the artist has actually committed to (not every intermediate
     * value dragged through on a slider). Call when a colour is confirmed/selected.
     */
    fun commitColor(newColor: RgbaColor) {
        if (newColor.toArgb() != color.toArgb()) {
            recentColors = recentColors.add(color)
        }
        color = newColor
    }
    /** Multi-frame onion-skin configuration (range, falloff, tints). */
    var onionSkin by mutableStateOf(OnionSkinSettings())
    /** Whether the onion-skin settings panel is open. */
    var showOnionSettings by mutableStateOf(false)
    var isPlaying by mutableStateOf(false)
        private set
    var showChecker by mutableStateOf(true)

    // Mirror the engine's history availability for the toolbar buttons.
    var canUndo by mutableStateOf(false)
        private set
    var canRedo by mutableStateOf(false)
        private set

    // Persistence status surfaced to the UI (e.g. a snackbar / title suffix).
    var statusMessage by mutableStateOf<String?>(null)
    var isBusy by mutableStateOf(false)
        private set

    /** Current viewport zoom as a percentage, shown in the toolbar. */
    var zoomPercent by mutableStateOf(100)
        private set

    fun setZoom(scale: Float) { zoomPercent = (scale * 100f).toInt().coerceAtLeast(1) }

    val scene: Scene get() = project.activeScene!!
    val activeLayer: Layer get() = scene.layerById(activeLayerId) ?: scene.layers.first()

    // --- Engine wiring -------------------------------------------------------

    private val surfaceIds = AtomicLong(1L)
    @Volatile private var engine: PaintEngine? = null

    /** Posted by the engine (GL thread) so the UI can refresh on the main thread. */
    var onUiInvalidate: (() -> Unit)? = null

    /**
     * Called from the renderer once the GL context/engine exists. Hooks the engine's
     * history callback so the undo/redo button enabled-state stays in sync. The callback
     * fires on the GL thread, so we marshal the snapshot of flags and let the host repost
     * to the main thread via [onUiInvalidate].
     */
    fun bindEngine(e: PaintEngine) {
        engine = e
        e.onHistoryChanged = {
            canUndo = e.canUndo
            canRedo = e.canRedo
            onUiInvalidate?.invoke()
        }
    }

    /**
     * Returns the surface id for the active cel at the current frame, minting a new id
     * (and recording the cel in the model) if none exists yet. The GPU surface itself is
     * created lazily on the GL thread on first draw.
     */
    fun ensureActiveCel(): Long {
        val layer = activeLayer
        val existing = layer.cels[currentFrame]
        if (existing != null) return existing.surfaceId
        val sid = surfaceIds.getAndIncrement()
        updateLayer(layer.id) { it.copy(cels = it.cels + (currentFrame to Cel(surfaceId = sid))) }
        return sid
    }

    /**
     * Builds the bottom-to-top composite for the current frame, including onion-skin
     * ghosts of the active layer's previous/next cels at reduced opacity.
     */
    /**
     * Builds the flattened bottom-to-top draw list for an arbitrary [frame], honouring
     * layer visibility, opacity, blend mode and frame-holds — but WITHOUT onion skinning.
     * Used by the export pipeline to render any timeline frame independent of the current
     * editing frame.
     */
    fun buildExportDrawList(frame: Int): List<PaintEngine.LayerDrawSpec> {
        val specs = ArrayList<PaintEngine.LayerDrawSpec>()
        for (layer in scene.layers) {
            if (!layer.visible) continue
            val cel = layer.celAt(frame) ?: continue
            specs += PaintEngine.LayerDrawSpec(cel.surfaceId, layer.opacity, layer.blendMode.ordinal)
        }
        return specs
    }

    fun buildDrawList(): List<PaintEngine.LayerDrawSpec> {
        val specs = ArrayList<PaintEngine.LayerDrawSpec>()
        for (layer in scene.layers) {
            if (!layer.visible) continue
            // Onion-skin ghosts (only for the active layer), composited below its drawing.
            if (layer.id == activeLayerId) {
                val ghosts = OnionSkinPlanner.plan(currentFrame, onionSkin) { frame ->
                    layer.cels[frame]?.surfaceId
                }
                for (g in ghosts) specs += g.toSpec(layer.opacity, layer.blendMode.ordinal)
            }
            val cel = layer.celAt(currentFrame) ?: continue
            specs += PaintEngine.LayerDrawSpec(cel.surfaceId, layer.opacity, layer.blendMode.ordinal)
        }
        return specs
    }

    private fun OnionGhost.toSpec(layerOpacity: Float, blendOrdinal: Int) =
        PaintEngine.LayerDrawSpec(
            surfaceId = surfaceId,
            opacity = (opacity * layerOpacity).coerceIn(0f, 1f),
            blendOrdinal = blendOrdinal,
            tintR = tint.r, tintG = tint.g, tintB = tint.b,
            tintStrength = tintStrength,
        )

    fun setBusy(busy: Boolean) { isBusy = busy }

    /**
     * Replaces the in-memory document after a successful load. Resets the editing context
     * to the loaded project's first scene/layer/frame and advances the surface-id counter
     * past every id used by the document so newly drawn cels never collide.
     */
    fun replaceProject(loaded: Project) {
        project = loaded
        val firstScene = loaded.activeScene ?: loaded.scenes.firstOrNull()
        activeLayerId = firstScene?.layers?.firstOrNull()?.id ?: activeLayerId
        currentFrame = 0
        val maxId = loaded.scenes
            .flatMap { it.layers }
            .flatMap { it.cels.values }
            .maxOfOrNull { it.surfaceId } ?: 0L
        surfaceIds.set(maxId + 1)
        isPlaying = false
    }

    fun setFrame(frame: Int) {
        currentFrame = frame.coerceIn(0, scene.frameCount - 1)
    }

    fun togglePlay() { isPlaying = !isPlaying }
    fun stop() { isPlaying = false }

    /** Milliseconds per frame at the project frame rate (drives the playback loop). */
    val frameDurationMs: Long get() = PlaybackOps.frameDurationMs(project.canvas.fps)

    fun advancePlayback() {
        val (next, stillPlaying) = PlaybackOps.nextFrame(currentFrame, scene.playbackRange, scene.loop)
        currentFrame = next
        if (!stillPlaying) isPlaying = false
    }

    // --- Playback range (in/out points), FPS, loop ---------------------------

    /** Sets the loop in-point to the current frame (pushes the out-point if needed). */
    fun setInPointToCurrent() = updateScene {
        it.copy(playbackRange = PlaybackOps.setInPoint(it.playbackRange, currentFrame, it.frameCount))
    }

    /** Sets the loop out-point to the current frame (pulls the in-point if needed). */
    fun setOutPointToCurrent() = updateScene {
        it.copy(playbackRange = PlaybackOps.setOutPoint(it.playbackRange, currentFrame, it.frameCount))
    }

    /** Resets the playback range to the whole timeline. */
    fun clearPlaybackRange() = updateScene {
        it.copy(playbackRange = PlaybackOps.fullRange(it.frameCount))
    }

    fun toggleLoop() = updateScene { it.copy(loop = !it.loop) }

    /** Changes the project frame rate (clamped to the supported range). */
    fun setFps(fps: Int) {
        project = project.copy(
            canvas = project.canvas.copy(fps = PlaybackOps.clampFps(fps)),
            modifiedAtEpochMs = System.currentTimeMillis(),
        )
    }

    fun addLayer(name: String = "Layer ${scene.layers.size + 1}") {
        val layer = Layer(name = name)
        updateScene { it.copy(layers = it.layers + layer) }
        activeLayerId = layer.id
    }

    // --- Layer management ----------------------------------------------------

    /** Moves a layer one step toward the top of the stack (composited later/over). */
    fun moveLayerUp(id: String) = updateScene { LayerOps.moveUp(it, id) }

    /** Moves a layer one step toward the bottom of the stack. */
    fun moveLayerDown(id: String) = updateScene { LayerOps.moveDown(it, id) }

    fun renameLayer(id: String, name: String) = updateScene { LayerOps.rename(it, id, name) }

    fun toggleLayerVisible(id: String) = updateScene { LayerOps.toggleVisible(it, id) }

    fun toggleLayerLocked(id: String) = updateScene { LayerOps.toggleLocked(it, id) }

    fun setLayerOpacity(id: String, opacity: Float) = updateScene { LayerOps.setOpacity(it, id, opacity) }

    fun setLayerBlendMode(id: String, mode: BlendMode) = updateScene { LayerOps.setBlendMode(it, id, mode) }

    /**
     * Deletes a layer, keeping at least one in the scene and re-selecting a sensible
     * active layer if the deleted one was active.
     */
    fun deleteLayer(id: String) {
        val nextActive = LayerOps.activeAfterDelete(scene, id, activeLayerId)
        updateScene { LayerOps.delete(it, id) }
        activeLayerId = nextActive
    }

    /** Applies a validated edit to the current brush (from the settings panel). */
    fun updateBrush(transform: (Brush) -> Brush) {
        brush = transform(brush)
    }

    // --- Timeline editing ----------------------------------------------------

    /**
     * Posts GPU work to the engine on the GL thread. Used by duplicate/paste to clone a
     * source surface into a fresh one. [requestRender] is supplied by the host so the
     * canvas redraws once the clone lands.
     */
    var postEngineWork: ((block: (PaintEngine) -> Unit) -> Unit)? = null

    /** A copied/cut cel kept for paste. The pixels stay on its [Cel.surfaceId]. */
    var clipboardCel by mutableStateOf<Cel?>(null)
        private set

    val canPaste: Boolean get() = clipboardCel != null
    val hasCelAtCurrentFrame: Boolean get() = activeLayer.cels.containsKey(currentFrame)

    /** True if the active layer has an explicit (drawn) cel at [frame] — drag source test. */
    fun hasCelAt(frame: Int): Boolean = activeLayer.cels.containsKey(frame)

    /**
     * Moves the active layer's explicit cel from [from] to [to] (drag-to-move on the
     * timeline). The cel keeps its surfaceId — only its timeline position changes — so no
     * GPU work is needed. Selects the destination frame afterwards. No-op if there's no
     * cel at [from] or the indices are equal.
     */
    fun moveCel(from: Int, to: Int) {
        if (from == to) return
        if (!activeLayer.cels.containsKey(from)) return
        val dest = to.coerceIn(0, scene.frameCount - 1)
        updateLayer(activeLayerId) { TimelineOps.moveCel(it, from, dest) }
        currentFrame = dest
    }

    /** Clears the explicit cel at the current frame on the active layer. */
    fun clearCelAtCurrentFrame() {
        updateLayer(activeLayerId) { TimelineOps.clearCel(it, currentFrame) }
    }

    /** Copies the current frame's explicit cel to the clipboard. */
    fun copyCel() {
        clipboardCel = TimelineOps.explicitCel(activeLayer, currentFrame)
    }

    /** Cut = copy then clear. */
    fun cutCel() {
        val cel = TimelineOps.explicitCel(activeLayer, currentFrame) ?: return
        clipboardCel = cel
        updateLayer(activeLayerId) { TimelineOps.clearCel(it, currentFrame) }
    }

    /**
     * Duplicates the current frame's cel onto the next frame as an independent drawing,
     * cloning its pixels into a fresh surface, then advances to it.
     */
    fun duplicateCelToNextFrame() {
        val src = TimelineOps.explicitCel(activeLayer, currentFrame) ?: return
        val to = currentFrame + 1
        val newId = surfaceIds.getAndIncrement()
        // Ensure room on the timeline if duplicating past the end.
        if (to >= scene.frameCount) updateScene { TimelineOps.insertFrames(it, scene.frameCount, to - scene.frameCount + 1) }
        updateLayer(activeLayerId) { TimelineOps.duplicateCel(it, currentFrame, to, newId) }
        postEngineWork?.invoke { engine -> engine.cloneSurface(src.surfaceId, newId) }
        currentFrame = to
    }

    /** Pastes the clipboard cel onto the current frame as an independent drawing. */
    fun pasteCel() {
        val clip = clipboardCel ?: return
        val newId = surfaceIds.getAndIncrement()
        updateLayer(activeLayerId) { TimelineOps.pasteCel(it, currentFrame, clip, newId) }
        postEngineWork?.invoke { engine -> engine.cloneSurface(clip.surfaceId, newId) }
    }

    /** Inserts a blank frame at the current position (shifts later cels right). */
    fun insertFrame() {
        updateScene { TimelineOps.insertFrames(it, currentFrame, 1) }
    }

    /** Removes the current frame across all layers (shifts later cels left). */
    fun removeFrame() {
        updateScene { TimelineOps.removeFrames(it, currentFrame, 1) }
        currentFrame = currentFrame.coerceIn(0, scene.frameCount - 1)
    }

    /** Holds the current drawing [holdFrames] longer by inserting frames after it. */
    fun extendExposure(holdFrames: Int = 1) {
        updateScene { TimelineOps.extendExposure(it, currentFrame, holdFrames) }
    }

    fun updateLayer(id: String, transform: (Layer) -> Layer) {
        updateScene { sc -> sc.copy(layers = sc.layers.map { if (it.id == id) transform(it) else it }) }
    }

    private fun updateScene(transform: (Scene) -> Scene) {
        project = project.copy(
            scenes = project.scenes.map { if (it.id == scene.id) transform(it) else it },
            modifiedAtEpochMs = System.currentTimeMillis(),
        )
    }

    private companion object {
        fun newProject(): Project {
            val layer = Layer(name = "Layer 1")
            val scene = Scene(name = "Scene 1", frameCount = 24, layers = listOf(layer))
            return Project(
                name = "Untitled",
                canvas = CanvasSpec(widthPx = 1280, heightPx = 720, fps = 24),
                scenes = listOf(scene),
            )
        }
    }
}
