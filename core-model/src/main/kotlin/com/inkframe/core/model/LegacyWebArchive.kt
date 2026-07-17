package com.inkframe.core.model

import com.inkframe.core.common.JsonValue
import com.inkframe.core.common.asArr
import com.inkframe.core.common.asBool
import com.inkframe.core.common.asDouble
import com.inkframe.core.common.asObj
import com.inkframe.core.common.asString
import com.inkframe.core.common.optional
import com.inkframe.core.common.parseJson
import java.util.Base64

/** Exact frame-local intermediate representation of a historical web `.inkframe` archive. */
data class LegacyWebArchive(
    val version: Int,
    val savedAtEpochMs: Long?,
    val activeProjectIndex: Int,
    val projects: List<LegacyWebProject>,
    val warnings: List<String>,
)

data class LegacyWebProject(
    val name: String,
    val widthPx: Int,
    val heightPx: Int,
    val currentFrameIndex: Int,
    val fps: Int,
    val paperColor: String,
    val canvasShape: CanvasShape,
    val background: LegacyWebBackground?,
    val frameHolds: List<Int>,
    val frames: List<LegacyWebFrame>,
)

data class LegacyWebBackground(
    val visible: Boolean,
    val opacity: Float,
    val blendMode: BlendMode,
    val pngBytes: ByteArray?,
)

data class LegacyWebFrame(
    val activeLayerIndex: Int,
    val layers: List<LegacyWebLayer>,
)

data class LegacyWebLayer(
    val name: String,
    val visible: Boolean,
    val opacity: Float,
    val blendMode: BlendMode,
    val pngBytes: ByteArray?,
)

/** Raised when a historical archive cannot be represented safely and exactly. */
class LegacyWebArchiveException(message: String, cause: Throwable? = null) :
    IllegalArgumentException(message, cause)

/**
 * Bounded, dependency-free parser for portable web archives v3 and v4.
 *
 * Parsing intentionally stops at a frame-local DTO. Conversion into the canonical native
 * document is a separate operation because the old web topology stores a distinct ordered layer
 * stack on every frame. The current sparse-layer prototype cannot represent that losslessly.
 */
object LegacyWebArchiveParser {

    data class Limits(
        val maxJsonChars: Int = 128 * 1024 * 1024,
        val maxProjects: Int = 4,
        val maxFramesPerProject: Int = 1_024,
        val maxLayersPerFrame: Int = 64,
        val maxDimensionPx: Int = 16_384,
        val maxNameChars: Int = 256,
        val maxPaperColorChars: Int = 64,
        val maxPngBytesPerSurface: Int = 32 * 1024 * 1024,
        val maxTotalPngBytes: Long = 96L * 1024L * 1024L,
        val maxTotalSurfacePixels: Long = 268_435_456L,
    )

    /** Cheap content sniff used before choosing between JSON web archives and native ZIP files. */
    fun looksLikeLegacyJson(text: String): Boolean {
        val trimmed = text.trimStart()
        if (!trimmed.startsWith('{')) return false
        return trimmed.contains("\"inkframe-web-archive\"") ||
            (trimmed.contains("\"projects\"") && trimmed.contains("\"frames\""))
    }

    fun parse(text: String, limits: Limits = Limits()): LegacyWebArchive {
        if (text.length > limits.maxJsonChars) {
            throw LegacyWebArchiveException(
                "Legacy archive JSON exceeds ${limits.maxJsonChars} characters",
            )
        }
        val root = try {
            parseJson(text).asObj()
        } catch (error: Throwable) {
            throw LegacyWebArchiveException("Legacy archive is not valid JSON", error)
        }
        return Decoder(limits).decode(root)
    }

    private class Decoder(private val limits: Limits) {
        private val warnings = ArrayList<String>()
        private var totalPngBytes = 0L
        private var totalSurfacePixels = 0L

        fun decode(root: JsonValue.Obj): LegacyWebArchive {
            val version = requiredInt(root, "v", "archive.v")
            if (version !in 3..4) {
                throw LegacyWebArchiveException(
                    "Unsupported legacy web archive version $version; supported versions are 3 and 4",
                )
            }

            root.entries["kind"]?.let { value ->
                val kind = requiredString(value, "archive.kind")
                if (kind != ARCHIVE_KIND) {
                    throw LegacyWebArchiveException("Unsupported archive kind: $kind")
                }
            } ?: warnings.add("archive.kind was missing; accepted by structural signature")

            val projectsValue = root.entries["projects"]
            val projectValues = when {
                projectsValue != null -> requiredArray(projectsValue, "archive.projects")
                root.entries["project"] != null -> {
                    warnings.add("archive.project singleton normalized to archive.projects")
                    listOf(root.entries.getValue("project"))
                }
                else -> throw LegacyWebArchiveException("Legacy archive contains no projects")
            }
            if (projectValues.isEmpty()) throw LegacyWebArchiveException("Legacy archive contains no projects")
            if (projectValues.size > limits.maxProjects) {
                throw LegacyWebArchiveException(
                    "Legacy archive contains ${projectValues.size} projects; limit is ${limits.maxProjects}",
                )
            }

            val projects = projectValues.mapIndexed { index, value ->
                decodeProject(requiredObject(value, "projects[$index]"), index, version)
            }
            val activeRaw = optionalInt(root, "active", "archive.active") ?: 0
            val active = activeRaw.coerceIn(0, projects.lastIndex)
            if (active != activeRaw) warnings.add("archive.active $activeRaw clamped to $active")

            return LegacyWebArchive(
                version = version,
                savedAtEpochMs = optionalLong(root, "savedAt", "archive.savedAt"),
                activeProjectIndex = active,
                projects = projects,
                warnings = warnings.toList(),
            )
        }

        private fun decodeProject(
            obj: JsonValue.Obj,
            projectIndex: Int,
            archiveVersion: Int,
        ): LegacyWebProject {
            val path = "projects[$projectIndex]"
            val width = requiredInt(obj, "w", "$path.w")
            val height = requiredInt(obj, "h", "$path.h")
            requireInRange(width, 1, limits.maxDimensionPx, "$path.w")
            requireInRange(height, 1, limits.maxDimensionPx, "$path.h")

            val framesValue = obj.entries["frames"]
            val rawFrames = when {
                framesValue == null -> {
                    warnings.add("$path.frames missing; inserted one blank frame")
                    emptyList()
                }
                else -> requiredArray(framesValue, "$path.frames")
            }
            if (rawFrames.size > limits.maxFramesPerProject) {
                throw LegacyWebArchiveException(
                    "$path contains ${rawFrames.size} frames; limit is ${limits.maxFramesPerProject}",
                )
            }
            val frames = if (rawFrames.isEmpty()) {
                listOf(blankFrame(path, width, height))
            } else {
                rawFrames.mapIndexed { frameIndex, value ->
                    decodeFrame(requiredObject(value, "$path.frames[$frameIndex]"), path, frameIndex, width, height)
                }
            }

            val holds = decodeHolds(obj.entries["holds"], frames.size, "$path.holds")
            val currentRaw = optionalInt(obj, "cur", "$path.cur") ?: 0
            val current = currentRaw.coerceIn(0, frames.lastIndex)
            if (current != currentRaw) warnings.add("$path.cur $currentRaw clamped to $current")

            val shape = when (optionalString(obj, "canvasShape", "$path.canvasShape")?.lowercase()) {
                null, "square" -> CanvasShape.SQUARE
                "circle" -> CanvasShape.CIRCLE
                else -> throw LegacyWebArchiveException("$path.canvasShape must be square or circle")
            }

            val background = obj.entries["background"]?.let { value ->
                decodeBackground(requiredObject(value, "$path.background"), path, width, height)
            } ?: if (archiveVersion >= 4) {
                warnings.add("$path.background missing from v$archiveVersion archive; using transparent background")
                null
            } else {
                null
            }

            return LegacyWebProject(
                name = boundedString(
                    optionalString(obj, "name", "$path.name") ?: "Canvas",
                    limits.maxNameChars,
                    "$path.name",
                ),
                widthPx = width,
                heightPx = height,
                currentFrameIndex = current,
                fps = (optionalInt(obj, "fps", "$path.fps") ?: 12).also {
                    requireInRange(it, PlaybackOps.MIN_FPS, PlaybackOps.MAX_FPS, "$path.fps")
                },
                paperColor = boundedString(
                    optionalString(obj, "paper", "$path.paper") ?: DEFAULT_PAPER,
                    limits.maxPaperColorChars,
                    "$path.paper",
                ),
                canvasShape = shape,
                background = background,
                frameHolds = holds,
                frames = frames,
            )
        }

        private fun decodeFrame(
            obj: JsonValue.Obj,
            projectPath: String,
            frameIndex: Int,
            width: Int,
            height: Int,
        ): LegacyWebFrame {
            val path = "$projectPath.frames[$frameIndex]"
            val layersValue = obj.entries["layers"]
            val rawLayers = layersValue?.let { requiredArray(it, "$path.layers") }.orEmpty()
            if (rawLayers.size > limits.maxLayersPerFrame) {
                throw LegacyWebArchiveException(
                    "$path contains ${rawLayers.size} layers; limit is ${limits.maxLayersPerFrame}",
                )
            }

            val layers = if (rawLayers.isEmpty()) {
                val direct = decodeRaster(obj, path)
                registerSurface(width, height, "$path.layers[0]")
                listOf(
                    LegacyWebLayer(
                        name = "Layer 1",
                        visible = true,
                        opacity = 1f,
                        blendMode = BlendMode.NORMAL,
                        pngBytes = direct,
                    ),
                )
            } else {
                rawLayers.mapIndexed { layerIndex, value ->
                    decodeLayer(
                        requiredObject(value, "$path.layers[$layerIndex]"),
                        "$path.layers[$layerIndex]",
                        width,
                        height,
                    )
                }
            }

            val activeRaw = optionalInt(obj, "active", "$path.active") ?: 0
            val active = activeRaw.coerceIn(0, layers.lastIndex)
            if (active != activeRaw) warnings.add("$path.active $activeRaw clamped to $active")
            return LegacyWebFrame(activeLayerIndex = active, layers = layers)
        }

        private fun blankFrame(projectPath: String, width: Int, height: Int): LegacyWebFrame {
            registerSurface(width, height, "$projectPath.frames[0].layers[0]")
            return LegacyWebFrame(
                activeLayerIndex = 0,
                layers = listOf(
                    LegacyWebLayer(
                        name = "Layer 1",
                        visible = true,
                        opacity = 1f,
                        blendMode = BlendMode.NORMAL,
                        pngBytes = null,
                    ),
                ),
            )
        }

        private fun decodeLayer(
            obj: JsonValue.Obj,
            path: String,
            width: Int,
            height: Int,
        ): LegacyWebLayer {
            registerSurface(width, height, path)
            return LegacyWebLayer(
                name = boundedString(
                    optionalString(obj, "name", "$path.name") ?: "Layer",
                    limits.maxNameChars,
                    "$path.name",
                ),
                visible = optionalBoolean(obj, "visible", "$path.visible") ?: true,
                opacity = decodeOpacity(obj, path),
                blendMode = decodeBlend(optionalString(obj, "blend", "$path.blend") ?: "source-over", path),
                pngBytes = decodeRaster(obj, path),
            )
        }

        private fun decodeBackground(
            obj: JsonValue.Obj,
            projectPath: String,
            width: Int,
            height: Int,
        ): LegacyWebBackground {
            val path = "$projectPath.background"
            registerSurface(width, height, path)
            return LegacyWebBackground(
                visible = optionalBoolean(obj, "visible", "$path.visible") ?: true,
                opacity = decodeOpacity(obj, path),
                blendMode = decodeBlend(optionalString(obj, "blend", "$path.blend") ?: "source-over", path),
                pngBytes = decodeRaster(obj, path),
            )
        }

        private fun decodeHolds(value: JsonValue?, frameCount: Int, path: String): List<Int> {
            if (value == null || value is JsonValue.Null) return List(frameCount) { Scene.MIN_FRAME_HOLD }
            val source = requiredArray(value, path)
            if (source.size != frameCount) {
                throw LegacyWebArchiveException(
                    "$path length ${source.size} does not match frame count $frameCount",
                )
            }
            return source.mapIndexed { index, item ->
                requiredWholeNumber(item, "$path[$index]").also {
                    requireInRange(it, Scene.MIN_FRAME_HOLD, Scene.MAX_FRAME_HOLD, "$path[$index]")
                }
            }
        }

        private fun decodeOpacity(obj: JsonValue.Obj, path: String): Float {
            val value = obj.entries["opacity"] ?: return 1f
            val decoded = requiredFiniteNumber(value, "$path.opacity")
            if (decoded !in 0.0..1.0) {
                throw LegacyWebArchiveException("$path.opacity must be in 0..1")
            }
            return decoded.toFloat()
        }

        private fun decodeBlend(value: String, path: String): BlendMode = when (value.lowercase()) {
            "source-over" -> BlendMode.NORMAL
            "multiply" -> BlendMode.MULTIPLY
            "screen" -> BlendMode.SCREEN
            "overlay" -> BlendMode.OVERLAY
            "lighter" -> BlendMode.ADD
            "darken" -> BlendMode.DARKEN
            "lighten" -> BlendMode.LIGHTEN
            "difference" -> BlendMode.DIFFERENCE
            else -> throw LegacyWebArchiveException("$path.blend has unsupported value '$value'")
        }

        private fun decodeRaster(obj: JsonValue.Obj, path: String): ByteArray? {
            val encoded = sequenceOf("png", "dataUrl", "data")
                .mapNotNull { key -> obj.entries[key]?.let { key to it } }
                .firstOrNull()
                ?: return null
            if (encoded.second is JsonValue.Null) return null
            val dataUrl = requiredString(encoded.second, "$path.${encoded.first}")
            if (dataUrl.isBlank()) return null
            if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
                throw LegacyWebArchiveException("$path.${encoded.first} must be a base64 PNG data URL")
            }
            val payload = dataUrl.substring(PNG_DATA_URL_PREFIX.length)
            val estimatedBytes = ((payload.length.toLong() + 3L) / 4L) * 3L
            if (estimatedBytes > limits.maxPngBytesPerSurface) {
                throw LegacyWebArchiveException(
                    "$path PNG exceeds ${limits.maxPngBytesPerSurface} decoded bytes",
                )
            }
            if (totalPngBytes + estimatedBytes > limits.maxTotalPngBytes) {
                throw LegacyWebArchiveException(
                    "Legacy archive PNG payload exceeds ${limits.maxTotalPngBytes} decoded bytes",
                )
            }
            val bytes = try {
                Base64.getDecoder().decode(payload)
            } catch (error: IllegalArgumentException) {
                throw LegacyWebArchiveException("$path contains invalid base64 PNG data", error)
            }
            if (bytes.size > limits.maxPngBytesPerSurface) {
                throw LegacyWebArchiveException(
                    "$path PNG exceeds ${limits.maxPngBytesPerSurface} decoded bytes",
                )
            }
            if (!hasPngSignature(bytes)) {
                throw LegacyWebArchiveException("$path decoded data is not a PNG")
            }
            totalPngBytes += bytes.size
            if (totalPngBytes > limits.maxTotalPngBytes) {
                throw LegacyWebArchiveException(
                    "Legacy archive PNG payload exceeds ${limits.maxTotalPngBytes} decoded bytes",
                )
            }
            return bytes
        }

        private fun registerSurface(width: Int, height: Int, path: String) {
            val pixels = width.toLong() * height.toLong()
            totalSurfacePixels += pixels
            if (totalSurfacePixels > limits.maxTotalSurfacePixels) {
                throw LegacyWebArchiveException(
                    "$path would exceed ${limits.maxTotalSurfacePixels} total surface pixels",
                )
            }
        }

        private fun requiredObject(value: JsonValue, path: String): JsonValue.Obj = try {
            value.asObj()
        } catch (error: Throwable) {
            throw LegacyWebArchiveException("$path must be an object", error)
        }

        private fun requiredArray(value: JsonValue, path: String): List<JsonValue> = try {
            value.asArr().items
        } catch (error: Throwable) {
            throw LegacyWebArchiveException("$path must be an array", error)
        }

        private fun requiredString(value: JsonValue, path: String): String = try {
            value.asString()
        } catch (error: Throwable) {
            throw LegacyWebArchiveException("$path must be a string", error)
        }

        private fun optionalString(obj: JsonValue.Obj, key: String, path: String): String? {
            val value = obj.entries[key] ?: return null
            if (value is JsonValue.Null) return null
            return requiredString(value, path)
        }

        private fun optionalBoolean(obj: JsonValue.Obj, key: String, path: String): Boolean? {
            val value = obj.entries[key] ?: return null
            if (value is JsonValue.Null) return null
            return try {
                value.asBool()
            } catch (error: Throwable) {
                throw LegacyWebArchiveException("$path must be a boolean", error)
            }
        }

        private fun requiredInt(obj: JsonValue.Obj, key: String, path: String): Int {
            val value = obj.entries[key] ?: throw LegacyWebArchiveException("Missing $path")
            return requiredWholeNumber(value, path)
        }

        private fun optionalInt(obj: JsonValue.Obj, key: String, path: String): Int? {
            val value = obj.entries[key] ?: return null
            if (value is JsonValue.Null) return null
            return requiredWholeNumber(value, path)
        }

        private fun optionalLong(obj: JsonValue.Obj, key: String, path: String): Long? {
            val value = obj.entries[key] ?: return null
            if (value is JsonValue.Null) return null
            val number = requiredFiniteNumber(value, path)
            if (number % 1.0 != 0.0 || number < 0.0 || number > Long.MAX_VALUE.toDouble()) {
                throw LegacyWebArchiveException("$path must be a non-negative whole number")
            }
            return number.toLong()
        }

        private fun requiredWholeNumber(value: JsonValue, path: String): Int {
            val number = requiredFiniteNumber(value, path)
            if (number % 1.0 != 0.0 || number < Int.MIN_VALUE || number > Int.MAX_VALUE) {
                throw LegacyWebArchiveException("$path must be a whole 32-bit number")
            }
            return number.toInt()
        }

        private fun requiredFiniteNumber(value: JsonValue, path: String): Double {
            val number = try {
                value.asDouble()
            } catch (error: Throwable) {
                throw LegacyWebArchiveException("$path must be a number", error)
            }
            if (!number.isFinite()) throw LegacyWebArchiveException("$path must be finite")
            return number
        }

        private fun boundedString(value: String, maxChars: Int, path: String): String {
            if (value.length > maxChars) {
                throw LegacyWebArchiveException("$path exceeds $maxChars characters")
            }
            return value
        }

        private fun requireInRange(value: Int, min: Int, max: Int, path: String) {
            if (value !in min..max) {
                throw LegacyWebArchiveException("$path must be in $min..$max")
            }
        }
    }

    private fun hasPngSignature(bytes: ByteArray): Boolean {
        if (bytes.size < PNG_SIGNATURE.size) return false
        return PNG_SIGNATURE.indices.all { bytes[it] == PNG_SIGNATURE[it] }
    }

    private const val ARCHIVE_KIND = "inkframe-web-archive"
    private const val DEFAULT_PAPER = "#fff0f3"
    private const val PNG_DATA_URL_PREFIX = "data:image/png;base64,"
    private val PNG_SIGNATURE = byteArrayOf(
        0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    )
}
