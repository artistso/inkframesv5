package com.inkframe.core.model

import com.inkframe.core.common.JsonValue
import com.inkframe.core.common.asArr
import com.inkframe.core.common.asBool
import com.inkframe.core.common.asFloat
import com.inkframe.core.common.asInt
import com.inkframe.core.common.asLong
import com.inkframe.core.common.asString
import com.inkframe.core.common.get
import com.inkframe.core.common.optional
import com.inkframe.core.common.parseJson

/**
 * Serializes a [Project] document (the structural model only — no pixels) to and from
 * JSON. Pixel data for each [Cel] is stored separately as a PNG named by its surfaceId.
 */
object ProjectCodec {

    /** v2 adds scene-level per-frame hold counts. v1 files decode with all holds = 1. */
    const val FORMAT_VERSION = 2

    fun toJsonString(project: Project, pretty: Boolean = true): String =
        encode(project).toJsonString(pretty)

    fun fromJsonString(text: String): Project = decode(parseJson(text))

    // ---- Encode --------------------------------------------------------------

    fun encode(p: Project): JsonValue = JsonValue.obj(
        "format" to JsonValue.of("inkframe-project"),
        "version" to JsonValue.of(FORMAT_VERSION),
        "id" to JsonValue.of(p.id),
        "name" to JsonValue.of(p.name),
        "canvas" to encodeCanvas(p.canvas),
        "createdAt" to JsonValue.of(p.createdAtEpochMs),
        "modifiedAt" to JsonValue.of(p.modifiedAtEpochMs),
        "activeSceneId" to (p.activeSceneId?.let { JsonValue.of(it) } ?: JsonValue.Null),
        "palette" to JsonValue.arr(p.colorPalette.map { encodeColor(it) }),
        "scenes" to JsonValue.arr(p.scenes.map { encodeScene(it) }),
    )

    private fun encodeCanvas(c: CanvasSpec): JsonValue = JsonValue.obj(
        "width" to JsonValue.of(c.widthPx),
        "height" to JsonValue.of(c.heightPx),
        "fps" to JsonValue.of(c.fps),
        "pixelAspect" to JsonValue.of(c.pixelAspect),
        "background" to encodeColor(c.backgroundColor),
    )

    private fun encodeColor(c: RgbaColor): JsonValue = JsonValue.arr(
        listOf(JsonValue.of(c.r), JsonValue.of(c.g), JsonValue.of(c.b), JsonValue.of(c.a)),
    )

    private fun encodeScene(s: Scene): JsonValue = JsonValue.obj(
        "id" to JsonValue.of(s.id),
        "name" to JsonValue.of(s.name),
        "frameCount" to JsonValue.of(s.frameCount),
        "holds" to JsonValue.arr(s.holds.map { JsonValue.of(it) }),
        "playbackStart" to JsonValue.of(s.playbackRange.first),
        "playbackEnd" to JsonValue.of(s.playbackRange.last),
        "loop" to JsonValue.of(s.loop),
        "layers" to JsonValue.arr(s.layers.map { encodeLayer(it) }),
    )

    private fun encodeLayer(l: Layer): JsonValue = JsonValue.obj(
        "id" to JsonValue.of(l.id),
        "name" to JsonValue.of(l.name),
        "opacity" to JsonValue.of(l.opacity),
        "visible" to JsonValue.of(l.visible),
        "locked" to JsonValue.of(l.locked),
        "blendMode" to JsonValue.of(l.blendMode.name),
        "cels" to JsonValue.arr(
            l.cels.entries.sortedBy { it.key }.map { (frame, cel) -> encodeCel(frame, cel) },
        ),
    )

    private fun encodeCel(frame: Int, cel: Cel): JsonValue = JsonValue.obj(
        "frame" to JsonValue.of(frame),
        "id" to JsonValue.of(cel.id),
        "surfaceId" to JsonValue.of(cel.surfaceId),
        "transform" to JsonValue.obj(
            "tx" to JsonValue.of(cel.transform.tx),
            "ty" to JsonValue.of(cel.transform.ty),
            "scaleX" to JsonValue.of(cel.transform.scaleX),
            "scaleY" to JsonValue.of(cel.transform.scaleY),
            "rotationDeg" to JsonValue.of(cel.transform.rotationDeg),
        ),
    )

    // ---- Decode --------------------------------------------------------------

    fun decode(root: JsonValue): Project {
        val version = root.optional("version")?.asInt() ?: 1
        require(version <= FORMAT_VERSION) {
            "Project was saved by a newer version (v$version > v$FORMAT_VERSION)"
        }
        val scenes = root["scenes"].asArr().items.map { decodeScene(it) }
        return Project(
            id = root["id"].asString(),
            name = root["name"].asString(),
            canvas = decodeCanvas(root["canvas"]),
            scenes = scenes,
            activeSceneId = root.optional("activeSceneId")?.let {
                if (it is JsonValue.Null) null else it.asString()
            } ?: scenes.firstOrNull()?.id,
            colorPalette = root.optional("palette")?.asArr()?.items?.map { decodeColor(it) }
                ?: DefaultPalette.entries,
            createdAtEpochMs = root.optional("createdAt")?.asLong() ?: System.currentTimeMillis(),
            modifiedAtEpochMs = root.optional("modifiedAt")?.asLong() ?: System.currentTimeMillis(),
        )
    }

    private fun decodeCanvas(v: JsonValue): CanvasSpec = CanvasSpec(
        widthPx = v["width"].asInt(),
        heightPx = v["height"].asInt(),
        fps = v["fps"].asInt(),
        pixelAspect = v.optional("pixelAspect")?.asFloat() ?: 1f,
        backgroundColor = v.optional("background")?.let { decodeColor(it) } ?: RgbaColor.WHITE,
    )

    private fun decodeColor(v: JsonValue): RgbaColor {
        val a = v.asArr().items
        return RgbaColor(a[0].asFloat(), a[1].asFloat(), a[2].asFloat(), if (a.size > 3) a[3].asFloat() else 1f)
    }

    private fun decodeScene(v: JsonValue): Scene {
        val frameCount = v["frameCount"].asInt()
        val start = v.optional("playbackStart")?.asInt() ?: 0
        val end = v.optional("playbackEnd")?.asInt() ?: (frameCount - 1)
        val rawHolds = (v.optional("holds") as? JsonValue.Arr)?.items?.map { item ->
            val number = (item as? JsonValue.Num)?.value
            if (number != null && number.isFinite()) number.toInt() else Scene.MIN_HOLD
        }.orEmpty()
        val holds = List(frameCount) { index ->
            (rawHolds.getOrNull(index) ?: Scene.MIN_HOLD)
                .coerceIn(Scene.MIN_HOLD, Scene.MAX_HOLD)
        }
        return Scene(
            id = v["id"].asString(),
            name = v["name"].asString(),
            frameCount = frameCount,
            layers = v["layers"].asArr().items.map { decodeLayer(it) },
            playbackRange = start..end,
            loop = v.optional("loop")?.asBool() ?: true,
            holds = holds,
        )
    }

    private fun decodeLayer(v: JsonValue): Layer = Layer(
        id = v["id"].asString(),
        name = v["name"].asString(),
        opacity = v.optional("opacity")?.asFloat() ?: 1f,
        visible = v.optional("visible")?.asBool() ?: true,
        locked = v.optional("locked")?.asBool() ?: false,
        blendMode = runCatching { BlendMode.valueOf(v["blendMode"].asString()) }.getOrDefault(BlendMode.NORMAL),
        cels = v["cels"].asArr().items.associate { decodeCel(it) },
    )

    private fun decodeCel(v: JsonValue): Pair<Int, Cel> {
        val frame = v["frame"].asInt()
        val t = v.optional("transform")
        val transform = if (t != null) {
            CelTransform(
                tx = t.optional("tx")?.asFloat() ?: 0f,
                ty = t.optional("ty")?.asFloat() ?: 0f,
                scaleX = t.optional("scaleX")?.asFloat() ?: 1f,
                scaleY = t.optional("scaleY")?.asFloat() ?: 1f,
                rotationDeg = t.optional("rotationDeg")?.asFloat() ?: 0f,
            )
        } else {
            CelTransform()
        }
        return frame to Cel(
            id = v["id"].asString(),
            surfaceId = v["surfaceId"].asLong(),
            transform = transform,
        )
    }
}
