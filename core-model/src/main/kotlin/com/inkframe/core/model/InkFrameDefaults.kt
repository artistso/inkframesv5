package com.inkframe.core.model

/** Canonical defaults inherited from the original Glass Horizon implementation. */
object InkFrameDefaults {
    const val DEFAULT_WIDTH_PX: Int = 1024
    const val DEFAULT_HEIGHT_PX: Int = 768
    const val DEFAULT_FPS: Int = 12
    const val DEFAULT_FRAME_COUNT: Int = 1
    const val DEFAULT_PROJECT_NAME: String = "Canvas"
    const val DEFAULT_SCENE_NAME: String = "Scene 1"
    const val DEFAULT_LAYER_NAME: String = "Layer 1"

    val DEFAULT_PAPER: RgbaColor = RgbaColor.fromArgb(0xFFFFF0F3.toInt())

    /** Creates the same blank document the original Glass Horizon opened with. */
    fun newProject(): Project {
        val layer = Layer(name = DEFAULT_LAYER_NAME)
        return Project(
            name = DEFAULT_PROJECT_NAME,
            canvas = CanvasSpec(
                widthPx = DEFAULT_WIDTH_PX,
                heightPx = DEFAULT_HEIGHT_PX,
                fps = DEFAULT_FPS,
                backgroundColor = DEFAULT_PAPER,
            ),
            scenes = listOf(
                Scene(
                    name = DEFAULT_SCENE_NAME,
                    frameCount = DEFAULT_FRAME_COUNT,
                    layers = listOf(layer),
                ),
            ),
        )
    }

    /**
     * Replaces only the untouched placeholder created by the retired native prototype.
     *
     * Returning the same instance when migration is not applicable lets callers use referential
     * equality to avoid resetting editing context for real projects.
     */
    fun migrateUntouchedLegacyNativePlaceholder(project: Project): Project {
        return if (isUntouchedLegacyNativePlaceholder(project)) newProject() else project
    }

    fun isUntouchedLegacyNativePlaceholder(project: Project): Boolean {
        val scene = project.activeScene ?: return false
        return project.name == "Untitled" &&
            project.scenes.size == 1 &&
            project.canvas.widthPx == 1280 &&
            project.canvas.heightPx == 720 &&
            project.canvas.fps == 24 &&
            scene.frameCount == 24 &&
            scene.layers.size == 1 &&
            scene.layers.all { it.cels.isEmpty() }
    }
}
