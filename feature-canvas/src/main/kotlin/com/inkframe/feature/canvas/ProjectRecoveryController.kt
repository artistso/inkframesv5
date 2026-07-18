package com.inkframe.feature.canvas

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
