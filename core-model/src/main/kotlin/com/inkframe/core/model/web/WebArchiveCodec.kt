package com.inkframe.core.model.web

import com.inkframe.core.common.JsonValue
import com.inkframe.core.common.parseJson
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Base64
import kotlin.math.max
import kotlin.math.min

/**
 * `.inkframe` web-archive v3 codec: a 1:1 port of `buildProjectArchive` /
 * `projectToArchive` (write, i.html:4496-4526) and `archiveToProjects` (lenient read,
 * i.html:4546-4572), plus the I/O naming plumbing of i.html:4470-4473 and 4785-4786.
 *
 * Payload shape (key set exact, field order irrelevant):
 * ```
 * {v:3, app:"InkFrame Studio", kind:"inkframe-web-archive", savedAt, active,
 *  projects:[{name,w,h,cur,fps,paper,holds:[int],
 *             frames:[{active,layers:[{name,visible,opacity,blend,png}]}]}]}
 * ```
 * where `png` is `"data:image/png;base64," + base64(PNG)` (`canvasPngDataUrl`,
 * i.html:4474-4485). **Blank layers are still written as a PNG of a blank canvas** — the
 * web always serializes the layer canvas (i.html:4506), so `pixels == null` encodes as a
 * fully transparent `w*h` PNG.
 *
 * Import is lenient exactly where the web is: legacy single-`project` payloads; per-layer
 * `png|dataUrl|data` keys (plus a frame-level fallback for legacy single-canvas frames,
 * i.html:4556); `MAX_FRAMES`/`MAX_PROJECTS` clamps; fresh layer ids via the injected
 * [LayerIdGenerator]; PNG decode failure -> blank layer (`img.onerror`, i.html:4533);
 * `cur` clamped; missing frames -> one blank frame. Undo/redo are reset — the model
 * simply carries none (i.html:4568 `undo:[], redo:[]`).
 *
 * **v4 acceptance** (PORT_MAP §4.2 divergence note): injector-era `static-background`
 * builds write `{v:4, ...}` with a per-project `background:{visible,opacity,blend,png}`
 * (tools/inject-static-background-v2.mjs:87-94). [decode] populates [Project.background]
 * from `background.blob|png|dataUrl|data` when `v == 4`; a `background` key under any
 * other version is ignored, like the unpatched web importer.
 */
object WebArchiveCodec {
    private const val APP = "InkFrame Studio"
    private const val KIND = "inkframe-web-archive"
    private const val PNG_PREFIX = "data:image/png;base64,"

    private val defaultPng: PngImageIO = ImageIoPngImageIO()

    // ------------------------------------------------------------------ write

    /**
     * Serializes the whole gallery like `buildProjectArchive` (i.html:4517-4526):
     * `{v:3, app, kind, savedAt, active, projects}`. [savedAt] is the caller's epoch-ms
     * (`Date.now()` in the web).
     */
    fun encode(gallery: Gallery, savedAt: Long, png: PngImageIO = defaultPng): String =
        JsonValue.obj(
            "v" to JsonValue.of(3),
            "app" to JsonValue.of(APP),
            "kind" to JsonValue.of(KIND),
            "savedAt" to JsonValue.of(savedAt),
            "active" to JsonValue.of(gallery.active),
            "projects" to JsonValue.arr(gallery.projects.map { encodeProject(it, png) }),
        ).toJsonString()

    /** `projectToArchive` (i.html:4496-4516), minus the async progress callback. */
    private fun encodeProject(p: Project, png: PngImageIO): JsonValue {
        val w = if (p.w != 0) p.w else Caps.W0 // P.w||W0
        val h = if (p.h != 0) p.h else Caps.H0 // P.h||H0
        return JsonValue.obj(
            "name" to JsonValue.of(p.name.ifEmpty { Caps.DEFAULT_PROJECT_NAME }), // P.name||'Canvas'
            "w" to JsonValue.of(w),
            "h" to JsonValue.of(h),
            // Math.min(Math.max(0,P.cur|0),framesSrc.length-1)
            "cur" to JsonValue.of(p.cur.coerceIn(0, p.frames.size - 1)),
            "fps" to JsonValue.of(if (p.fps != 0) p.fps else Caps.DEFAULT_FPS), // P.fps||12
            "paper" to JsonValue.of(p.paper.ifEmpty { Caps.DEFAULT_PAPER }), // P.paper||DEFAULT_PAPER
            // framesSrc.map((_,i)=>Math.max(1,Math.round((P.holds&&P.holds[i])||1)))
            "holds" to JsonValue.arr(p.frames.indices.map { i -> JsonValue.of(max(1, p.holds.getOrElse(i) { 1 })) }),
            "frames" to JsonValue.arr(p.frames.map { encodeFrame(it, w, h, png) }),
        )
    }

    private fun encodeFrame(f: Frame, w: Int, h: Int, png: PngImageIO): JsonValue =
        JsonValue.obj(
            // Math.min(fr.active|0,fr.layers.length-1) — no lower clamp in the web either (i.html:4510)
            "active" to JsonValue.of(min(f.active, f.layers.size - 1)),
            "layers" to JsonValue.arr(f.layers.map { encodeLayer(it, w, h, png) }),
        )

    private fun encodeLayer(l: Layer, w: Int, h: Int, png: PngImageIO): JsonValue =
        JsonValue.obj(
            "name" to JsonValue.of(l.name.ifEmpty { "Layer" }), // L.name||'Layer'
            "visible" to JsonValue.of(l.visible),
            "opacity" to JsonValue.Num(l.opacity),
            "blend" to JsonValue.of(l.blend.key), // L.blend||'source-over' — model already stores the enum
            // canvasPngDataUrl always writes the canvas, even a blank one (i.html:4506, 4474-4485)
            "png" to JsonValue.of(PNG_PREFIX + Base64.getEncoder().encodeToString(png.encode(l.pixels ?: IntArray(w * h), w, h))),
        )

    // ------------------------------------------------------------------ read

    /**
     * Lenient import, `archiveToProjects` (i.html:4546-4572). Throws
     * [IllegalArgumentException] (`"Invalid archive"` / `"No projects in archive"`) on the
     * same payloads the web rejects (i.html:4547-4549); JSON syntax errors surface as
     * [com.inkframe.core.common.JsonParseException].
     *
     * The web clamps the project count in the import *caller* (`slice(0,MAX_PROJECTS)`,
     * i.html:4807) and then re-clamps `active` (i.html:4808); [decode] folds both into the
     * returned [Gallery] so the codec boundary enforces the model caps directly.
     */
    fun decode(json: String, ids: LayerIdGenerator, png: PngImageIO = defaultPng): Gallery {
        val payload = parseJson(json)
        // !payload || typeof payload!=='object' (i.html:4547); a JSON array is an object in
        // JS, so it survives this check and fails at the projects lookup below, as upstream.
        if (payload !is JsonValue.Obj && payload !is JsonValue.Arr) throw IllegalArgumentException("Invalid archive")
        val root = payload as? JsonValue.Obj
        val projectsArr = root?.entries?.get("projects") as? JsonValue.Arr
        val legacy = root?.entries?.get("project")?.takeIf { jsTruthy(it) }
        // Array.isArray(payload.projects) ? payload.projects : (payload.project ? [payload.project] : null)
        val list = projectsArr?.items ?: legacy?.let { listOf(it) }
        if (list.isNullOrEmpty()) throw IllegalArgumentException("No projects in archive")
        val isV4 = (root?.entries?.get("v") as? JsonValue.Num)?.value == 4.0
        val projects = list.map { decodeProject(it, isV4, ids, png) }.take(Caps.MAX_PROJECTS)
        // Math.min(Math.max(0,payload.active|0),restored.length-1) (i.html:4571), applied
        // after the MAX_PROJECTS slice like the caller's re-clamp (i.html:4808).
        val active = jsToInt32(root?.let { num(it, "active") } ?: 0.0).coerceIn(0, projects.size - 1)
        return Gallery(projects, active)
    }

    private fun decodeProject(v: JsonValue, isV4: Boolean, ids: LayerIdGenerator, png: PngImageIO): Project {
        // Property access on a non-object JS value yields undefined; mirror with an empty object.
        val p = v as? JsonValue.Obj ?: EMPTY_OBJ
        // Math.max(1,P.w||W0) — truthiness checked on the raw number, then Int truncation
        val w = max(1, num(p, "w")?.takeIf { it != 0.0 }?.toInt() ?: Caps.W0)
        val h = max(1, num(p, "h")?.takeIf { it != 0.0 }?.toInt() ?: Caps.H0)
        val srcFrames = (p.entries["frames"] as? JsonValue.Arr)?.items?.takeIf { it.isNotEmpty() }
            ?: listOf(EMPTY_OBJ) // [{active:0,layers:[]}] (i.html:4553)
        val frames = srcFrames.take(Caps.MAX_FRAMES).map { decodeFrame(it, w, h, ids, png) }
        // SPEC §WebArchiveCodec.decode: holds kept only if length == frames.size, else all-1
        // (same rule as session restore, autosave.js:192). Kept entries are sanitized with
        // the web's per-element formula Math.max(1,Math.round(v||1)) (i.html:4567).
        val holdsArr = (p.entries["holds"] as? JsonValue.Arr)?.items
        val holds = if (holdsArr != null && holdsArr.size == frames.size) {
            holdsArr.map { max(1, jsRound(((it as? JsonValue.Num)?.value?.takeIf { v2 -> v2 != 0.0 } ?: 1.0)).toInt()) }
        } else {
            List(frames.size) { 1 }
        }
        val background = if (isV4) decodeBackground(p, w, h, png) else null
        return Project(
            name = str(p, "name")?.takeIf { it.isNotEmpty() } ?: Caps.DEFAULT_PROJECT_NAME, // P.name||'Canvas'
            w = w,
            h = h,
            fps = num(p, "fps")?.toInt()?.takeIf { it != 0 } ?: Caps.DEFAULT_FPS, // P.fps||12
            paper = str(p, "paper")?.takeIf { it.isNotEmpty() } ?: Caps.DEFAULT_PAPER,
            frames = frames,
            holds = holds,
            // Math.min(Math.max(0,P.cur|0),framesOut.length-1) (i.html:4568)
            cur = jsToInt32(num(p, "cur") ?: 0.0).coerceIn(0, frames.size - 1),
            canvasShape = CanvasShape.SQUARE, // not carried by the archive schema
            background = background,
        )
    }

    private fun decodeFrame(item: JsonValue, w: Int, h: Int, ids: LayerIdGenerator, png: PngImageIO): Frame {
        val f = item as? JsonValue.Obj ?: EMPTY_OBJ
        val layersArr = (f.entries["layers"] as? JsonValue.Arr)?.items?.takeIf { it.isNotEmpty() }
        // Legacy single-canvas frame: [{name:'Layer 1', png:item.png||item.dataUrl||item.data}] (i.html:4556)
        val srcLayers = layersArr ?: listOf(legacyFrameLayer(f))
        val layers = srcLayers.map { decodeLayer(it, w, h, ids, png) }
        // Math.min(item.active|0, layers.length-1) (i.html:4565) — no lower clamp upstream;
        // a negative foreign value is tolerated by the read path (Frame.activeLayer, i.html:1079).
        val active = min(jsToInt32(num(f, "active") ?: 0.0), layers.size - 1)
        return Frame(layers = layers, active = active, version = 0)
    }

    private fun legacyFrameLayer(f: JsonValue.Obj): JsonValue {
        val entries = LinkedHashMap<String, JsonValue>()
        entries["name"] = JsonValue.of(Caps.FIRST_LAYER_NAME)
        firstTruthy(f, "png", "dataUrl", "data")?.let { entries["png"] = it }
        return JsonValue.Obj(entries)
    }

    private fun decodeLayer(v: JsonValue, w: Int, h: Int, ids: LayerIdGenerator, png: PngImageIO): Layer {
        val l = v as? JsonValue.Obj ?: EMPTY_OBJ
        return Layer(
            id = ids.next(), // id:__lid++ (i.html:4559) — imported ids are never trusted
            name = str(l, "name")?.takeIf { it.isNotEmpty() } ?: "Layer", // L.name||'Layer'
            visible = isNotFalse(l.entries["visible"]), // L.visible!==false
            opacity = num(l, "opacity") ?: 1.0, // typeof L.opacity==='number'?L.opacity:1
            blend = BlendMode.fromKey(str(l, "blend")), // L.blend||'source-over'
            pixels = decodeDataUrl(strOrNull(firstTruthy(l, "png", "dataUrl", "data")), w, h, png),
        )
    }

    /** v4 per-project background (inject-static-background-v2.mjs:94); keys `blob|png|dataUrl|data` (SPEC). */
    private fun decodeBackground(p: JsonValue.Obj, w: Int, h: Int, png: PngImageIO): Background? {
        val bg = p.entries["background"] as? JsonValue.Obj ?: return null
        return Background(
            visible = isNotFalse(bg.entries["visible"]),
            opacity = num(bg, "opacity") ?: 1.0,
            blend = BlendMode.fromKey(str(bg, "blend")),
            pixels = decodeDataUrl(strOrNull(firstTruthy(bg, "blob", "png", "dataUrl", "data")), w, h, png),
        )
    }

    /**
     * `loadArchiveCanvas` (i.html:4527-4536): any failure — missing src, undecodable data
     * URL, truncated/corrupt PNG — resolves to a blank canvas (`null` pixels here). Only
     * `data:` URLs are decodable natively; remote URLs degrade to blank like the web's
     * `onerror` path (the native port is offline-first).
     *
     * A PNG whose dimensions differ from the project is scaled to `w*h`, mirroring
     * `drawImage(img,0,0,w,h)` (i.html:4532); see [scaleBilinear].
     */
    private fun decodeDataUrl(src: String?, w: Int, h: Int, png: PngImageIO): IntArray? {
        if (src.isNullOrEmpty()) return null
        if (!src.startsWith("data:")) return null
        val comma = src.indexOf(',')
        if (comma < 0) return null
        val bytes = try {
            Base64.getMimeDecoder().decode(src.substring(comma + 1))
        } catch (e: IllegalArgumentException) {
            return null
        }
        val (pixels, size) = png.decode(bytes) ?: return null
        return if (size.first == w && size.second == h) pixels else scaleBilinear(pixels, size.first, size.second, w, h)
    }

    /**
     * Straight-alpha bilinear resample approximating Canvas2D `drawImage` smoothing
     * (i.html:4532). Browser filtering is implementation-defined, so exact parity on
     * size-mismatched foreign payloads is not claimed; web-written archives always store
     * canvases at project size and never take this path.
     */
    private fun scaleBilinear(src: IntArray, sw: Int, sh: Int, dw: Int, dh: Int): IntArray {
        val out = IntArray(dw * dh)
        for (y in 0 until dh) {
            val fy = (y + 0.5) * sh / dh - 0.5
            val y0 = kotlin.math.floor(fy).toInt().coerceIn(0, sh - 1)
            val y1 = (y0 + 1).coerceAtMost(sh - 1)
            val wy = fy - kotlin.math.floor(fy)
            for (x in 0 until dw) {
                val fx = (x + 0.5) * sw / dw - 0.5
                val x0 = kotlin.math.floor(fx).toInt().coerceIn(0, sw - 1)
                val x1 = (x0 + 1).coerceAtMost(sw - 1)
                val wx = fx - kotlin.math.floor(fx)
                val c00 = src[y0 * sw + x0]
                val c10 = src[y0 * sw + x1]
                val c01 = src[y1 * sw + x0]
                val c11 = src[y1 * sw + x1]
                out[y * dw + x] = lerpArgb(c00, c10, c01, c11, wx, wy)
            }
        }
        return out
    }

    private fun lerpArgb(c00: Int, c10: Int, c01: Int, c11: Int, wx: Double, wy: Double): Int {
        var result = 0
        for (shift in intArrayOf(24, 16, 8, 0)) {
            val v00 = (c00 ushr shift) and 0xFF
            val v10 = (c10 ushr shift) and 0xFF
            val v01 = (c01 ushr shift) and 0xFF
            val v11 = (c11 ushr shift) and 0xFF
            val top = v00 + (v10 - v00) * wx
            val bottom = v01 + (v11 - v01) * wx
            val v = (top + (bottom - top) * wy).toInt().coerceIn(0, 255)
            result = result or (v shl shift)
        }
        return result
    }

    // ------------------------------------------------------------------ naming

    private val FILE_NAME_DATE: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyyMMdd-HHmm").withZone(ZoneOffset.UTC)

    /**
     * `inkframe-YYYYMMDD-HHMM.inkframe` (i.html:4470-4473, 4786). The web stamps in
     * browser-local time; the SPEC pins **UTC** so a given [now] produces the same name on
     * every machine — the only intentional divergence from the web formula.
     */
    fun suggestedFileName(now: Long): String = "inkframe-${FILE_NAME_DATE.format(Instant.ofEpochMilli(now))}.inkframe"

    // ------------------------------------------------------------------ JS leniency helpers

    private val EMPTY_OBJ = JsonValue.Obj(emptyMap())

    /** JS truthiness for the `||`/`?:` chains ported above. */
    private fun jsTruthy(v: JsonValue?): Boolean = when (v) {
        null, JsonValue.Null -> false
        is JsonValue.Bool -> v.value
        is JsonValue.Num -> v.value != 0.0 && !v.value.isNaN()
        is JsonValue.Str -> v.value.isNotEmpty()
        is JsonValue.Obj, is JsonValue.Arr -> true
    }

    private fun num(obj: JsonValue.Obj, key: String): Double? = (obj.entries[key] as? JsonValue.Num)?.value

    private fun str(obj: JsonValue.Obj, key: String): String? = (obj.entries[key] as? JsonValue.Str)?.value

    private fun strOrNull(v: JsonValue?): String? = (v as? JsonValue.Str)?.value

    /** First JS-truthy value among [keys] — the `a||b||c` chain (i.html:4561). */
    private fun firstTruthy(obj: JsonValue.Obj, vararg keys: String): JsonValue? =
        keys.firstNotNullOfOrNull { key -> obj.entries[key]?.takeIf { jsTruthy(it) } }

    /** `visible !== false`: everything except literal JSON `false` reads as visible. */
    private fun isNotFalse(v: JsonValue?): Boolean = v !is JsonValue.Bool || v.value

    /** JS `Math.round(x)` = `floor(x + 0.5)` — ties go up, unlike rint/ties-to-even. */
    private fun jsRound(d: Double): Double = kotlin.math.floor(d + 0.5)

    /**
     * JS `x|0` (ToInt32): NaN/Infinity -> 0, fractional -> truncated, out-of-range ->
     * wrapped mod 2^32. Used for the `P.cur|0` / `item.active|0` / `payload.active|0`
     * coercions (i.html:4565, 4568, 4571).
     */
    private fun jsToInt32(d: Double): Int {
        if (d.isNaN() || d.isInfinite()) return 0
        val mod = d % 4294967296.0 // 2^32
        val wrapped = when {
            mod >= 2147483648.0 -> mod - 4294967296.0
            mod <= -2147483648.0 -> mod + 4294967296.0
            else -> mod
        }
        return wrapped.toInt()
    }
}
