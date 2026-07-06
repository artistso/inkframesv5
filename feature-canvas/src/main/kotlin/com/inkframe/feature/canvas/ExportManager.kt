package com.inkframe.feature.canvas

import android.graphics.Bitmap
import com.inkframe.core.common.gif.GifEncoder
import com.inkframe.core.model.ExportPlanner
import com.inkframe.core.model.ExportPlanner.ExportPlan
import java.io.BufferedOutputStream
import java.io.File
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Writes an [ExportPlan] to a chosen [ExportFormat], pulling each frame's pixels from a
 * [frameRenderer] callback (which must produce a top-down ARGB array for a given timeline
 * frame index — see `PaintEngine.renderFrameToArgb`).
 *
 * The encoders themselves are pure (`GifEncoder`) or use Android's `Bitmap` PNG codec.
 * Rendering frames touches GL, so callers run [exportGif] / [exportPngSequence] on the GL
 * thread (the View routes them through its engine queue).
 */
object ExportManager {

    enum class ExportFormat { GIF, PNG_SEQUENCE, MP4 }

    /** Progress callback: (framesDone, framesTotal). */
    fun interface Progress { fun onProgress(done: Int, total: Int) }

    /**
     * Encodes the plan as an animated GIF to [out].
     * @param frameRenderer maps a timeline frame index to top-down ARGB pixels.
     */
    fun exportGif(
        plan: ExportPlan,
        out: OutputStream,
        frameRenderer: (frameIndex: Int) -> IntArray,
        progress: Progress? = null,
    ) {
        BufferedOutputStream(out).use { buffered ->
            GifEncoder(buffered, plan.widthPx, plan.heightPx, loop = plan.loop).use { gif ->
                plan.frames.forEachIndexed { i, pf ->
                    val argb = frameRenderer(pf.frameIndex)
                    gif.addFrame(argb, pf.gifDelayCs)
                    progress?.onProgress(i + 1, plan.frameCount)
                }
            }
        }
    }

    /**
     * Encodes the plan as an H.264 .mp4 to [file] (MediaCodec/MediaMuxer need a real file
     * path, not a stream).
     */
    fun exportMp4(
        plan: ExportPlan,
        file: File,
        frameRenderer: (frameIndex: Int) -> IntArray,
        progress: Progress? = null,
    ) {
        Mp4Encoder(plan, file).encode(
            frameRenderer = frameRenderer,
            progress = { done, total -> progress?.onProgress(done, total) },
        )
    }

    /** MP4 to a SAF [fd] (from `ContentResolver.openFileDescriptor(uri, "rw")`). */
    fun exportMp4(
        plan: ExportPlan,
        fd: java.io.FileDescriptor,
        frameRenderer: (frameIndex: Int) -> IntArray,
        progress: Progress? = null,
    ) {
        Mp4Encoder(plan, fd).encode(
            frameRenderer = frameRenderer,
            progress = { done, total -> progress?.onProgress(done, total) },
        )
    }

    /**
     * Encodes the plan as a ZIP of PNG frames to [out]. Each entry is named with a
     * zero-padded ordinal so the sequence sorts correctly.
     */
    fun exportPngSequence(
        plan: ExportPlan,
        out: OutputStream,
        prefix: String = "frame",
        frameRenderer: (frameIndex: Int) -> IntArray,
        progress: Progress? = null,
    ) {
        ZipOutputStream(BufferedOutputStream(out)).use { zip ->
            plan.frames.forEachIndexed { i, pf ->
                val argb = frameRenderer(pf.frameIndex)
                val bmp = Bitmap.createBitmap(plan.widthPx, plan.heightPx, Bitmap.Config.ARGB_8888)
                bmp.setPixels(argb, 0, plan.widthPx, 0, 0, plan.widthPx, plan.heightPx)
                val name = ExportPlanner.frameFileName(prefix, i, plan.frameCount)
                zip.putNextEntry(ZipEntry(name))
                bmp.compress(Bitmap.CompressFormat.PNG, 100, zip)
                zip.closeEntry()
                bmp.recycle()
                progress?.onProgress(i + 1, plan.frameCount)
            }
        }
    }
}
