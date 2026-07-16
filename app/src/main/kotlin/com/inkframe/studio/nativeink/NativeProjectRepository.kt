package com.inkframe.studio.nativeink

import android.content.Context
import java.io.File
import java.io.FileOutputStream

/** Local, app-private native project storage with one-generation recovery backup. */
class NativeProjectRepository private constructor(
    private val directory: File,
) {
    constructor(context: Context) : this(File(context.filesDir, DIRECTORY_NAME))

    fun saveCurrent(project: NativeProject) {
        ensureDirectory()
        val bytes = NativeProjectCodec.encode(project)
        val target = File(directory, CURRENT_FILE_NAME)
        val backup = File(directory, BACKUP_FILE_NAME)
        val temporary = File(directory, TEMPORARY_FILE_NAME)

        if (temporary.exists() && !temporary.delete()) {
            error("Unable to clear stale native project temporary file")
        }
        FileOutputStream(temporary).use { stream ->
            stream.write(bytes)
            stream.flush()
            stream.fd.sync()
        }

        if (backup.exists() && !backup.delete()) {
            temporary.delete()
            error("Unable to replace native project recovery backup")
        }
        if (target.exists() && !target.renameTo(backup)) {
            temporary.delete()
            error("Unable to rotate current native project into recovery backup")
        }
        if (!temporary.renameTo(target)) {
            if (backup.exists()) backup.renameTo(target)
            temporary.delete()
            error("Unable to publish native project atomically")
        }
    }

    fun loadCurrent(): NativeProjectLoad? {
        ensureDirectory()
        val target = File(directory, CURRENT_FILE_NAME)
        val backup = File(directory, BACKUP_FILE_NAME)
        if (!target.exists() && !backup.exists()) return null

        if (target.exists()) {
            try {
                return NativeProjectLoad(
                    project = NativeProjectCodec.decode(target.readBytes()),
                    recoveredFromBackup = false,
                )
            } catch (_: Throwable) {
                // Fall through to the last fully committed generation.
            }
        }
        if (backup.exists()) {
            return NativeProjectLoad(
                project = NativeProjectCodec.decode(backup.readBytes()),
                recoveredFromBackup = true,
            )
        }
        return null
    }

    fun clearCurrent() {
        ensureDirectory()
        listOf(CURRENT_FILE_NAME, BACKUP_FILE_NAME, TEMPORARY_FILE_NAME).forEach { name ->
            val file = File(directory, name)
            if (file.exists() && !file.delete()) error("Unable to delete native project file: $name")
        }
    }

    internal fun currentFileForTests(): File = File(directory, CURRENT_FILE_NAME)
    internal fun backupFileForTests(): File = File(directory, BACKUP_FILE_NAME)

    private fun ensureDirectory() {
        check(directory.exists() || directory.mkdirs()) { "Unable to create native project directory" }
        check(directory.isDirectory) { "Native project path is not a directory" }
    }

    companion object {
        private const val DIRECTORY_NAME = "native-projects"
        private const val CURRENT_FILE_NAME = "current.ifn"
        private const val BACKUP_FILE_NAME = "current.ifn.bak"
        private const val TEMPORARY_FILE_NAME = "current.ifn.tmp"

        internal fun forTests(directory: File): NativeProjectRepository = NativeProjectRepository(directory)
    }
}
