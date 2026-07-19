package com.inkframe.feature.canvas

import com.inkframe.core.model.Project

internal data class CanvasRecreationDecision(
    val nextSignature: String,
    val recreate: Boolean,
)

/**
 * Separates blank-document resizing from archive open/recovery.
 *
 * Loaded projects restore cel pixels into the current engine before their Project model is
 * installed, so a nonblank replacement must retain that engine. Blank creation has no restored
 * pixel surfaces and may safely rebuild CanvasView when its immutable dimensions change.
 */
internal object ProjectCanvasRecreation {
    fun signature(project: Project): String =
        "${project.canvas.widthPx}x${project.canvas.heightPx}@${project.canvas.pixelAspect}"

    fun observe(previousSignature: String, project: Project): CanvasRecreationDecision {
        val next = signature(project)
        return CanvasRecreationDecision(
            nextSignature = next,
            recreate = next != previousSignature && isStructurallyBlank(project),
        )
    }

    fun isStructurallyBlank(project: Project): Boolean =
        project.scenes.all { scene -> scene.layers.all { layer -> layer.cels.isEmpty() } }
}
