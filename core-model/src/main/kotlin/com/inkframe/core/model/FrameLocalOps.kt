package com.inkframe.core.model

/** Pure immutable operations for the canonical frame-local document. */
object FrameLocalOps {

    fun setFrameHold(scene: FrameLocalScene, frameIndex: Int, hold: Int): FrameLocalScene {
        require(frameIndex in scene.frames.indices) { "frameIndex out of range" }
        val normalized = hold.coerceIn(Scene.MIN_FRAME_HOLD, Scene.MAX_FRAME_HOLD)
        val current = scene.frames[frameIndex]
        if (current.hold == normalized) return scene
        return replaceFrame(scene, frameIndex, current.copy(hold = normalized))
    }

    fun insertBlankFrame(
        scene: FrameLocalScene,
        at: Int,
        frameId: FrameId = FrameId.random(),
        layerId: LayerId = LayerId.random(),
        layerName: String = "Layer 1",
    ): FrameLocalScene {
        val index = at.coerceIn(0, scene.frames.size)
        val frame = AnimationFrame(
            id = frameId,
            layers = listOf(FrameLayer(id = layerId, name = layerName)),
            activeLayerId = layerId,
        )
        val frames = scene.frames.toMutableList().apply { add(index, frame) }
        return scene.copy(
            frames = frames,
            activeFrameIndex = shiftIndexForInsert(scene.activeFrameIndex, index),
            playbackRange = shiftRangeForInsert(scene.playbackRange, index),
        )
    }

    /**
     * Duplicates frame structure while sharing raster assets through copy-on-write references.
     * New frame and layer IDs are mandatory inputs in deterministic tests and migrations.
     */
    fun duplicateFrame(
        scene: FrameLocalScene,
        sourceIndex: Int,
        insertAt: Int = sourceIndex + 1,
        newFrameId: FrameId,
        newLayerIds: List<LayerId>,
    ): FrameLocalScene {
        require(sourceIndex in scene.frames.indices) { "sourceIndex out of range" }
        val source = scene.frames[sourceIndex]
        require(newLayerIds.size == source.layers.size) {
            "newLayerIds size must match source layer count"
        }
        require(newLayerIds.toSet().size == newLayerIds.size) { "newLayerIds must be unique" }
        val idMap = source.layers.map { it.id }.zip(newLayerIds).toMap()
        val duplicate = AnimationFrame(
            id = newFrameId,
            hold = source.hold,
            layers = source.layers.mapIndexed { index, layer -> layer.copy(id = newLayerIds[index]) },
            activeLayerId = idMap.getValue(source.activeLayerId),
        )
        val index = insertAt.coerceIn(0, scene.frames.size)
        val frames = scene.frames.toMutableList().apply { add(index, duplicate) }
        return scene.copy(
            frames = frames,
            activeFrameIndex = index,
            playbackRange = shiftRangeForInsert(scene.playbackRange, index),
        )
    }

    /** Removes one frame; a scene containing one frame is returned unchanged. */
    fun removeFrame(scene: FrameLocalScene, frameIndex: Int): FrameLocalScene {
        require(frameIndex in scene.frames.indices) { "frameIndex out of range" }
        if (scene.frames.size == 1) return scene
        val frames = scene.frames.toMutableList().apply { removeAt(frameIndex) }
        val newLast = frames.lastIndex
        val active = when {
            scene.activeFrameIndex < frameIndex -> scene.activeFrameIndex
            scene.activeFrameIndex > frameIndex -> scene.activeFrameIndex - 1
            else -> frameIndex.coerceAtMost(newLast)
        }
        val mappedStart = mapIndexAfterRemoval(scene.playbackRange.first, frameIndex, newLast)
        val mappedEnd = mapIndexAfterRemoval(scene.playbackRange.last, frameIndex, newLast)
        val start = minOf(mappedStart, mappedEnd)
        val end = maxOf(mappedStart, mappedEnd)
        return scene.copy(
            frames = frames,
            activeFrameIndex = active,
            playbackRange = start..end,
        )
    }

    fun addLayer(
        frame: AnimationFrame,
        layer: FrameLayer,
        index: Int = frame.layers.size,
        makeActive: Boolean = true,
    ): AnimationFrame {
        require(frame.layers.none { it.id == layer.id }) { "layer id already exists in frame" }
        val insertion = index.coerceIn(0, frame.layers.size)
        val layers = frame.layers.toMutableList().apply { add(insertion, layer) }
        return frame.copy(
            layers = layers,
            activeLayerId = if (makeActive) layer.id else frame.activeLayerId,
        )
    }

    /** Deletes a frame-local layer while keeping at least one layer and a valid selection. */
    fun deleteLayer(frame: AnimationFrame, layerId: LayerId): AnimationFrame {
        val index = frame.layers.indexOfFirst { it.id == layerId }
        if (index < 0 || frame.layers.size == 1) return frame
        val layers = frame.layers.toMutableList().apply { removeAt(index) }
        val active = if (frame.activeLayerId != layerId) {
            frame.activeLayerId
        } else {
            layers[index.coerceAtMost(layers.lastIndex)].id
        }
        return frame.copy(layers = layers, activeLayerId = active)
    }

    fun moveLayer(frame: AnimationFrame, layerId: LayerId, toIndex: Int): AnimationFrame {
        val from = frame.layers.indexOfFirst { it.id == layerId }
        if (from < 0) return frame
        val destination = toIndex.coerceIn(0, frame.layers.lastIndex)
        if (from == destination) return frame
        val layers = frame.layers.toMutableList()
        val layer = layers.removeAt(from)
        layers.add(destination, layer)
        return frame.copy(layers = layers)
    }

    fun selectLayer(frame: AnimationFrame, layerId: LayerId): AnimationFrame {
        require(frame.layers.any { it.id == layerId }) { "layerId is not in frame" }
        return if (frame.activeLayerId == layerId) frame else frame.copy(activeLayerId = layerId)
    }

    /** Counts durable document references, including the project-wide static background. */
    fun rasterReferenceCounts(project: FrameLocalProject): Map<RasterAssetId, Int> {
        val counts = LinkedHashMap<RasterAssetId, Int>()
        fun add(id: RasterAssetId?) {
            if (id != null) counts[id] = (counts[id] ?: 0) + 1
        }
        add(project.background.rasterId)
        for (scene in project.scenes) {
            for (frame in scene.frames) {
                for (layer in frame.layers) add(layer.rasterId)
            }
        }
        return counts
    }

    fun requiresCopyOnWrite(project: FrameLocalProject, rasterId: RasterAssetId): Boolean =
        (rasterReferenceCounts(project)[rasterId] ?: 0) > 1

    /** Rebinds exactly one frame-local layer to a prepared raster asset. */
    fun replaceLayerRaster(
        project: FrameLocalProject,
        sceneId: SceneId,
        frameId: FrameId,
        layerId: LayerId,
        rasterId: RasterAssetId?,
        modifiedAtEpochMs: Long,
    ): FrameLocalProject {
        require(modifiedAtEpochMs >= 0L) { "modifiedAtEpochMs must be non-negative" }
        var sceneFound = false
        var frameFound = false
        var layerFound = false
        val scenes = project.scenes.map { scene ->
            if (scene.id != sceneId) return@map scene
            sceneFound = true
            val frames = scene.frames.map { frame ->
                if (frame.id != frameId) return@map frame
                frameFound = true
                val layers = frame.layers.map { layer ->
                    if (layer.id != layerId) return@map layer
                    layerFound = true
                    layer.copy(rasterId = rasterId)
                }
                frame.copy(layers = layers)
            }
            scene.copy(frames = frames)
        }
        require(sceneFound) { "sceneId not found" }
        require(frameFound) { "frameId not found in scene" }
        require(layerFound) { "layerId not found in frame" }
        return project.copy(scenes = scenes, modifiedAtEpochMs = modifiedAtEpochMs)
    }

    fun replaceBackgroundRaster(
        project: FrameLocalProject,
        rasterId: RasterAssetId?,
        modifiedAtEpochMs: Long,
    ): FrameLocalProject {
        require(modifiedAtEpochMs >= 0L) { "modifiedAtEpochMs must be non-negative" }
        return project.copy(
            background = project.background.copy(rasterId = rasterId),
            modifiedAtEpochMs = modifiedAtEpochMs,
        )
    }

    fun replaceFrame(scene: FrameLocalScene, frameIndex: Int, frame: AnimationFrame): FrameLocalScene {
        require(frameIndex in scene.frames.indices) { "frameIndex out of range" }
        val frames = scene.frames.toMutableList()
        frames[frameIndex] = frame
        return scene.copy(frames = frames)
    }

    private fun shiftIndexForInsert(index: Int, insertion: Int): Int =
        if (index >= insertion) index + 1 else index

    private fun shiftRangeForInsert(range: IntRange, insertion: Int): IntRange {
        val start = if (range.first >= insertion) range.first + 1 else range.first
        val end = if (range.last >= insertion) range.last + 1 else range.last
        return start..end
    }

    private fun mapIndexAfterRemoval(index: Int, removed: Int, newLast: Int): Int = when {
        index < removed -> index
        index > removed -> index - 1
        else -> removed.coerceAtMost(newLast)
    }.coerceIn(0, newLast)
}
