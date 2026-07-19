package com.inkframe.core.model.web

/**
 * The open gallery: `projects[]` plus the active index `pi` (i.html:1163). Bounded to
 * 0..[Caps.MAX_PROJECTS] projects; the cap is enforced at mutation/import boundaries
 * (archive import slices at i.html:4807; [WebArchiveCodec.decode] does the same).
 *
 * [active] is clamped against the restored list on import (i.html:4571 with the post-slice
 * re-clamp at i.html:4808). Direct constructor callers should keep it in range; reads go
 * through [activeProject], mirroring the web's `projects[pi]` fast getter (i.html:1155).
 */
data class Gallery(
    val projects: List<Project>,
    val active: Int = 0,
) {
    /** `projects[pi]` as a nullable read (web boot state always has >= 1 project). */
    val activeProject: Project?
        get() = projects.getOrNull(active)
}
