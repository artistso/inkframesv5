package com.inkframe.studio.nativeink

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.nio.charset.StandardCharsets
import java.util.zip.CRC32

/** Dependency-free, bounded binary codec for editable native InkFrame projects. */
object NativeProjectCodec {
    private const val MAGIC = 0x49464E31 // IFN1
    private const val MAX_PAYLOAD_BYTES = 64 * 1024 * 1024
    private const val MAX_STRING_BYTES = 4 * 1024

    fun encode(project: NativeProject): ByteArray {
        val payloadBytes = ByteArrayOutputStream().use { payloadBuffer ->
            DataOutputStream(payloadBuffer).use { output ->
                output.writeInt(NativeProject.FILE_VERSION)
                output.writeBoundedString(project.id, NativeProject.MAX_ID_LENGTH)
                output.writeBoundedString(project.name, NativeProject.MAX_NAME_LENGTH)
                output.writeInt(project.width)
                output.writeInt(project.height)
                output.writeInt(project.paperColor)
                output.writeInt(project.inkColor)
                output.writeFloat(project.brushSizePx)
                output.writeLong(project.updatedAtMillis)
                output.writeInt(project.strokes.size)
                project.strokes.forEach { stroke ->
                    require(stroke.samples.isNotEmpty()) { "project contains an empty stroke" }
                    require(stroke.samples.size <= NativeProject.MAX_SAMPLES_PER_STROKE) {
                        "stroke contains too many samples"
                    }
                    output.writeInt(stroke.style.color)
                    output.writeFloat(stroke.style.sizePx)
                    output.writeBoolean(stroke.eraser)
                    output.writeInt(stroke.samples.size)
                    stroke.samples.forEach { sample -> output.writeSample(sample) }
                }
            }
            payloadBuffer.toByteArray()
        }
        require(payloadBytes.size <= MAX_PAYLOAD_BYTES) { "native project payload is too large" }

        val checksum = CRC32().apply { update(payloadBytes) }.value
        return ByteArrayOutputStream(payloadBytes.size + 20).use { fileBuffer ->
            DataOutputStream(fileBuffer).use { output ->
                output.writeInt(MAGIC)
                output.writeInt(payloadBytes.size)
                output.write(payloadBytes)
                output.writeLong(checksum)
            }
            fileBuffer.toByteArray()
        }
    }

    fun decode(bytes: ByteArray): NativeProject {
        require(bytes.size >= 16) { "native project file is truncated" }
        return DataInputStream(ByteArrayInputStream(bytes)).use { input ->
            require(input.readInt() == MAGIC) { "native project magic is invalid" }
            val payloadLength = input.readInt()
            require(payloadLength in 1..MAX_PAYLOAD_BYTES) { "native project payload length is invalid" }
            require(bytes.size == payloadLength + 16) { "native project file length is inconsistent" }
            val payload = ByteArray(payloadLength)
            input.readFully(payload)
            val expectedChecksum = input.readLong()
            val actualChecksum = CRC32().apply { update(payload) }.value
            require(actualChecksum == expectedChecksum) { "native project checksum mismatch" }
            decodePayload(payload)
        }
    }

    private fun decodePayload(payload: ByteArray): NativeProject =
        DataInputStream(ByteArrayInputStream(payload)).use { input ->
            val version = input.readInt()
            require(version == NativeProject.FILE_VERSION) { "unsupported native project version: $version" }
            val id = input.readBoundedString(NativeProject.MAX_ID_LENGTH)
            val name = input.readBoundedString(NativeProject.MAX_NAME_LENGTH)
            val width = input.readInt()
            val height = input.readInt()
            val paperColor = input.readInt()
            val inkColor = input.readInt()
            val brushSizePx = input.readFiniteFloat("brush size")
            val updatedAtMillis = input.readLong()
            val strokeCount = input.readInt()
            require(strokeCount in 0..NativeProject.MAX_STROKES) { "invalid stroke count: $strokeCount" }

            var totalSamples = 0
            val strokes = ArrayList<NativeStroke>(strokeCount)
            repeat(strokeCount) {
                val color = input.readInt()
                val sizePx = input.readFiniteFloat("stroke size")
                require(sizePx in 0.5f..NativeProject.MAX_BRUSH_SIZE_PX) { "invalid stroke size" }
                val eraser = input.readBoolean()
                val sampleCount = input.readInt()
                require(sampleCount in 1..NativeProject.MAX_SAMPLES_PER_STROKE) {
                    "invalid sample count: $sampleCount"
                }
                totalSamples += sampleCount
                require(totalSamples <= NativeProject.MAX_SAMPLES) { "native project contains too many samples" }
                val samples = ArrayList<InkSample>(sampleCount)
                repeat(sampleCount) { samples += input.readSample(width, height) }
                strokes += NativeStroke(samples, NativeBrushStyle(color, sizePx), eraser)
            }
            require(input.available() == 0) { "native project contains trailing payload data" }
            NativeProject(
                id = id,
                name = name,
                width = width,
                height = height,
                paperColor = paperColor,
                inkColor = inkColor,
                brushSizePx = brushSizePx,
                updatedAtMillis = updatedAtMillis,
                strokes = strokes,
            )
        }

    private fun DataOutputStream.writeBoundedString(value: String, maximumCharacters: Int) {
        require(value.length <= maximumCharacters) { "native project string is too long" }
        val encoded = value.toByteArray(StandardCharsets.UTF_8)
        require(encoded.size <= MAX_STRING_BYTES) { "native project string encoding is too large" }
        writeInt(encoded.size)
        write(encoded)
    }

    private fun DataInputStream.readBoundedString(maximumCharacters: Int): String {
        val length = readInt()
        require(length in 1..MAX_STRING_BYTES) { "invalid native project string length" }
        val encoded = ByteArray(length)
        readFully(encoded)
        val value = String(encoded, StandardCharsets.UTF_8)
        require(value.length <= maximumCharacters) { "native project string is too long" }
        require(value.isNotBlank()) { "native project string must not be blank" }
        return value
    }

    private fun DataOutputStream.writeSample(sample: InkSample) {
        require(sample.x.isFinite() && sample.y.isFinite()) { "sample coordinates are not finite" }
        require(sample.pressure.isFinite()) { "sample pressure is not finite" }
        writeFloat(sample.x)
        writeFloat(sample.y)
        writeFloat(sample.pressure)
        writeFloat(sample.tiltRadians)
        writeFloat(sample.orientationRadians)
        writeFloat(sample.distance)
        writeLong(sample.eventTimeMillis)
        writeLong(sample.receivedUptimeMillis)
        writeInt(sample.tool.ordinal)
        writeInt(sample.phase.ordinal)
        writeBoolean(sample.historical)
        writeInt(sample.buttonState)
    }

    private fun DataInputStream.readSample(width: Int, height: Int): InkSample {
        val x = readFiniteFloat("sample x")
        val y = readFiniteFloat("sample y")
        val coordinateLimit = maxOf(width, height).toFloat() * 4f
        require(x in -coordinateLimit..coordinateLimit && y in -coordinateLimit..coordinateLimit) {
            "sample coordinate is outside bounded project space"
        }
        val pressure = readFiniteFloat("sample pressure")
        require(pressure in 0f..1f) { "invalid sample pressure" }
        val tilt = readFiniteFloat("sample tilt")
        val orientation = readFiniteFloat("sample orientation")
        val distance = readFiniteFloat("sample distance")
        val eventTimeMillis = readLong()
        val receivedUptimeMillis = readLong()
        val toolOrdinal = readInt()
        val phaseOrdinal = readInt()
        require(toolOrdinal in InkTool.entries.indices) { "invalid ink tool" }
        require(phaseOrdinal in InkPhase.entries.indices) { "invalid ink phase" }
        return InkSample(
            x = x,
            y = y,
            pressure = pressure,
            tiltRadians = tilt,
            orientationRadians = orientation,
            distance = distance,
            eventTimeMillis = eventTimeMillis,
            receivedUptimeMillis = receivedUptimeMillis,
            tool = InkTool.entries[toolOrdinal],
            phase = InkPhase.entries[phaseOrdinal],
            historical = readBoolean(),
            buttonState = readInt(),
        )
    }

    private fun DataInputStream.readFiniteFloat(label: String): Float =
        readFloat().also { require(it.isFinite()) { "$label is not finite" } }
}
