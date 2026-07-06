package com.inkframe.feature.canvas

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import com.inkframe.core.common.video.YuvConverter
import com.inkframe.core.model.ExportPlanner.ExportPlan
import java.io.File
import java.io.FileDescriptor
import java.nio.ByteBuffer

/**
 * Encodes an [ExportPlan] to an H.264 **.mp4** using `MediaCodec` (hardware where
 * available) + `MediaMuxer`. Frames arrive as top-down ARGB and are converted to YUV
 * 4:2:0 by the pure [YuvConverter]; the encoder's actual colour-format preference (I420
 * vs NV12) is detected and matched.
 *
 * Timing: each planned frame is held for its `durationMs`, so variable holds / fps
 * overrides / "on twos" all map to correct presentation timestamps. Dimensions are forced
 * even (a YUV 4:2:0 requirement) by cropping one pixel if needed.
 *
 * Must run off the main thread (callers route it through the GL/engine thread, which also
 * supplies frame pixels via `renderFrameToArgb`).
 */
// The COLOR_FormatYUV420* constants are marked @Deprecated by Android but remain the
// correct (and only) values to request planar/semi-planar input from MediaCodec — there
// is no replacement, so the deprecation is suppressed here intentionally.
@Suppress("DEPRECATION")
class Mp4Encoder private constructor(
    private val plan: ExportPlan,
    private val muxerFactory: () -> MediaMuxer,
    private val bitRate: Int,
) {
    /** File-path target (private app storage). */
    constructor(plan: ExportPlan, outFile: File, bitRate: Int = defaultBitRate(plan)) : this(
        plan = plan,
        muxerFactory = { MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4) },
        bitRate = bitRate,
    )

    /**
     * SAF target: a [FileDescriptor] obtained from a `content://` Uri. MediaMuxer requires
     * a *seekable* fd, which `ContentResolver.openFileDescriptor(uri, "rw")` provides
     * (mode "w" alone is not seekable on all providers).
     */
    constructor(plan: ExportPlan, fd: FileDescriptor, bitRate: Int = defaultBitRate(plan)) : this(
        plan = plan,
        muxerFactory = { MediaMuxer(fd, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4) },
        bitRate = bitRate,
    )

    fun interface Progress { fun onProgress(done: Int, total: Int) }

    private val width = plan.widthPx and 1.inv()   // force even
    private val height = plan.heightPx and 1.inv()

    /**
     * Renders & encodes the whole plan. [frameRenderer] maps a timeline frame index to
     * top-down ARGB pixels (already canvas-sized; cropped to even dims here).
     */
    fun encode(frameRenderer: (frameIndex: Int) -> IntArray, progress: Progress? = null) {
        require(width >= 2 && height >= 2) { "Canvas too small for video: ${width}x$height" }

        val mime = MediaFormat.MIMETYPE_VIDEO_AVC
        val codecName = selectEncoder(mime) ?: error("No H.264 encoder available on this device")
        val codec = MediaCodec.createByCodecName(codecName)

        val colorFormat = selectColorFormat(codec.codecInfo, mime)
        val layout = when (colorFormat) {
            MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar -> YuvConverter.Layout.NV12
            else -> YuvConverter.Layout.I420 // Planar (and flexible) -> I420
        }

        val format = MediaFormat.createVideoFormat(mime, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, colorFormat)
            setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
            setInteger(MediaFormat.KEY_FRAME_RATE, plan.fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }

        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()

        val muxer = muxerFactory()
        var trackIndex = -1
        var muxerStarted = false
        val bufferInfo = MediaCodec.BufferInfo()
        val yuv = ByteArray(YuvConverter.bufferSize(width, height))

        var presentationUs = 0L
        try {
            plan.frames.forEachIndexed { index, pf ->
                val argb = cropToEven(frameRenderer(pf.frameIndex))
                YuvConverter.convert(argb, width, height, layout, yuv)

                queueInput(codec, yuv, presentationUs)
                presentationUs += pf.durationMs.toLong() * 1000L

                // Drain whatever the encoder has ready so far (non-blocking-ish).
                trackIndex = drain(codec, muxer, bufferInfo, trackIndex, endOfStream = false) { started ->
                    muxerStarted = started
                }
                progress?.onProgress(index + 1, plan.frameCount)
            }

            // Signal EOS and flush the remaining output.
            signalEndOfStream(codec, presentationUs)
            drain(codec, muxer, bufferInfo, trackIndex, endOfStream = true) { /* already started */ }
        } finally {
            runCatching { codec.stop() }
            runCatching { codec.release() }
            if (muxerStarted) runCatching { muxer.stop() }
            runCatching { muxer.release() }
        }
    }

    private fun queueInput(codec: MediaCodec, yuv: ByteArray, ptsUs: Long) {
        val inIndex = codec.dequeueInputBuffer(DEQUEUE_TIMEOUT_US)
        if (inIndex < 0) return
        val buf: ByteBuffer = codec.getInputBuffer(inIndex) ?: return
        buf.clear()
        buf.put(yuv)
        codec.queueInputBuffer(inIndex, 0, yuv.size, ptsUs, 0)
    }

    private fun signalEndOfStream(codec: MediaCodec, ptsUs: Long) {
        val inIndex = codec.dequeueInputBuffer(DEQUEUE_TIMEOUT_US * 4)
        if (inIndex >= 0) {
            codec.queueInputBuffer(inIndex, 0, 0, ptsUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
        }
    }

    /** Drains encoded output to the muxer; returns the (possibly new) track index. */
    private inline fun drain(
        codec: MediaCodec,
        muxer: MediaMuxer,
        info: MediaCodec.BufferInfo,
        currentTrack: Int,
        endOfStream: Boolean,
        onMuxerStarted: (Boolean) -> Unit,
    ): Int {
        var track = currentTrack
        while (true) {
            val outIndex = codec.dequeueOutputBuffer(info, DEQUEUE_TIMEOUT_US)
            when {
                outIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!endOfStream) return track // nothing ready yet
                    // else keep looping until EOS arrives
                }
                outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    track = muxer.addTrack(codec.outputFormat)
                    muxer.start()
                    onMuxerStarted(true)
                }
                outIndex >= 0 -> {
                    val encoded = codec.getOutputBuffer(outIndex)
                    if (encoded != null && info.size > 0 &&
                        (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0
                    ) {
                        encoded.position(info.offset)
                        encoded.limit(info.offset + info.size)
                        muxer.writeSampleData(track, encoded, info)
                    }
                    codec.releaseOutputBuffer(outIndex, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return track
                }
            }
        }
    }

    /** Crops a canvas-sized ARGB frame down to the even [width]×[height] if needed. */
    private fun cropToEven(src: IntArray): IntArray {
        if (width == plan.widthPx && height == plan.heightPx) return src
        val out = IntArray(width * height)
        for (y in 0 until height) {
            System.arraycopy(src, y * plan.widthPx, out, y * width, width)
        }
        return out
    }

    private fun selectEncoder(mime: String): String? {
        val list = MediaCodecList(MediaCodecList.REGULAR_CODECS)
        return list.codecInfos.firstOrNull { it.isEncoder && it.supportedTypes.any { t -> t.equals(mime, true) } }?.name
    }

    private fun selectColorFormat(info: MediaCodecInfo, mime: String): Int {
        val caps = info.getCapabilitiesForType(mime)
        val preferred = intArrayOf(
            MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar,
            MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar,
            MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible,
        )
        for (want in preferred) {
            if (caps.colorFormats.any { it == want }) return want
        }
        // Fall back to the first format the encoder reports.
        return caps.colorFormats.firstOrNull() ?: MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible
    }

    private companion object {
        const val DEQUEUE_TIMEOUT_US = 10_000L

        /** ~0.18 bits/pixel/frame, clamped to a sensible range. */
        fun defaultBitRate(plan: ExportPlan): Int {
            val bpp = 0.18
            val raw = (plan.widthPx.toLong() * plan.heightPx * plan.fps * bpp).toLong()
            return raw.coerceIn(2_000_000L, 24_000_000L).toInt()
        }
    }
}
