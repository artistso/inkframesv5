package com.inkframe.studio.nativeink

/**
 * Versioned, editable native InkFrame project state.
 *
 * Native projects deliberately live outside the existing WebView project store. Coordinates and
 * brush sizes are expressed in project pixels so a document is independent of the current View.
 */
data class NativeProject(
    val id: String,
    val name: String,
    val width: Int,
    val height: Int,
    val paperColor: Int,
    val inkColor: Int,
    val brushSizePx: Float,
    val updatedAtMillis: Long,
    val strokes: List<NativeStroke>,
) {
    init {
        require(id.isNotBlank()) { "project id must not be blank" }
        require(name.isNotBlank()) { "project name must not be blank" }
        require(width in MIN_DIMENSION..MAX_DIMENSION) { "invalid project width: $width" }
        require(height in MIN_DIMENSION..MAX_DIMENSION) { "invalid project height: $height" }
        require(brushSizePx.isFinite() && brushSizePx in 0.5f..MAX_BRUSH_SIZE_PX) {
            "invalid brush size: $brushSizePx"
        }
        require(strokes.size <= MAX_STROKES) { "too many strokes: ${strokes.size}" }
        require(strokes.sumOf { it.samples.size } <= MAX_SAMPLES) { "too many samples" }
    }

    companion object {
        const val FILE_VERSION = 1
        const val MIN_DIMENSION = 64
        const val MAX_DIMENSION = 16_384
        const val MAX_STROKES = 512
        const val MAX_SAMPLES = 262_144
        const val MAX_SAMPLES_PER_STROKE = 65_536
        const val MAX_BRUSH_SIZE_PX = 1_024f
        const val MAX_ID_LENGTH = 128
        const val MAX_NAME_LENGTH = 256
    }
}

data class NativeProjectLoad(
    val project: NativeProject,
    val recoveredFromBackup: Boolean,
)
