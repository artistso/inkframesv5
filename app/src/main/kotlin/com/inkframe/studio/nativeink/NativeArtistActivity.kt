package com.inkframe.studio.nativeink

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Environment
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

/** Artist-facing production entry point for InkFrame's Kotlin native canvas beta. */
class NativeArtistActivity : ComponentActivity() {
    private lateinit var canvasView: NativeArtistCanvasView
    private lateinit var undoButton: Button
    private lateinit var redoButton: Button
    private lateinit var paperButton: Button
    private lateinit var statusText: TextView

    private val paperColors = intArrayOf(
        0xFF100A12.toInt(),
        0xFF160018.toInt(),
        0xFFFFF0F3.toInt(),
        0xFFF5F5F0.toInt(),
        Color.WHITE,
    )
    private var paperIndex = 0
    private var exportAfterPermission = false

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
        val sizeControl = SeekBar(this).apply {
            max = 63
            progress = 9
            minWidth = dp(220)
            contentDescription = "Native brush size"
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                    canvasView.setBrushSizePx(dp((progress + 1).toFloat()).toFloat())
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
            text = "INKFRAME · NATIVE CANVAS BETA"
            textSize = 15f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        val explanation = TextView(this).apply {
            text = "Native Kotlin/HWUI · unbuffered S Pen input · reverse stylus erases · fingers are ignored as palm contact"
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
            addView(explanation, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(2) })
            addView(statusText, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(5) })
            addView(scrollRow(primaryControls), LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(48),
            ).apply { topMargin = dp(6) })
            addView(scrollRow(paletteControls), LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(48),
            ).apply { topMargin = dp(2) })
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(0xFF100A12.toInt())
            addView(canvasView, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ))
            addView(panel, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP,
            ))
        }

        setContentView(root)
        canvasView.stateListener = ::renderState
        renderState(canvasView.snapshotState())
        hideSystemBars()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onPause() {
        canvasView.cancelActiveInput()
        super.onPause()
    }

    override fun onDestroy() {
        canvasView.stateListener = null
        super.onDestroy()
    }

    private fun renderState(state: NativeArtistCanvasView.State) {
        undoButton.isEnabled = state.canUndo
        redoButton.isEnabled = state.canRedo
        val sizeDp = state.brushSizePx / resources.displayMetrics.density
        statusText.text = buildString {
            append(state.rendererLabel)
            append(" · strokes ")
            append(state.strokeCount)
            append(" · samples ")
            append(state.sampleCount)
            append(" · brush ")
            append(String.format(Locale.US, "%.0f dp", sizeDp))
        }
    }

    private fun cyclePaper() {
        paperIndex = (paperIndex + 1) % paperColors.size
        canvasView.setPaperColor(paperColors[paperIndex])
        paperButton.backgroundTintList = ColorStateList.valueOf(contrastButtonColor(paperColors[paperIndex]))
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
        Thread {
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
        }.start()
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
        val luminance = 0.2126 * Color.red(color) + 0.7152 * Color.green(color) + 0.0722 * Color.blue(color)
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
        addView(row, ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        ))
    }

    private fun controlButton(label: String, action: () -> Unit): Button = Button(this).apply {
        text = label
        textSize = 10f
        isAllCaps = false
        setTextColor(Color.WHITE)
        backgroundTintList = ColorStateList.valueOf(0xFF6A1646.toInt())
        minHeight = dp(40)
        minWidth = dp(82)
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

    private fun timestamp(): String = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
