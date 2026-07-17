package com.inkframe.core.model

/** Raster payload handed to the migration storage boundary before a project is published. */
data class LegacyRasterPayload(
    val logicalPath: String,
    val pngBytes: ByteArray,
)

/** Stores one validated PNG and returns its durable project asset identity. */
fun interface LegacyRasterStore {
    fun store(payload: LegacyRasterPayload): RasterAssetId
}

/** ID policy injected so migration fixtures are deterministic and production can use UUIDs. */
interface LegacyImportIdFactory {
    fun projectId(projectIndex: Int): ProjectId
    fun sceneId(projectIndex: Int): SceneId
    fun frameId(projectIndex: Int, frameIndex: Int): FrameId
    fun layerId(projectIndex: Int, frameIndex: Int, layerIndex: Int): LayerId
}

object RandomLegacyImportIdFactory : LegacyImportIdFactory {
    override fun projectId(projectIndex: Int): ProjectId = ProjectId.random()
    override fun sceneId(projectIndex: Int): SceneId = SceneId.random()
    override fun frameId(projectIndex: Int, frameIndex: Int): FrameId = FrameId.random()
    override fun layerId(projectIndex: Int, frameIndex: Int, layerIndex: Int): LayerId = LayerId.random()
}

data class ImportedLegacyProjects(
    val projects: List<FrameLocalProject>,
    val activeProjectIndex: Int,
    val warnings: List<String>,
)

/**
 * Lossless structural conversion from the bounded web DTO into the canonical frame-local model.
 *
 * Raster persistence is deliberately injected. A caller should stage every returned asset and the
 * structural package in a temporary generation, then atomically publish only after this function
 * and all raster writes succeed.
 */
object LegacyWebArchiveConverter {

    fun convert(
        archive: LegacyWebArchive,
        rasterStore: LegacyRasterStore,
        idFactory: LegacyImportIdFactory = RandomLegacyImportIdFactory,
        importedAtEpochMs: Long,
    ): ImportedLegacyProjects {
        require(importedAtEpochMs >= 0L) { "importedAtEpochMs must be non-negative" }
        val projects = archive.projects.mapIndexed { projectIndex, legacy ->
            convertProject(
                legacy = legacy,
                projectIndex = projectIndex,
                archiveSavedAtEpochMs = archive.savedAtEpochMs,
                importedAtEpochMs = importedAtEpochMs,
                rasterStore = rasterStore,
                ids = idFactory,
            )
        }
        return ImportedLegacyProjects(
            projects = projects,
            activeProjectIndex = archive.activeProjectIndex.coerceIn(0, projects.lastIndex),
            warnings = archive.warnings,
        )
    }

    private fun convertProject(
        legacy: LegacyWebProject,
        projectIndex: Int,
        archiveSavedAtEpochMs: Long?,
        importedAtEpochMs: Long,
        rasterStore: LegacyRasterStore,
        ids: LegacyImportIdFactory,
    ): FrameLocalProject {
        val sceneId = ids.sceneId(projectIndex)
        val frames = legacy.frames.mapIndexed { frameIndex, frame ->
            val layers = frame.layers.mapIndexed { layerIndex, layer ->
                FrameLayer(
                    id = ids.layerId(projectIndex, frameIndex, layerIndex),
                    name = layer.name,
                    visible = layer.visible,
                    locked = false,
                    opacity = layer.opacity,
                    blendMode = layer.blendMode,
                    rasterId = storeRaster(
                        bytes = layer.pngBytes,
                        logicalPath = "projects/$projectIndex/frames/$frameIndex/layers/$layerIndex",
                        rasterStore = rasterStore,
                    ),
                )
            }
            AnimationFrame(
                id = ids.frameId(projectIndex, frameIndex),
                hold = legacy.frameHolds[frameIndex],
                layers = layers,
                activeLayerId = layers[frame.activeLayerIndex].id,
            )
        }
        val scene = FrameLocalScene(
            id = sceneId,
            name = "Scene 1",
            frames = frames,
            activeFrameIndex = legacy.currentFrameIndex,
            playbackRange = 0..frames.lastIndex,
            loop = true,
        )
        val timestamp = archiveSavedAtEpochMs ?: importedAtEpochMs
        val background = legacy.background?.let { source ->
            StaticBackground(
                visible = source.visible,
                opacity = source.opacity,
                blendMode = source.blendMode,
                rasterId = storeRaster(
                    bytes = source.pngBytes,
                    logicalPath = "projects/$projectIndex/background",
                    rasterStore = rasterStore,
                ),
            )
        } ?: StaticBackground()

        return FrameLocalProject(
            id = ids.projectId(projectIndex),
            name = legacy.name,
            canvas = CanvasSpec(
                widthPx = legacy.widthPx,
                heightPx = legacy.heightPx,
                fps = legacy.fps,
                backgroundColor = parseCssHexColor(legacy.paperColor, "projects[$projectIndex].paper"),
                shape = legacy.canvasShape,
            ),
            background = background,
            scenes = listOf(scene),
            activeSceneId = sceneId,
            createdAtEpochMs = timestamp,
            modifiedAtEpochMs = importedAtEpochMs,
        )
    }

    private fun storeRaster(
        bytes: ByteArray?,
        logicalPath: String,
        rasterStore: LegacyRasterStore,
    ): RasterAssetId? {
        if (bytes == null) return null
        return try {
            rasterStore.store(
                LegacyRasterPayload(
                    logicalPath = logicalPath,
                    pngBytes = bytes.copyOf(),
                ),
            )
        } catch (error: Throwable) {
            throw LegacyWebArchiveException("Failed to store migrated raster at $logicalPath", error)
        }
    }

    /** Strict CSS hex parsing for the historical colour-input paper field. */
    fun parseCssHexColor(value: String, path: String = "paper"): RgbaColor {
        if (!value.startsWith('#')) {
            throw LegacyWebArchiveException("$path must be a CSS hex colour")
        }
        val digits = value.substring(1)
        val expanded = when (digits.length) {
            3, 4 -> buildString(digits.length * 2) {
                for (digit in digits) {
                    append(digit)
                    append(digit)
                }
            }
            6, 8 -> digits
            else -> throw LegacyWebArchiveException("$path must use #RGB, #RGBA, #RRGGBB, or #RRGGBBAA")
        }
        val number = expanded.toLongOrNull(16)
            ?: throw LegacyWebArchiveException("$path contains non-hexadecimal characters")
        val hasAlpha = expanded.length == 8
        val red: Int
        val green: Int
        val blue: Int
        val alpha: Int
        if (hasAlpha) {
            red = ((number shr 24) and 0xff).toInt()
            green = ((number shr 16) and 0xff).toInt()
            blue = ((number shr 8) and 0xff).toInt()
            alpha = (number and 0xff).toInt()
        } else {
            red = ((number shr 16) and 0xff).toInt()
            green = ((number shr 8) and 0xff).toInt()
            blue = (number and 0xff).toInt()
            alpha = 0xff
        }
        return RgbaColor(
            r = red / 255f,
            g = green / 255f,
            b = blue / 255f,
            a = alpha / 255f,
        )
    }
}
