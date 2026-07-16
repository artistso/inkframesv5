package com.inkframe.studio

import com.inkframe.core.model.StudioArtistCanvasStatus
import com.inkframe.core.model.StudioContextSnapshot
import com.inkframe.core.model.StudioLayerReconciliationSnapshot
import com.inkframe.core.model.StudioPlaybackSnapshot
import com.inkframe.core.model.StudioProjectReconciliationMirror
import com.inkframe.core.model.StudioProjectReconciliationSnapshot
import com.inkframe.core.model.StudioProjectReconciliationUpdate
import com.inkframe.core.model.StudioTimelineExposureMirror
import com.inkframe.core.model.StudioTimelineExposureSnapshot
import com.inkframe.core.model.StudioTimelineExposureUpdate
import com.inkframe.studio.nativeink.StudioArtistCanvasStatusStore
import org.json.JSONObject

/**
 * Android-side parser and holder for the WebView's read-only project reconciliation snapshot.
 * It performs no artwork, timeline, project, or storage writes.
 */
internal class StudioProjectReconciliationController {
    private val mirror = StudioProjectReconciliationMirror()
    private val timelineMirror = StudioTimelineExposureMirror()

    @Synchronized
    fun update(value: JSONObject, context: StudioContextSnapshot): Boolean {
        val candidate = parse(value, context) ?: return false
        if (!candidate.matches(context)) return false
        val timeline = StudioTimelineExposureSnapshot.from(candidate) ?: return false
        val projectUpdate = mirror.update(candidate)
        val timelineUpdate = timelineMirror.update(timeline)
        val accepted = projectUpdate != StudioProjectReconciliationUpdate.REJECTED_INVALID &&
            timelineUpdate != StudioTimelineExposureUpdate.REJECTED_INVALID
        if (accepted) StudioArtistCanvasStatusStore.update(StudioArtistCanvasStatus.from(candidate, timeline))
        return accepted
    }

    fun snapshot(): StudioProjectReconciliationSnapshot? = mirror.snapshot()

    fun timelineSnapshot(): StudioTimelineExposureSnapshot? = timelineMirror.snapshot()

    fun artistCanvasStatus(): StudioArtistCanvasStatus? {
        val project = mirror.snapshot() ?: return null
        val timeline = timelineMirror.snapshot() ?: return null
        return StudioArtistCanvasStatus.from(project, timeline)
    }

    @Synchronized
    fun clear() {
        mirror.clear()
        timelineMirror.clear()
        StudioArtistCanvasStatusStore.clear()
    }

    private fun parse(
        value: JSONObject,
        context: StudioContextSnapshot,
    ): StudioProjectReconciliationSnapshot? {
        val selectedValues = value.optJSONArray("selectedFrames")
        val selected = ArrayList<Int>(selectedValues?.length()?.coerceAtMost(120) ?: 0)
        if (selectedValues != null) {
            for (index in 0 until selectedValues.length().coerceAtMost(120)) {
                selected += selectedValues.optInt(index, -1)
            }
        }

        return StudioProjectReconciliationSnapshot(
            schema = value.optInt("projectReconciliationSchema", 0),
            revision = value.optInt("projectRevision", -1),
            projectIndex = value.optInt("projectIndex", -1),
            sceneIndex = value.optInt("sceneIndex", -1),
            canvasWidth = value.optInt("canvasWidth", 0),
            canvasHeight = value.optInt("canvasHeight", 0),
            shape = context.shape,
            playback = StudioPlaybackSnapshot(
                frameCount = value.optInt("frameCount", 0),
                activeFrameIndex = value.optInt("activeFrameIndex", -1),
                maxFrames = value.optInt("maxFrames", 0),
                rangeStartFrame = value.optInt("playbackStartFrame", -1),
                rangeEndFrame = value.optInt("playbackEndFrame", -1),
                fps = value.optInt("fps", 0),
                playing = value.optBoolean("playing", false),
                loopEnabled = value.optBoolean("loopEnabled", false),
                holdFrames = value.optInt("holdFrames", 0),
                selectedFrameIndices = selected,
            ),
            layer = StudioLayerReconciliationSnapshot(
                layerCount = value.optInt("layerCount", -1),
                activeLayerIndex = value.optInt("layerIndex", Int.MIN_VALUE),
                backgroundActive = value.optBoolean("backgroundActive", false),
                visible = value.optBoolean("layerVisible", true),
                opacity = value.optDouble("layerOpacity", Double.NaN),
                blendMode = value.optString("layerBlend", ""),
            ),
        ).validatedOrNull()
    }
}
