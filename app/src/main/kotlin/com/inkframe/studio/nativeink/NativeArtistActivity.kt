package com.inkframe.studio.nativeink

import android.Manifest
import android.app.AlertDialog
import android.content.ContentValues
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/** Non-exported engineering harness for InkFrame's Kotlin native canvas. */
class NativeArtistActivity : ComponentActivity() {
    private lateinit var canvasView: NativeArtistCanvasView
    private lateinit var undoButton: Button
    private lateinit var redoButton: Button
    private lateinit var paperButton: Button
    private lateinit var sizeControl: SeekBar
    private lateinit var statusText: TextView
    private lateinit var repository: NativeProjectRepository

    private val mainHandler = Handler(Looper.getMainLooper())
    private val ioExecutor = Executors.newSingleThreadExecutor()
    private val autosaveRunnable = Runnable { saveCurrentProject(explicit = false) }

    private val paperColors = intArrayOf(
        0xFF100A12.toInt(),
        0xFF160018.toInt(),
        0xFFFFF0F3.toInt(),
        0xFFF5F5F0.toInt(),
        Color.WHITE,
    )

    private var paperIndex = 0
    private var exportAfterPermission = false
    private var restoringProject = true
    private var currentProjectId = UUID.randomUUID().toString()
    private var currentProjectName = freshProjectName()
    private var saveGeneration = 0L
    private var saveStatus = "Loading native project…"

    private val storagePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (exportAfterPermission) {
            exportAfterPermission = false
            if (granted) exportPng() else toast("Storage permission is required to save PNG files.")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        repository = NativeProjectRepository(this)

        canvasView = NativeArtistCanvasView(this)
        statusText = TextView(this).apply {
            textSize = 11f
            setTextColor(0xFFFFE9F0.toInt())
            typeface = android.graphics.Typeface.MONOSPACE
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        undoButton = controlButton("UNDO") { canvasView.undo() }
        redoButton = controlButton("REDO") { canvasView.redo() }
        paperButton = controlButton("PAPER") { cyclePaper() }

        val primaryControls = horizontalRow(
            controlButton("STUDIO") { finish() },
            controlButton("NEW") { confirmNewProject() },
            controlButton("SAVE") { saveCurrentProject(explicit = true) },
            undoButton,
            redoButton,
            controlButton("CLEAR") { canvasView.clearCanvas() },
            controlButton("SAVE PNG") { requestExport() },
            paperButton,
        )

        val sizeLabel = TextView(this).apply {
            text = "SIZE"
            textSize = 10f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), 0, dp(4), 0)
        }
        sizeControl = SeekBar(this).apply {
            max = 63
            progress = 9
            minimumWidth = dp(220)
            contentDescription = "Native brush size"
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                    if (fromUser) canvasView.setBrushSizePx(dpFloat((progress + 1).toFloat()))
                }

                override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
                override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
            })
        }

        val paletteControls = horizontalRow(
            sizeLabel,
            sizeControl,
            colorButton("PINK", 0xFFFFE9F0.toInt()),
            colorButton("WHITE", Color.WHITE),
            colorButton("BLACK", 0xFF050208.toInt()),
            colorButton("CYAN", 0xFF71E6FF.toInt()),
            colorButton("MAGENTA", 0xFFFF4F91.toInt()),
            colorButton("GOLD", 0xFFFFC857.toInt()),
        )

        val title = TextView(this).apply {
            text = "INKFRAME · NATIVE CANVAS HARNESS"
            textSize = 15f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        val explanation = TextView(this).apply {
            text = "Internal Kotlin/HWUI canvas validation · reverse stylus erases · fingers are palm contact"
            textSize = 10f
            setTextColor(0xFFD8BCC9.toInt())
        }

        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(10))
            backgroundTintList = ColorStateList.valueOf(0xE81D101B.toInt())
            setBackgroundColor(0xE81D101B.toInt())
            elevation = dp(8).toFloat()
            addView(title)
            addView(
                explanation,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = dp(2) },
            )
            addView(
                statusText,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = dp(5) },
            )
            addView(
                scrollRow(primaryControls),
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dp(48),
                ).apply { topMargin = dp(6) },
            )
            addView(
                scrollRow(paletteControls),
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dp(48),
                ).apply { topMargin = dp(2) },
            )
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(0xFF09070B.toInt())
            addView(
                canvasView,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )
            addView(
                panel,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    Gravity.TOP,
                ),
            )
        }

        setContentView(root)
        canvasView.stateListener = ::renderState
        canvasView.documentMutationListener = ::scheduleAutosave
        renderState(canvasView.snapshotState())
        restoreCurrentProject()
        hideSystemBars()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onPause() {
        canvasView.cancelActiveInput()
        if (!restoringProject) saveCurrentProject(explicit = false)
        super.onPause()
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(autosaveRunnable)
        canvasView.stateListener = null
        canvasView.documentMutationListener = null
        ioExecutor.shutdown()
        super.onDestroy()
    }

    private fun restoreCurrentProject() {
        ioExecutor.execute {
            val result = runCatching { repository.loadCurrent() }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                result.onSuccess { load ->
                    if (load == null) {
                        startNewProject(saveImmediately = true)
                        saveStatus = "New native project · autosave enabled"
                    } else {
                        currentProjectId = load.project.id
                        currentProjectName = load.project.name
                        canvasView.loadProject(load.project)
                        syncControls(load.project)
                        saveStatus = if (load.recoveredFromBackup) {
                            "Recovered last complete autosave backup"
                        } else {
                            "Restored autosave"
                        }
                    }
                }.onFailure { error ->
                    startNewProject(saveImmediately = false)
                    saveStatus = "Recovery failed: ${error.message ?: "invalid project"}"
                }
                restoringProject = false
                renderState(canvasView.snapshotState())
            }
        }
    }

    private fun scheduleAutosave() {
        if (restoringProject || isFinishing || isDestroyed) return
        saveStatus = "Unsaved changes"
        renderState(canvasView.snapshotState())
        mainHandler.removeCallbacks(autosaveRunnable)
        mainHandler.postDelayed(autosaveRunnable, AUTOSAVE_DELAY_MILLIS)
    }

    private fun saveCurrentProject(explicit: Boolean) {
        if (!::repository.isInitialized || restoringProject || isDestroyed) return
        mainHandler.removeCallbacks(autosaveRunnable)
        val generation = ++saveGeneration
        val project = canvasView.createProjectSnapshot(
            id = currentProjectId,
            name = currentProjectName,
            updatedAtMillis = System.currentTimeMillis(),
        )
        saveStatus = "Saving editable project…"
        renderState(canvasView.snapshotState())
        ioExecutor.execute {
            val result = runCatching { repository.saveCurrent(project) }
            runOnUiThread {
                if (isDestroyed || generation != saveGeneration) return@runOnUiThread
                result.onSuccess {
                    saveStatus = "Saved ${clockTime()}"
                    if (explicit) toast("Native project saved")
                }.onFailure { error ->
                    saveStatus = "Save failed: ${error.message ?: "unknown error"}"
                    if (explicit) toast(saveStatus)
                }
                renderState(canvasView.snapshotState())
            }
        }
    }

    private fun confirmNewProject() {
        AlertDialog.Builder(this)
            .setTitle("Start a new native project?")
            .setMessage(
                "The current project will be saved first. The new canvas replaces only the " +
                    "internal native autosave; normal InkFrame projects remain untouched.",
            )
            .setNegativeButton("Cancel", null)
            .setPositiveButton("New project") { _, _ ->
                saveCurrentProject(explicit = false)
                startNewProject(saveImmediately = true)
            }
            .show()
    }

    private fun startNewProject(saveImmediately: Boolean) {
        restoringProject = true
        currentProjectId = UUID.randomUUID().toString()
        currentProjectName = freshProjectName()
        paperIndex = 0
        val width = resources.displayMetrics.widthPixels.coerceIn(
            NativeProject.MIN_DIMENSION,
            NativeProject.MAX_DIMENSION,
        )
        val height = resources.displayMetrics.heightPixels.coerceIn(
            NativeProject.MIN_DIMENSION,
            NativeProject.MAX_DIMENSION,
        )
        canvasView.startBlankProject(
            width = width,
            height = height,
            paperColor = paperColors[paperIndex],
            inkColor = 0xFFFFE9F0.toInt(),
            brushSizePx = dpFloat(10f),
        )
        sizeControl.progress = 9
        paperButton.backgroundTintList = ColorStateList.valueOf(
            contrastButtonColor(paperColors[paperIndex]),
        )
        restoringProject = false
        saveStatus = "New project"
        renderState(canvasView.snapshotState())
        if (saveImmediately) saveCurrentProject(explicit = false)
    }

    private fun syncControls(project: NativeProject) {
        paperIndex = paperColors.indexOf(project.paperColor).takeIf { it >= 0 } ?: 0
        paperButton.backgroundTintList = ColorStateList.valueOf(
            contrastButtonColor(project.paperColor),
        )
        val sizeDp = project.brushSizePx / resources.displayMetrics.density
        sizeControl.progress = (sizeDp.roundToInt() - 1).coerceIn(0, sizeControl.max)
    }

    private fun renderState(state: NativeArtistCanvasView.State) {
        undoButton.isEnabled = state.canUndo
        redoButton.isEnabled = state.canRedo
        val sizeDp = state.brushSizePx / resources.displayMetrics.density
        statusText.text = buildString {
            append(currentProjectName)
            append(" · ")
            append(state.projectWidth)
            append('×')
            append(state.projectHeight)
            append(" · strokes ")
            append(state.strokeCount)
            append(" · samples ")
            append(state.sampleCount)
            append(" · brush ")
            append(String.format(Locale.US, "%.0f dp", sizeDp))
            append(" · ")
            append(saveStatus)
        }
    }

    private fun cyclePaper() {
        paperIndex = (paperIndex + 1) % paperColors.size
        canvasView.setPaperColor(paperColors[paperIndex])
        paperButton.backgroundTintList = ColorStateList.valueOf(
            contrastButtonColor(paperColors[paperIndex]),
        )
    }

    private fun requestExport() {
        if (
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            exportAfterPermission = true
            storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            return
        }
        exportPng()
    }

    private fun exportPng() {
        val bitmap = canvasView.renderBitmap()
        val fileName = "InkFrame-Native-${timestamp()}.png"
        ioExecutor.execute {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    saveWithMediaStore(bitmap, fileName)
                } else {
                    saveLegacy(bitmap, fileName)
                }
                runOnUiThread { toast("Saved $fileName to Pictures/InkFrame") }
            } catch (error: Throwable) {
                runOnUiThread { toast("PNG export failed: ${error.message ?: "unknown error"}") }
            } finally {
                bitmap.recycle()
            }
        }
    }

    private fun saveWithMediaStore(bitmap: Bitmap, fileName: String) {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/InkFrame")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            ?: error("MediaStore refused the export")
        try {
            contentResolver.openOutputStream(uri)?.use { stream ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
                    "PNG encoder returned false"
                }
            } ?: error("Unable to open export stream")
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            contentResolver.update(uri, values, null, null)
        } catch (error: Throwable) {
            contentResolver.delete(uri, null, null)
            throw error
        }
    }

    @Suppress("DEPRECATION")
    private fun saveLegacy(bitmap: Bitmap, fileName: String) {
        val directory = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
            "InkFrame",
        )
        check(directory.exists() || directory.mkdirs()) { "Unable to create Pictures/InkFrame" }
        FileOutputStream(File(directory, fileName)).use { stream ->
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
                "PNG encoder returned false"
            }
        }
    }

    private fun colorButton(label: String, color: Int): Button = controlButton(label) {
        canvasView.setInkColor(color)
    }.apply {
        backgroundTintList = ColorStateList.valueOf(contrastButtonColor(color))
    }

    private fun contrastButtonColor(color: Int): Int {
        val luminance =
            0.2126 * Color.red(color) + 0.7152 * Color.green(color) + 0.0722 * Color.blue(color)
        return if (luminance > 170.0) 0xFF6A1646.toInt() else color
    }

    private fun horizontalRow(vararg children: View): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        children.forEach(::addView)
    }

    private fun scrollRow(row: View): HorizontalScrollView = HorizontalScrollView(this).apply {
        isHorizontalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        addView(
            row,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
    }

    private fun controlButton(label: String, action: () -> Unit): Button = Button(this).apply {
        text = label
        textSize = 10f
        isAllCaps = false
        setTextColor(Color.WHITE)
        backgroundTintList = ColorStateList.valueOf(0xFF6A1646.toInt())
        minimumHeight = dp(40)
        minimumWidth = dp(82)
        setPadding(dp(10), 0, dp(10), 0)
        setOnClickListener { action() }
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            dp(42),
        ).apply { marginEnd = dp(6) }
    }

    private fun hideSystemBars() {
        WindowCompat.getInsetsController(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun freshProjectName(): String =
        "Native ${SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date())}"

    private fun timestamp(): String = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
    private fun clockTime(): String = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
    private fun dpFloat(value: Float): Float = value * resources.displayMetrics.density
    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

    private companion object {
        const val AUTOSAVE_DELAY_MILLIS = 500L
    }
}
