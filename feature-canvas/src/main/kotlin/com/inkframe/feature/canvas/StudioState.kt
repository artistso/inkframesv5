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
import com.inkframe.core.model.OnionGhost
import com.inkframe.core.model.OnionSkinPlanner
import com.inkframe.core.model.OnionSkinSettings
import com.inkframe.core.model.PlaybackOps
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
 * structure through this class.
 */
class StudioState : ViewModel() {

    var project by mutableStateOf(newProject())
        private set

    var activeLayerId by mutableStateOf(project.activeScene!!.layers.first().id)
    var currentFrame by mutableStateOf(0)
        private set
    var brush by mutableStateOf<Brush>(DefaultBrushes.ink)
    var color by mutableStateOf(RgbaColor.BLACK)
    var recentColors by mutableStateOf(RecentColors.empty())
        private set
    var showColorPicker by mutableStateOf(false)
    var eyedropperActive by mutableStateOf(false)
    var fillActive by mutableStateOf(false)
    var showBrushSettings by mutableStateOf(false)
    var renamingLayerId by mutableStateOf<String?>(null)

    fun commitColor(newColor: RgbaColor) {
        if (newColor.toArgb() != color.toArgb()) recentColors = recentColors.add(color)
        color = newColor
    }

    var onionSkin by mutableStateOf(OnionSkinSettings())
    var showOnionSettings by mutableStateOf(false)
    var isPlaying by mutableStateOf(false)
        private set
    private var playbackTicksRemaining = 1
    var showChecker by mutableStateOf(false)

    var canUndo by mutableStateOf(false)
        private set
    var canRedo by mutableStateOf(false)
        private set

    var statusMessage by mutableStateOf<String?>(null)
    private var _isBusy by mutableStateOf(false)
    val isBusy: Boolean get() = _isBusy

    var zoomPercent by mutableStateOf(100)
        private set

    fun setZoom(scale: Float) { zoomPercent = (scale * 100f).toInt().coerceAtLeast(1) }

    private var recoveryRestoreClaimed = false

    fun claimRecoveryRestore(): Boolean {
        if (recoveryRestoreClaimed) return false
        recoveryRestoreClaimed = true
        return true
    }

    fun markArtworkModified() {
        val now = System.currentTimeMillis()
        project = project.copy(modifiedAtEpochMs = maxOf(now, project.modifiedAtEpochMs + 1L))
    }

    val scene: Scene get() = project.activeScene!!
    val activeLayer: Layer get() = scene.layerById(activeLayerId) ?: scene.layers.first()
    val currentHold: Int get() = scene.holdAt(currentFrame)

    // --- Engine wiring -------------------------------------------------------

    private val surfaceIds = AtomicLong(1L)
    @Volatile private var engine: PaintEngine? = null
    var onUiInvalidate: (() -> Unit)? = null

    fun bindEngine(e: PaintEngine) {
        engine = e
        e.onHistoryChanged = {
            canUndo = e.canUndo
            canRedo = e.canRedo
            onUiInvalidate?.invoke()
        }
    }

    fun ensureActiveCel(): Long {
        val layer = activeLayer
        val existing = layer.cels[currentFrame]
        if (existing != null) return existing.surfaceId
        val sid = surfaceIds.getAndIncrement()
        updateLayer(layer.id) { it.copy(cels = it.cels + (currentFrame to Cel(surfaceId = sid))) }
        return sid
    }

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
            tintR = tint.r,
            tintG = tint.g,
            tintB = tint.b,
            tintStrength = tintStrength,
        )

    fun setBusy(busy: Boolean) { _isBusy = busy }

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
        playbackTicksRemaining = firstScene?.holdAt(0) ?: 1
    }

    fun setFrame(frame: Int) {
        currentFrame = frame.coerceIn(0, scene.frameCount - 1)
        playbackTicksRemaining = currentHold
    }

    fun togglePlay() {
        if (isPlaying) {
            stop()
            return
        }
        val range = PlaybackOps.clampRange(scene.playbackRange, scene.frameCount)
        if (PlaybackOps.length(range) <= 1) {
            isPlaying = false
            statusMessage = "ADD AT LEAST 2 FRAMES TO PLAY"
            return
        }
        if (currentFrame !in range || currentFrame == range.last) currentFrame = range.first
        playbackTicksRemaining = currentHold
        isPlaying = true
    }

    fun stop() {
        isPlaying = false
        playbackTicksRemaining = currentHold
    }

    /** Milliseconds per timing tick at the project frame rate. */
    val frameDurationMs: Long get() = PlaybackOps.frameDurationMs(project.canvas.fps)

    fun advancePlayback() {
        val tick = PlaybackOps.nextTick(
            current = currentFrame,
            range = scene.playbackRange,
            loop = scene.loop,
            ticksRemaining = playbackTicksRemaining,
            holdAt = scene::holdAt,
        )
        currentFrame = tick.frame
        playbackTicksRemaining = tick.ticksRemaining.coerceAtLeast(1)
        if (!tick.stillPlaying) isPlaying = false
    }

    // --- Playback range, FPS, loop and holds ---------------------------------

    fun setInPointToCurrent() = updateScene {
        it.copy(playbackRange = PlaybackOps.setInPoint(it.playbackRange, currentFrame, it.frameCount))
    }

    fun setOutPointToCurrent() = updateScene {
        it.copy(playbackRange = PlaybackOps.setOutPoint(it.playbackRange, currentFrame, it.frameCount))
    }

    fun clearPlaybackRange() = updateScene {
        it.copy(playbackRange = PlaybackOps.fullRange(it.frameCount))
    }

    fun toggleLoop() = updateScene { it.copy(loop = !it.loop) }

    fun setFps(fps: Int) {
        project = project.copy(
            canvas = project.canvas.copy(fps = PlaybackOps.clampFps(fps)),
            modifiedAtEpochMs = System.currentTimeMillis(),
        )
    }

    fun setCurrentHold(hold: Int) {
        updateScene { TimelineOps.setHold(it, currentFrame, hold) }
        playbackTicksRemaining = currentHold
        statusMessage = "HOLD · $currentHold"
    }

    fun adjustCurrentHold(delta: Int) = setCurrentHold(currentHold + delta)

    fun addLayer(name: String = "Layer ${scene.layers.size + 1}") {
        val layer = Layer(name = name)
        updateScene { it.copy(layers = it.layers + layer) }
        activeLayerId = layer.id
    }

    // --- Layer management ----------------------------------------------------

    fun moveLayerUp(id: String) = updateScene { LayerOps.moveUp(it, id) }
    fun moveLayerDown(id: String) = updateScene { LayerOps.moveDown(it, id) }
    fun renameLayer(id: String, name: String) = updateScene { LayerOps.rename(it, id, name) }
    fun toggleLayerVisible(id: String) = updateScene { LayerOps.toggleVisible(it, id) }
    fun toggleLayerLocked(id: String) = updateScene { LayerOps.toggleLocked(it, id) }
    fun setLayerOpacity(id: String, opacity: Float) = updateScene { LayerOps.setOpacity(it, id, opacity) }
    fun setLayerBlendMode(id: String, mode: BlendMode) = updateScene { LayerOps.setBlendMode(it, id, mode) }

    fun deleteLayer(id: String) {
        val nextActive = LayerOps.activeAfterDelete(scene, id, activeLayerId)
        updateScene { LayerOps.delete(it, id) }
        activeLayerId = nextActive
    }

    fun updateBrush(transform: (Brush) -> Brush) {
        brush = transform(brush)
    }

    // --- Timeline editing ----------------------------------------------------

    var postEngineWork: ((block: (PaintEngine) -> Unit) -> Unit)? = null

    var clipboardCel by mutableStateOf<Cel?>(null)
        private set

    val canPaste: Boolean get() = clipboardCel != null
    val hasCelAtCurrentFrame: Boolean get() = activeLayer.cels.containsKey(currentFrame)

    fun hasCelAt(frame: Int): Boolean = activeLayer.cels.containsKey(frame)

    fun moveCel(from: Int, to: Int) {
        if (from == to) return
        if (!activeLayer.cels.containsKey(from)) return
        val dest = to.coerceIn(0, scene.frameCount - 1)
        updateLayer(activeLayerId) { TimelineOps.moveCel(it, from, dest) }
        currentFrame = dest
        playbackTicksRemaining = currentHold
    }

    fun clearCelAtCurrentFrame() {
        updateLayer(activeLayerId) { TimelineOps.clearCel(it, currentFrame) }
    }

    fun copyCel() {
        clipboardCel = TimelineOps.explicitCel(activeLayer, currentFrame)
    }

    fun cutCel() {
        val cel = TimelineOps.explicitCel(activeLayer, currentFrame) ?: return
        clipboardCel = cel
        updateLayer(activeLayerId) { TimelineOps.clearCel(it, currentFrame) }
    }

    fun duplicateCelToNextFrame() {
        val src = TimelineOps.explicitCel(activeLayer, currentFrame) ?: return
        val sourceHold = currentHold
        val to = currentFrame + 1
        val newId = surfaceIds.getAndIncrement()
        if (to >= scene.frameCount) {
            updateScene { currentScene ->
                TimelineOps.insertFrames(currentScene, currentScene.frameCount, to - currentScene.frameCount + 1)
            }
            updateScene { TimelineOps.setHold(it, to, sourceHold) }
        }
        updateLayer(activeLayerId) { TimelineOps.duplicateCel(it, currentFrame, to, newId) }
        postEngineWork?.invoke { engine -> engine.cloneSurface(src.surfaceId, newId) }
        currentFrame = to
        playbackTicksRemaining = currentHold
    }

    fun pasteCel() {
        val clip = clipboardCel ?: return
        val newId = surfaceIds.getAndIncrement()
        updateLayer(activeLayerId) { TimelineOps.pasteCel(it, currentFrame, clip, newId) }
        postEngineWork?.invoke { engine -> engine.cloneSurface(clip.surfaceId, newId) }
    }

    fun insertFrame() {
        val insertionFrame = (currentFrame + 1).coerceAtMost(scene.frameCount)
        updateScene { currentScene ->
            val inserted = TimelineOps.insertFrames(currentScene, insertionFrame, 1)
            inserted.copy(playbackRange = PlaybackOps.fullRange(inserted.frameCount))
        }
        currentFrame = insertionFrame
        playbackTicksRemaining = currentHold
        isPlaying = false
    }

    fun removeFrame() {
        updateScene { TimelineOps.removeFrames(it, currentFrame, 1) }
        currentFrame = currentFrame.coerceIn(0, scene.frameCount - 1)
        playbackTicksRemaining = currentHold
    }

    fun extendExposure(holdFrames: Int = 1) {
        updateScene { TimelineOps.extendExposure(it, currentFrame, holdFrames) }
        playbackTicksRemaining = currentHold
        statusMessage = "HOLD · $currentHold"
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
