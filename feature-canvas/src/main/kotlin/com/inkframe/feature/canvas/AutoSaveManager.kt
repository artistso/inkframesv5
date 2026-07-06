package com.inkframe.feature.canvas

import android.content.Context
import com.inkframe.core.model.Project
import com.inkframe.engine.gl.PaintEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream

/**
 * Periodically saves the current project to a private autosave file in the app's
 * internal storage. Runs every [intervalMs] milliseconds while active.
 *
 * The autosave file lives at:
 *   <filesDir>/autosave/autosave.inkframe
 *
 * On a successful save, [onSaved] is called on the main thread with the file.
 * On failure, [onError] is called with the exception.
 *
 * Usage:
 *   val mgr = AutoSaveManager(context)
 *   mgr.start(canvasView, studioState::project)
 *   // ... on app exit or explicit save:
 *   mgr.stop()
 *
 * The autosave is intentionally separate from the user's chosen SAF destination so
 * it never overwrites a file the user hasn't explicitly saved to.
 */
class AutoSaveManager(
    private val context: Context,
    private val intervalMs: Long = AUTOSAVE_INTERVAL_MS,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var job: Job? = null

    val autosaveFile: File
        get() = File(context.filesDir, "autosave/autosave.inkframe")

    /**
     * Starts the autosave loop. [canvasView] is used to post pixel read-back onto the
     * GL thread; [projectProvider] is called on the main thread to snapshot the current
     * document model.
     *
     * Calling [start] while already running replaces the previous loop.
     */
    fun start(
        canvasView: CanvasView,
        projectProvider: () -> Project,
        onSaved: ((File) -> Unit)? = null,
        onError: ((Throwable) -> Unit)? = null,
    ) {
        job?.cancel()
        job = scope.launch {
            while (isActive) {
                delay(intervalMs)
                if (!isActive) break
                val project = projectProvider()
                save(canvasView, project, onSaved, onError)
            }
        }
    }

    /** Stops the autosave loop. Safe to call multiple times. */
    fun stop() {
        job?.cancel()
        job = null
    }

    /**
     * Performs a single immediate autosave. Pixel read-back runs on the GL thread;
     * [onSaved]/[onError] are invoked on the main thread via [CanvasView.post].
     */
    fun saveNow(
        canvasView: CanvasView,
        project: Project,
        onSaved: ((File) -> Unit)? = null,
        onError: ((Throwable) -> Unit)? = null,
    ) {
        save(canvasView, project, onSaved, onError)
    }

    private fun save(
        canvasView: CanvasView,
        project: Project,
        onSaved: ((File) -> Unit)?,
        onError: ((Throwable) -> Unit)?,
    ) {
        val file = autosaveFile
        canvasView.runOnEngine { engine: PaintEngine ->
            val result = runCatching {
                file.parentFile?.mkdirs()
                // Write to a temp file first, then atomically rename to avoid a corrupt
                // autosave if the process is killed mid-write.
                val tmp = File(file.parent, "autosave.tmp")
                BufferedOutputStream(FileOutputStream(tmp)).use { out ->
                    com.inkframe.core.model.ProjectPackage.write(project, engine.celImageIO(), out)
                }
                tmp.renameTo(file)
                file
            }
            canvasView.post {
                result.fold(
                    onSuccess = { f -> onSaved?.invoke(f) },
                    onFailure = { e -> onError?.invoke(e) },
                )
            }
        }
    }

    /** True if an autosave file exists and can be offered as a recovery option. */
    fun hasAutosave(): Boolean = autosaveFile.exists() && autosaveFile.length() > 0

    /** Deletes the autosave file (call after the user explicitly saves or discards). */
    fun clearAutosave() { autosaveFile.delete() }

    companion object {
        /** Default autosave interval: 60 seconds. */
        const val AUTOSAVE_INTERVAL_MS = 60_000L
    }
}
