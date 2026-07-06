package com.inkframe.feature.canvas

import android.annotation.SuppressLint
import android.content.Context
import android.opengl.GLSurfaceView
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
 * MotionEvents — including historical batched samples, pressure, tilt, and azimuth —
 * into engine stroke events. Configured for OpenGL ES 3.0, RGBA8888, dirty rendering.
 *
 * Tilt (AXIS_TILT) and azimuth (AXIS_ORIENTATION) are forwarded to InputSample so the
 * StrokeProcessor can drive tip rotation and point-size squash in the shader.
 */
@SuppressLint("ViewConstructor")
class CanvasView(
    context: Context,
    canvasWidth: Int,
    canvasHeight: Int,
    private val sceneProvider: () -> List<PaintEngine.LayerDrawSpec>,
    private val strokeConfig: () -> StrokeConfig,
    private val onEngineReady: (PaintEngine) -> Unit,
) : GLSurfaceView(context) {

    data class StrokeConfig(val targetSurfaceId: Long, val brush: Brush, val color: RgbaColor)

    private val renderer: CanvasRenderer
    private val backupStore = SurfaceBackupStore()

    init {
        setEGLContextClientVersion(3)
        setEGLConfigChooser(8, 8, 8, 8, 0, 0)
        preserveEGLContextOnPause = true
        renderer = CanvasRenderer(
            context = context,
            canvasWidth = canvasWidth,
            canvasHeight = canvasHeight,
            sceneProvider = sceneProvider,
            onEngineReady = onEngineReady,
            backupStore = backupStore,
            onContextRestored = { post { onContextRestored?.invoke() } },
        )
        setRenderer(renderer)
        renderMode = RENDERMODE_WHEN_DIRTY
    }

    var onContextRestored: (() -> Unit)? = null
    @Volatile var eyedropperActive: Boolean = false
    @Volatile var fillActive: Boolean = false
    var onFilled: ((Boolean) -> Unit)? = null
    var onColorSampled: ((RgbaColor?) -> Unit)? = null

    private fun floodFillAtView(vx: Float, vy: Float) {
        val cfg = strokeConfig()
        val canvas = toCanvas(vx, vy)
        renderer.post(CanvasRenderer.EngineEvent.Run { engine ->
            val changed = engine.floodFill(cfg.targetSurfaceId, canvas.x.toInt(), canvas.y.toInt(), cfg.color)
            post { onFilled?.invoke(changed) }
        })
        requestRender()
    }

    private fun sampleColorAtView(vx: Float, vy: Float) {
        val canvas = toCanvas(vx, vy)
        val specs = sceneProvider()
        renderer.post(CanvasRenderer.EngineEvent.Run { engine ->
            val sampled = engine.sampleColorAt(specs, canvas.x.toInt(), canvas.y.toInt())
            post { onColorSampled?.invoke(sampled) }
        })
        requestRender()
    }

    override fun onPause() {
        renderer.backupSurfaces()
        requestRender()
        super.onPause()
    }

    override fun onResume() { super.onResume(); requestRender() }

    fun setShowChecker(show: Boolean) { renderer.showChecker = show; requestRender() }

    fun runOnEngine(block: (PaintEngine) -> Unit) {
        renderer.post(CanvasRenderer.EngineEvent.Run(block))
        requestRender()
    }

    fun undo() { renderer.post(CanvasRenderer.EngineEvent.Undo); requestRender() }
    fun redo() { renderer.post(CanvasRenderer.EngineEvent.Redo); requestRender() }

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
                val renderer: (Int) -> IntArray = { fi -> engine.renderFrameToArgb(drawListFor(fi)) }
                val progress = onProgress?.let { cb -> ExportManager.Progress { d, t -> cb(d, t) } }
                when (format) {
                    ExportManager.ExportFormat.MP4 -> ExportManager.exportMp4(plan, file, renderer, progress)
                    ExportManager.ExportFormat.GIF -> FileOutputStream(file).use { out -> ExportManager.exportGif(plan, out, renderer, progress) }
                    ExportManager.ExportFormat.PNG_SEQUENCE -> FileOutputStream(file).use { out -> ExportManager.exportPngSequence(plan, out, frameRenderer = renderer, progress = progress) }
                }
                file
            }
            onResult(result)
        }
    }

    fun saveProjectTo(project: Project, out: OutputStream, onResult: (Result<Unit>) -> Unit) {
        runOnEngine { engine ->
            val result = runCatching {
                BufferedOutputStream(out).use { ProjectPackage.write(project, engine.celImageIO(), it) }
            }
            onResult(result)
        }
    }

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
                val frameRenderer: (Int) -> IntArray = { fi -> engine.renderFrameToArgb(drawListFor(fi)) }
                val progress = onProgress?.let { cb -> ExportManager.Progress { d, t -> cb(d, t) } }
                when (format) {
                    ExportManager.ExportFormat.MP4 -> {
                        val descriptor = requireNotNull(fd) { "MP4 export needs a FileDescriptor" }
                        ExportManager.exportMp4(plan, descriptor, frameRenderer, progress)
                    }
                    ExportManager.ExportFormat.GIF -> {
                        val stream = requireNotNull(out) { "GIF export needs an OutputStream" }
                        ExportManager.exportGif(plan, stream, frameRenderer, progress)
                    }
                    ExportManager.ExportFormat.PNG_SEQUENCE -> {
                        val stream = requireNotNull(out) { "PNG export needs an OutputStream" }
                        ExportManager.exportPngSequence(plan, stream, frameRenderer = frameRenderer, progress = progress)
                    }
                }
            }
            onResult(result)
        }
    }

    // --- Viewport -----------------------------------------------------------

    private var viewW = 1f
    private var viewH = 1f
    private val canvasW = canvasWidth.toFloat()
    private val canvasH = canvasHeight.toFloat()
    private var viewportInitialized = false
    private var viewport: ViewportTransform = ViewportTransform.IDENTITY
        set(value) { field = value; renderer.viewport = value; onViewportChanged?.invoke(value.scale) }

    var onViewportChanged: ((scale: Float) -> Unit)? = null
    private var minScale = 0.05f
    private var maxScale = 32f

    fun fitToScreen() { viewport = ViewportTransform.fit(canvasW, canvasH, viewW, viewH); requestRender() }
    fun resetZoom() {
        viewport = ViewportTransform(1f, 0f, (viewW - canvasW) * 0.5f, (viewH - canvasH) * 0.5f)
        requestRender()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        viewW = w.toFloat().coerceAtLeast(1f)
        viewH = h.toFloat().coerceAtLeast(1f)
        if (!viewportInitialized) { viewportInitialized = true; fitToScreen() }
    }

    // --- Input --------------------------------------------------------------

    private enum class Mode { IDLE, DRAW, NAVIGATE }
    private var mode = Mode.IDLE
    private var navIdA = -1; private var navIdB = -1
    private var prevAx = 0f; private var prevAy = 0f
    private var prevBx = 0f; private var prevBy = 0f

    private fun toCanvas(vx: Float, vy: Float): Vec2 = viewport.viewToCanvas(Vec2(vx, vy))

    /**
     * Builds an InputSample from a MotionEvent pointer, including pressure, tilt, and
     * azimuth from the stylus (S-Pen / Apple Pencil / Wacom). Falls back gracefully on
     * devices that don't report these axes.
     */
    private fun sample(event: MotionEvent, idx: Int, hist: Int = -1): InputSample {
        val x: Float; val y: Float; val p: Float; val tilt: Float; val azimuth: Float
        if (hist >= 0) {
            x = event.getHistoricalX(idx, hist)
            y = event.getHistoricalY(idx, hist)
            p = event.getHistoricalPressure(idx, hist).coerceIn(0f, 1f)
            tilt    = event.getHistoricalAxisValue(MotionEvent.AXIS_TILT, idx, hist).coerceIn(0f, Math.PI.toFloat() / 2f)
            azimuth = event.getHistoricalAxisValue(MotionEvent.AXIS_ORIENTATION, idx, hist)
        } else {
            x = event.getX(idx); y = event.getY(idx)
            p = event.getPressure(idx).coerceIn(0f, 1f)
            tilt    = event.getAxisValue(MotionEvent.AXIS_TILT, idx).coerceIn(0f, Math.PI.toFloat() / 2f)
            azimuth = event.getAxisValue(MotionEvent.AXIS_ORIENTATION, idx)
        }
        val pressure = if (p <= 0f) 0.5f else p
        return InputSample(
            pos        = toCanvas(x, y),
            pressure   = pressure,
            timeMs     = event.eventTime,
            tiltRad    = tilt,
            azimuthRad = azimuth,
        )
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val cfg = strokeConfig()
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                when {
                    eyedropperActive -> { mode = Mode.IDLE; sampleColorAtView(event.getX(0), event.getY(0)) }
                    fillActive       -> { mode = Mode.IDLE; floodFillAtView(event.getX(0), event.getY(0)) }
                    else -> {
                        mode = Mode.DRAW
                        renderer.post(CanvasRenderer.EngineEvent.Begin(cfg.targetSurfaceId, cfg.brush, cfg.color, sample(event, 0)))
                        requestRender()
                    }
                }
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (mode == Mode.DRAW) renderer.post(CanvasRenderer.EngineEvent.End)
                if (event.pointerCount >= 2) beginNavigation(event)
            }
            MotionEvent.ACTION_MOVE -> when (mode) {
                Mode.DRAW -> {
                    for (h in 0 until event.historySize) renderer.post(CanvasRenderer.EngineEvent.Extend(sample(event, 0, h)))
                    renderer.post(CanvasRenderer.EngineEvent.Extend(sample(event, 0)))
                    requestRender()
                }
                Mode.NAVIGATE -> { updateNavigation(event); requestRender() }
                Mode.IDLE -> {}
            }
            MotionEvent.ACTION_POINTER_UP -> {
                if (event.pointerCount <= 2) { mode = Mode.IDLE; navIdA = -1; navIdB = -1 }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (mode == Mode.DRAW) renderer.post(CanvasRenderer.EngineEvent.End)
                mode = Mode.IDLE; navIdA = -1; navIdB = -1
                requestRender()
            }
            else -> return false
        }
        return true
    }

    private fun beginNavigation(event: MotionEvent) {
        mode = Mode.NAVIGATE
        navIdA = event.getPointerId(0); navIdB = event.getPointerId(1)
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
        val pivotX = (curAx + curBx) * 0.5f
        val pivotY = (curAy + curBy) * 0.5f
        next = next.withScaleClamped(minScale, maxScale, pivotX, pivotY)
        viewport = next
        prevAx = curAx; prevAy = curAy; prevBx = curBx; prevBy = curBy
    }
}
