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

/** Structural JSON codec for the canonical frame-local native document. Raster bytes are external. */
object FrameLocalProjectCodec {

    const val FORMAT_VERSION = 3
    const val FORMAT_NAME = "inkframe-project"
    const val TOPOLOGY = "frame-local"

    fun toJsonString(project: FrameLocalProject, pretty: Boolean = true): String =
        encode(project).toJsonString(pretty)

    fun fromJsonString(text: String): FrameLocalProject = decode(parseJson(text))

    fun encode(project: FrameLocalProject): JsonValue = JsonValue.obj(
        "format" to JsonValue.of(FORMAT_NAME),
        "version" to JsonValue.of(FORMAT_VERSION),
        "topology" to JsonValue.of(TOPOLOGY),
        "id" to JsonValue.of(project.id.value),
        "name" to JsonValue.of(project.name),
        "canvas" to encodeCanvas(project.canvas),
        "background" to encodeBackground(project.background),
        "activeSceneId" to JsonValue.of(project.activeSceneId.value),
        "palette" to JsonValue.arr(project.colorPalette.map(::encodeColor)),
        "createdAt" to JsonValue.of(project.createdAtEpochMs),
        "modifiedAt" to JsonValue.of(project.modifiedAtEpochMs),
        "scenes" to JsonValue.arr(project.scenes.map(::encodeScene)),
    )

    fun decode(value: JsonValue): FrameLocalProject {
        val root = value as? JsonValue.Obj ?: error("Frame-local project root must be an object")
        val format = root["format"].asString()
        require(format == FORMAT_NAME) { "Unsupported project format: $format" }
        val version = root["version"].asInt()
        require(version == FORMAT_VERSION) {
            if (version > FORMAT_VERSION) {
                "Project was saved by a newer version (v$version > v$FORMAT_VERSION)"
            } else {
                "Frame-local codec requires v$FORMAT_VERSION, got v$version"
            }
        }
        val topology = root.optional("topology")?.asString() ?: TOPOLOGY
        require(topology == TOPOLOGY) { "Unsupported project topology: $topology" }

        val scenes = root["scenes"].asArr().items.mapIndexed { index, scene ->
            decodeScene(scene, index)
        }
        return FrameLocalProject(
            id = ProjectId(root["id"].asString()),
            name = root["name"].asString(),
            canvas = decodeCanvas(root["canvas"]),
            background = root.optional("background")?.let(::decodeBackground) ?: StaticBackground(),
            scenes = scenes,
            activeSceneId = root.optional("activeSceneId")?.let {
                if (it is JsonValue.Null) scenes.firstOrNull()?.id
                    ?: error("Project needs an active scene")
                else SceneId(it.asString())
            } ?: scenes.firstOrNull()?.id ?: error("Project needs an active scene"),
            colorPalette = root.optional("palette")?.asArr()?.items?.map(::decodeColor)
                ?: DefaultPalette.entries,
            createdAtEpochMs = root.optional("createdAt")?.asLong() ?: 0L,
            modifiedAtEpochMs = root.optional("modifiedAt")?.asLong() ?: 0L,
        )
    }

    private fun encodeCanvas(canvas: CanvasSpec): JsonValue = JsonValue.obj(
        "width" to JsonValue.of(canvas.widthPx),
        "height" to JsonValue.of(canvas.heightPx),
        "fps" to JsonValue.of(canvas.fps),
        "pixelAspect" to JsonValue.of(canvas.pixelAspect),
        "paper" to encodeColor(canvas.backgroundColor),
        "shape" to JsonValue.of(canvas.shape.name),
    )

    private fun decodeCanvas(value: JsonValue): CanvasSpec = CanvasSpec(
        widthPx = value["width"].asInt(),
        heightPx = value["height"].asInt(),
        fps = value["fps"].asInt(),
        pixelAspect = value.optional("pixelAspect")?.asFloat() ?: 1f,
        backgroundColor = value.optional("paper")?.let(::decodeColor) ?: RgbaColor.WHITE,
        shape = decodeEnum(value.optional("shape")?.asString() ?: CanvasShape.SQUARE.name, "canvas shape") {
            CanvasShape.valueOf(it)
        },
    )

    private fun encodeBackground(background: StaticBackground): JsonValue = JsonValue.obj(
        "visible" to JsonValue.of(background.visible),
        "opacity" to JsonValue.of(background.opacity),
        "blendMode" to JsonValue.of(background.blendMode.name),
        "rasterId" to encodeRasterId(background.rasterId),
    )

    private fun decodeBackground(value: JsonValue): StaticBackground = StaticBackground(
        visible = value.optional("visible")?.asBool() ?: true,
        opacity = value.optional("opacity")?.asFloat() ?: 1f,
        blendMode = decodeBlend(value.optional("blendMode")?.asString() ?: BlendMode.NORMAL.name),
        rasterId = decodeRasterId(value.optional("rasterId")),
    )

    private fun encodeScene(scene: FrameLocalScene): JsonValue = JsonValue.obj(
        "id" to JsonValue.of(scene.id.value),
        "name" to JsonValue.of(scene.name),
        "activeFrame" to JsonValue.of(scene.activeFrameIndex),
        "playbackStart" to JsonValue.of(scene.playbackRange.first),
        "playbackEnd" to JsonValue.of(scene.playbackRange.last),
        "loop" to JsonValue.of(scene.loop),
        "frames" to JsonValue.arr(scene.frames.map(::encodeFrame)),
    )

    private fun decodeScene(value: JsonValue, index: Int): FrameLocalScene {
        val frameValues = value["frames"].asArr().items
        val frames = frameValues.mapIndexed { frameIndex, frame ->
            decodeFrame(frame, "scenes[$index].frames[$frameIndex]")
        }
        return FrameLocalScene(
            id = SceneId(value["id"].asString()),
            name = value["name"].asString(),
            frames = frames,
            activeFrameIndex = value.optional("activeFrame")?.asInt() ?: 0,
            playbackRange = (value.optional("playbackStart")?.asInt() ?: 0)..
                (value.optional("playbackEnd")?.asInt() ?: frames.lastIndex),
            loop = value.optional("loop")?.asBool() ?: true,
        )
    }

    private fun encodeFrame(frame: AnimationFrame): JsonValue = JsonValue.obj(
        "id" to JsonValue.of(frame.id.value),
        "hold" to JsonValue.of(frame.hold),
        "activeLayerId" to JsonValue.of(frame.activeLayerId.value),
        "layers" to JsonValue.arr(frame.layers.map(::encodeLayer)),
    )

    private fun decodeFrame(value: JsonValue, path: String): AnimationFrame {
        val layers = value["layers"].asArr().items.mapIndexed { index, layer ->
            decodeLayer(layer, "$path.layers[$index]")
        }
        return AnimationFrame(
            id = FrameId(value["id"].asString()),
            hold = value.optional("hold")?.asInt() ?: Scene.MIN_FRAME_HOLD,
            layers = layers,
            activeLayerId = value.optional("activeLayerId")?.let {
                if (it is JsonValue.Null) layers.firstOrNull()?.id
                    ?: error("$path needs an active layer")
                else LayerId(it.asString())
            } ?: layers.firstOrNull()?.id ?: error("$path needs an active layer"),
        )
    }

    private fun encodeLayer(layer: FrameLayer): JsonValue = JsonValue.obj(
        "id" to JsonValue.of(layer.id.value),
        "name" to JsonValue.of(layer.name),
        "visible" to JsonValue.of(layer.visible),
        "locked" to JsonValue.of(layer.locked),
        "opacity" to JsonValue.of(layer.opacity),
        "blendMode" to JsonValue.of(layer.blendMode.name),
        "rasterId" to encodeRasterId(layer.rasterId),
    )

    private fun decodeLayer(value: JsonValue, path: String): FrameLayer = FrameLayer(
        id = LayerId(value["id"].asString()),
        name = value["name"].asString(),
        visible = value.optional("visible")?.asBool() ?: true,
        locked = value.optional("locked")?.asBool() ?: false,
        opacity = value.optional("opacity")?.asFloat() ?: 1f,
        blendMode = decodeBlend(value.optional("blendMode")?.asString() ?: BlendMode.NORMAL.name),
        rasterId = decodeRasterId(value.optional("rasterId")),
    ).also {
        require(it.name.length <= FrameLayer.MAX_NAME_CHARS) { "$path.name is too long" }
    }

    private fun encodeRasterId(id: RasterAssetId?): JsonValue =
        id?.let { JsonValue.of(it.value) } ?: JsonValue.Null

    private fun decodeRasterId(value: JsonValue?): RasterAssetId? = when (value) {
        null, JsonValue.Null -> null
        else -> RasterAssetId(value.asString())
    }

    private fun encodeColor(color: RgbaColor): JsonValue = JsonValue.arr(
        listOf(
            JsonValue.of(color.r),
            JsonValue.of(color.g),
            JsonValue.of(color.b),
            JsonValue.of(color.a),
        ),
    )

    private fun decodeColor(value: JsonValue): RgbaColor {
        val components = value.asArr().items
        require(components.size in 3..4) { "Colour needs 3 or 4 components" }
        return RgbaColor(
            components[0].asFloat(),
            components[1].asFloat(),
            components[2].asFloat(),
            if (components.size == 4) components[3].asFloat() else 1f,
        )
    }

    private fun decodeBlend(value: String): BlendMode =
        decodeEnum(value, "blend mode") { BlendMode.valueOf(it) }

    private inline fun <T> decodeEnum(value: String, label: String, decode: (String) -> T): T =
        try {
            decode(value.uppercase())
        } catch (error: IllegalArgumentException) {
            throw IllegalArgumentException("Unsupported $label: $value", error)
        }
}
