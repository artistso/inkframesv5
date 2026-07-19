package com.inkframe.core.model.web

import com.inkframe.core.common.JsonValue
import com.inkframe.core.common.optional
import com.inkframe.core.common.parseJson
import java.util.Base64

/**
 * Session (autosave) payload codec — a structural port of `web/autosave.js`
 * `serialize()` (L121-154) and `restore()` (L156-207) onto the JVM document model.
 *
 * The web stores one JSON snapshot of the whole gallery in IndexedDB
 * (`inkframe/sessions/current`, autosave.js:53-56) with PNG blobs; here blobs are
 * PNG data-URLs (`"data:image/png;base64,…"`), the same encoding the archive codec
 * uses for its `png` field (M1_SPEC §SessionPayload).
 *
 * Payload shape written by [serialize] (exact key set of autosave.js:125-153):
 * `{v:3, savedAt, pi, projects:[{name,w,h,cur,fps,paper,canvasShape,
 * background:{visible,opacity,blend,blob}|null, holds, frames:[{active,
 * layers:[{name,visible,opacity,blend,blob}]}]}]}`.
 *
 * [restore] is **structural and never reads `payload.v`** (PORT_MAP §4.3): a v1
 * payload has bare blob frame items (upgraded to single-layer frames), v2 has
 * layered frames, v3 adds `background` + `canvasShape` — all detected from shape,
 * not the version field. The `newBackground` env defect of the checked-in web build
 * (PORT_MAP §1.3.1, i.html:5589-5609) is *not* replicated: background handling is
 * pure model code here.
 *
 * Runtime-only web behavior deliberately left to callers:
 *  - `undo`/`redo` reset (autosave.js:194) — the model carries no undo stacks.
 *  - `backgroundActive:false` (autosave.js:199) — the model has no such field.
 *  - Outer `projects[]` array identity preservation (i.html:5599-5603) — a web
 *    aliasing concern; the Kotlin model is immutable.
 *  - The 800 ms trailing debounce / visibility flush (autosave.js:57,225-242) —
 *    the M4 scheduler's concern; [SAVE_DELAY_MS] is exported for it.
 *
 * M1_SPEC wrote "`object SessionCodec` (constructor-injected)" — an object cannot
 * be constructor-injected, so this is a class with a default parameter (the same
 * latitude the SPEC grants Agent A's WebArchiveCodec).
 */
class SessionCodec(
    private val png: PngImageIO = ImageIoPngImageIO(),
) {

    // ---- Serialize (autosave.js:121-154) ---------------------------------------

    /**
     * Serializes [gallery] to the session v3 payload. [savedAt] is epoch ms
     * (`Date.now()`, autosave.js:126). The web mutates the active project's
     * cur/fps/w/h from app state before saving (autosave.js:124); the Kotlin model
     * is immutable, so the caller hands in an up-to-date gallery instead.
     */
    fun serialize(gallery: Gallery, savedAt: Long): String =
        JsonValue.obj(
            "v" to JsonValue.of(VERSION),
            "savedAt" to JsonValue.of(savedAt),
            "pi" to JsonValue.of(gallery.active),
            "projects" to JsonValue.arr(gallery.projects.map { encodeProject(it) }),
        ).toJsonString()

    private fun encodeProject(p: Project): JsonValue = JsonValue.obj(
        // `P.name || 'Canvas'` etc. (autosave.js:130-131): empty strings are falsy in JS.
        "name" to JsonValue.of(p.name.ifEmpty { Caps.DEFAULT_PROJECT_NAME }),
        "w" to JsonValue.of(p.w),
        "h" to JsonValue.of(p.h),
        "cur" to JsonValue.of(p.cur),
        "fps" to JsonValue.of(p.fps),
        "paper" to JsonValue.of(p.paper.ifEmpty { Caps.DEFAULT_PAPER }),
        "canvasShape" to JsonValue.of(p.canvasShape.key), // normalizeCanvasShape (autosave.js:29-31,132)
        "background" to (p.background?.let { encodeBackground(it, p.w, p.h) } ?: JsonValue.Null),
        "holds" to JsonValue.arr(encodeHolds(p)),
        "frames" to JsonValue.arr(p.frames.map { encodeFrame(it, p.w, p.h) }),
    )

    // autosave.js:139 — `(P.holds || P.frames.map(() => 1)).slice()`. The model keeps
    // holds non-null, so the fallback applies when the list is misaligned (PORT_MAP §4.1:
    // "size == frames.size else treated all-1").
    private fun encodeHolds(p: Project): List<JsonValue> =
        if (p.holds.size == p.frames.size) p.holds.map { JsonValue.of(it) }
        else p.frames.map { JsonValue.of(1) }

    private fun encodeFrame(f: Frame, w: Int, h: Int): JsonValue = JsonValue.obj(
        "active" to JsonValue.of(f.active), // `F.active | 0` (autosave.js:143)
        "layers" to JsonValue.arr(f.layers.map { encodeLayer(it, w, h) }),
    )

    private fun encodeLayer(l: Layer, w: Int, h: Int): JsonValue = JsonValue.obj(
        "name" to JsonValue.of(l.name),
        "visible" to JsonValue.of(l.visible),
        "opacity" to JsonValue.Num(l.opacity),
        "blend" to JsonValue.of(l.blend.key),
        "blob" to JsonValue.of(encodeBlob(l.pixels, w, h)),
    )

    private fun encodeBackground(b: Background, w: Int, h: Int): JsonValue = JsonValue.obj(
        "visible" to JsonValue.of(b.visible),
        "opacity" to JsonValue.Num(b.opacity),
        "blend" to JsonValue.of(b.blend.key),
        "blob" to JsonValue.of(encodeBlob(b.pixels, w, h)),
    )

    // frameToBlob always produces a PNG, even for a fully transparent canvas
    // (autosave.js:99-107) — so a blank layer (pixels == null) still writes a blob.
    private fun encodeBlob(pixels: IntArray?, w: Int, h: Int): String {
        val px = if (pixels != null && pixels.size == w * h) pixels else IntArray(w * h)
        return PNG_DATA_URL_PREFIX + Base64.getEncoder().encodeToString(png.encode(px, w, h))
    }

    // ---- Restore (autosave.js:156-207) ------------------------------------------

    /**
     * Restores a gallery from a session payload of any known shape (v1/v2/v3),
     * detected structurally — `payload.v` is never read.
     *
     * Returns a gallery with **zero projects** when the payload has no usable
     * `projects` array — the structural equivalent of the web's `return false`
     * (autosave.js:157); the caller then boots a blank session exactly like the web
     * boot path (i.html:5628-5648). Malformed JSON throws
     * [com.inkframe.core.common.JsonParseException]; the web swallows the same
     * failure at boot (i.html:5643).
     *
     * Every restored layer gets a **fresh id** from [ids] (autosave.js:165,172,177).
     */
    fun restore(json: String, ids: LayerIdGenerator): Gallery {
        val root = parseJson(json)
        val obj = root as? JsonValue.Obj ?: return Gallery(projects = emptyList(), active = 0)
        val projects = (obj.optional("projects") as? JsonValue.Arr)?.items
        if (projects.isNullOrEmpty()) return Gallery(projects = emptyList(), active = 0)
        val restored = projects.map { restoreProject(it, ids) }
        // autosave.js:203 — `min(max(0, payload.pi | 0), restored.length - 1)`.
        val pi = (obj.optional("pi")?.numOrNull()?.toInt() ?: 0).coerceIn(0, restored.size - 1)
        return Gallery(projects = restored, active = pi)
    }

    private fun restoreProject(v: JsonValue, ids: LayerIdGenerator): Project {
        val obj = v as? JsonValue.Obj
        // autosave.js:160 — `P.w || env.W0`; 0/missing falls back to the default size.
        val w = obj?.intOr("w")?.takeIf { it != 0 } ?: Caps.W0
        val h = obj?.intOr("h")?.takeIf { it != 0 } ?: Caps.H0

        val frameItems = (obj?.optional("frames") as? JsonValue.Arr)?.items.orEmpty()
        // autosave.js:191 — `fr.length ? fr : [newFrame(w, h)]`.
        val frames = frameItems.map { restoreFrameItem(it, w, h, ids) }
            .ifEmpty { listOf(Frame.blank(ids)) }

        // autosave.js:192 — holds kept only when their length matches the frame count,
        // else all-1. (Compared against the final frame list; the web's degenerate
        // `holds:[]` + one fallback frame case is treated all-1 by `hOf` anyway.)
        val holdsValue = obj?.optional("holds") as? JsonValue.Arr
        val holds = if (holdsValue != null && holdsValue.items.size == frames.size) {
            holdsValue.items.map { it.numOrNull()?.toInt() ?: 1 }
        } else {
            List(frames.size) { 1 }
        }

        // autosave.js:193 — `min(max(0, P.cur | 0), max(0, fr.length - 1))`.
        val cur = (obj?.intOr("cur") ?: 0).coerceIn(0, (frames.size - 1).coerceAtLeast(0))

        return Project(
            name = obj?.optional("name")?.strOrNull()?.takeIf { it.isNotEmpty() }
                ?: Caps.DEFAULT_PROJECT_NAME,
            w = w,
            h = h,
            fps = obj?.intOr("fps")?.takeIf { it != 0 } ?: Caps.DEFAULT_FPS,
            paper = obj?.optional("paper")?.strOrNull()?.takeIf { it.isNotEmpty() }
                ?: Caps.DEFAULT_PAPER,
            frames = frames,
            holds = holds,
            cur = cur,
            // normalizeCanvasShape: only 'circle' survives (autosave.js:29-31,197).
            canvasShape = CanvasShape.fromKey(obj?.optional("canvasShape")?.strOrNull()),
            background = restoreBackground(obj?.optional("background"), w, h),
        )
    }

    private fun restoreFrameItem(item: JsonValue, w: Int, h: Int, ids: LayerIdGenerator): Frame {
        val itemObj = item as? JsonValue.Obj
        val layerItems = (itemObj?.optional("layers") as? JsonValue.Arr)?.items
        return if (itemObj != null && layerItems != null) {
            // v2/v3 layered frame (autosave.js:163-174).
            val layers = layerItems.map { restoreLayer(it, w, h, ids) }.ifEmpty {
                // autosave.js:172 — an empty layer list becomes one blank "Layer 1".
                listOf(Layer(id = ids.next(), name = Caps.FIRST_LAYER_NAME))
            }
            // autosave.js:173 — `min(item.active | 0, layers.length - 1)`, lower bound
            // added to satisfy the model's `layers.indices` invariant (M1_SPEC §Types).
            Frame(
                layers = layers,
                active = (itemObj.intOr("active") ?: 0).coerceIn(0, layers.size - 1),
            )
        } else {
            // v1 pre-layers frame: the item itself is the frame blob
            // (autosave.js:175-181, payload note L23) — upgraded to one layer.
            Frame(
                layers = listOf(
                    Layer(
                        id = ids.next(),
                        name = Caps.FIRST_LAYER_NAME,
                        pixels = decodePixels(item, w, h),
                    ),
                ),
                active = 0,
            )
        }
    }

    private fun restoreLayer(v: JsonValue, w: Int, h: Int, ids: LayerIdGenerator): Layer {
        val obj = v as? JsonValue.Obj
        return Layer(
            id = ids.next(), // autosave.js:165 — fresh id, payload ids are never reused
            // `sL.name || 'Layer'` (autosave.js:166).
            name = obj?.optional("name")?.strOrNull()?.takeIf { it.isNotEmpty() } ?: DEFAULT_LAYER_NAME,
            // `sL.visible !== false` (autosave.js:167) — only a literal false hides.
            visible = obj?.optional("visible")?.boolOrNull() != false,
            // `typeof sL.opacity === 'number' ? sL.opacity : 1` (autosave.js:168).
            opacity = obj?.optional("opacity")?.numOrNull() ?: 1.0,
            // `sL.blend || 'source-over'` (autosave.js:169); unknown keys map to
            // SOURCE_OVER because the model is an enum (BlendMode.fromKey).
            blend = BlendMode.fromKey(obj?.optional("blend")?.strOrNull()),
            pixels = decodePixels(obj?.optional("blob"), w, h),
        )
    }

    // autosave.js:183-189 — the web always rebuilds a background object; pre-v3
    // payloads restore with "a blank transparent static background" (autosave.js:26),
    // which is exactly `Background()`'s defaults.
    private fun restoreBackground(v: JsonValue?, w: Int, h: Int): Background {
        val obj = v as? JsonValue.Obj ?: return Background()
        return Background(
            visible = obj.optional("visible")?.boolOrNull() != false,
            opacity = obj.optional("opacity")?.numOrNull() ?: 1.0,
            blend = BlendMode.fromKey(obj.optional("blend")?.strOrNull()),
            pixels = decodePixels(obj.optional("blob"), w, h),
        )
    }

    // blobToCanvas (autosave.js:108-119): missing blob → blank canvas; image decode
    // failure → blank canvas. A fully transparent result is the model's canonical
    // blank (`pixels = null`, M1_SPEC §Hard rules) — the web has no such distinction
    // because every web layer owns a real canvas.
    private fun decodePixels(blob: JsonValue?, w: Int, h: Int): IntArray? {
        val text = blob?.strOrNull() ?: return null
        val base64 = if (text.startsWith("data:")) text.substringAfter(',', "") else text
        if (base64.isEmpty()) return null
        val bytes = try {
            Base64.getDecoder().decode(base64)
        } catch (e: IllegalArgumentException) {
            return null
        }
        val decoded = png.decode(bytes) ?: return null
        val (px, dims) = decoded
        if (px.size != dims.first * dims.second) return null
        val fitted = fitToCanvas(px, dims.first, dims.second, w, h)
        return if (fitted.all { it == 0 }) null else fitted
    }

    // `drawImage(img, 0, 0)` onto a w×h canvas (autosave.js:113): natural size,
    // top-left anchored — overflow is clipped, uncovered pixels stay transparent.
    private fun fitToCanvas(src: IntArray, sw: Int, sh: Int, w: Int, h: Int): IntArray {
        if (sw == w && sh == h) return src
        val out = IntArray(w * h)
        val copyW = minOf(sw, w)
        val copyH = minOf(sh, h)
        for (y in 0 until copyH) {
            System.arraycopy(src, y * sw, out, y * w, copyW)
        }
        return out
    }

    private fun JsonValue.numOrNull(): Double? = (this as? JsonValue.Num)?.value
    private fun JsonValue.strOrNull(): String? = (this as? JsonValue.Str)?.value
    private fun JsonValue.boolOrNull(): Boolean? = (this as? JsonValue.Bool)?.value
    private fun JsonValue.Obj.intOr(key: String): Int? = optional(key)?.numOrNull()?.toInt()

    companion object {
        /** Payload version written by [serialize] (`v: 3`, autosave.js:126). */
        const val VERSION = 3

        /**
         * Trailing-debounce cadence of the web autosave scheduler
         * (`SAVE_DELAY_MS = 800`, autosave.js:57,225-228). Exported for the M4
         * scheduler (PORT_MAP §4.3); the codec itself performs no timing.
         */
        const val SAVE_DELAY_MS = 800L

        /** Prefix of the PNG data-URL written for every layer/background blob. */
        const val PNG_DATA_URL_PREFIX = "data:image/png;base64,"

        /** Default name of a restored layer without one (`'Layer'`, autosave.js:166). */
        const val DEFAULT_LAYER_NAME = "Layer"
    }
}
