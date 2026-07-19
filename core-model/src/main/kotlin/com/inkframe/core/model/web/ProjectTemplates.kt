package com.inkframe.core.model.web

/**
 * The six start-screen `PROJECT_TEMPLATES`, ported verbatim from i.html:1117-1124, and
 * the `projectFromTemplate` factory (i.html:1125-1130). Field defaults mirror the JS
 * `||`-fallbacks (`t.w||W0`, `t.fps||12`, `t.frames||1`, `t.name||'Canvas'`,
 * `t.paper||DEFAULT_PAPER`).
 */
object ProjectTemplates {

    data class Template(
        val id: String,
        val name: String,
        val w: Int = Caps.W0,
        val h: Int = Caps.H0,
        val fps: Int = Caps.DEFAULT_FPS,
        val frames: Int = 1,
        val paper: String = Caps.DEFAULT_PAPER,
        val desc: String = "",
    )

    /** Exact order and values of i.html:1118-1123. */
    val ALL: List<Template> = listOf(
        Template(id = "classic", name = "Classic sketch", w = 1024, h = 768, fps = 12, frames = 1, paper = Caps.DEFAULT_PAPER, desc = "4:3 cream paper"),
        Template(id = "hd", name = "HD animation", w = 1280, h = 720, fps = 12, frames = 12, paper = Caps.DEFAULT_PAPER, desc = "16:9 · 12 starter frames"),
        Template(id = "square", name = "Square social", w = 1080, h = 1080, fps = 12, frames = 1, paper = Caps.DEFAULT_PAPER, desc = "1:1 post / sticker"),
        Template(id = "phone", name = "Phone vertical", w = 1080, h = 1920, fps = 12, frames = 1, paper = Caps.DEFAULT_PAPER, desc = "9:16 story / reel"),
        Template(id = "pixel", name = "Pixel art", w = 512, h = 512, fps = 8, frames = 8, paper = "#f5f5f0", desc = "small canvas · 8 fps"),
        Template(id = "neon", name = "Neon loop", w = 1280, h = 720, fps = 12, frames = 16, paper = "#0a0a10", desc = "dark paper · 16 frames"),
    )

    /**
     * `projectFromTemplate(t)` (i.html:1125-1130): `n=max(1,min(MAX_FRAMES,t.frames||1))`
     * blank frames, all-1 holds, cur 0; `w||W0`, `h||H0`, `fps||12`, `name||'Canvas'`,
     * `paper||DEFAULT_PAPER` fallbacks. Blank-frame count and per-frame layer ids come
     * from [ids], matching the web's shared `__lid` counter.
     */
    fun fromTemplate(t: Template, ids: LayerIdGenerator): Project {
        val w = if (t.w != 0) t.w else Caps.W0
        val h = if (t.h != 0) t.h else Caps.H0
        val n = t.frames.coerceIn(1, Caps.MAX_FRAMES)
        return Project(
            name = t.name.ifEmpty { Caps.DEFAULT_PROJECT_NAME },
            w = w,
            h = h,
            fps = if (t.fps != 0) t.fps else Caps.DEFAULT_FPS,
            paper = t.paper.ifEmpty { Caps.DEFAULT_PAPER },
            frames = List(n) { Frame.blank(ids) },
            holds = List(n) { 1 },
            cur = 0,
        )
    }
}
