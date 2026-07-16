package com.inkframe.studio.nativeink

import java.nio.file.Files
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeProjectCodecTest {
    @Test
    fun binaryRoundTripPreservesEditableProject() {
        val project = project("alpha", 42L)

        val decoded = NativeProjectCodec.decode(NativeProjectCodec.encode(project))

        assertEquals(project, decoded)
        assertEquals(2, decoded.strokes.size)
        assertTrue(decoded.strokes.last().eraser)
        assertEquals(0.9f, decoded.strokes.first().samples.last().pressure)
    }

    @Test
    fun checksumRejectsMutatedPayload() {
        val encoded = NativeProjectCodec.encode(project("checksum", 1L))
        encoded[encoded.size / 2] = (encoded[encoded.size / 2].toInt() xor 0x01).toByte()

        val result = runCatching { NativeProjectCodec.decode(encoded) }

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("checksum") == true)
    }

    @Test
    fun repositoryPublishesCurrentAndKeepsOneRecoveryGeneration() {
        val directory = Files.createTempDirectory("inkframe-native-project").toFile()
        try {
            val repository = NativeProjectRepository.forTests(directory)
            val first = project("first", 10L)
            val second = project("second", 20L)

            repository.saveCurrent(first)
            repository.saveCurrent(second)

            assertEquals(second, repository.loadCurrent()?.project)
            assertTrue(repository.backupFileForTests().exists())
            assertArrayEquals(
                NativeProjectCodec.encode(first),
                repository.backupFileForTests().readBytes(),
            )
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun corruptedCurrentFallsBackToLastCompleteGeneration() {
        val directory = Files.createTempDirectory("inkframe-native-recovery").toFile()
        try {
            val repository = NativeProjectRepository.forTests(directory)
            val first = project("recoverable", 10L)
            val second = project("corrupt", 20L)
            repository.saveCurrent(first)
            repository.saveCurrent(second)
            repository.currentFileForTests().writeBytes(byteArrayOf(1, 2, 3, 4))

            val loaded = repository.loadCurrent()

            assertEquals(first, loaded?.project)
            assertTrue(loaded?.recoveredFromBackup == true)
            assertFalse(repository.currentFileForTests().exists())
            assertTrue(directory.listFiles().orEmpty().any { it.name.contains(".corrupt-") })
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun project(id: String, updatedAt: Long): NativeProject = NativeProject(
        id = id,
        name = "Project $id",
        width = 2560,
        height = 1600,
        paperColor = 0xFF100A12.toInt(),
        inkColor = 0xFFFFE9F0.toInt(),
        brushSizePx = 24f,
        updatedAtMillis = updatedAt,
        strokes = listOf(
            NativeStroke(
                samples = listOf(sample(10f, 20f, 0.2f), sample(20f, 30f, 0.9f)),
                style = NativeBrushStyle(0xFFFFE9F0.toInt(), 24f),
                eraser = false,
            ),
            NativeStroke(
                samples = listOf(sample(40f, 50f, 0.5f)),
                style = NativeBrushStyle(0xFFFFFFFF.toInt(), 32f),
                eraser = true,
            ),
        ),
    )

    private fun sample(x: Float, y: Float, pressure: Float): InkSample = InkSample(
        x = x,
        y = y,
        pressure = pressure,
        tiltRadians = 0.1f,
        orientationRadians = -0.2f,
        distance = 0f,
        eventTimeMillis = 100L,
        receivedUptimeMillis = 101L,
        tool = InkTool.STYLUS,
        phase = InkPhase.CONTACT,
        historical = false,
        buttonState = 0,
    )
}
