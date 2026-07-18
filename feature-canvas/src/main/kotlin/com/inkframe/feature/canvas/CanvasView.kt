package com.inkframe.feature.canvas

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.PixelFormat
import android.opengl.GLSurfaceView
import android.util.AtomicFile
import android.view.MotionEvent
import com.inkframe.core.common.Vec2
import com.inkframe.core.common.ViewportTransform
import com.inkframe.core.model.Brush
import com.inkframe.core.model.ExportPlanner
import com.inkframe.core.model.Project
import com.inkframe.core.model.ProjectPackage
import com.inkframe.core.model.RgbaColor
import com.inkframe.engine.gl.CanvasRenderer
import com.inkframe.engine.gl.InputSample
import com.inkframe.engine.gl.PaintEngine
import com.inkframe.engine.gl.SurfaceBackupStore
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream

/**
 * A GLSurfaceView that hosts the GPU paint engine and translates stylus/touch
 * MotionEvents (including historical batched samples and pressure) into engine
 * stroke events. Configured for OpenGL ES 3.0, RGBA8888, dirty rendering.
 */
@SuppressLint("ViewConstructor")
class CanvasView(
    context: Context,
    canvasWidth: Int,
    canvasHeight: Int,
    private val sceneProvider: () -> List<PaintEngine.LayerDrawSpec>,
    private val backgroundColorProvider: () -> RgbaColor = { RgbaColor.WHITE },
    private val strokeConfig: () -> StrokeConfig,
    private val onEngineReady: (PaintEngine) -> Unit,
) : GLSurfaceView(context) {

    /** What to draw with right now and where (the active cel's surface). */
    data class StrokeConfig(val targetSurfaceId: Long, val brush: Brush, val color: RgbaColor)

    private val renderer: CanvasRenderer

    /** CPU-side artwork backup; survives EGL-context loss so we can restore after it. */
    private val backupStore = SurfaceBackupStore()

    init {
        setEGLContextClientVersion(3)
        setEGLConfigChooser(8, 8, 8, 8, 0, 0)
        setZOrderMediaOverlay(true)
        holder.setFormat(PixelFormat.RGBA_8888)
        isClickable = true
        isFocusable = true
        // First line of defence: ask the system to keep the EGL context across pauses.
        // Many devices honour this, avoiding loss entirely; the backup store covers the
        // rest (low-memory devices / forced context loss).
        preserveEGLContextOnPause = true
        renderer = CanvasRenderer(
            context = context,
            canvasWidth = canvasWidth,
            canvasHeight = canvasHeight,
            sceneProvider = sceneProvider,
            backgroundColorProvider = backgroundColorProvider,
            onEngineReady = onEngineReady,
            backupStore = backupStore,
            onContextRestored = { post { onContextRestored?.invoke() } },
        )
        setRenderer(renderer)
        renderMode = RENDERMODE_WHEN_DIRTY
    }

    /** Invoked after the GL context was lost and artwork re-uploaded (on the main thread). */
    var onContextRestored: (() -> Unit)? = null

    /** When true, a single-finger tap samples a colour instead of drawing (eyedropper). */
    @Volatile var eyedropperActive: Boolean = false

    /** When true, a single-finger tap flood-fills instead of drawing (bucket). */
    @Volatile var fillActive: Boolean = false

    /** Invoked (main thread) after a fill; arg = whether anything changed. */
    var onFilled: ((Boolean) -> Unit)? = null

    /** Visible QA signal proving that Android contact reached the native canvas. */
    var onStrokeInput: ((String) -> Unit)? = null

    /** Invoked on the main thread after pixels have changed and recovery should be refreshed. */
    var onArtworkChanged: (() -> Unit)? = null

    /** Flood-fills the active cel at a view-space point with the current stroke colour. */
    private fun floodFillAtView(vx: Float, vy: Float) {
        val cfg = strokeConfig()
        val canvas = toCanvas(vx, vy)
        val px = canvas.x.toInt()
        val py = canvas.y.toInt()
        renderer.post(
            CanvasRenderer.EngineEvent.Run { engine ->
                val changed = engine.floodFill(cfg.targetSurfaceId, px, py, cfg.color)
                post {
                    onFilled?.invoke(changed)
                    if (changed) onArtworkChanged?.invoke()
                }
            },
        )
        requestRender()
    }

    /**
     * Invoked (on the main thread) when the eyedropper samples a colour. `null` means the
     * tap hit a transparent / off-canvas area.
     */
    var onColorSampled: ((RgbaColor?) -> Unit)? = null

    /** Samples the composited colour at a view-space point and reports it via [onColorSampled]. */
    private fun sampleColorAtView(vx: Float, vy: Float) {
        val canvas = toCanvas(vx, vy)
        val px = canvas.x.toInt()
        val py = canvas.y.toInt()
        val specs = sceneProvider()
        renderer.post(
            CanvasRenderer.EngineEvent.Run { engine ->
                val sampled = engine.sampleColorAt(specs, px, py)
                post { onColorSampled?.invoke(sampled) }
            },
        )
        requestRender()
    }

    override fun onPause() {
        // Snapshot artwork to the CPU-side store *before* the GL thread pauses, so it can
        // be restored if the EGL context is destroyed while backgrounded.
        renderer.backupSurfaces()
        requestRender()  // flush the queued backup before the GL thread idles
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        requestRender()
    }

    fun setShowChecker(show: Boolean) {
        renderer.showChecker = show
        requestRender()
    }

    /** Posts an arbitrary engine command (e.g. allocate a surface) to the GL thread. */
    fun runOnEngine(block: (PaintEngine) -> Unit) {
        renderer.post(CanvasRenderer.EngineEvent.Run(block))
        requestRender()
    }

    /** Requests an undo on the GL thread. */
    fun undo() {
        renderer.post(CanvasRenderer.EngineEvent.Undo)
        onArtworkChanged?.invoke()
        requestRender()
    }

    /** Requests a redo on the GL thread. */
    fun redo() {
        renderer.post(CanvasRenderer.EngineEvent.Redo)
        onArtworkChanged?.invoke()
        requestRender()
    }

    /**
     * Saves [project] (document + cel pixels) to [file] as an `.inkframe` package. The
     * pixel read-back happens on the GL thread; [onResult] is invoked there with success
     * or the thrown error. The caller should marshal UI updates back to the main thread.
     */
    fun saveProject(project: Project, file: File, onResult: (Result<Unit>) -> Unit) {
        runOnEngine { engine ->
            val result = runCatching {
                file.parentFile?.mkdirs()
                BufferedOutputStream(FileOutputStream(file)).use { out ->
                    ProjectPackage.write(project, engine.celImageIO(), out)
                }
            }
            onResult(result)
        }
    }

    /**
     * Writes a complete recovery package with Android's two-phase [AtomicFile] protocol.
     * A killed process therefore leaves either the previous valid archive or the new one,
     * never a partially written ZIP. The callback runs on the GL thread.
     */
    fun saveProjectAtomically(project: Project, file: File, onResult: (Result<Unit>) -> Unit) {
        runOnEngine { engine ->
            val result = runCatching {
                file.parentFile?.mkdirs()
                val atomicFile = AtomicFile(file)
                var stream: FileOutputStream? = null
                try {
                    stream = atomicFile.startWrite()
                    val buffered = BufferedOutputStream(stream)
                    ProjectPackage.write(project, engine.celImageIO(), buffered)
                    buffered.flush()
                    atomicFile.finishWrite(checkNotNull(stream))
                } catch (error: Throwable) {
                    stream?.let { output -> runCatching { atomicFile.failWrite(output) } }
                    throw error
                }
            }
            onResult(result)
        }
    }

    /**
     * Loads an `.inkframe` package from [file], restoring cel pixels onto fresh GPU
     * surfaces. Returns the decoded [Project] via [onResult] (on the GL thread). The
     * engine's existing surfaces and undo history are discarded first.
     */
    fun loadProject(file: File, onResult: (Result<Project>) -> Unit) {
        runOnEngine { engine ->
            val result = runCatching {
                engine.resetForLoad()
                BufferedInputStream(FileInputStream(file)).use { input ->
                    ProjectPackage.read(engine.celImageIO(), input)
                }
            }
            onResult(result)
            requestRender()
        }
    }

    /**
     * Exports an animation to [file] in the given [format]. Rendering each frame happens
     * on the GL thread; [drawListFor] maps a timeline frame index to its export draw list
     * (typically `StudioState::buildExportDrawList`). [onResult] is invoked on the GL
     * thread; the host marshals UI updates back to the main thread.
     */
    fun exportAnimation(
        plan: ExportPlanner.ExportPlan,
        format: ExportManager.ExportFormat,
        file: File,
        drawListFor: (Int) -> List<PaintEngine.LayerDrawSpec>,
        onProgress: ((Int, Int) -> Unit)? = null,
        onResult: (Result<File>) -> Unit,
    ) {
        runOnEngine { engine ->
            val result = runCatching {
                file.parentFile?.mkdirs()
                val renderer: (Int) -> IntArray = { frameIndex ->
                    engine.renderFrameToArgb(drawListFor(frameIndex))
                }
                val progress = onProgress?.let { cb -> ExportManager.Progress { d, t -> cb(d, t) } }
                when (format) {
                    // MP4 needs a real file path (MediaMuxer), not a stream.
                    ExportManager.ExportFormat.MP4 ->
                        ExportManager.exportMp4(plan, file, renderer, progress)
                    ExportManager.ExportFormat.GIF ->
                        FileOutputStream(file).use { out -> ExportManager.exportGif(plan, out, renderer, progress) }
                    ExportManager.ExportFormat.PNG_SEQUENCE ->
                        FileOutputStream(file).use { out ->
                            ExportManager.exportPngSequence(plan, out, frameRenderer = renderer, progress = progress)
                        }
                }
                file
            }
            onResult(result)
        }
    }

    // --- Storage Access Framework (stream/fd) variants ----------------------
    // SAF hands us content:// Uris; the host opens streams/fds from a ContentResolver and
    // passes them here. These mirror the File-based methods but write to the given target.

    /** Saves the project to a SAF [out] stream (caller owns/closes the underlying Uri). */
    fun saveProjectTo(project: Project, out: OutputStream, onResult: (Result<Unit>) -> Unit) {
        runOnEngine { engine ->
            val result = runCatching {
                BufferedOutputStream(out).use { ProjectPackage.write(project, engine.celImageIO(), it) }
            }
            onResult(result)
        }
    }

    /** Loads a project from a SAF [input] stream. */
    fun loadProjectFrom(input: InputStream, onResult: (Result<Project>) -> Unit) {
        runOnEngine { engine ->
            val result = runCatching {
                engine.resetForLoad()
                BufferedInputStream(input).use { ProjectPackage.read(engine.celImageIO(), it) }
            }
            onResult(result)
            requestRender()
        }
    }

    /**
     * Exports to a SAF target. GIF/PNG use the [out] stream; MP4 uses [fd] (MediaMuxer
     * needs a seekable file descriptor). The caller supplies whichever the format needs.
     */
    fun exportAnimationTo(
        plan: ExportPlanner.ExportPlan,
        format: ExportManager.ExportFormat,
        out: OutputStream?,
        fd: java.io.FileDescriptor?,
        drawListFor: (Int) -> List<PaintEngine.LayerDrawSpec>,
        onProgress: ((Int, Int) -> Unit)? = null,
        onResult: (Result<Unit>) -> Unit,
    ) {
        runOnEngine { engine ->
            val result = runCatching {
                val renderer: (Int) -> IntArray = { frameIndex ->
                    engine.renderFrameToArgb(drawListFor(frameIndex))
                }
                val progress = onProgress?.let { cb -> ExportManager.Progress { d, t -> cb(d, t) } }
                when (format) {
                    ExportManager.ExportFormat.MP4 -> {
                        val descriptor = requireNotNull(fd) { "MP4 export needs a FileDescriptor" }
                        ExportManager.exportMp4(plan, descriptor, renderer, progress)
                    }
                    ExportManager.ExportFormat.GIF -> {
                        val stream = requireNotNull(out) { "GIF export needs an OutputStream" }
                        ExportManager.exportGif(plan, stream, renderer, progress)
                    }
                    ExportManager.ExportFormat.PNG_SEQUENCE -> {
                        val stream = requireNotNull(out) { "PNG export needs an OutputStream" }
                        ExportManager.exportPngSequence(plan, stream, frameRenderer = renderer, progress = progress)
                    }
                }
            }
            onResult(result)
        }
    }

    // --- Viewport (pan / zoom / rotate) -------------------------------------

    private var viewW = 1f
    private var viewH = 1f
    private val canvasW = canvasWidth.toFloat()
    private val canvasH = canvasHeight.toFloat()
    private var viewportInitialized = false

    private var viewport: ViewportTransform = ViewportTransform.IDENTITY
        set(value) {
            field = value
            renderer.viewport = value
            onViewportChanged?.invoke(value.scale)
        }

    /** Notifies the host of zoom changes (e.g. to show a zoom %). */
    var onViewportChanged: ((scale: Float) -> Unit)? = null

    private var minScale = 0.05f
    private var maxScale = 32f

    /** Resets the view to frame the whole canvas (aspect-fit, no rotation). */
    fun fitToScreen() {
        viewport = ViewportTransform.fit(canvasW, canvasH, viewW, viewH)
        requestRender()
    }

    /** Resets to 1:1 (100%) centered. */
    fun resetZoom() {
        val bx = (viewW - canvasW) * 0.5f
        val by = (viewH - canvasH) * 0.5f
        viewport = ViewportTransform(1f, 0f, bx, by)
        requestRender()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        viewW = w.toFloat().coerceAtLeast(1f)
        viewH = h.toFloat().coerceAtLeast(1f)
        if (!viewportInitialized) {
            viewportInitialized = true
            fitToScreen()
        }
    }

    // --- Input arbitration: 1 pointer draws, 2 pointers navigate ------------

    private enum class Mode { IDLE, DRAW, NAVIGATE }
    private var mode = Mode.IDLE

    // Cached previous positions of the two navigation pointers (by pointer id).
    private var navIdA = -1
    private var navIdB = -1
    private var prevAx = 0f; private var prevAy = 0f
    private var prevBx = 0f; private var prevBy = 0f

    private fun toCanvas(vx: Float, vy: Float): Vec2 = viewport.viewToCanvas(Vec2(vx, vy))

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val cfg = strokeConfig()

        fun sample(idx: Int, hist: Int = -1): InputSample {
            val x: Float; val y: Float; val p: Float
            if (hist >= 0) {
                x = event.getHistoricalX(idx, hist)
                y = event.getHistoricalY(idx, hist)
                p = event.getHistoricalPressure(idx, hist).coerceIn(0f, 1f)
            } else {
                x = event.getX(idx); y = event.getY(idx)
                p = event.getPressure(idx).coerceIn(0f, 1f)
            }
            val pressure = if (p <= 0f) 0.5f else p
            return InputSample(toCanvas(x, y), pressure, event.eventTime)
        }

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                when {
                    eyedropperActive -> {
                        // Eyedropper: sample the colour under the finger; don't draw.
                        mode = Mode.IDLE
                        sampleColorAtView(event.getX(0), event.getY(0))
                    }
                    fillActive -> {
                        // Bucket: flood-fill the active cel at the tap; don't draw.
                        mode = Mode.IDLE
                        floodFillAtView(event.getX(0), event.getY(0))
                    }
                    else -> {
                        mode = Mode.DRAW
                        onStrokeInput?.invoke(
                            "INK CONTACT · ${cfg.brush.name.uppercase()} · ${cfg.brush.sizePx.toInt()} PX",
                        )
                        renderer.post(CanvasRenderer.EngineEvent.Begin(cfg.targetSurfaceId, cfg.brush, cfg.color, sample(0)))
                        requestRender()
                    }
                }
            }

            MotionEvent.ACTION_POINTER_DOWN -> {
                // A second finger arrived: abandon any wet stroke and start navigating.
                if (mode == Mode.DRAW) {
                    renderer.post(CanvasRenderer.EngineEvent.End)
                    onArtworkChanged?.invoke()
                }
                if (event.pointerCount >= 2) beginNavigation(event)
            }

            MotionEvent.ACTION_MOVE -> when (mode) {
                Mode.DRAW -> {
                    for (h in 0 until event.historySize) {
                        renderer.post(CanvasRenderer.EngineEvent.Extend(sample(0, h)))
                    }
                    renderer.post(CanvasRenderer.EngineEvent.Extend(sample(0)))
                    requestRender()
                }
                Mode.NAVIGATE -> {
                    updateNavigation(event)
                    requestRender()
                }
                Mode.IDLE -> {}
            }

            MotionEvent.ACTION_POINTER_UP -> {
                // Dropped to one finger: stay in navigation but rebind pointers, or idle.
                if (event.pointerCount <= 2) {
                    mode = Mode.IDLE
                    navIdA = -1; navIdB = -1
                }
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (mode == Mode.DRAW) {
                    renderer.post(CanvasRenderer.EngineEvent.End)
                    onStrokeInput?.invoke("INK COMMITTED · FRAME ${cfg.targetSurfaceId}")
                    onArtworkChanged?.invoke()
                }
                mode = Mode.IDLE
                navIdA = -1; navIdB = -1
                requestRender()
            }

            else -> return false
        }
        return true
    }

    private fun beginNavigation(event: MotionEvent) {
        mode = Mode.NAVIGATE
        navIdA = event.getPointerId(0)
        navIdB = event.getPointerId(1)
        prevAx = event.getX(0); prevAy = event.getY(0)
        prevBx = event.getX(1); prevBy = event.getY(1)
    }

    private fun updateNavigation(event: MotionEvent) {
        val ia = event.findPointerIndex(navIdA)
        val ib = event.findPointerIndex(navIdB)
        if (ia < 0 || ib < 0) return
        val curAx = event.getX(ia); val curAy = event.getY(ia)
        val curBx = event.getX(ib); val curBy = event.getY(ib)

        var next = viewport.applyGesture(
            Vec2(prevAx, prevAy), Vec2(prevBx, prevBy),
            Vec2(curAx, curAy), Vec2(curBx, curBy),
        )
        // Clamp zoom about the gesture midpoint so it doesn't run away.
        val pivotX = (curAx + curBx) * 0.5f
        val pivotY = (curAy + curBy) * 0.5f
        next = next.withScaleClamped(minScale, maxScale, pivotX, pivotY)
        viewport = next

        prevAx = curAx; prevAy = curAy
        prevBx = curBx; prevBy = curBy
    }
}
