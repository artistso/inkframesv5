package com.inkframe.core.model

/** A native starter document exposed by the Glass Horizon project creator. */
data class NativeProjectTemplate(
    val id: String,
    val name: String,
    val description: String,
    val widthPx: Int,
    val heightPx: Int,
    val fps: Int,
    val frameCount: Int,
    val paper: ProjectPaper,
) {
    val aspectLabel: String
        get() = when {
            widthPx == heightPx -> "1:1"
            widthPx * 3 == heightPx * 4 -> "4:3"
            widthPx * 9 == heightPx * 16 -> "16:9"
            widthPx * 16 == heightPx * 9 -> "9:16"
            else -> "${widthPx}:${heightPx}"
        }
}

/** Named paper choices shared by templates and custom document creation. */
enum class ProjectPaper(
    val displayName: String,
    val color: RgbaColor,
) {
    BLUSH("Blush", RgbaColor.fromArgb(0xFFFFF0F3.toInt())),
    CREAM("Cream", RgbaColor.fromArgb(0xFFF5F5F0.toInt())),
    WHITE("White", RgbaColor.WHITE),
    GRAPHITE("Graphite", RgbaColor.fromArgb(0xFF0A0A10.toInt())),
}

/** Validated values for a custom native project. */
data class CustomProjectSpec(
    val name: String,
    val widthPx: Int,
    val heightPx: Int,
    val fps: Int,
    val frameCount: Int,
    val paper: ProjectPaper = ProjectPaper.BLUSH,
)

/**
 * Native project templates and document construction rules.
 *
 * The six template values preserve the original Glass Horizon reference. The custom bounds
 * preserve the reference implementation's tablet-safe limits rather than exposing the much
 * larger serialization ceiling supported by [CanvasSpec].
 */
object NativeProjectTemplates {
    val DIMENSION_RANGE: IntRange = 256..4096
    val FPS_RANGE: IntRange = 1..24
    val FRAME_COUNT_RANGE: IntRange = 1..120
    const val DEFAULT_CUSTOM_NAME: String = "Custom canvas"

    val all: List<NativeProjectTemplate> = listOf(
        NativeProjectTemplate(
            id = "classic",
            name = "Classic sketch",
            description = "Cream paper · drawing starter",
            widthPx = 1024,
            heightPx = 768,
            fps = 12,
            frameCount = 1,
            paper = ProjectPaper.BLUSH,
        ),
        NativeProjectTemplate(
            id = "hd",
            name = "HD animation",
            description = "Widescreen · 12 starter frames",
            widthPx = 1280,
            heightPx = 720,
            fps = 12,
            frameCount = 12,
            paper = ProjectPaper.BLUSH,
        ),
        NativeProjectTemplate(
            id = "square",
            name = "Square social",
            description = "Post, sticker, or album art",
            widthPx = 1080,
            heightPx = 1080,
            fps = 12,
            frameCount = 1,
            paper = ProjectPaper.BLUSH,
        ),
        NativeProjectTemplate(
            id = "phone",
            name = "Phone vertical",
            description = "Story, reel, or vertical animation",
            widthPx = 1080,
            heightPx = 1920,
            fps = 12,
            frameCount = 1,
            paper = ProjectPaper.BLUSH,
        ),
        NativeProjectTemplate(
            id = "pixel",
            name = "Pixel art",
            description = "Small square · 8-frame loop",
            widthPx = 512,
            heightPx = 512,
            fps = 8,
            frameCount = 8,
            paper = ProjectPaper.CREAM,
        ),
        NativeProjectTemplate(
            id = "neon",
            name = "Neon loop",
            description = "Dark paper · 16-frame loop",
            widthPx = 1280,
            heightPx = 720,
            fps = 12,
            frameCount = 16,
            paper = ProjectPaper.GRAPHITE,
        ),
    )

    fun byId(id: String): NativeProjectTemplate? = all.firstOrNull { it.id == id }

    fun create(template: NativeProjectTemplate): Project = createProject(
        name = template.name,
        widthPx = template.widthPx,
        heightPx = template.heightPx,
        fps = template.fps,
        frameCount = template.frameCount,
        paper = template.paper,
    )

    fun createCustom(spec: CustomProjectSpec): Project {
        require(spec.widthPx in DIMENSION_RANGE) {
            "widthPx must be in $DIMENSION_RANGE: ${spec.widthPx}"
        }
        require(spec.heightPx in DIMENSION_RANGE) {
            "heightPx must be in $DIMENSION_RANGE: ${spec.heightPx}"
        }
        require(spec.fps in FPS_RANGE) { "fps must be in $FPS_RANGE: ${spec.fps}" }
        require(spec.frameCount in FRAME_COUNT_RANGE) {
            "frameCount must be in $FRAME_COUNT_RANGE: ${spec.frameCount}"
        }
        return createProject(
            name = spec.name.trim().ifEmpty { DEFAULT_CUSTOM_NAME },
            widthPx = spec.widthPx,
            heightPx = spec.heightPx,
            fps = spec.fps,
            frameCount = spec.frameCount,
            paper = spec.paper,
        )
    }

    private fun createProject(
        name: String,
        widthPx: Int,
        heightPx: Int,
        fps: Int,
        frameCount: Int,
        paper: ProjectPaper,
    ): Project {
        val layer = Layer(name = InkFrameDefaults.DEFAULT_LAYER_NAME)
        return Project(
            name = name,
            canvas = CanvasSpec(
                widthPx = widthPx,
                heightPx = heightPx,
                fps = fps,
                backgroundColor = paper.color,
            ),
            scenes = listOf(
                Scene(
                    name = InkFrameDefaults.DEFAULT_SCENE_NAME,
                    frameCount = frameCount,
                    layers = listOf(layer),
                ),
            ),
        )
    }
}
