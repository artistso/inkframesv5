package com.inkframe.engine.gl

import android.content.Context
import com.inkframe.core.common.DirtyRegion
import com.inkframe.core.common.FloodFill
import com.inkframe.core.common.IntRect
import com.inkframe.core.common.UndoStack
import com.inkframe.core.model.Brush
import com.inkframe.core.model.BrushKind
import com.inkframe.core.model.ColorSampler
import com.inkframe.core.model.ProjectPackage
import com.inkframe.core.model.RgbaColor
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap

/**
 * High-level GPU paint engine. Owns per-cel [GlSurface]s, the [BrushRenderer] and the
 * [Compositor]. All methods must be invoked on the GL thread (the renderer guarantees
 * this by routing UI events through a thread-safe queue).
 *
 * ## Stroke-buffer compositing
 * A stroke is never stamped directly onto its cel. Instead, dabs accumulate in a
 * reusable [strokeScratch] surface, and a [strokePreview] surface (cel + scratch) is
 * shown while the stroke is wet. Only when the stroke ends is the scratch composited
 * onto the real cel — exactly once, at the brush opacity. This removes the dab-overlap
 * darkening that direct stamping produces.
 */
class PaintEngine(
    private val context: Context,
    val canvasWidth: Int,
    val canvasHeight: Int,
) {
    private val surfaces = ConcurrentHashMap<Long, GlSurface>()

    private val brushRenderer by lazy { BrushRenderer(context) }
    private val compositor by lazy { Compositor(context, canvasWidth, canvasHeight) }

    // Reusable scratch + preview surfaces, allocated on first stroke.
    private var strokeScratch: GlSurface? = null
    private var strokePreview: GlSurface? = null

    // Active stroke state.
    private var activeStroke: StrokeProcessor? = null
    private var strokeCel: GlSurface? = null
    private var strokeCelId: Long = -1L
    private var strokeBrush: Brush? = null
    private var strokeColor: RgbaColor = RgbaColor.BLACK
    private var strokeOpacity: Float = 1f
    private val dirty = DirtyRegion()

    /** Undo/redo history for committed strokes (and future structural edits). */
    val undoStack = UndoStack()

    /** Notified after any change to the document so the host can request a redraw. */
    var onHistoryChanged: (() -> Unit)? = null

    /**
     * Returns the surface for [id], lazily creating a transparent one on first use.
     * Surface ids are minted by the document layer; the GPU surface is created here on
     * the GL thread the first time it is drawn or composited. Must run on the GL thread.
     */
    fun getOrCreateSurface(id: Long): GlSurface =
        surfaces.getOrPut(id) { GlSurface(canvasWidth, canvasHeight).apply { clear(0f, 0f, 0f, 0f) } }

    fun surface(id: Long): GlSurface? = surfaces[id]

    fun releaseSurface(id: Long) {
        surfaces.remove(id)?.release()
    }

    /**
     * Copies the pixels of surface [srcId] into a freshly-created surface [dstId] so the
     * two can be edited independently. Backs the timeline duplicate/paste operations,
     * which need their own pixels rather than a shared handle. No-op if [srcId] is
     * missing. GL thread only.
     */
    fun cloneSurface(srcId: Long, dstId: Long) {
        val src = surfaces[srcId] ?: return
        val dst = getOrCreateSurface(dstId)
        dst.clear(0f, 0f, 0f, 0f)
        brushRenderer.blit(dst, src)
    }

    private fun scratch(): GlSurface =
        strokeScratch ?: GlSurface(canvasWidth, canvasHeight).also { strokeScratch = it }

    private fun preview(): GlSurface =
        strokePreview ?: GlSurface(canvasWidth, canvasHeight).also { strokePreview = it }

    // ---- Stroke lifecycle ---------------------------------------------------

    fun beginStroke(surfaceId: Long, brush: Brush, color: RgbaColor, first: InputSample) {
        val cel = getOrCreateSurface(surfaceId)
        activeStroke = StrokeProcessor(brush)
        strokeCel = cel
        strokeCelId = surfaceId
        strokeBrush = brush
        strokeColor = color
        strokeOpacity = brush.opacity
        dirty.reset()

        scratch().clear(0f, 0f, 0f, 0f)   // fresh wet layer
        addDabs(activeStroke!!.add(first))
    }

    fun extendStroke(sample: InputSample) {
        val proc = activeStroke ?: return
        addDabs(proc.add(sample))
    }

    fun endStroke() {
        val proc = activeStroke ?: return
        val cel = strokeCel
        val brush = strokeBrush
        val celId = strokeCelId
        if (cel != null && brush != null) {
            addDabs(proc.finish())

            // Convert the accumulated dirty bounds (top-left origin) to a clamped rect,
            // then to GL's bottom-left origin for pixel read/write.
            val topRect = dirty.toIntRect(canvasWidth, canvasHeight, padding = 2)
            if (topRect != null) {
                val glRect = topToGlRect(topRect)
                val before = cel.readPixels(glRect.x, glRect.y, glRect.w, glRect.h)

                brushRenderer.compositeScratchToCel(
                    target = cel,
                    scratch = scratch(),
                    opacity = strokeOpacity,
                    erase = brush.kind == BrushKind.ERASER,
                )

                val after = cel.readPixels(glRect.x, glRect.y, glRect.w, glRect.h)
                val snapshot = StrokeSnapshot(celId, glRect, before, after)
                // The stroke is already on the cel, so register without re-applying.
                undoStack.pushAlreadyApplied(
                    StrokeCommand(snapshot, restore = ::restorePixels),
                )
                onHistoryChanged?.invoke()
            }
        }
        activeStroke = null
        strokeCel = null
        strokeCelId = -1L
        strokeBrush = null
    }

    /**
     * Flood-fills the connected region at canvas pixel ([x], [y]) on the cel
     * [surfaceId] with [color], matching the seed colour within [tolerance] (0..255 per
     * channel). The fill runs on the cel's OWN pixels (not the composite), reads them
     * back, fills via the pure [FloodFill], writes only the changed rows back, and
     * registers an undoable command. GL thread only. Returns true if anything changed.
     */
    fun floodFill(surfaceId: Long, x: Int, y: Int, color: RgbaColor, tolerance: Int = 24): Boolean {
        if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return false
        val cel = getOrCreateSurface(surfaceId)

        // Read the whole cel as top-down ARGB (fill needs global connectivity).
        val buffer = cel.readPixels(0, 0, canvasWidth, canvasHeight)
        val argb = IntArray(canvasWidth * canvasHeight)
        PixelConvert.rgbaBottomUpToArgbTopDown(buffer, canvasWidth, canvasHeight, argb)

        val result = FloodFill.fill(argb, canvasWidth, canvasHeight, x, y, color.toArgb(), tolerance)
        val rect = result.dirtyRect() ?: return false

        // Snapshot BEFORE within the dirty rect (GL coords) for undo.
        val glRect = topToGlRect(rect)
        val before = cel.readPixels(glRect.x, glRect.y, glRect.w, glRect.h)

        // Upload only the changed rectangle back to the cel.
        uploadArgbRegion(cel, argb, rect)

        val after = cel.readPixels(glRect.x, glRect.y, glRect.w, glRect.h)
        undoStack.pushAlreadyApplied(
            StrokeCommand(StrokeSnapshot(surfaceId, glRect, before, after), restore = ::restorePixels, label = "Fill"),
        )
        onHistoryChanged?.invoke()
        return true
    }

    /** Uploads the [rect] sub-region of a top-down ARGB array into [cel] (RGBA, bottom-up). */
    private fun uploadArgbRegion(cel: GlSurface, argb: IntArray, rect: IntRect) {
        val region = IntArray(rect.w * rect.h)
        for (row in 0 until rect.h) {
            val srcBase = (rect.y + row) * canvasWidth + rect.x
            System.arraycopy(argb, srcBase, region, row * rect.w, rect.w)
        }
        val buffer = PixelConvert.argbTopDownToRgbaBottomUp(region, rect.w, rect.h)
        // Place at GL bottom-left origin matching topToGlRect.
        cel.writePixels(rect.x, canvasHeight - rect.bottom, rect.w, rect.h, buffer)
    }

    /** Restores a snapshot block to a cel surface (used by undo/redo). GL thread only. */
    private fun restorePixels(surfaceId: Long, rect: IntRect, pixels: ByteBuffer) {        val surf = surfaces[surfaceId] ?: return
        surf.writePixels(rect.x, rect.y, rect.w, rect.h, pixels)
        onHistoryChanged?.invoke()
    }

    /** Converts a top-left-origin rect into GL's bottom-left-origin pixel space. */
    private fun topToGlRect(r: IntRect): IntRect =
        IntRect(r.x, canvasHeight - r.bottom, r.w, r.h)

    private fun addDabs(dabs: List<Dab>) {
        if (dabs.isEmpty()) return
        val brush = strokeBrush ?: return
        for (d in dabs) dirty.addCircle(d.center.x, d.center.y, d.size)
        brushRenderer.stampToScratch(scratch(), brush, strokeColor, dabs, buildUp = brush.buildUp)
    }

    // ---- Undo / redo --------------------------------------------------------

    fun undo(): Boolean {
        val ok = undoStack.undo()
        if (ok) onHistoryChanged?.invoke()
        return ok
    }

    fun redo(): Boolean {
        val ok = undoStack.redo()
        if (ok) onHistoryChanged?.invoke()
        return ok
    }

    val canUndo: Boolean get() = undoStack.canUndo
    val canRedo: Boolean get() = undoStack.canRedo

    // ---- Persistence --------------------------------------------------------

    /**
     * A [ProjectPackage.CelImageIO] bound to this engine's surfaces. Use with
     * [com.inkframe.core.model.ProjectPackage.write] / `read` on the GL thread to save or
     * load cel pixels. On decode, surfaces are created on demand so loading also restores
     * the GPU state for every cel referenced by the document.
     */
    fun celImageIO(): ProjectPackage.CelImageIO = GlCelImageIO(
        width = canvasWidth,
        height = canvasHeight,
        surfaceFor = { id -> surfaces[id] },
        ensureSurface = { id -> getOrCreateSurface(id) },
    )

    /** Discards all GPU surfaces and clears history — call before loading a project. */
    fun resetForLoad() {
        // Cancel any in-progress stroke.
        activeStroke = null
        strokeCel = null
        strokeCelId = -1L
        strokeBrush = null
        surfaces.values.forEach { it.release() }
        surfaces.clear()
        undoStack.clear()
        canUndoRedoChanged()
    }

    private fun canUndoRedoChanged() {
        onHistoryChanged?.invoke()
    }

    /** True while a stroke is in progress (used to decide whether to build a preview). */
    val isStroking: Boolean get() = activeStroke != null

    // ---- Compositing --------------------------------------------------------

    /**
     * UI-thread-friendly description of one layer to composite: only surface ids and
     * blend params (no GL handles). Resolved to real surfaces on the GL thread.
     */
    data class LayerDrawSpec(
        val surfaceId: Long,
        val opacity: Float,
        val blendOrdinal: Int,
        /** Onion-skin tint RGB (0..1 each); ignored when [tintStrength] is 0. */
        val tintR: Float = 0f,
        val tintG: Float = 0f,
        val tintB: Float = 0f,
        /** 0 = normal layer, >0 = onion-skin ghost tinted toward (tintR,tintG,tintB). */
        val tintStrength: Float = 0f,
    )

    /**
     * Flattens the given spec list (resolving/creating surfaces) and presents it under
     * the viewport transform described by [invCoeffs] (packed inverse view→canvas affine
     * from `ViewportTransform.inverseCoeffs()`).
     */
    fun composeAndPresent(
        specs: List<LayerDrawSpec>,
        screenW: Int,
        screenH: Int,
        showChecker: Boolean,
        invCoeffs: FloatArray,
    ) {
        // If a stroke is wet, build a preview (cel + scratch) and substitute it for the
        // cel being drawn so the artist sees the in-progress stroke without modifying
        // the real cel yet.
        var previewSurface: GlSurface? = null
        val cel = strokeCel
        val brush = strokeBrush
        if (cel != null && brush != null) {
            val pv = preview()
            brushRenderer.blit(pv, cel)                       // preview := cel
            brushRenderer.compositeScratchToCel(              // preview += wet stroke
                target = pv, scratch = scratch(),
                opacity = strokeOpacity, erase = brush.kind == BrushKind.ERASER,
            )
            previewSurface = pv
        }

        val draws = specs.map { spec ->
            val surf = if (spec.surfaceId == strokeCelId && previewSurface != null) {
                previewSurface
            } else {
                getOrCreateSurface(spec.surfaceId)
            }
            Compositor.LayerDraw(
                surf, spec.opacity, spec.blendOrdinal,
                spec.tintR, spec.tintG, spec.tintB, spec.tintStrength,
            )
        }
        val flat = compositor.flatten(draws)
        compositor.present(flat, screenW, screenH, showChecker, invCoeffs)
    }

    /**
     * Flattens [specs] off-screen (no viewport transform, no checkerboard) and reads the
     * result back as a top-down ARGB int array — the pixel source for exporting a single
     * timeline frame to PNG / GIF / video. GL thread only.
     */
    fun renderFrameToArgb(specs: List<LayerDrawSpec>): IntArray {
        val draws = specs.map { spec ->
            Compositor.LayerDraw(
                getOrCreateSurface(spec.surfaceId), spec.opacity, spec.blendOrdinal,
                spec.tintR, spec.tintG, spec.tintB, spec.tintStrength,
            )
        }
        val flat = compositor.flatten(draws)
        val buffer = flat.readPixels(0, 0, canvasWidth, canvasHeight)
        val out = IntArray(canvasWidth * canvasHeight)
        PixelConvert.rgbaBottomUpToArgbTopDown(buffer, canvasWidth, canvasHeight, out)
        return out
    }

    /**
     * Eyedropper: flattens [specs] and samples the composited colour at canvas pixel
     * ([x], [y]), averaging an odd `2*radius+1` neighbourhood for a steady reading.
     * Returns `null` if the point is off-canvas or only transparent pixels were found.
     * GL thread only.
     *
     * Only the small region around the point is read back (not the whole canvas), so this
     * is cheap even on large documents.
     */
    fun sampleColorAt(
        specs: List<LayerDrawSpec>,
        x: Int,
        y: Int,
        radius: Int = 2,
    ): RgbaColor? {
        if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return null
        val draws = specs.map { spec ->
            Compositor.LayerDraw(
                getOrCreateSurface(spec.surfaceId), spec.opacity, spec.blendOrdinal,
                spec.tintR, spec.tintG, spec.tintB, spec.tintStrength,
            )
        }
        val flat = compositor.flatten(draws)

        // Read a clamped region around the point. GL is bottom-up, so flip y.
        val r = radius.coerceIn(0, 16)
        val x0 = (x - r).coerceIn(0, canvasWidth - 1)
        val y0 = (y - r).coerceIn(0, canvasHeight - 1)
        val x1 = (x + r).coerceIn(0, canvasWidth - 1)
        val y1 = (y + r).coerceIn(0, canvasHeight - 1)
        val rw = x1 - x0 + 1
        val rh = y1 - y0 + 1
        val glY = canvasHeight - (y1 + 1) // bottom-left origin of the region
        val buffer = flat.readPixels(x0, glY, rw, rh)
        val region = IntArray(rw * rh)
        PixelConvert.rgbaBottomUpToArgbTopDown(buffer, rw, rh, region)

        // Sample at the point's position within the region.
        return ColorSampler.sampleAverage(region, rw, rh, x - x0, y - y0, radius = r)
    }

    // ---- GL context-loss recovery ------------------------------------------

    /**
     * Reads every live surface's pixels into [store] (top-down ARGB). Call before the GL
     * context may be lost (e.g. on pause) so artwork can be restored if it is destroyed.
     * GL thread only. Returns the number of surfaces backed up.
     */
    fun backupSurfaces(store: SurfaceBackupStore): Int {
        var count = 0
        for ((id, surf) in surfaces) {
            val buffer = surf.readPixels(0, 0, canvasWidth, canvasHeight)
            val argb = IntArray(canvasWidth * canvasHeight)
            PixelConvert.rgbaBottomUpToArgbTopDown(buffer, canvasWidth, canvasHeight, argb)
            store.put(id, canvasWidth, canvasHeight, argb)
            count++
        }
        return count
    }

    /**
     * Re-uploads all snapshots from [store] into freshly-created GL surfaces. Called on a
     * brand-new engine after the EGL context is recreated, restoring artwork that the
     * destroyed context lost. Snapshots whose dimensions differ from this canvas are
     * uploaded into the overlapping top-left region. GL thread only. Returns the count.
     */
    fun restoreSurfaces(store: SurfaceBackupStore): Int {
        var count = 0
        for (id in store.surfaceIds) {
            val snap = store.get(id) ?: continue
            val surf = getOrCreateSurface(id)
            surf.clear(0f, 0f, 0f, 0f)
            val w = snap.width.coerceAtMost(canvasWidth)
            val h = snap.height.coerceAtMost(canvasHeight)
            if (w <= 0 || h <= 0) continue
            // If the snapshot matches the canvas, upload directly; otherwise crop rows.
            val argb = if (snap.width == canvasWidth && snap.height == canvasHeight) {
                snap.argb
            } else {
                IntArray(w * h).also { cropped ->
                    for (y in 0 until h) System.arraycopy(snap.argb, y * snap.width, cropped, y * w, w)
                }
            }
            val buffer = PixelConvert.argbTopDownToRgbaBottomUp(argb, w, h)
            // Bottom-up upload: place at GL y-origin so the (cropped) image sits top-left.
            surf.writePixels(0, canvasHeight - h, w, h, buffer)
            count++
        }
        return count
    }

    /** True if no GL surfaces exist yet (e.g. a freshly recreated engine). */
    val hasNoSurfaces: Boolean get() = surfaces.isEmpty()

    fun release() {
        surfaces.values.forEach { it.release() }
        surfaces.clear()
        strokeScratch?.release(); strokeScratch = null
        strokePreview?.release(); strokePreview = null
        brushRenderer.release()
        compositor.release()
    }
}
