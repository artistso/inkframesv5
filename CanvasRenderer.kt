package com.inkframe.engine.gl

import android.content.Context
import android.opengl.GLES30
import android.opengl.GLSurfaceView
import com.inkframe.core.common.ViewportTransform
import com.inkframe.core.model.Brush
import com.inkframe.core.model.RgbaColor
import java.util.concurrent.ConcurrentLinkedQueue
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * GLSurfaceView.Renderer that runs the paint engine on the GL thread.
 *
 * UI/input events are posted as [EngineEvent]s onto a lock-free queue and drained at
 * the start of each frame, guaranteeing all GL calls happen on the render thread.
 *
 * The renderer uses RENDERMODE_WHEN_DIRTY; [requestFrame] (via the host view) triggers
 * a redraw after input or document changes.
 */
class CanvasRenderer(
    private val context: Context,
    private val canvasWidth: Int,
    private val canvasHeight: Int,
    private val sceneProvider: () -> List<PaintEngine.LayerDrawSpec>,
    private val onEngineReady: (PaintEngine) -> Unit,
    /** Survives GL-context loss; used to re-upload artwork when the context is recreated. */
    private val backupStore: SurfaceBackupStore,
    /** Invoked (on the GL thread) after surfaces are restored following context loss. */
    private val onContextRestored: () -> Unit = {},
) : GLSurfaceView.Renderer {

    private var engine: PaintEngine? = null
    private val events = ConcurrentLinkedQueue<EngineEvent>()
    @Volatile private var screenW = 1
    @Volatile private var screenH = 1
    @Volatile var showChecker = true

    /** True once at least one GL context has been created (to detect *re*-creation). */
    @Volatile private var hadContext = false

    /** Current canvas→view transform; updated from the UI thread on pan/zoom/rotate. */
    @Volatile var viewport: ViewportTransform = ViewportTransform.IDENTITY

    sealed interface EngineEvent {
        data class Begin(val surfaceId: Long, val brush: Brush, val color: RgbaColor, val sample: InputSample) : EngineEvent
        data class Extend(val sample: InputSample) : EngineEvent
        data object End : EngineEvent
        data object Undo : EngineEvent
        data object Redo : EngineEvent
        data class Run(val block: (PaintEngine) -> Unit) : EngineEvent
    }

    fun post(event: EngineEvent) { events.add(event) }

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES30.glDisable(GLES30.GL_DEPTH_TEST)
        // A new EGL context: every prior GL surface/texture is now invalid, so always
        // build a fresh engine. The old one's GL handles are gone — nothing to release.
        val e = PaintEngine(context, canvasWidth, canvasHeight)
        engine = e

        val isRecreation = hadContext && backupStore.size > 0
        if (isRecreation) {
            // Context was lost and recreated: re-upload artwork from the CPU-side backup
            // instead of starting blank. The document/model state is untouched in the UI
            // layer, so only GPU pixels need restoring.
            e.restoreSurfaces(backupStore)
            onContextRestored()
        }
        hadContext = true
        // Always notify the host so it can (re)bind callbacks to the new engine instance.
        onEngineReady(e)
    }

    /**
     * Backs up all live GPU surfaces into the store. Posted via the event queue so it
     * runs on the GL thread before the context is torn down (call from the View's pause).
     */
    fun backupSurfaces() {
        post(EngineEvent.Run { e -> e.backupSurfaces(backupStore) })
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        screenW = width.coerceAtLeast(1)
        screenH = height.coerceAtLeast(1)
    }

    override fun onDrawFrame(gl: GL10?) {
        val e = engine ?: return
        drainEvents(e)
        GLES30.glClearColor(0.5f, 0.5f, 0.5f, 1f)
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
        e.composeAndPresent(sceneProvider(), screenW, screenH, showChecker, viewport.inverseCoeffs())
    }

    private fun drainEvents(e: PaintEngine) {
        while (true) {
            val ev = events.poll() ?: break
            when (ev) {
                is EngineEvent.Begin -> e.beginStroke(ev.surfaceId, ev.brush, ev.color, ev.sample)
                is EngineEvent.Extend -> e.extendStroke(ev.sample)
                EngineEvent.End -> e.endStroke()
                EngineEvent.Undo -> e.undo()
                EngineEvent.Redo -> e.redo()
                is EngineEvent.Run -> ev.block(e)
            }
        }
    }
}
