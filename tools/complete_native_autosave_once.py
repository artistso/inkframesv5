from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:160]!r}")
    file.write_text(text.replace(old, new, 1))


# CanvasView: atomic package writes and explicit artwork-change notifications.
canvas = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/CanvasView.kt"
replace_once(
    canvas,
    "import android.opengl.GLSurfaceView\n",
    "import android.opengl.GLSurfaceView\nimport android.util.AtomicFile\n",
)
replace_once(
    canvas,
    "    /** Visible QA signal proving that Android contact reached the native canvas. */\n    var onStrokeInput: ((String) -> Unit)? = null\n",
    "    /** Visible QA signal proving that Android contact reached the native canvas. */\n    var onStrokeInput: ((String) -> Unit)? = null\n\n    /** Invoked on the main thread after pixels have changed and recovery should be refreshed. */\n    var onArtworkChanged: (() -> Unit)? = null\n",
)
replace_once(
    canvas,
    "                val changed = engine.floodFill(cfg.targetSurfaceId, px, py, cfg.color)\n                post { onFilled?.invoke(changed) }\n",
    "                val changed = engine.floodFill(cfg.targetSurfaceId, px, py, cfg.color)\n                post {\n                    onFilled?.invoke(changed)\n                    if (changed) onArtworkChanged?.invoke()\n                }\n",
)
replace_once(
    canvas,
    "    fun undo() {\n        renderer.post(CanvasRenderer.EngineEvent.Undo)\n        requestRender()\n    }\n\n    /** Requests a redo on the GL thread. */\n    fun redo() {\n        renderer.post(CanvasRenderer.EngineEvent.Redo)\n        requestRender()\n    }\n",
    "    fun undo() {\n        renderer.post(CanvasRenderer.EngineEvent.Undo)\n        onArtworkChanged?.invoke()\n        requestRender()\n    }\n\n    /** Requests a redo on the GL thread. */\n    fun redo() {\n        renderer.post(CanvasRenderer.EngineEvent.Redo)\n        onArtworkChanged?.invoke()\n        requestRender()\n    }\n",
)
replace_once(
    canvas,
    "    fun saveProject(project: Project, file: File, onResult: (Result<Unit>) -> Unit) {\n        runOnEngine { engine ->\n            val result = runCatching {\n                file.parentFile?.mkdirs()\n                BufferedOutputStream(FileOutputStream(file)).use { out ->\n                    ProjectPackage.write(project, engine.celImageIO(), out)\n                }\n            }\n            onResult(result)\n        }\n    }\n",
    "    fun saveProject(project: Project, file: File, onResult: (Result<Unit>) -> Unit) {\n        runOnEngine { engine ->\n            val result = runCatching {\n                file.parentFile?.mkdirs()\n                BufferedOutputStream(FileOutputStream(file)).use { out ->\n                    ProjectPackage.write(project, engine.celImageIO(), out)\n                }\n            }\n            onResult(result)\n        }\n    }\n\n    /**\n     * Writes a complete recovery package with Android's two-phase [AtomicFile] protocol.\n     * A killed process therefore leaves either the previous valid archive or the new one,\n     * never a partially written ZIP. The callback runs on the GL thread.\n     */\n    fun saveProjectAtomically(project: Project, file: File, onResult: (Result<Unit>) -> Unit) {\n        runOnEngine { engine ->\n            val result = runCatching {\n                file.parentFile?.mkdirs()\n                val atomicFile = AtomicFile(file)\n                var stream: FileOutputStream? = null\n                try {\n                    stream = atomicFile.startWrite()\n                    val buffered = BufferedOutputStream(stream)\n                    ProjectPackage.write(project, engine.celImageIO(), buffered)\n                    buffered.flush()\n                    atomicFile.finishWrite(checkNotNull(stream))\n                } catch (error: Throwable) {\n                    stream?.let { output -> runCatching { atomicFile.failWrite(output) } }\n                    throw error\n                }\n            }\n            onResult(result)\n        }\n    }\n",
)
replace_once(
    canvas,
    "                if (mode == Mode.DRAW) {\n                    renderer.post(CanvasRenderer.EngineEvent.End)\n                }\n",
    "                if (mode == Mode.DRAW) {\n                    renderer.post(CanvasRenderer.EngineEvent.End)\n                    onArtworkChanged?.invoke()\n                }\n",
)
replace_once(
    canvas,
    "                if (mode == Mode.DRAW) {\n                    renderer.post(CanvasRenderer.EngineEvent.End)\n                    onStrokeInput?.invoke(\"INK COMMITTED · FRAME ${cfg.targetSurfaceId}\")\n                }\n",
    "                if (mode == Mode.DRAW) {\n                    renderer.post(CanvasRenderer.EngineEvent.End)\n                    onStrokeInput?.invoke(\"INK COMMITTED · FRAME ${cfg.targetSurfaceId}\")\n                    onArtworkChanged?.invoke()\n                }\n",
)

# StudioState: configuration-safe restore claim and monotonic artwork modification time.
state = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/StudioState.kt"
replace_once(
    state,
    "    fun setZoom(scale: Float) { zoomPercent = (scale * 100f).toInt().coerceAtLeast(1) }\n\n    val scene: Scene get() = project.activeScene!!\n",
    "    fun setZoom(scale: Float) { zoomPercent = (scale * 100f).toInt().coerceAtLeast(1) }\n\n    private var recoveryRestoreClaimed = false\n\n    /** Allows exactly one recovery attempt for this ViewModel, including configuration changes. */\n    fun claimRecoveryRestore(): Boolean {\n        if (recoveryRestoreClaimed) return false\n        recoveryRestoreClaimed = true\n        return true\n    }\n\n    /** Records pixel-only edits so autosave observes strokes, fills, undo and redo. */\n    fun markArtworkModified() {\n        val now = System.currentTimeMillis()\n        project = project.copy(modifiedAtEpochMs = maxOf(now, project.modifiedAtEpochMs + 1L))\n    }\n\n    val scene: Scene get() = project.activeScene!!\n",
)

# Recovery controller: bounded debounce, in-flight coalescing, validation and quarantine.
controller = Path("feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/ProjectRecoveryController.kt")
controller.write_text(
    '''package com.inkframe.feature.canvas

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.inkframe.core.model.Project
import com.inkframe.core.model.ProjectPackage
import java.io.File
import java.io.FileInputStream

/**
 * Owns the single local crash-recovery archive for the active native project.
 *
 * Saves are debounced while the artist is drawing, serialized through [CanvasView]'s GL queue,
 * and committed atomically. At most one follow-up save is retained while a write is in flight,
 * preventing an unbounded backlog on large animation documents.
 */
internal class ProjectRecoveryController(
    context: Context,
    private val projectProvider: () -> Project,
    private val shouldRestore: () -> Boolean,
    private val onRestored: (Project) -> Unit,
    private val onStatus: (String) -> Unit,
) {
    private val recoveryDirectory = File(context.applicationContext.filesDir, "recovery")
    private val recoveryFile = File(recoveryDirectory, "current.inkframe")
    private val invalidFile = File(recoveryDirectory, "invalid-recovery.inkframe")
    private val handler = Handler(Looper.getMainLooper())
    private val saveRunnable = Runnable { saveNow() }

    private var canvas: CanvasView? = null
    private var restoreInFlight = false
    private var saveInFlight = false
    private var saveAgain = false

    fun attach(view: CanvasView) {
        canvas = view
        if (shouldRestore()) restoreIfPresent(view)
    }

    fun schedule(delayMs: Long = AUTOSAVE_DELAY_MS) {
        if (canvas == null) return
        if (restoreInFlight) {
            saveAgain = true
            return
        }
        handler.removeCallbacks(saveRunnable)
        if (delayMs <= 0L) handler.post(saveRunnable) else handler.postDelayed(saveRunnable, delayMs)
    }

    fun saveNow() {
        handler.removeCallbacks(saveRunnable)
        val view = canvas ?: return
        if (restoreInFlight || saveInFlight) {
            saveAgain = true
            return
        }

        saveInFlight = true
        val snapshot = projectProvider()
        view.saveProjectAtomically(snapshot, recoveryFile) { result ->
            view.post {
                saveInFlight = false
                result.exceptionOrNull()?.let { error ->
                    onStatus("AUTOSAVE FAILED · ${error.message ?: "UNKNOWN ERROR"}")
                }
                if (saveAgain) {
                    saveAgain = false
                    schedule(0L)
                }
            }
        }
    }

    fun close() {
        handler.removeCallbacks(saveRunnable)
        canvas = null
    }

    private fun restoreIfPresent(view: CanvasView) {
        if (!recoveryFile.isFile || recoveryFile.length() == 0L) return

        val document = runCatching {
            FileInputStream(recoveryFile).buffered().use { input ->
                ProjectPackage.readDocumentOnly(input)
            }
        }.getOrElse { error ->
            quarantineInvalidRecovery()
            onStatus("IGNORED INVALID RECOVERY · ${error.message ?: "CORRUPT ARCHIVE"}")
            return
        }

        restoreInFlight = true
        onStatus("RESTORING ${document.name.uppercase()}…")
        view.loadProject(recoveryFile) { result ->
            view.post {
                restoreInFlight = false
                result.fold(
                    onSuccess = { project ->
                        onRestored(project)
                        view.requestRender()
                        onStatus("RECOVERED ${project.name.uppercase()}")
                    },
                    onFailure = { error ->
                        quarantineInvalidRecovery()
                        onStatus("RECOVERY FAILED · ${error.message ?: "UNKNOWN ERROR"}")
                    },
                )
                if (saveAgain) {
                    saveAgain = false
                    schedule(0L)
                }
            }
        }
    }

    private fun quarantineInvalidRecovery() {
        recoveryDirectory.mkdirs()
        invalidFile.delete()
        if (recoveryFile.exists()) recoveryFile.renameTo(invalidFile)
    }

    private companion object {
        const val AUTOSAVE_DELAY_MS = 3_000L
    }
}
'''
)

# Glass Horizon wiring: restore on first native canvas, observe model/pixel edits, flush on pause.
screen = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/GlassHorizonScreen.kt"
replace_once(
    screen,
    "    val context = LocalContext.current\n    val resolver = context.contentResolver\n\n    val saveLauncher = rememberLauncherForActivityResult(\n",
    "    val context = LocalContext.current\n    val resolver = context.contentResolver\n    val recoveryController = remember(context, state) {\n        ProjectRecoveryController(\n            context = context,\n            projectProvider = { state.project },\n            shouldRestore = state::claimRecoveryRestore,\n            onRestored = { loaded ->\n                state.replaceProject(loaded)\n                canvasView?.requestRender()\n            },\n            onStatus = { message -> state.statusMessage = message },\n        )\n    }\n\n    LaunchedEffect(state.project.modifiedAtEpochMs) {\n        recoveryController.schedule()\n    }\n\n    val saveLauncher = rememberLauncherForActivityResult(\n",
)
replace_once(
    screen,
    "            onCanvasReady = { canvasView = it },\n            modifier = Modifier\n",
    "            onCanvasReady = { view ->\n                canvasView = view\n                recoveryController.attach(view)\n            },\n            onArtworkChanged = state::markArtworkModified,\n            modifier = Modifier\n",
)
replace_once(
    screen,
    "                    \"Native project browsing, import, export and recovery remain required parity work.\",\n",
    "                    \"Crash-safe local autosave and startup recovery are active for the native project.\",\n",
)
replace_once(
    screen,
    "                Lifecycle.Event.ON_PAUSE -> canvasView?.onPause()\n                Lifecycle.Event.ON_RESUME -> canvasView?.onResume()\n",
    "                Lifecycle.Event.ON_PAUSE -> {\n                    recoveryController.saveNow()\n                    canvasView?.onPause()\n                }\n                Lifecycle.Event.ON_RESUME -> canvasView?.onResume()\n",
)
replace_once(
    screen,
    "            lifecycleOwner.lifecycle.removeObserver(observer)\n            state.stop()\n",
    "            lifecycleOwner.lifecycle.removeObserver(observer)\n            recoveryController.close()\n            state.stop()\n",
)
replace_once(
    screen,
    "    frameHeight: Dp,\n    onCanvasReady: (CanvasView) -> Unit,\n    modifier: Modifier = Modifier,\n",
    "    frameHeight: Dp,\n    onCanvasReady: (CanvasView) -> Unit,\n    onArtworkChanged: () -> Unit,\n    modifier: Modifier = Modifier,\n",
)
replace_once(
    screen,
    "                            view.onStrokeInput = { status -> state.statusMessage = status }\n",
    "                            view.onStrokeInput = { status -> state.statusMessage = status }\n                            view.onArtworkChanged = onArtworkChanged\n",
)

# Auditable parity and release notes.
registry = "docs/FEATURE_PARITY_REGISTRY.json"
replace_once(
    registry,
    '    {"id":"autosave-recovery","status":"missing","evidence":[]},\n',
    '    {"id":"autosave-recovery","status":"implemented_unverified","evidence":["ProjectRecoveryController.kt","CanvasView.kt:saveProjectAtomically"]},\n',
)

changelog = "CHANGELOG.md"
replace_once(
    changelog,
    "## [Unreleased]\n\n",
    "## [Unreleased]\n\n### Native Android — crash-safe project recovery\n- Added a debounced local `.inkframe` autosave that captures the complete structural document and cel pixels after native artwork or timeline changes.\n- Recovery writes use Android `AtomicFile`, coalesce edits while a large archive is being encoded, and flush when the studio pauses.\n- The first native canvas restores a valid recovery archive automatically; malformed archives are quarantined instead of repeatedly breaking startup.\n\n",
)
