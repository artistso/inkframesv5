# InkFrame Web→Native Port Map

Master reference for the 1:1 port of the InkFrame web runtime to native Kotlin/Android.
Source of truth: `web/` @ `main` (`934f7ec`), specifically the **injected release configuration**
(checked-in `web/index.html` + `tools/inject-*.mjs` release output: brush-engine-v2 default-on,
radial timeline, onion-skin-studio, workspaces, feedback, creator-statement, canvas-shape;
debug-only modules excluded). Audits: `output/audit/{native,engine,brush,ui,timeline,io}.md`.
Native repo: `/mnt/agents/inkframesv5` (never modified by this document). Work branch: `native/port`.
Repo rules honored throughout: offline-first, no analytics, tests for behavior changes, CHANGELOG updates.

Naming convention used below: `i.html` = `web/index.html` (5,663 lines). All line numbers verified
against `main @ 934f7ec`.

---

## 0. Executive summary

**Where main is today.** `main` ships a partial, non-matching native rewrite: `app/` launches
`ClosedBetaGlassHorizonScreen` (Compose + GLSurfaceView shell over `:engine-gl`), CI hard-rejects
any WebView return, and the document model is a Scenes/sparse-cel design the web app never had.
The last WebView wrapper survives only in `inkframe-v0.1.1-agent.bundle` (v0.1.1). The checked-in
web app itself has a silently broken autosave (missing `newBackground` env), a failing version
smoke test (0.4.0 vs 0.5.0-native-mainline1), and a proven GIF byte-divergence from its own Kotlin
reference encoder (`MedianCutQuantizer.kt:88` box-ordering bug).

**What the port delivers.** A native Kotlin app (Jetpack Compose UI, GLES3 canvas, pure-JVM cores)
that behaves identically to the pinned web build: same document model (gallery ≤4 projects ×
≤120 frames, frame-local layers, per-frame `holds[]` 1–8), same 10 brushes + Brush Engine V2 pen
pipeline, same 11 blend modes, same 40-deep snapshot undo, same `.inkframe` v3 JSON archive, same
GIF bytes, same radial timing hierarchy, same orb UI, gestures, themes.

**Strategy (5 bullets).**
1. **Port, don't reinterpret.** The web JS is the executable spec. Pure modules (brush pipeline,
   timing math, codecs) are translated function-by-function with the exact constants; web/tests
   vectors become JUnit tests. No behavior is "improved" except enumerated bug decisions (§5, §7).
2. **Web-shaped core first.** Replace `core-model`'s Scene/Cel model with the web document shape
   (frames + holds + frame-local layers + paper + gallery caps) and the v3 JSON codec before any UI
   work; everything downstream keys off this model.
3. **Reuse what is already the reference.** `core-common` gif/*, FloodFill, Json, UndoStack,
   ViewportTransform, DirtyRegion, PixelConvert, YuvConverter and the `engine-gl` stroke pipeline
   are kept (the web JS was ported *from* them); only deltas are ported (4 blend shaders, textured
   dabs, tilt, holds-aware playback).
4. **Monkey-patches become class hierarchy.** The injector load-order decorator chains (radial
   timing, brush-v2 session/ghost wrappers, autosave `pushU`/`setCur` wrapping) become explicit,
   constructor-injected Kotlin delegates with the cascade semantics encoded in one ordered list.
5. **Goldens pin parity.** Byte-level goldens (GIF SHA-256, `.inkframe` v3 fixtures), seeded-RNG
   stroke/frame bitmap goldens, and mechanical JUnit ports of the 74 web test files gate every
   milestone. Known-broken web tests are fixed or consciously retired (§7).

**Milestones.**
- **M1 — Foundation**: web-v3 document model + codec + session payload + round-trip goldens (~610 web LOC).
- **M2 — Brush core**: brush-engine-v2 pure files + brush-math + 10 v1 rasterizers + stroke parity (~3,050 LOC).
- **M3 — Compositor / timeline / undo**: 11-mode compositor, onion, playback ticks, snapshot undo (~1,160 LOC).
- **M4 — Persistence + export**: SAF archive I/O, autosave scheduler, GIF byte-parity (fix first), MP4/PNG (~450 LOC + reused encoder).
- **M5 — Orb UI + gestures**: 11 nodes, wires/pins, Brush Lab, panels, themes, rail, gestures (~2,500 LOC).
- **M6 — Radial timing + polish + acceptance**: 10 radial modules, onion studio, deck/workspaces, feedback, canvas-shape, creator statement (~3,740 LOC).

---

## 1. Current state assessment

This section states what `main` actually is, factually, and what is broken.

### 1.1 What main ships

- **Native rewrite, not a WebView shell.** `app/src/main/.../MainActivity.kt` hosts
  `ClosedBetaGlassHorizonScreen` (feature-canvas, 1,023 LOC) over `CanvasView` (GLSurfaceView,
  ES 3.0). The "faithful" `GlassHorizonScreen.kt` (1,580 LOC) exists but is not launched;
  `StudioScreen.kt` (1,111 LOC) is dead code explicitly rejected by `docs/MAINLINE_KOTLIN_MIGRATION.md`.
- **Module graph** (`settings.gradle.kts` at HEAD): `:app → :feature-canvas → :engine-gl → :core-model →(api) :core-common`;
  `:feature-layers` isolated. core-common/core-model/feature-layers are `kotlin-jvm`; engine-gl and
  feature-canvas are android-library (compileSdk 34, minSdk 26); app compileSdk/targetSdk 36.
  Toolchain: AGP 8.5.2, Kotlin 1.9.24, Compose BOM 2024.06.00, Gradle 8.9.
- **Document model is the wrong shape** for this port: `Project → Scene → Layer → cels: Map<Int,Cel>`
  with GPU `surfaceId` handles, `BlendMode` of 8, `inkframe-project` v1 JSON inside a ZIP
  `.inkframe`. §3 gives per-class verdicts; §5 gives the conflicts.
- **295 JVM unit tests**, zero instrumented tests. Test distribution: core-common 10 files,
  core-model 17, engine-gl 6, feature-canvas 4 (thin, 160 LOC), app 1.
- **Historical WebView shell** (v0.1.1, bundle only): `stageWebAssets` Copy task, single WebView
  loading `file:///android_asset/index.html`, `InkFrameAndroidBridge.saveBase64/saveDataUrl`
  export bridge. Later variants were generated by `tools/inject-brush-v2-index.mjs` +
  `registerWebAssetPipeline` (unrecoverable from the squashed history; only the inject tools and
  CI greps remain).

### 1.2 CI posture

- `.github/workflows/android.yml` job `native-boundary` greps the app module for `WebView(`,
  `JavascriptInterface`, `addJavascriptInterface`, `androidx.webkit`, `android.permission.INTERNET`,
  `registerWebAssetPipeline` — the port must stay WebView-free (it does; nothing here reintroduces one).
- Job `release-compile-and-tests` runs `./gradlew :app:compileReleaseKotlin test` (JDK 17, API 36).
- **No CI job runs `web/tests/*.mjs`** — the web suite is un-wired ("wired into Android CI"
  comments in it are historical, io.md §6).
- `docs/MAINLINE_KOTLIN_MIGRATION.md` policy: no APK/AAB artifacts from `main` until owner visual
  approval; no `StudioScreen`/WebView references in `MainActivity` (CI-grepped);
  `docs/GLASS_HORIZON_VISUAL_CONTRACT.md` is binding for the shell — the port implements the web
  orb UI (which *is* the Glass Horizon design) and treats that contract as the visual acceptance bar.
- **Working-tree breakage (local only)**: `settings.gradle.kts`, `gradle.properties`,
  `gradlew(.bat)`, `inkframe-cli`, `keystore.properties.example` are deleted in this checkout but
  present in git HEAD; restore with `git checkout -- <files>` before local builds. CI (fresh
  checkout) is unaffected.

### 1.3 Broken contracts (fix or consciously carry — none may be silently ported)

1. **Autosave silently broken on checked-in web build.** `web/autosave.js` `serialize()` (L128)
   and `restore()` (L183) call `env.newBackground(w,h)` unconditionally, but the env injected at
   `i.html:5589-5609` does not provide it → every save/restore throws `TypeError`, caught silently
   → IndexedDB persistence is dead in the plain web build; only injector-generated builds wire it
   (`tools/inject-static-background-v2.mjs:12,105`). Verified by execution (io.md §2).
   **Port decision:** treat the injector-wired v3 payload (with per-project `background` +
   `canvasShape`) as canonical; do not replicate the defect.
2. **Version drift + failing smoke test.** `web/metadata.json` = `0.4.0`, targetSdk 35;
   `gradle/inkframe-app.properties` = `versionName=0.5.0-native-mainline1`, `versionCode=50000`,
   targetSdk 36. `web/tests/version-smoke.mjs` fails on main with exactly 2 stale assertions
   (expects `app/build.gradle.kts` to call `webMetadataString("version")`/`webMetadataInt("targetSdk")`).
   **Resolution:** single source = `gradle/inkframe-app.properties`; web `metadata.json` stays for
   the injector toolchain; retire/update the 2 assertions (§7).
3. **GIF byte parity broken between web JS and Kotlin reference.** `MedianCutQuantizer.kt:88` does
   `boxes.remove(box); boxes.add(left); boxes.add(right)` (append at end) while
   `gif-encoder.js:241` splices `left,right` in place → different box order → different
   tie-breaks/palette order → different bytes (measured: noisy 64×64 → 5,980 B vs 5,977 B;
   two-flat-color → same length, different bytes; only tie-free gradients match).
   **Fix (one line):** splice in place — `val i = boxes.indexOf(box); boxes.removeAt(i); boxes.addAll(i, listOf(left, right))`.
   Land in M4 *before* pinning goldens; web JS order is canonical (io.md §3, §9.1).
4. **`.inkframe` extension collision.** Native writes ZIP (`document.json` + `cels/*.png`,
   `format:"inkframe-project"`, v1, MIME `application/zip`); web writes single JSON v3
   (`kind:'inkframe-web-archive'`, `application/x-inkframe+json`, inline PNG data-URLs,
   `buildProjectArchive` i.html:4516-4526). Mutually unreadable. Resolution + migration in §5.1.
5. **Dead WebView telemetry in app.** `app/src/debug/.../InkFrameApplication.kt` still hunts for a
   WebView to attach `InkFrameNativePenBridge` to (finds none → no-op); `NativePenMotionCapture`/
   `NativePenTraceRecorder` are only meaningful against that bridge. Replace verdict in §3.
6. **Injected-module ambiguity.** Checked-in `i.html` loads exactly 4 scripts (i.html:753-756:
   gif-encoder, autosave, brush-math, flood-fill). brush-engine-v2 (38 files), the 10 radial
   modules, onion-skin-studio, canvas-shape, feedback-report, tablet-command-deck, workspaces,
   creator-statement exist **only** via `tools/inject-*.mjs` (or as test fixtures). "The web app"
   for parity purposes is pinned to the **release injection** (§0 header); raw index.html behavior
   (rectangular frame board fallback i.html:3863-3884, v1-only brushes) is explicitly **not** the target.
7. **Feature-parity registry vs. reality.** `docs/FEATURE_PARITY_REGISTRY.json` already lists
   brush-lab/tilt/start-templates/help-overlay/theme-worlds/canvas-resize-handles as missing and
   most UI as partial against the web reference; the ClosedBeta shell's `BetaNode` set
   (TOOLS/LINE/COLOR/FX/THEMES/STUDIO·STEVEN/GALLERY/FRAMES/LAYERS/SELECT/REPORT) does not match
   the web's 11-node structure (§2). The rewrite is superseded by this port, not extended.

---

## 2. Source-of-truth inventory (web)

LOC from `wc -l` @ `934f7ec`. "Parity spec" = which `web/tests/*.mjs` pin the subsystem today;
**GAP** = no web test exists — the port must author goldens (§7).

| Subsystem | Files (file:lines for index.html) | LOC | Behavior summary | Parity spec |
|---|---|---|---|---|
| Engine core (doc model, render, stroke) | `web/index.html` (whole file; section index in §4) | 5,663 | Single-IIFE app: gallery ≤4 × ≤120 frames, frame-local layers, holds 1–8, undo 40, 11 blends, onion, playback, export | boot-smoke.mjs (structural only); **GAP** for engine math → golden fixtures |
| Brush presets ×10 | i.html:891-909 (`brushes[]`), 947-963 (`DEFAULT_PROFILE`), 703-715 (Lab ranges), 918-1059 (prefs) | ~150 | pencil/ink/marker/water/frost/smudge/glow/neon/star/eraser + 13-field per-brush prefs, `PEN_ENGINE_VERSION=2` migration, `inkframe.prefs.v1` (debounce 180 ms) | boot-smoke (control ids); **GAP** on dab pixels → stroke goldens |
| Brush dab rasterizers (v1) | i.html:1464-1675 (`dab`), 1677-1698 (`dabSym`), 1700-1711 (`inkPool`), 1713-1799 (`segCR`/`seg`) | ~340 | Per-brush radial-gradient/arc stamps; grain field 256²; jitter/taper/pool envelopes; symmetry ×1/2/4/6/8/12 | **GAP** → seeded stroke goldens |
| Brush Engine V2 (pen: ink+eraser) | `web/brush-engine-v2/` 38 files | 5,855 | Pipeline: batch → validator → contact guard → stabilizer/filter EMAs → quadratic path → arc sampler → radius guard → dab/ribbon rasterizer; tuning presets direct/balanced/smooth; ghost trail; Brush Lab UI; coach/identity dev chain | brush-engine-v2-*.test.mjs (29 files) — the richest parity source |
| brush-math | `web/brush-math.js` | 127 | `GRAIN_SIZE=256`, buildGrain/sampleGrain, easeAngle, hexWithAlpha, catmullRom | covered via brush tests; **GAP** direct |
| Stroke pipeline (pointer→pixel) | i.html:1328-1426 (toC, Living Line), 1800-1858 (palm/barrel), 1860-2236 (down/move/up, QuickShape) | ~800 | Coalesced events, pressure seat-in (PSEAT_N=4), StreamLine smoothing, velocity, CR spline, predicted overlay, QuickShape (QS_HOLD=420) | **GAP** → stroke goldens |
| Orb UI ("Glass Horizon") | i.html:2303-2662 (nodes/wires/pins/layoutKids), 2664-4456 (11 node definitions), CSS 16-573 | ~2,300 | 11 root nodes, golden-ratio kid fans, spring stagger 26 ms, SVG wires + cut handles, tear-off pins, collapse | boot-smoke.mjs (≥9 orbs etc.) |
| Panels & dialogs | i.html:614-746 (DOM), 2705-3005 (Brush Lab), 4458-4835 (project/start panels) | ~1,200 | Brush Lab (13 sliders + preview + presets + .inkbrush), Studio/Projects/Start/Help/Export/Stylus panels, hint toast | boot-smoke.mjs |
| Radial timing hierarchy | `web/radial-timeline.js` + 9 `radial-timing-*.js` | 2,681 | Radial frame board; timing editor (hold arcs, loop handles); patterns (6 presets, 25-deep timing undo); recipes/variations/morph/phrases/score + 2 persistent libraries; decorator chain (§5.6) | radial-timeline(.test,-boot), radial-timing-*.test.mjs (20 files), history-inspector-release |
| Onion skin | i.html:1228-1260 (renderer), `web/onion-skin-studio.js` | 162 + ~35 | depth 0–8 (def 2), past `#880057`@.34, future `#f7cac9`@.24, tint .5, layerOnly, 5 presets, scrub-reach 5 ×0.82 decay | onion-skin-studio(.test,-boot,-release) |
| Layers / blend modes | i.html:1061-1105 (factories, `BLEND_MODES` 1067-1072), 4016-4160 (ops) | ~190 | 11 Canvas2D composite ops + labels; add/dup/del/up/down/merge/flatten/import/visible/blend/opacity | layer-workspace tests (normalizer); **GAP** on pixel blends → blend goldens |
| Undo | i.html:1183-1227 (`snap/structSnap/restoreSnap/pushU`), 3617-3635 (`doUndo/doRedo`) | ~65 | 40-deep per-project; kinds `pixels` (active layer ImageData) + `struct` (all layers); symmetric re-snapshot; **no timing undo** | **GAP** → behavior tests |
| Autosave | `web/autosave.js` + i.html:5562-5654 wiring | 257 + ~95 | IndexedDB `inkframe/sessions/current`; payload v1→v3 (structural detection); debounce 800 ms + flush on hide; wraps `pushU`/`setCur` | canvas-shape-autosave.test.mjs, static-background-release.test.mjs (v3 serialize markers) |
| `.inkframe` archive v3 | i.html:4464-4586 (`projectToArchive`/`buildProjectArchive`/`archiveToProjects`), 4776-4835 (I/O plumbing) | ~185 | Single JSON `{v:3,kind:'inkframe-web-archive',projects:[…],active}`; layers = PNG data-URLs; lenient import (legacy `project`, `png|dataUrl|data`, clamps 4×120) | **GAP** (no archive test) → round-trip goldens |
| Export GIF | i.html:5181-5440 (EXPORT driver), `web/gif-encoder.js` (500) | ~880 | `baseDelayCs=max(2,round(100/fps))` × `hold`; paper-flatten; worker/inline streaming; >120 MP confirm; `inkframe-<epoch>.gif` | Kotlin side: GifEncoder/Lzw/MedianCut tests; **GAP** cross-language → byte goldens |
| Export MP4 | i.html:5440-5560 | ~120 | MediaRecorder + `captureStream(0)` + `requestFrame()`, 6 Mbps, mime probe mp4/avc1→webm vp9/vp8, real-time cadence | **GAP** (native supersedes with MediaCodec offline) |
| Export PNG | i.html:3654-3720 (3716-3718) | ~10 | `flattenFrame` → PNG blob download | **GAP** trivial |
| Gallery | i.html:4379-4463 (switch/crossfade), 1107-1182 (templates) | ~160 | ≤4 projects, 6 `PROJECT_TEMPLATES`, 420 ms dive animation, thumbnails | boot-smoke.mjs |
| Themes | i.html:819-888 (8 themes, `readableTextFor`, `applyTheme`) | ~70 | Glass Horizon/Aurora/Sapphire/Ember/Amethyst/Graphite/Gold Dusk/Mint Glass; luminance threshold 0.35; **theme not persisted (always boots 0)**; Graphite `#2cف34`→`#2c2e34` runtime patch (port the fixed value) | boot-smoke (partial) |
| Gestures | i.html:5101-5164 (pinch/2F-undo/3F-redo/double-tap), 1800-1858 (palm/barrel), 1871/2109-2112 (QuickShape hold) | ~130 | pinch `fit·0.35..2.2` min .18; 2F tap ≤420 ms ≤10 px → undo; 3F → redo; 2nd finger cancels touch stroke; double-tap <330 ms <8 px collapses; PALM_SIZE=40, PALM_GRACE=900 | **GAP** → constants + gesture tests |
| Circular canvas | `web/canvas-shape.js` (injected) | 120 | square/circle; `circleGeometry` r=max(.5,min(w,h)/2); clamp ε=1e-7; boundary pointerup at rim; `destination-in` mask | canvas-shape(.test,-boot), canvas-shape-autosave |
| Tablet deck + workspaces | `web/tablet-command-deck.js` (207), `web/layer-workspace.js` (153), `web/timeline-workspace.js` (139) | 499 | Side control deck (modes/transport/status); 15 layer commands; 12 timeline commands; stroke-guard "Finish the active stroke…" | tablet-command-deck(.test,-boot,-release), layer-workspace(×3), timeline-workspace(×3) |
| Feedback report | `web/feedback-report.js` | 216 | Deterministic redacted text report; NOTE_LIMIT=4000; per-field caps; privacy: no artwork/names/paths; transient notes | feedback-report(.test,-boot,-release) |
| Creator statement | `web/creator-statement.js` | 63 | Static testimony card + "Studio · Steven" rename; copy byte-exact (curly quotes/em-dash) | creator-statement.test.mjs (+16 chained) |
| Prefs / metadata | i.html:918-1059 (`inkframe.prefs.v1`), `web/metadata.json` (12), localStorage keys (§2 audit) | ~140 | prefs v1 schema; brush prefs 13×10; lab/tuning/recipe/deck keys (full list §4.14) | version-smoke.mjs (2 stale assertions), tablet prefs roundtrip |
| Web shell leftovers | `manifest.webmanifest` (27), `package.json` (15), `vite.config.js` (11), `gif_encoder_demo.gif` (3,923 B) | 53 | PWA/build artifacts; demo GIF unreferenced | android-branding.test.mjs pins native branding instead |

**Totals:** web root JS+HTML = 10,714 LOC (of which index.html 5,663); brush-engine-v2 = 5,855;
tests = 6,713 (74 files). Injectable-only modules (not loaded by checked-in i.html):
brush-engine-v2/*, radial-*.js (10), onion-skin-studio.js, canvas-shape.js, feedback-report.js,
tablet-command-deck.js, layer-workspace.js, timeline-workspace.js, creator-statement.js.

---

## 3. Native asset inventory & reuse verdicts

95 Kotlin files (58 main / 37 test) + 6 GLSL shaders. LOC = main/test lines (native.md §2).
Verdicts: **REUSE-AS-IS** · **REUSE-WITH-CHANGES** (RWC) · **REPLACE** · **KEEP-ISOLATED** · **DELETE**.

### 3.1 core-common — `com.inkframe.core.common` (1,175 / 1,030; 10 main + 10 test)

| Class (file) | Verdict | Reason |
|---|---|---|
| `JsonValue` + parser/writer (`Json.kt`) | REUSE-AS-IS | Dependency-free JSON needed for web v3 archive + prefs; no new deps allowed (offline-first). |
| `Vec2`, `lerp`, `clamp`, `catmullRom` (`MathUtil.kt`) | REUSE-AS-IS | Pure geometry; identical math needed by ported stroke code. |
| `UndoStack`/`Command` (`UndoStack.kt`) | RWC | Keep bounded stack; add memento/snapshot command kinds + structural coverage to match web `snap`/`structSnap`; capacity comes from caller (web cap = 40, not the native default 200). |
| `ViewportTransform` (`ViewportTransform.kt`) | REUSE-AS-IS | Pinch/pan/rotate math maps onto web gesture semantics; 12 tests exist. |
| `FloodFill` (`FloodFill.kt`) | REUSE-AS-IS | web/flood-fill.js is a documented 1:1 port of this file — the Kotlin file *is* the reference. |
| `DirtyRegion`/`IntRect` (`DirtyRegion.kt`) | REUSE-AS-IS | Stroke dirty-bbox accumulation reused by undo tile store. |
| `gif/GifEncoder.kt` | RWC (1-line-adjacent) | Reference impl; web gif-encoder.js is its 1:1 port. No code change needed itself. |
| `gif/LzwEncoder.kt` | REUSE-AS-IS | Round-trip-tested; line-equivalent to JS. |
| `gif/MedianCutQuantizer.kt` | RWC (**one-line fix**) | `:88` remove+append → splice-in-place to restore byte parity with gif-encoder.js:241 (§1.3.3). |
| `video/YuvConverter.kt` | REUSE-AS-IS | BT.601 limited-range math feeding MediaCodec; native MP4 is a deliberate superset of web MediaRecorder. |
| All 10 test files (`JsonTest`, `UndoStackTest`, `ViewportTransformTest`, `FloodFillTest`, `DirtyRegionTest`, `GifEncoderTest`, `LzwEncoderTest`, `MedianCutQuantizerTest`, `YuvConverterTest`, `MathUtilTest`) | KEEP | Stay green in CI; add cross-language golden tests beside them (§7). |

### 3.2 core-model — `com.inkframe.core.model` (1,506 / 1,732; 18 main + 17 test)

| Class (file) | Verdict | Reason |
|---|---|---|
| `Project`/`CanvasSpec`/`DefaultPalette` (`Project.kt`) | REPLACE | Scene/canvas model conflicts with web frame-local model (§5.2). New web-shaped `Project` lands in same package (proguard already keeps `core.model.**`). |
| `Scene`/`Layer`/`Cel`/`CelTransform` (`Scene.kt`) | REPLACE | Timeline-spanning layers + sparse cels + transforms have no web counterpart. Hold-fallback (`celAt`) is superseded by explicit `holds[]`. |
| `BlendMode` (8, in `Scene.kt`) | REPLACE | Web persists 11 Canvas2D strings (i.html:1067-1072); new enum must serialize those exact strings. Native-only ADD is dropped from the parity path (§5.3). |
| `Brush`/`BrushKind`/`DefaultBrushes` (`Brush.kt`) | REPLACE | 6 kinds can't express water/frost/smudge/glow/neon/star, Engine-V2 `coverage`/`radiusMode`/`contactMode`/`response`, or the 13-field web profile. |
| `BrushAdjustments.kt` (+ its test) | REUSE-AS-IS (pattern) | Clamped-mutator + `*_RANGE` pattern is correct; re-express against the web 13-field profile + Lab ranges (i.html:703-715). |
| `ProjectCodec.kt` (`inkframe-project` v1) | KEEP-ISOLATED | Move to `core.model.legacy`; read-only legacy importer for beta-era ZIPs (§5.1). Never written again. |
| `ProjectPackage.kt` (ZIP `.inkframe`) | KEEP-ISOLATED | Same: legacy read path only; must not share the `.inkframe` write path (§5.1). |
| `LayerOps.kt` | REPLACE | Semantics tied to timeline-spanning layers; web layer ops are per-frame array ops (i.html:4016-4160) ported fresh. |
| `TimelineOps.kt` | REPLACE | Sparse-cel shifting model; web frame ops (dup/del/reverse/ping-pong/holds, i.html:3802-4015) ported against `frames[]`+`holds[]`. |
| `TimelineDrag.kt` | RWC | Cell-pitch hit-testing math is representation-agnostic — lift into the radial/rail port. |
| `PlaybackOps.kt` | RWC | fps/duration math fine; must consume web `holds[]` (tick model) instead of playbackRange; fps range changes 1..120 → web dial 1..24. |
| `OnionSkin.kt` (`OnionSkinSettings`/`OnionSkinPlanner`) | RWC | Re-parameterize to web fields: single depth 0–8, past/future opacity+colors, layerOnly, 5 presets (onion-skin-studio.js:4-14). |
| `ExportPlan.kt` (`ExportPlanner`) | RWC | Duration/centisecond math good; feed from `holds[]` multipliers; keep GIF cs rounding (`max(2,round(100/fps))*hold`). |
| `MediaTypes.kt` | RWC | PROJECT kind: mime `application/zip` → `application/x-inkframe+json`; keep SAF plumbing + `suggestedFileName`. |
| `InkFrameDefaults.kt` | REUSE-AS-IS | Already web-aligned (1024×768, fps 12, `#FFF0F3`, "Canvas"); keep migration shim. |
| `RgbaColor.kt`, `Hsv.kt` | REUSE-AS-IS | Value math; matches web color handling. |
| `RecentColors.kt`, `ColorSampler.kt` | REUSE-AS-IS | MRU + eyedropper sampling; web dropper flattens paper+composite (i.html:3566-3606) — same contract. |
| 17 test files (`ProjectCodecTest`, `ProjectPackageTest`, `SaveLoadIntegrationTest`, ops/color/onion/export tests) | REPLACE/KEEP split | Model/ops tests die with the Scene model (rewritten against the web model in M1); codec/package tests move to `legacy` and stay as import-regression tests; color/sampler/hsv/recents tests KEEP. |

### 3.3 engine-gl — `com.inkframe.engine.gl` (1,561 / 478; 12 main + 6 test + 6 shaders)

| Class (file) | Verdict | Reason |
|---|---|---|
| `PaintEngine.kt` (464) | RWC | Façade + scratch/preview stroke compositing is sound; needs frame-local layer model, holds-aware playback passes (motion-blur/dissolve), circular-canvas clip, 11 blend ordinals. |
| `StrokeProcessor.kt` | RWC | Keep (smoothing/CR/arc-resample) for the GL path, but the web v1/v2 pipelines are the behavioral spec — feed it `InputSample`s produced by the ported pipeline, add tilt/azimuth. |
| `StrokeCommand.kt` / `StrokeSnapshot` | RWC | Dirty-rect command stays for GL memory; must interoperate with the web-shaped snapshot undo (§5.5). |
| `BrushRenderer.kt` + `brush.vert/frag` | RWC | Point-sprite dabs extend to textured/shaped stamps (star/glow/neon/water/frost/smudge) + grain; hardness falloff formula stays. |
| `Compositor.kt` + `composite.vert/frag` | RWC | Add 4 separable blend shaders (color-dodge/burn/hard/soft-light) with Canvas2D straight-alpha semantics; drop or quarantine ADD. |
| `present.frag`, `stroke_overlay.frag` | REUSE-AS-IS | Checkerboard/background/inverse-YP + wet-stroke overlay unchanged. |
| `CpuStrokeRasterizer.kt` | REUSE-AS-IS | Device-proven commit path (Samsung workaround); becomes the reference rasterizer for CPU goldens. |
| `CanvasRenderer.kt` | REUSE-AS-IS | EngineEvent queue + RENDERMODE_WHEN_DIRTY model unchanged. |
| `GlSurface.kt`, `GlUtil.kt`, `PixelConvert.kt` | REUSE-AS-IS | FBO/texture plumbing + GL↔ARGB orientation helpers; round-trip-tested. |
| `GlCelImageIO.kt` | RWC | PNG encode/decode reused by archive codec; re-key from surfaceId to frame/layer identity. |
| `SurfaceBackupStore.kt` | REUSE-AS-IS | EGL context-loss recovery; works unchanged on ARGB snapshots. |
| 6 test files (`CpuStrokeRasterizerTest`, `PixelConvertTest`, `StrokeBlendMathTest`, `StrokeCommandTest`, `StrokeProcessorTest`, `SurfaceBackupStoreTest`) | KEEP | StrokeBlendMathTest remains the no-darkening proof; add blend-shader golden tests (§7). |

### 3.4 app / feature-canvas / feature-layers (coarse)

| Module : class | LOC (m/t) | Verdict | Reason |
|---|---|---|---|
| app : `MainActivity.kt` | 195 | REUSE-AS-IS | `dispatchTouchEvent`→CanvasView routing still needed under Compose; hosts the ported shell. |
| app : `SplashActivity.kt` | 103 | REUSE-AS-IS | Fix stale "WebView" KDoc only. |
| app : `StylusLensOverlayView.kt` | 233 | REUSE-AS-IS | Lens is registry-verified parity with web `#lens`. |
| app(debug) : `InkFrameApplication.kt`, `NativePenMotionCapture.kt` | 105+101 | DELETE | Dead WebView-bridge telemetry (`InkFrameNativePenBridge`) on a WebView-free app. |
| app(debug) : `NativePenTraceRecorder.kt` (+test, 284+99) | — | KEEP-ISOLATED | Keep only if pen diagnostics wanted against the native surface; re-point at `MotionEvent` directly (its JVM tests are good). |
| feature-canvas : `StudioState.kt` | 428 | REPLACE | Welded to scene/cel model; rebuild as document controller over the web model (§4.1); salvage bind/recovery-claim patterns. |
| feature-canvas : `CanvasView.kt` | 537 | RWC | Stylus/touch routing, EGL config, SAF/export scaffolding good; stroke targeting + undo hooks follow the new model. |
| feature-canvas : `GlassHorizonScreen.kt` (1,580), `ClosedBetaGlassHorizonScreen.kt` (1,023) | 2,603 | REPLACE | Stopgap/incomplete shells; the port rebuilds the orb UI 1:1 from i.html. Lift `RadialDocking`, gesture routing, fan math as references. Delete once M5 lands. |
| feature-canvas : `StudioScreen.kt` | 1,111 | DELETE | Rejected by migration policy; dead code. |
| feature-canvas : `ExportManager.kt` (104), `Mp4Encoder.kt` (212) | 316 | RWC | Encoders fine; frame source must honor holds + frame-local compositing; GIF session moves to coroutine Flow. |
| feature-canvas : `ProjectRecoveryController.kt` | 126 | RWC | Keep debounce/atomic-commit pattern; payload switches ZIP → session v3 (autosave equivalent). |
| feature-canvas : `RadialDocking.kt` (71), `PhysicalStylusTool.kt` (16) | 87 | REUSE-AS-IS | Small, tested, behavior-neutral. |
| feature-canvas : 4 test files (160 LOC) | — | REPLACE | Rewritten against ported shell (§7 tier 3). |
| feature-layers : `Placeholder.kt` | 10 | DELETE | Empty; web layers are frame-local — no separate module. Layer workspace UI lands in feature-canvas. |

**New-code placement rule (no new Gradle modules):** pure ports → `core-common`/`core-model`
(kotlin-jvm, JVM-testable; mirrors how flood-fill/gif were extracted); GL/raster → `engine-gl`;
everything else (controller, UI, I/O) → `:feature-canvas` (the port home). Package layout in §4.

---

## 4. THE MAP

Ordered by dependency: document model → codec → brush core → raster → compositor →
timeline/holds → undo → persistence → export → radial timing → orb UI → gestures → gallery/settings.

**Target package layout (no new Gradle modules):**
```
core-common : com.inkframe.core.common.brush    — pure brush pipeline (v1 math + v2 engine)
              com.inkframe.core.common.timing   — pure radial/timing math + compilers
core-model  : com.inkframe.core.model           — web document model, brushes, archive, session, timing stores
              com.inkframe.core.model.legacy    — ZIP v1 codec (import-only, isolated)
engine-gl   : com.inkframe.engine.gl            — REUSE core + .brush (dab painters) + .playback
feature-canvas : com.inkframe.feature.canvas    — .doc .input .undo .io .export .session
                 .ui.orb .ui.timeline .ui.brushlab .ui.panels .ui.theme .ui.gestures
                 .ui.workspace .deck .feedback .shape
app         : com.inkframe.studio               — MainActivity/Splash/Lens + creator statement
```

### 4.0 Map table

| # | Web subsystem (file:lines) | Kotlin target (module : package : class) | Class | Parity test |
|---|---|---|---|---|
| 1 | Document model: frames/layers/holds/projects — i.html:1061-1182 (factories 1061-1105, caps+templates 1107-1182) | core-model : model : `Project`/`Frame`/`Layer`/`Gallery`/`Caps`/`ProjectTemplates` | PORT 1:1 | Doc-model JUnit (shape, caps 4×120, hold clamp 1..8, `hOf` floor 1) + boot-smoke structural contracts re-expressed |
| 2 | Blend modes + labels — i.html:1067-1072 | core-model : model : `BlendMode` (11, Canvas2D string keys) | PORT 1:1 | Enum↔string round-trip; file-compat test vs web archives |
| 3 | `.inkframe` v3 archive — i.html:4464-4586, 4776-4835 | core-model : model : `WebArchiveCodec` (`buildProjectArchive`/`archiveToProjects` ports) | PORT 1:1 | Golden v3 fixtures: web-exported file → Kotlin decode → re-encode → deep-equal; lenient-import matrix (legacy `project`, `png|dataUrl|data`, clamps) |
| 4 | Autosave session payload v3 + migration — autosave.js:1-257, i.html:5562-5654 | core-model : model : `SessionPayload`/`SessionPayloadMigrator` + feature-canvas : session : `AutosaveScheduler` | ADAPT | Migrator tests: v1 frames / v2 layered / v3 +background; clamp/blank/decode-failure matrix; 800 ms debounce + flush-on-stop |
| 5 | Prefs — i.html:918-1059 (`inkframe.prefs.v1`), `PEN_ENGINE_VERSION=2` migration 996-1009 | core-model : model : `PrefsSchema` + feature-canvas : io : `PrefsRepository` (DataStore) | ADAPT | Schema round-trip incl. v1→v2 pen-engine migration; debounce 180 ms |
| 6 | brush-math — brush-math.js:1-127 | core-common : brush : `BrushMath` (grain 256², catmullRom, easeAngle, hexWithAlpha) | PORT 1:1 | Vector tests from brush-engine-v2 suite + grain determinism (seeded) |
| 7 | Brush presets/profiles ×10 — i.html:891-909, 947-963, 703-715 | core-model : model : `BrushId`(10)/`BrushProfile`(13 fields)/`DefaultProfiles` | PORT 1:1 | Profile-table equality vs i.html constants; Lab range clamps |
| 8 | V2 pure pipeline — brush-engine-v2/{sample,batch,validator,contact,stabilizer,filters,path,arc-sampler,radius,engine,tuning,trace}.js | core-common : brush : `BrushSample`/`InputBatchNormalizer`/`SampleValidator`/`ContactBoundaryGuard`/`PositionStabilizer`/`StrokeFilter`/`QuadraticPathBuilder`/`ArcSampler`/`RadiusContinuityGuard`/`BrushEngine`/`BrushTuning`/`TuningMapper`/`BrushTrace` | PORT 1:1 | JUnit ports of brush-engine-v2-{core,batch,contact,corner,coverage,discontinuity,radius,session,stabilizer,tuning,ab,runtime}.test.mjs (same vectors) |
| 9 | V1 stroke math — i.html:1428-1463 (`shapePressure`/`targetWidth`), 1713-1799 (`segCR`/`seg`), 1860-1871 (StreamLine) | core-common : brush : `PressureCurves`/`LivingLine`/`StreamLineStabilizer`/`QuickShapeFit` | PORT 1:1 | Curve goldens (CR incl. p3==p2 quirk), seat-in/velocity constants, QuickShape fits (err 0.42/0.5, QS_HOLD 420) |
| 10 | V1 dab rasterizers ×10 — i.html:1464-1675, `dabSym` 1677-1698, `inkPool` 1700-1711 | engine-gl : brush : `DabPainter` + 10 impls (GL) + `CpuDabPainter` twin for goldens | PORT 1:1 | Seeded stroke bitmap goldens per brush (CPU twin vs web canvas capture); symmetry ×1/2/4/6/8/12 |
| 11 | V2 dab/ribbon paint — rasterizer.js:9-212 | engine-gl : brush : `RoundDabPainter` (isolated + ribbon), profile `resolveProfile` in core-common | ADAPT | Dab goldens: hardness gradient stops, ribbon gap rules, eraser CLEAR |
| 12 | Ghost trail — ghost-trail.js:1-283, ghost-runtime.js:1-46 | engine-gl : brush : `GhostTrailRenderer` + engine callback hook | ADAPT | Envelope/gap goldens (24/8r/2.5Δt); default-ON comet via balanced preset (risk §8) |
| 13 | Flood fill — flood-fill.js:1-150 + i.html:3041-3109 (`fillAt`, tol 8) | REUSE core-common : `FloodFill` + engine-gl `PaintEngine.floodFill` | REUSE | Existing FloodFillTest + no-op fill pops own snapshot (i.html:3106) behavior test |
| 14 | Compositor — i.html:1082-1105 (`frameComposite`), render 1252-1259 | engine-gl : `Compositor` + 4 new blend shaders; frame `_comp` cache = `_v`-keyed surface cache | RWC | Blend goldens: 11 modes × canonical pixel pairs, straight-alpha reference; cache-invalidation tests |
| 15 | Onion skin — i.html:1228-1260; settings `onion-skin-studio.js` | engine-gl : onion pass (tint via SRC_ATOP-equivalent) + core-model : `OnionSettings`/`OnionPresets` | PORT 1:1 | onion-skin-studio test vectors (normalize, presets, signature); tint/falloff goldens (0.45 falloff, reach ×0.82) |
| 16 | Playback/holds ticks — i.html:3756-3801 (`playLoop` 3766), 3802-4015 (frame ops), 4913-5027 (tick math) | feature-canvas : doc : `PlaybackController` + core-model : `TimelineOps`/`TickMath` | PORT 1:1 | Tick-math tests (`ticksTotal`/`tickStart`/`frameAtFrac`/`hOf`); dissolve f×1.6 & blurAmt ramps; loop range |
| 17 | Undo — i.html:1183-1227, 3617-3635 | feature-canvas : undo : `SnapshotUndoStore` (cap 40, kinds pixels/struct, symmetric re-snap) over core-common `UndoStack` | ADAPT | Cap/symmetric/kind tests; tile/delta storage bounds test; **no timing undo** (matches web) |
| 18 | Persistence I/O (SAF) — i.html:4776-4835 | feature-canvas : io : `ArchiveExporter`/`ArchiveImporter` + core-model `MediaTypes` (mime fix) | ADAPT | SAF-less core tests (streams); mime/extension routing tests |
| 19 | GIF export — gif-encoder.js:1-500 + i.html:5181-5440 driver | REUSE core-common gif/* + feature-canvas : export : `GifExportSession` (Flow) | REUSE (+fix) | **Byte goldens**: SHA-256(JS bytes) == SHA-256(Kotlin bytes) on fixed frames; delay math `max(2,round(100/fps))*hold` |
| 20 | MP4 export — i.html:5440-5560 | feature-canvas : export : `Mp4Encoder` (MediaCodec, offline PTS) | ADAPT | PTS-from-holds plan tests; even-dimension crop; not real-time (documented divergence §4.12) |
| 21 | PNG export — i.html:3716-3718 + `flattenFrame` 5217-5238 | feature-canvas : export : `PngExporter` (paper-flatten) | PORT 1:1 | Pixel tests (paper under composite) |
| 22 | Radial timeline — radial-timeline.js:1-610 | core-common : timing : `RadialGeometry` + feature-canvas : ui.timeline : `RadialTimelineBoard` | PORT math / ADAPT render | radial-timeline.test.mjs vectors (12-slot orbit, rotation, ringForIndex, ellipseCircumference(100,100)≈624.6, normalizeAngle ±3π→π) |
| 23 | Timing editor — radial-timing-editor.js:1-310 | feature-canvas : ui.timeline : `TimingEditorDelegate` | PORT math / ADAPT UI | holdFromRadialDrag (18 px step), arc span formula, clampLoopRange tests |
| 24 | Patterns + timing history — radial-timing-patterns.js:1-296 | core-common : timing : scope/assignment engine + feature-canvas : `TimingHistoryRepository` (25-deep) | PORT 1:1 | radial-timing-patterns + history-inspector vectors: 6 PATTERNS, scope priority selection→loop→all, transaction jump |
| 25 | Recipes — radial-timing-recipes.js:1-228 | core-common : timing : `TimingMath` (minimalPeriod/rotate/signature) + core-model : timing : `RecipeStore` (24 cap, schema 1) | PORT 1:1 | recipes test vectors: canonicalization, name-match overwrite, `-2`/` 2` uniquifiers, JSON import/export |
| 26 | Variations — radial-timing-variations.js:1-210 | core-common : timing : `VariationGenerator` | PORT 1:1 | Dedupe-by-signature, palindrome cap 120, pulse/compress/expand clamps |
| 27 | Morph — radial-timing-morph.js:1-186 | core-common : timing : `MorphBlender` (gcd/lcm align ≤120, mix lerp, SNAP_POINTS) | PORT 1:1 | morph test vectors |
| 28 | Phrases + library — radial-timing-phrases.js:219 + phrase-library.js:238 | core-common : timing : `PhraseCompiler` + core-model : timing : `PhraseLibraryStore` (16 cap) + drift `DriftResolver` | PORT 1:1 | compile caps (8 seg × rep 4, ≤120), signature drift (missing/changed/renamed) vectors |
| 29 | Score + library — radial-timing-score.js:305 + score-library.js:290 | core-common : timing : `ScoreCompiler` + core-model : timing : `ScoreLibraryStore` (12 cap, two-level drift) | PORT 1:1 | score test vectors (MAX_SECTIONS=8, MAX_REPEAT=4, arrangementSignature ≤960) |
| 30 | Onion studio — onion-skin-studio.js:1-162 | feature-canvas : ui.panels : `OnionSkinStudioSheet` | ADAPT | Preset/apply/signature vectors (§4.10) |
| 31 | Orb system — i.html:2303-2662 (`layoutKids` 2586, `makeNode` 2618, wires 2308-2413, pins 2415-2477) | feature-canvas : ui.orb : `OrbNode`/`OrbFanLayout`/`WireGraph`/`CutHandles`/`PinLayer` | PORT 1:1 | Geometry tests: arc solve, φ-cap `min(R,96+26·ln(n+1)·φ)`, spring 0.34 s/stagger 26 ms, RELINK_DIST=70 |
| 32 | 11 nodes + actions — i.html:2664-4456 | feature-canvas : ui.orb.nodes : 11 node composables + action intents | PORT 1:1 | boot-smoke structural contracts (node/kid labels, dial ranges, batch labels) as Compose semantics tests |
| 33 | Brush Lab — i.html:2705-3005 + v2 lab-ui/coverage-ui/stabilizer-ui/ghost-ui/preset-ui (drop DOM) | feature-canvas : ui.brushlab : `BrushLabPanel`/`PresetLibrary` + v2 tuning section | PORT (v1) / ADAPT (v2) | 13 slider ranges + ink-only row disabling (2807-2816); `.inkbrush` schema round-trip (`kind:'inkframe-brush-profile'`, i.html:2902/2945) |
| 34 | Timeline rail + frame board — i.html:597-611, 4913-5026, 3755-4014 (board superseded by radial) | feature-canvas : ui.timeline : `TimelineRail`/`LoopHandles`/`Playhead`; rectangular board DROP (radial is canonical, timeline.md §8.11) | PORT 1:1 (rail) | Hold-proportional segment/seek tests; loop-handle drag; reach decay |
| 35 | Gestures — i.html:5101-5164, 1800-1858 | feature-canvas : ui.gestures : `MultiTouchGestureDetector`/`PalmRejection`/`BarrelButtonHandler` | PORT 1:1 | Window constants tests (420/330 ms, 10/8/6 px), palm 40 px/900 ms, barrel button 2 |
| 36 | Selection engine — i.html:3184-3565 | feature-canvas : doc : `SelectionEngine` (rect/lasso/lift/move) | PORT 1:1 | Pixel cut/copy/move tests incl. ants overlay mapping |
| 37 | FX engine — i.html:4201-4372 (`fxBloom/fxSparkle/fxChroma`) | feature-canvas : doc : `FxEngine` | PORT 1:1 | Pixel goldens per FX (additive, active layer only) |
| 38 | Eyedropper — i.html:3566-3606, 1930-1937 | REUSE core-model `ColorSampler` + engine `sampleColorAt` | REUSE | Existing sampler tests + paper+composite flatten rule |
| 39 | Circular canvas — canvas-shape.js:1-120 | feature-canvas : shape : `CanvasShapeMath`/`CanvasShapeMask` + UI toggle | PORT geom / ADAPT UI | canvas-shape test vectors (ε 1e-7, boundaryEvent=pointerup buttons 0, destination-in mask) |
| 40 | Canvas resize/display — i.html:4898-4912 (`cScale`), 5028-5099 (`reshapeDocument` 256..4096, handles) | feature-canvas : ui.canvas : `CanvasStage`/`ResizeHandles` | PORT 1:1 | fit-scale (zen 0.96/0.92 vs 0.82/0.74), clamp 256..4096, top-left anchor tests |
| 41 | Compare split + scrub reach — i.html:1270-1326, 3654-3720 | feature-canvas : doc : `CompareMode` | PORT 1:1 | Split geometry (composite minus top layer, seam 2+1 px), SCRUB_REACH=5 ×0.82 |
| 42 | Themes — i.html:819-888 | feature-canvas : ui.theme : `InkFrameTheme` (8 palettes) + `readableTextFor` | PORT 1:1 | Hex/stop equality; luminance 0.35 threshold; Graphite `#2c2e34` (not the typo) |
| 43 | Gallery + projects/start panels — i.html:4379-4456, 646-681, 4721-4826 | feature-canvas : ui.panels : `GalleryNode`/`ProjectManagerDialog`/`StartScreenDialog` | PORT 1:1 | Caps, 6 templates, dive 420 ms sequence, row actions (Open/Dup/Scale copy/Clear/Delete) |
| 44 | Tablet deck + workspaces — tablet-command-deck.js:207, layer-workspace.js:153, timeline-workspace.js:139 | feature-canvas : deck : `TabletDeckViewModel` + ui.workspace panels | ADAPT | normalizeSnapshot/normalizeLayerState/normalizeTimelineState vectors; 15+12 command intents; stroke-guard policy |
| 45 | Feedback report — feedback-report.js:1-216 | feature-canvas : feedback : `FeedbackReportBuilder`/`FeedbackViewModel`/`FeedbackExporter` | PORT core / ADAPT shell | Redaction/layout regex vectors; zero-write counters as test invariants; filename pattern |
| 46 | Creator statement — creator-statement.js:1-63 | app : studio : `CreatorStatementCard` + strings.xml | PORT content | Byte-exact strings (curly quotes/em-dash); "Studio · Steven" rename |
| 47 | Predicted overlay / lens / glint — i.html:802-817, 2238-2301 | app : `StylusLensOverlayView` (REUSE) + feature-canvas overlays (`GlintOverlay`, predicted pass) | ADAPT | Overlay mapping tests; MotionEventPredictor seam |
| 48 | localStorage stores — tuning v4 chain, user presets, deck prefs, recipe/phrase/score libraries | core-model stores + DataStore backends | ADAPT | Key/schema parity tests (full key list §4.14); v1→v4 tuning migration |
| 49 | metadata.json — web/metadata.json | gradle/inkframe-app.properties (single source) + BuildConfig exposure | ADAPT | version-smoke updated (§7); APP_META fields surface in Studio panel |
| 50 | Web shell (manifest/package/vite/demo gif, sw.js-era notes) | — | DROP | — |

### 4.1 Document model (row 1) — exact contract

Runtime shapes (i.html:1061-1182): `Project{frames≤120, holds[], cur, undo, redo, w, h, fps, name, paper}`;
`Frame{layers[], active, _comp, _compV, _v}`; `Layer{id(__lid++), name, visible, opacity 0..1, blend:canvas2d-string, canvas}`.
Constants: `MAX_PROJECTS=4` (i.html:1108), `MAX_FRAMES=120` (i.html:1109), `DEFAULT_PAPER='#fff0f3'`,
`W0=1024, H0=768` (i.html:802), fps dial 1–24 default 12 (i.html:911,3976), `hOf(i)=max(1,round(holds[i]||1))`
(i.html:1227), holds 1–8 (`adjustHolds` i.html:3924). Defaults: name "Canvas", first layer "Layer 1".
Kotlin: immutable data classes + monotonic `AtomicLong` layer ids; `_v`/`_comp` cache versioning preserved
(`bumpFrame` invalidates on any pixel/prop change). Templates: 6 `PROJECT_TEMPLATES` (i.html:1110-1182) ported verbatim.
Caps enforced at every mutation boundary (risk §8: memory).

### 4.2 Archive codec v3 (row 3)

Write (i.html:4496-4526): `{v:3, app:'InkFrame Studio', kind:'inkframe-web-archive', savedAt, active,
projects:[{name,w,h,cur,fps,paper,holds:[int],frames:[{active,layers:[{name,visible,opacity,blend,png:'data:image/png;base64,…'}]}]}]}` —
single uncompressed JSON, MIME `application/x-inkframe+json`, filename `inkframe-YYYYMMDD-HHMM.inkframe`.
Import (`archiveToProjects` i.html:4546-4572) is lenient: legacy single-`project` payloads; per-layer
`png|dataUrl|data` keys; clamp to MAX_FRAMES/MAX_PROJECTS; re-issue layer ids; reset undo/redo; PNG decode
failure → blank layer. Port byte-for-byte at the JSON level (field order irrelevant, key set exact).
**Note divergence:** the injector-era `static-background` tooling generates a `v:4` archive with a shared
background layer (static-background-release.test.mjs); the checked-in canonical archive is **v3 without
background**. Decision: write v3; accept v4 on import (background → per-project background object from the
autosave schema, §4.3) so injector-era files still load.

### 4.3 Session/autosave (row 4)

Payload v3 (autosave.js:121-154): `{v:3, savedAt, pi, projects:[{name,w,h,cur,fps:12,paper:'#fff0f3',
canvasShape:'square'|'circle', background:{visible,opacity,blend,blob}, holds[], frames:[{active,layers:[{…,blob}]}]}]}`.
Restore (156-207) is **structural, never reads `payload.v`**: v1 = frame items without `layers` (upgraded to
single-layer), v2 = layered, v3 = +background. Restore rules to reproduce exactly: fresh layer ids from
`nextLayerId()`; `visible!==false`; `opacity`/`blend` defaults 1/`source-over`; decode failure → blank canvas;
empty layers → one "Layer 1"; `active` clamped; holds kept only if length == frames else all-1; `cur` clamped;
undo/redo `[]`; `backgroundActive:false`; frames fallback `[newFrame]`; outer array identity preserved
(i.html:5599-5603). Cadence: `SAVE_DELAY_MS=800` trailing debounce (autosave.js:57,225-228); flush on
visibilitychange/pagehide/beforeunload → Android `ON_STOP`; reentrancy guard; `status()` → StateFlow.
Storage: files in `filesDir/session/` (JSON + PNG files) — closer to the IDB record than Room blobs (io.md §2).
Do **not** port the `newBackground` defect (§1.3.1).

### 4.4 Brush profiles & prefs (rows 5, 7)

`brushes[]` (i.html:891-909): pencil `{size:6,op:1,hard:.95}` · ink `{14,1,.9}` · marker `{40,.85,.7}` ·
water `{48,.32,.05}` · frost `{54,.58,.12}` · smudge `{42,.62,.18}` · glow `{64,.5,.15}` · neon `{8,1,.98}` ·
star `{22,1,1}` · eraser `{40,1,.8,erase:true}`.
`DEFAULT_PROFILE` (i.html:947-963) — `{minSize,stabilize,spacing,jitter,taperIn,taperOut,entryPool,exitPool,texture,response}`:
pencil `{.18,.25,.10,.05,8,6,0,0,.65,−.3}` · ink `{.08,.08,.055,0,12,16,0,0,.10,−.20}` · marker `{.50,.32,.14,.02,6,6,0,0,.35,0}` ·
water `{.35,.38,.18,.03,12,8,0,0,.50,−.5}` · frost `{.40,.30,.11,.06,10,10,0,0,.70,0}` · smudge `{.45,.18,.07,0,4,4,0,0,.35,0}` ·
glow `{.70,.32,.10,0,0,0,0,0,0,0}` · neon `{.55,.16,.06,0,8,8,0,0,0,.1}` · star `{1.00,.08,1.40,.15,0,0,0,0,0,0,0}` ·
eraser `{1.00,.10,.12,0,0,0,0,0,0,0}` (pressure-insensitive width).
Lab slider ranges (i.html:703-715): Size 1–120 · Min 0–100% · Stabilize 0–100 · Opacity 1–100 · Hardness 0–100 ·
Spacing 2–50% → 0.02–0.5 · Jitter 0–100 · Taper in/out 0–60 px · Entry/Exit pool 0–100 · Texture 0–100 ·
Response −100..100 ÷100. Prefs: `inkframe.prefs.v1` = {color, streamline(0.45), stylusOnly, palmReject,
readableText, barrelMode('pick'), penEngineVersion(2), onion*, qsEnabled, brushId, brushPrefs, brushLibrary};
save debounce 180 ms; `PEN_ENGINE_VERSION=2` migration forces the ink profile (i.html:996-1009).

### 4.5 Brush Engine V2 pure pipeline (row 8) — constants that must match

Load/order: batch → validator → contact → stabilizer/filters → path → arc-sampler → radius → dab emission.
- `sample.js`: pressure clamp 0..1 (mouse fallback `buttons?0.5:0`), tilt ±90, twist mod 360, altitude 0..π/2 (def π/2).
- `batch.js`: `timestampTolerance 0.25`, `coordinateEpsilon 1e-4`, `pressureEpsilon 1e-5`, `maxBatchSize 256`; sort by (timeStamp,index); stale `< lastTime−0.25`.
- `validator.js`: `boundsPadding 96, minimumJump 72, speedLimitPxPerMs 8, recentStepMultiplier 8, returnRatio .30, segmentBreakMinimum 180, segmentBreakFraction .16, segmentBreakSpeedPxPerMs 14, segmentBreakStepMultiplier 12, partialReturnRatio .45`; `recentStep` EMA 0.82/0.18; `jumpLimit=max(72, recentStep*8, dt*8)`, `dt=max(1,Δt)`; isolated-spike: arm≥jumpLimit, max(ab,bc)≤arm*3, ac≤max(12,arm*.30); return: ac<bc && ac≤max(jumpLimit,ab*.45); `finish({acceptHeld:false})`.
- `contact.js` (strict): displaced-start = elapsed ≤48 ms && ab ≥18 px && bc ≤ max(6,ab*.45) && ac ≥ ab*.70; end ignores terminal sample; tap → `[start]`; short stroke → `[start,firstMove]`.
- `filters.js`: taus — pos fixed 8 / slow 18 / fast 3.5, speedStart .12, speedEnd 4, speedSmoothing 24, corner start π/10 end 0.72π tau 1.75 minSeg 0.75, pressure 12, tilt 18, angle 18, `resetGapMs 80`; `alphaForDt=clamp(1−exp(−dt/τ),0,1)`.
- `stabilizer.js`: adaptive uses exact integrator `v=(next−prev)/dt; decay=exp(−dt/max(.01,τ)); out=next−vτ+(filtered−prev+vτ)*decay`; fixed mode = endpoint EMA (rate-sensitive — keep batch order + dedupe tolerances).
- `path.js`: midpoint quadratics; `finish` emits final leg when count ≥2.
- `arc-sampler.js`: `spacingPx=max(.35,size*spacing)`, flatten tol 0.75, steps `max(2,min(96,ceil(max(chord,controlNet)/max(.25,tol))))`, finish force-emit if >0.25 px.
- `radius.js`: `minimumDeltaPx=max(.05,size*.025)`, allowance `(min+dist*.42+dt*size*.0035)*(rise 1 : fall 1.35)`, clamp min .05, bypass strokeStart/index 0/gap>80 ms.
- `rasterizer.js` profiles: ink `{14,.08,1,.055,.92,source-over,dabs,raw,raw}`; eraser `{40,1,1,.12,.82,destination-out,…}`. `resolveProfile` clamps: size≥0.1, spacing .01..2, response −1..1; eraser forces destination-out. `shapePressure`: r<0 → `p^(1+(−r*2))`; r>0 → `p+(smoothstep(p)−p)*r` (smoothstep `p²(3−2p)`).
- Ribbon: `coreRadius=max(.05,r*max(.18,h))`, `edgeAlpha=op*clamp((1−h)*.55,0,.35)`, `ribbonGapLimit=max(24,r*6,clamp(Δt,0,250)*2)`; reset on strokeStart/strokeId/brushId/composite/index 0.
- `tuning.js` presets (all `{adaptive,preserve,ribbon,guarded,strict}`): direct `25/80, comet 45/260/115, posTau 4, presTau 8, spacing .90, jump 84, speed 10`; balanced (default) `55/70, comet 65/380/130, 8, 12, 1, 72, 8`; smooth `80/55, echo 76/560/150, 15, 18, .82, 64, 7`. Clamps: strength 0..200, corner 0..100, ghost 0..100/80..1200 ms/50..250%, posTau .5..40, presTau .5..50, spacing .35..1.75, jump 24..220, speed 1..20. Store `inkframe.brushEngine.v2Tuning.v4` + v3/v2/v1 migration chain.
- **Double precision everywhere** (JS Number = IEEE-754 double); time in Double ms from `MotionEvent.eventTime`; never re-base mid-stroke; clamp `max(0/0.01/1, dt)` per path.

### 4.6 V1 stroke + dabs (rows 9, 10)

- Seat-in: `PSEAT_N=4`, seed ink 0.03 else 0.15, `smoothP=seed*.7+p*.3`, blend `k=.35+.6*(pSeat/4)` then `PSTAB .3`.
- StreamLine: `posStab=max(.08, 1−clamp01(stabilize)*.92)`; velocity `instVel=(stepPx/dtMs)*16`, `drawVel+=(instVel−drawVel)*.35`.
- `segCR`: uniform Catmull-Rom over last 4 samples; **quirk: with n=4, p3==p2 (zero outgoing tangent); mirror `2*p2−p1` only for n<4** — replicate exactly. Dab step `st=max(1, size*spacing*(1−min(.4,drawVel*.02)))`.
- Living Line (ink+pencil): `nibW+=(target−nibW)*WLAG(.35)`; `nibAng=easeAngle(nibAng,az||PEN_ANGLE(−0.5),ALAG(.22))`; `nibFlat+=(flat−nibFlat)*.25`; reveal `min(1,strokeLen/taperIn)`; `targetWidth=max(.35,size*pf)`, `pf=min+(1−min)*shapePressure(p)`; ink speed-thinning `thin=min(.68,spd*.030)`.
- Blend application: eraser → `destination-out` alpha 1; paint → `source-over`, `globalAlpha=opacity*(pencil? .45+.55*pr : 1)*rev*textureTooth(...)`; neon/star/fx → `lighter`. **Dual-write**: dabs go to active layer AND display canvas mid-stroke (eraser: layer only + `render()` per move); pen-up → `bumpFrame`, `pushU(pend)`, `render()`. Native equivalent: stroke overlay merged at commit (keep the pattern — engine.md §9.9).
- Terminals: dwell `1−drawVel/9 > .12` + exitPool → `inkPool`; fast lift `drawVel>3` + taperOut → `N=max(2,round(taperOut/(size*spacing)))` shrinking dabs along `lastAng`.
- Dab stamps (i.html:1464-1675): ink = calligraphic ellipse (`base=.30−.14*flat`, squash `base+(1−base)*|sin(ang−nibA)|`); marker = chisel `NIB=−0.7` y-scale .34 + grain bite `.45+.55*tooth` + bleed `max(0,1−spd/14)*(.30+.70*pr)`, `d*=1+.45*bleed`; water = wet-edge rim .36/mid .48/out .52 ×d + coarse grain at (x*.6,y*.6) + 6% bloom when spd<2; frost = milky body + `blur(px)` + rim arcs + 1–7 crystal scratches; smudge = pull `max(1,d*(.16+op*.55))` from behind heading into clipped blurred disc; pencil = 2–16 specks, alpha `op*(.16+.5*pr)*tooth*(.5+.5*rand)*rev*(1−.35*flat)`, tilt spread `1+2.4*flat`; neon = halo r=2.6d + core r=.35d `lighter`; star = 4+4 spoke flare + hot centre `lighter`; glow/eraser = disc (soft gradient `_bpH≤.85`, hard `>.85`).
- RNG: web uses unseeded `Math.random()` (grain build, jitter, specks, blooms, scratches) — **1:1 pixel parity is impossible**; port with a seeded `kotlin.random.Random` per document and pin goldens to that seed (§7).
- QuickShape: stillness `QS_HOLD=420` ms (moved <3 px), ≥8 pts, span ≥14 px; line err<0.42; ellipse gap<(rx+ry)*.6, err<0.5; `restoreSnap(pend)` then repaint via `seg()` (ellipse `steps=max(48,round(rx+ry))`, pressure 0.6).
- Symmetry: `dabSym` mirrors `SYM_STEPS=[1,2,4,6,8,12]` around canvas centre, rotating nib angle.

### 4.7 Compositor & blend modes (rows 2, 14)

11 modes + labels (i.html:1067-1072): source-over/Normal, multiply, screen, overlay, darken, lighten,
color-dodge/Dodge, color-burn/Burn, hard-light/Hard, soft-light/Soft, difference/Diff. Web composites
straight-alpha Canvas2D; native GLSL is premultiplied RGBA8 — implement the 4 new separable modes with
Canvas2D-spec math in straight-alpha space (un-premultiply → blend → re-premultiply) and validate with
golden pixel pairs (risk §8). Composite cache: `frameComposite` cached per frame, keyed by `_v`
(i.html:1082-1105) — port as `_v`-keyed cache. Blend application order: bottom→top, per-layer
`globalAlpha=opacity`, skip invisible/zero-alpha. Erase outside strokes: `destination-out` →
`PorterDuff.Mode.CLEAR`/`GL_ZERO` pair **on the layer surface only**, never the display target (brush.md §9.4).

### 4.8 Onion skin (rows 15, 30)

Renderer (i.html:1228-1260): depth default 2 (0–8); past `#880057` @ .34, future `#f7cac9` @ .24
(future dial auto = past×0.72); tint .5. Per distance k: `fall=k/depth`,
`fade=(1−0.45*(fall−1/depth))*reachFade`, tint amount `onionTint*fall` via `source-atop` scratch fill, drawn at
`past|futureOpacity*fade`. Scrub reach: `SCRUB_REACH=5`, extra frames softer, decay ×0.82/frame to <0.3
(i.html:1251-1256). `onionLayerOnly` = active layer only. Studio presets (onion-skin-studio.js:8-14):
Clean(1,.24,.16,.20) · Inbetween(2,.38,.28,.50) · Rough(4,.26,.20,.65) · Arc(6,.18,.14,.82) · Layer(3,.32,.24,.55,layerOnly).
Clamps: depth 0–8 int, opacity .02–.85, tint 0–1, hex lowercased; signature `'1|6|0.180|0.140|0.820|0|#112233|#445566'`.
Controls locked during active stroke ("Active stroke · controls temporarily locked").

### 4.9 Playback & tick math (row 16)

`playLoop` (i.html:3766-3791): `spf=1000/max(1,fps)`; `prog=(t−playT0)/spf` ticks; loop range
`[loopIn..loopOut]`; tick→frame via cumulative holds (`hOf`); sub-fraction `f=tick/h`. Paint: paper →
motion-blur prev at `blurAmt=clamp((fps−10)/40,0,.5)` (fps≤10→0, 24→0.35) → current alpha 1 → dissolve next at
`fade=min(1,f*1.6)` (wraps hi→lo). Playhead fraction `(tickStart(idx)+f*hOf(idx))/ticksTotal()`.
Tick math (i.html:4913-5027): `ticksTotal=Σholds`; segment widths `hOf(i)/ticksTotal`; rail seek maps x→frame
by cumulative ticks. Frame ops (i.html:3802-4015): copy/dup/del/reverse/clear/`adjustHolds`(1–8)/`setOnTwos`/
blanks/ping-pong; fps dial 1–24. Flags (global): `dissolve=true, motionBlur=true, loopOn=false, loopIn/Out=0`.
Clock: `Choreographer`/`withFrameNanos`; emit the same fraction semantics (`frameCenterFraction`,
`timePosition` EPSILON edge radial-timeline.js:133) or playhead/loop arcs drift by one frame (timeline.md §8.6).

### 4.10 Undo (row 17)

Web (i.html:1183-1227, 3617-3635): per-project stacks; `pushU` cap **40** (`shift()` drops oldest), clears
redo, calls `refreshActions`. Kinds: `pixels` (active-layer ImageData) on stroke pen-down (deferred push at
pen-up), fills, clear, selection ops, FX; `struct` (all layers' ImageData + props) on layer
add/dup/del/reorder/visibility/blend/merge/flatten/reference-import. `doUndo`/`doRedo` push a symmetric
re-snapshot of the opposite kind, `setCur(s.frame)`, `restoreSnap`. **No timing undo** (frame/hold/fps/reshape
mutations push nothing — metadata.json's "25-step timing history" refers to the radial patterns history,
§4.13). Layer-opacity dial changes are also non-undoable. A no-op fill pops its own snapshot (i.html:3106).
Native storage: full-RGBA snapshots ×40 ×4 projects can exceed 500 MB at 4096² (engine.md §9.6) → store
tile/delta or downsampled deltas with the **same semantics**; `UndoStack` capacity set to 40.

### 4.11 Persistence & archive I/O (rows 3, 18)

SAF: `CreateDocument`/`OpenDocument`; `MediaTypes` PROJECT → mime `application/x-inkframe+json`, extension
`.inkframe`, `suggestedFileName` sanitizer REUSE. Import clamp matrix identical to web (§4.2). Export writes
the whole gallery (all ≤4 projects) like `buildProjectArchive`. Legacy native ZIPs import via
`core.model.legacy` (§5.1) — a one-way "Import legacy archive" action, never re-exported as v1.

### 4.12 Export (rows 19-21)

GIF driver (i.html:5181-5440): `baseDelayCs=max(2,round(100/fps))` (5271); per-frame
`delayCs=baseDelayCs*max(1,round(holds[i]||1))` (5342-5348); pixels = paper fill + composited frame repacked
RGBA→ARGB (5217-5238); >120 MP confirm; filename `inkframe-<epoch>.gif`; saved via SAF. Container
(gif-encoder.js:314-425): GIF89a, no GCT, NETSCAPE2.0 loop, per-frame GCE (disposal 2, transparency flag),
LCT `0x80|(bpp−1)`, `minCodeSize=max(2,bpp)`, ≤255-byte sub-blocks, trailer `3B`. Quantizer: alpha ≤8 →
transparent slot 0; partial alpha → opaque; median cut on opaque only; split first strictly-largest box
(`sz>best`, best=1); axis `dr>=dg&&dr>=db→R; dg>=db→G; else B`; stable sort; split at midpoint, **splice in
place** (§1.3.3); palette = per-channel integer mean; nearest-index scan from `reserved`, earliest wins ties,
early exit exact; `bpp=max(1,ceil(log2(max(2,palette.length))))`. LZW: clear `1<<minCodeSize`, eoi +1, codeSize
starts +1, grow when `nextCode>(1<<codeSize)&&codeSize<12`, clear+reset when `nextCode>4096`, LSB-first.
Worker → coroutine `Flow` with per-frame progress-ack backpressure (rendezvous; web caps one raw frame in
flight — do not buffer all frames). MP4: replace real-time MediaRecorder with MediaCodec offline
(`Mp4Encoder` + `YuvConverter` REUSE); per-frame PTS = Σ(durationMs×hold) — **documented divergence**: output
won't duplicate/drop frames like web real-time capture (engine.md §9.5); this is the intended superset.
PNG: `flattenFrame` (paper under composite) → `Bitmap.compress(PNG)`.

### 4.13 Radial timing (rows 22-29) — decorator chain → class hierarchy

Geometry (radial-timeline.js): angles normalized (−π,π]; Ramanujan-II circumference; base radii circle
`min(cw,ch)/2+22`, square `cw/2+20 × ch/2+20`; `ringCapacity=max(12,floor(C/max(22,31)))`; gap
`max(24,32)`, ≤12 rings; slot phase `π/2+rotation+(odd ring? π/size:0)`, angle decreases clockwise; slot count
`min(120,max(12,ceil((n+1)/12)*12))` (i.html:3822); current ×1.34, selected ×1.20; capacity badge warns ≥85%
(102 frames); playhead r=6.5 pulse 5.8→8; slots 30/24 px. Timing editor: `normalizeHold=clamp(round,1..8)`;
drag 1 hold per 18 px (min 8); arc span `min(u*.82,u*(.18+h*.075))` radius +11; loop handles +22.
Patterns: `HISTORY_LIMIT=25`; PATTERNS = Ones[1], Twos[2], Threes[3], Snap[1,1,2,1], EaseIn[3,3,2,2,1,1],
EaseOut[1,1,2,2,3,3]; scope priority selection→loop→all; cyclic assignment with phase; transactions
`{patternId,label≤48,scope≤24,assignments}`; history jump = replay undo/redo steps. Recipes:
`MAX_RECIPES=24, MAX_NAME=32, MAX_ID=48, MAX_VALUES=120`, `minimalPeriod`, `valuesSignature=values.join(',')`,
overwrite on case-insensitive name match, `-2`/` 2` uniquifiers, `inkframe.radialTiming.recipes.v1` schema 1.
Variations: ≤12 phases + reverse/palindrome/pulse/compress/expand, dedupe by signature. Morph: lcm align
≤120, `a+(b−a)·mix/100` round+clamp 1..8 then canonicalize, snaps [0,25,50,75,100]. Phrases: ≤8 segments ×
repeat 1–4, compile concat ≤120, id `phrase:…`, label `' → '` join + `'×N'`. Phrase library: ≤16, stores
`{recipeId,recipeName,recipeSignature≤480,repeat}`; drift = missing/changed/renamed vs live store. Score: ≤8
sections × repeat 1–4, full compile arrangement→segments→recipes→values ≤120, id `score:…`, two-level drift.
Score library: ≤12, `arrangementSignature` = first 8 segments `recipeId:sigXrep` joined `|` (≤960).
**Cascade semantics** (replaces monkey-patch chain): Timing→Rhythm→Recipes→{Variations,Morph,Phrases}→
PhraseLibrary→Score→ScoreLibrary; child UI exists only while parent shelf is open; children force-close with
parent. Implement as one ordered delegate list (`RadialTimingModule` sealed hierarchy), each with explicit
`renderInto(parent)` — not wrappers. Write-governance flags (`timelineTimingWrites`, `deviceLibraryWrites`,
`projectCanvasWrites:0`…) become module-boundary unit tests (timeline.md §8.13). `setHold` fans out to the
selection when the target is selected (inject-radial-timeline.mjs:14). Rectangular perimeter fallback
(i.html:3863-3884) is **dropped** — radial is the only board.

### 4.14 Orb UI, panels, gestures, gallery, themes, stores (rows 31-46, 48)

- Orb metrics: orb 58 px/kid 48 px (66/56 coarse); spring `.34 s cubic-bezier(.2,.95,.25,1.1)` + 26 ms stagger;
  pad 14; radius cap `min(R, 96+26·ln(n+1)·1.618)`; arc faces away from screen center; orb drag >6 px vs tap;
  clamp 6 px from edges. Wires: quadratic curves, velocity bow, tip easing .32/.55, pulse 640 ms, dash flow
  1.3 s; `RELINK_DIST=70`; collapse button appears when anything open/pinned. 11 root nodes with anchors/kids
  exactly per ui.md §2 table (Tools/Line/Select/Color/FX/Actions/Themes/Frames/Layers/Studio/Gallery).
  Modal-exclusivity matrix: brush select force-exits Constellation/Select/Fill/Dropper; Fill exits
  Select+Constellation; Select exits Constellation (i.html:2666-2703, 3116-3125, 3463-3465).
- Gesture constants (single constants file — ui.md §8.12): long-press Brush Lab 400 ms; frame/paper long-press
  520/500 ms; QuickShape 420 ms; double-tap 330 ms <8 px; 2F/3F tap window 420 ms ≤10 px; orb drag 6 px;
  pinch `fit·0.35..2.2` min .18; PALM_SIZE 40, PALM_GRACE 900; barrel `button===2||buttons&2`; pinchBase reset
  when dropping below 2 fingers (i.html:5140); 2nd finger mid-stroke cancels touch strokes only (pen-owned
  strokes are palm-safe, i.html:5116-5119).
- Themes: 8 palettes with exact hex/stops (i.html:820-845); `readableTextFor` luminance threshold 0.35 →
  cream `#fff0f3`/78% vs ink `#1a0f16`; glass tokens (`--glass rgba(247,202,201,.12)` etc.) → Compose theme;
  **theme choice is NOT persisted — always boots theme 0** (i.html:5658; port as-is, ui.md §8.8); Graphite
  ships with a runtime-patched typo — port the corrected `#2c2e34`.
- Rail: 44 px bar (54 coarse); segments ∝ hold ticks (`.held` accented); loop handles; playhead 20 px;
  `#railCount` "3 / 12 · 2 sel"; drag pauses playback; prev/next wrap inside loop range.
- Gallery: ≤4 projects, per-project thumbs, 420 ms dive (scale .86→blur 10→1.10→1) as one `Animatable`
  sequence with `_busy` guard; project panel rows (Open/Duplicate/Scale copy/Clear/Delete + stats + autosave
  status strip); Start panel 6 templates + Blank/Import/Manager/Skip/don't-show (`inkframe.start.dismissed.v1`),
  opens only when no autosave restore, 180 ms after boot.
- Brush Lab: 13 sliders (§4.4 ranges), live preview = real `dab()` along a 64-sample sine with taper envelopes
  (i.html:2739-2785); ink-only rows disabled for non-ink brushes (2807-2816); preset library Use/Export/Del,
  `.inkbrush` JSON `{v:1,kind:'inkframe-brush-profile',app:'InkFrame Studio',…}` (i.html:2902/2945) — keep
  schema for cross-compat.
- Persisted keys to mirror (DataStore/files): `inkframe.prefs.v1`, `inkframe.start.dismissed.v1`,
  `inkframe.brushEngine.abMode.v1`, `inkframe.brushEngine.v2Tuning.v4` (+v3/v2/v1 migration),
  `inkframe.brushLab.userPresets.v1` (24 max, 4 pinned, name ≤32), `inkframe.brushLab.activeTab.v1`,
  `inkframe.brushLab.referenceReplay.auto.v1`, `inkframe.brushEngine.profileRecovery.v1`,
  `inkframe.brushEngine.profileHistory.v1`, `inkframe.radialTiming.recipes.v1`,
  `inkframe.radialTiming.phraseLibrary.v1`, `inkframe.radialTiming.scoreLibrary.v1`,
  `inkframe.ui.tabletDeck.v1`. Dev-tooling stores (recovery/history/identities) are DROP candidates with
  product sign-off (brush.md §4); schema kept if shipped.
- Z-order ladder (17 levels, ui.md §4): map each to a distinct full-screen Compose slot (bg 0-3 < stage 10 <
  glint 12 < frameBoard 13 < wires 18/19 < nodes 20/30 < pins 21 < lens 23 < collapse 24 < hint 40 < studio 45 <
  projectPanel 46 < startPanel 47 < expo 60 < help 64 < blab 65 < stylusPanel 66).
- Web-only semantics to re-express, not translate: `<input type=color>` → custom HSV picker; `prompt()`/
  `confirm()` → Compose dialogs; drag-drop image → `Modifier.dragAndDropTarget`; keyboard arrows/Esc →
  `onKeyEvent` (low priority); fullscreen → immersive sticky.

---

## 5. Critical conflicts & resolutions

### 5.1 `.inkframe` format collision — web JSON v3 vs native ZIP v1
- **Web** (`buildProjectArchive` i.html:4516-4526): single uncompressed JSON, `{v:3, kind:'inkframe-web-archive'}`,
  MIME `application/x-inkframe+json`, whole gallery, layers as inline PNG data-URLs.
- **Native** (`ProjectPackage.kt`, `ProjectCodec.kt` `FORMAT_VERSION=1`): ZIP = `document.json`
  (`format:"inkframe-project"`) + `cels/<surfaceId>.png`, single project, MIME `application/zip`.
  Mutually unreadable both directions.
- **Resolution:** web v3 wins. The native app **writes only** the v3 JSON archive. The ZIP codec moves to
  `core.model.legacy` (KEEP-ISOLATED) as an import-only path; `MediaTypes` PROJECT mime switches to
  `application/x-inkframe+json`; SAF open accepts both mimes and sniffs content (`{` vs `PK\x03\x04`).
- **Migration path:** beta users holding native ZIPs get an explicit "Import legacy archive" action
  (ZIP → web model: each Scene layer's cels → per-frame layers by materializing holds; sparse-cel exposure →
  `holds[]` computed from cel gaps; transforms flattened into pixels; `locked`/scenes/palette dropped with a
  one-time notice). No automatic in-place conversion of files on disk; nothing is ever written back as v1.

### 5.2 Document model — frame-local layers + holds vs Scenes + sparse cels
- **Web** (i.html:1061-1182): `Project{frames:[Frame{layers[],active}], holds[1..8], cur, undo, redo, w,h,fps=12,name,paper}`;
  layers are **frame-local**; `holds[i]` explicit exposure (`hOf` floors at 1, i.html:1227); gallery ≤4 × ≤120.
- **Native** (`Scene.kt`, `Project.kt`): `Project→Scene→Layer→cels:Map<Int,Cel>`; layers span the whole
  timeline; missing cel = implicit hold (`Layer.celAt`); extras: scenes, UUIDs, locked, cel transforms,
  playbackRange/loop, palette.
- **Resolution:** REPLACE core-model with the web shape (§4.1). Frame-local layers and explicit holds are the
  only model; scenes/transforms/locked/playbackRange are dropped (playback loop state becomes the web's global
  `loopOn/loopIn/loopOut`). Gallery caps 4×120 enforced in the model layer.
- **Migration path:** legacy-import conversion as in §5.1 (materialize cel exposures into holds; split
  timeline-spanning layers into per-frame stacks). `InkFrameDefaults` + proguard keeps stay valid (same package).

### 5.3 Blend modes — 11 vs 8 (+native-only ADD)
- **Web** (i.html:1067-1072): 11 Canvas2D `globalCompositeOperation` strings persisted per layer:
  source-over, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference.
- **Native** (`BlendMode` in `Scene.kt`, `composite.frag` `uBlend`): NORMAL, MULTIPLY, SCREEN, OVERLAY, ADD,
  DARKEN, LIGHTEN, DIFFERENCE — has ADD (web lacks), lacks the 4 separable modes.
- **Resolution:** new 11-value enum keyed by the exact Canvas2D strings (file compat). Add 4 GLSL separable
  shaders with straight-alpha Canvas2D semantics (§4.7). ADD leaves the parity path (keep the shader as an
  undocumented internal extra or delete; web archives can never reference it).
- **Migration path:** legacy ZIPs using ADD map to source-over with a notice (only reachable via §5.1 import).

### 5.4 Brushes — 10 presets + Engine V2 vs 6 kinds
- **Web:** 10 presets with 13-field profiles (§4.4) rendered by the v1 `dab()` engine (i.html:1464-1675) +
  Brush Engine V2 pipeline for pen ink/eraser (adapter.js:10 `SUPPORTED={'ink','eraser'}`; v2 default-on in
  Android variants). Per-brush prefs in `inkframe.prefs.v1`.
- **Native** (`Brush.kt`): 6 kinds (ROUND/PENCIL/INK/AIRBRUSH/ERASER/MARKER), soft round point sprites, no
  textured/shaped dabs, no tilt, no smudge/glow/star/water/frost, no coverage/radius/contact modes.
- **Resolution:** REPLACE `Brush`/`BrushKind` with `BrushId`(10)+`BrushProfile`(13) + V2 `BrushProfile`
  (size/minSize/opacity/spacing/hardness/composite/coverage/radiusMode/contactMode/response). Port the v1
  rasterizers and the v2 pipeline 1:1 (§4.5, §4.6); `BrushAdjustments` clamp pattern re-expressed on the new
  profile. V2 handles pen ink/eraser only; the other 8 brushes and all touch/mouse input go through the ported
  v1 engine — same routing as `shouldHandle` (adapter.js:89-93: mode v2 && ink|eraser && pointerType pen).
- **Migration path:** none needed (brushes are presets, not documents); legacy `DefaultBrushes` deleted.

### 5.5 Undo — 40-deep pixels+struct snapshots vs stroke-only engine commands
- **Web** (i.html:1183-1227, 3617-3635): per-project stacks, cap 40, kinds `pixels`/`struct`, symmetric
  re-snapshot on undo/redo, covers structure; **no timing undo**; layer-opacity dial not undoable.
- **Native** (`UndoStack`, `StrokeCommand`): engine-level dirty-rect commands for strokes + fills only,
  capacity 200; structural edits (layer/timeline ops) not undoable.
- **Resolution:** adopt web semantics exactly (cap 40, both kinds, symmetric re-snap, same non-undoable set)
  in a new `SnapshotUndoStore` (feature-canvas) built on the kept `UndoStack`. Storage adapts to tiles/deltas
  to fit mobile memory (§4.10) — semantics, not layout, are the parity surface. Engine `StrokeCommand`
  remains as the GL-side mechanism feeding `pixels` snapshots.
- **Migration path:** none (undo is session-only; both sides reset undo on load — autosave.js:190-200).

### 5.6 Module wiring — injector load-order decorator chains vs class hierarchy
- **Web:** brush-engine-v2, radial-timing (10 modules), onion-studio, workspaces, feedback, creator-statement,
  canvas-shape exist only via `tools/inject-*.mjs`; radial modules form a monkey-patch decorator chain on
  `InkFrameRadialTimeline.render` (inject-radial-timeline.mjs:9 order is test-enforced); session.js /
  ghost-runtime.js wrap adapter methods; autosave wraps `pushU`/`setCur` (i.html:5617-5625); visibility
  cascades Timing→Rhythm→Recipes→…→ScoreLibrary with parent-absent force-close (timeline.md §1).
- **Native:** no such concept; previous rewrite never had these features.
- **Resolution:** port as explicit Kotlin constructs: `RadialTimingModule` ordered delegate list (one
  `renderInto` pass per module, cascade encoded in the list); brush engine exposes `onDab`/session hooks as
  constructor-injected listeners (session continuity, ghost feed); autosave hooks via a mutation
  `SharedFlow` from the document controller instead of function wrapping. Write-governance flags become
  module-boundary tests.
- **Migration path:** n/a — but the cascade/order tests (§7) are mandatory before M6 exit.

### 5.7 GIF byte parity — Kotlin quantizer diverges from web JS
- **Web** (gif-encoder.js:241): median-cut box split **splices** `left,right` in place of the target box.
- **Native** (`MedianCutQuantizer.kt:88`): `boxes.remove(box); boxes.add(left); boxes.add(right)` — appends.
  Proven divergence on noisy/flat images (§1.3.3); identical only on tie-free gradients.
- **Resolution:** fix Kotlin to splice-in-place (one line); web JS order is canonical (it is what shipped in
  WebView builds). Then pin cross-language goldens: fixed ARGB frames → identical SHA-256 from Node-JS and
  Kotlin-JVM encoders (§7 tier 0). Re-verify after any quantizer change; both sorts are stable, alpha
  threshold 8, bpp floors, and LZW growth/clear conditions are otherwise line-equivalent.
- **Migration path:** none (exports are new files); CHANGELOG notes restored parity.

---

## 6. Milestones

Branch `native/port`; each milestone lands green (CI `compileReleaseKotlin test` + new parity tests),
updates CHANGELOG, and keeps `native-boundary` clean. LOC = web LOC covered by the milestone.

### M1 — Foundation: web-v3 document model + codec (~610 LOC)
- **Scope:** rows 1-5. New `core-model` web document shape (Project/Frame/Layer/Gallery/Caps/templates,
  BlendMode 11), `WebArchiveCodec` (v3 write + lenient import incl. v4-background acceptance), session
  payload + migrator (v1/v2/v3 structural), prefs schema; legacy codec isolated under `core.model.legacy`.
- **Modules touched:** core-model (REPLACE), core-common (Json REUSE), legacy move; delete Scene/Project/Brush/
  LayerOps/TimelineOps classes + their 17 tests (rewritten).
- **Exit criteria:** golden `.inkframe` fixtures exported from the web build decode → re-encode → deep-equal;
  import matrix (legacy `project`, `png|dataUrl|data`, clamps 4×120, decode-failure→blank, holds-length
  fallback, `backgroundActive:false`); session migrator vectors; caps enforced; `native-boundary` green.
- **LOC covered:** ~610 (i.html:1061-1227 ~170, archive 4464-4835 ~185, autosave.js 257).

### M2 — Brush core (~3,050 LOC)
- **Scope:** rows 6-12, 35(barrel)/45(prefs hooks). Port brush-math; V2 pure pipeline (12 files) into
  core-common.brush; V1 stroke math + 10 dab rasterizers (CPU twin for goldens); GL dab painters; ghost
  trail; tuning presets/stores; stylus input bridge (MotionEvent→samples incl. AXIS_TILT/ORIENTATION→
  azimuth/flatness); v1/v2 routing (`shouldHandle` = pen && ink|eraser).
- **Modules touched:** core-common (+~2,000 LOC), core-model (brush profiles), engine-gl (brush renderers,
  StrokeProcessor tilt), feature-canvas (input bridge, stroke controller), app debug (trace recorder re-point).
- **Exit criteria:** JUnit ports of the 29 brush-engine-v2 test files pass with identical vectors; seeded
  stroke goldens per brush (CPU rasterizer vs web-captured bitmaps, tolerance = 1 LSB/channel on AA edges);
  v2 pipeline dab-sequence equality vs JS on recorded traces (`parseTrace` fixtures); ghost-trail default-ON
  comet via balanced preset; CHANGELOG.
- **LOC covered:** ~3,050 (brush-engine-v2 pure ~1,900 + brush-math 127 + i.html stroke/dab ~900 + profiles ~120).

### M3 — Compositor / timeline / undo (~1,160 LOC)
- **Scope:** rows 13-17, 36-38, 41. 11-mode compositor (4 new separable shaders, straight-alpha math);
  frame `_v`-keyed composite cache; onion renderer (tint/falloff/reach); playback controller (ticks,
  dissolve, motion blur, loop range); frame ops (dup/del/reverse/ping-pong/holds/on-twos); layer ops;
  selection engine; FX engine; eyedropper/fill; compare split; `SnapshotUndoStore` (cap 40, tiled storage).
- **Modules touched:** engine-gl (Compositor, onion/playback passes), core-model (TimelineOps/PlaybackOps/
  OnionSkin rewritten), feature-canvas (doc controller, undo store, selection/FX).
- **Exit criteria:** blend goldens (11 modes × pixel pairs vs Canvas2D references); tick-math tests
  (`ticksTotal/tickStart/frameAtFrac`, blurAmt ramp, dissolve f×1.6); onion vectors from onion-skin-studio
  tests; undo behavior tests (cap, symmetric, kinds, no-timing-undo assertion); flood-fill/eyedropper reuse
  tests green; memory bound test (tiled undo < fixed budget at 120 frames).
- **LOC covered:** ~1,160.

### M4 — Persistence + export (~450 LOC + reused encoder)
- **Scope:** rows 18-21, 39-40. **GIF parity fix lands first** (MedianCutQuantizer.kt:88 splice, §5.7).
  SAF archive I/O; `AutosaveScheduler` (800 ms debounce, ON_STOP flush, filesDir store); legacy-ZIP import
  action (§5.1); `GifExportSession` (Flow, progress-ack backpressure, >120 MP confirm); MP4 offline
  (PTS from holds); PNG export; circular-canvas geometry + mask.
- **Modules touched:** core-common (quantizer fix), core-model (MediaTypes mime), feature-canvas (io/export/
  session/shape), engine-gl (GlCelImageIO re-key).
- **Exit criteria:** **GIF byte goldens**: SHA-256 equality Node-JS vs Kotlin on ≥4 fixed frame sets
  (gradient/noisy/flat/transparent); delay math tests; archive round-trip via SAF-less streams; autosave
  lifecycle test (mutation→800 ms→flush; ON_STOP→flushNow; restore matrix); canvas-shape vectors (ε 1e-7,
  boundary pointerup, destination-in mask); recovery controller writes session v3.
- **LOC covered:** ~450 (+500 gif-encoder.js reused as spec).

### M5 — Orb UI + gestures (~2,500 LOC)
- **Scope:** rows 31-35, 40, 42-43, 47 + panels. Compose orb system (nodes, fan layout, wires, pins,
  collapse), 11 nodes + all kids/actions/dials, Brush Lab (13 sliders + live preview + presets + .inkbrush),
  timeline rail, panels (Studio/Projects/Start/Help/Export/Stylus), themes ×8 + readable text, hint toast,
  gesture detector suite, canvas stage + resize handles, lens/glint/predicted overlays. Delete
  `StudioScreen.kt`, both GlassHorizon screens, app debug WebView telemetry.
- **Modules touched:** feature-canvas (ui.*, CanvasView rewiring), app (MainActivity host, creator statement
  lands), core-model (MediaTypes reuse).
- **Exit criteria:** orb geometry tests (arc solve, φ-cap, stagger, RELINK_DIST 70); boot-smoke structural
  contracts re-expressed as Compose semantics tests (11 nodes, dial ranges, labels, ≥6 templates); gesture
  constant tests; theme hex/luminance tests (Graphite `#2c2e34`); Brush Lab range + ink-row-disable tests;
  registry updated (orb UI rows → implemented_unverified→verified per owner review).
- **LOC covered:** ~2,500.

### M6 — Radial timing + polish + acceptance (~3,740 LOC)
- **Scope:** rows 22-30, 44-46, 48-49. `RadialGeometry` + radial board; timing editor; patterns + 25-deep
  timing history; recipes/variations/morph/phrases/score + 3 persistent stores (caps 24/16/12, schema 1);
  onion studio sheet; tablet deck + layer/timeline workspaces; feedback report; creator statement
  byte-exact; DataStore stores incl. tuning v1→v4 migration; version single-source decision executed.
- **Modules touched:** core-common.timing, core-model.timing, feature-canvas (ui.timeline, ui.workspace,
  deck, feedback), app (statement), gradle props/BuildConfig.
- **Exit criteria:** all 20 radial-timing test files' vectors pass as JUnit; cascade semantics test (parent
  absent ⇒ child closed; ordered delegate list); store caps/drift/uniquifier vectors; feedback redaction +
  layout regex tests (zero-write counters as invariants); workspace normalizer vectors; write-governance
  module-boundary tests; full acceptance pass vs pinned web build (side-by-side script); CHANGELOG +
  FEATURE_PARITY_REGISTRY refresh; owner visual approval per repo policy.
- **LOC covered:** ~3,740.

---

## 7. Parity test plan

**Principle:** `web/tests/*.mjs` (74 files, 6,713 LOC) is the parity spec. Pure vm-level tests translate
mechanically to JUnit with identical inputs/outputs; jsdom `-boot`/injector `-release` tests are re-expressed
as Compose/ViewModel/module-boundary tests; byte-level behaviors get generated goldens.

### Tier 0 — byte goldens (generated from the web build)
- **GIF byte parity:** harness `tools/` style Node script runs `gif-encoder.js` on fixed ARGB frame sets
  (smooth gradient, noisy, two-flat-color, with-transparency, 64×64/80×60/50×50 as in io.md §3.99) →
  bytes checked into `core-common/src/test/resources/golden/gif/`; JUnit asserts SHA-256 equality post-fix.
- **`.inkframe` v3 fixtures:** export 3 archives from the pinned web build (empty single project; multi-layer
  holds>1; gallery ×3 with blends/papers/fps variants) → golden files; Kotlin decode→encode round-trip
  deep-equality + lenient-import matrix fixtures (hand-built legacy `project`, `png|dataUrl|data`, >4
  projects/>120 frames, truncated PNG).
- **Session payload fixtures:** synthetic v1 (frame blobs) / v2 (layered) / v3 (+background) payloads →
  migrator restore matrix (§4.3 rules asserted one-by-one).
- **PNG bytes are never asserted** (Android `Bitmap.compress` ≠ canvas.toBlob) — assert pixels (io.md §9.2).

### Tier 1 — pure-logic JUnit ports (mechanical)
- brush-engine-v2: core, batch, contact, corner, coverage, discontinuity, radius, session, stabilizer,
  tuning, ab, runtime, user-presets (from 29 files; boot/DOM parts excluded).
- radial: radial-timeline math vectors; all radial-timing-* (editor/patterns/recipes/variations/morph/
  phrases/phrase-library/score/score-library) constants, clamps, canonicalization, signatures, drift.
- onion-skin-studio (normalize/presets/signature), layer-workspace + timeline-workspace normalizers,
  tablet-deck normalize/prefs, feedback sanitize/normalize/report regex, canvas-shape geometry.
- flood-fill / LZW / quantizer: existing Kotlin tests stay; add the JS-derived vectors.

### Tier 2 — seeded golden bitmaps (CPU rasterizer twin)
- Seeded `Random(42)`-equivalent injected into the ported grain/jitter/speck/bloom/scratch call sites
  (web `Math.random` call sites enumerated in engine.md §9.1); per-brush stroke scripts (fixed sample
  sequences incl. pressure/velocity curves) → CPU `DabPainter` bitmaps vs web-captured references;
  tolerance: exact on hard dabs, ≤1 LSB/channel on AA/blur edges.
- Blend-mode goldens: 11 modes × canonical opaque/translucent pixel pairs (straight-alpha reference
  computed per Canvas2D spec) for the GLSL shaders (run via CPU reference implementation of the same math
  on JVM; device spot-checks later).
- Onion tint/falloff, ghost-trail envelope (comet 65/380/130 default), QuickShape fits, FX pixel loops.

### Tier 3 — contract re-expression (Compose/ViewModel/module tests)
- boot-smoke structural: 11 nodes present, kid labels, dial ranges (Size 1–120 … Response ±100), frame batch
  labels (`+4,H+,Twos,Rev,Ping,All,None`), onion labels (`O·Depth,Ghost,Tint,O·Lay,Past,Future`), ≥6
  templates, cap badge `n / 120`, studio backup/version nodes.
- Cascade semantics (radial shelves), write-governance flags, stroke guards ("Finish the active stroke…"),
  feedback privacy counters (storageWrites 0 etc.), prefs round-trips, tuning v1→v4 migration.
- Gesture windows as parameter tests (420/330 ms, 10/8/6 px, palm 40 px/900 ms).

### Fixture pipeline
`tools/` gains `export-web-goldens.mjs` (Node; jsdom boot of the pinned injected index.html with a seeded
`Math.random` shim; drives strokes/exports; writes `*.golden.json/png/gif/sha256`). Goldens are regenerated
only via this script and diff-reviewed — never hand-edited.

### Broken / stale web tests — fix or retire consciously
| Test | Status on main | Action |
|---|---|---|
| version-smoke.mjs (Gradle `webMetadataString/Int` assertions) | **FAILS (2)** | Update: single source = `gradle/inkframe-app.properties`; keep packageName/minSdk assertions; run in port CI |
| feedback-report-release.test.mjs (MainActivity bridge functions) | stale (WebView era) | Retire bridge assertions; keep redaction/order/contract parts as tier-1/3 |
| Any WebView-wrapper packaging assertions in release tests | stale | Retire (native-boundary CI already forbids WebView) |
| Web test suite not in CI | un-wired | Wire `node` job for the kept suite on `native/port` (offline runner) |
| boot-smoke.mjs | passes | Keep as web-build smoke; mirror as Compose semantics tests |
| android-branding.test.mjs | passes | Keep (pins native branding/Splash contract) |
| Autosave `newBackground` env defect (i.html:5589-5609) | silently broken upstream | Do not port; cover v3 background schema with tier-0/1 tests (§1.3.1) |

---

## 8. Risk register

Merged + deduplicated from all six audits; ranked by (impact × likelihood). S/L = severity/likelihood H/M/L.

| # | Risk | S | L | Mitigation |
|---|---|---|---|---|
| 1 | **Double vs Float rendering drift.** JS Number = IEEE-754 double; width/angle inertia (WLAG .35, ALAG .22), CR spline, adaptive integrator, EMAs accumulate error in Float. | H | H | `Double` everywhere in the stroke/timing pipelines (never Float); convert to pixels only at raster; transcendental <1 ulp cross-platform differences accepted (documented); golden tolerance ≤1 LSB. |
| 2 | **Time-base conversion.** Web DOMHighResTimeStamp (ms, double, monotonic) vs `MotionEvent.eventTime` (ms-since-boot Long). | H | M | Convert once at the input seam to Double ms; never re-base mid-stroke; preserve `fallbackTime` behavior; dt clamps `max(0/0.01/1, Δt)` per path; validator regression >0.25 ms. |
| 3 | **GL blend fidelity vs Canvas2D.** 4 new separable modes; premultiplied GL vs straight-alpha web; clamping/gamma differences (color-dodge/burn especially). | H | M | Implement in straight-alpha space (un-premultiply→blend→re-premultiply); tier-2 golden pixel-pair tests per mode; CPU reference implementation shared between tests and shader docs. |
| 4 | **destination-out → CLEAR correctness.** Eraser on layer surface only (offscreen), never display target; alpha-rounding changes edge pixels. | H | M | Eraser = `GL_ZERO`-source / `PorterDuff.Mode.CLEAR` on the layer FBO/bitmap via saveLayer-equivalent; eraser goldens; engine keeps subtract path `dst.a*(1−src.a)` proof (`StrokeBlendMathTest`). |
| 5 | **Load-order decorator chain → class hierarchy.** 9 radial modules + session/ghost/autosave wrappers rely on JS patch order; wrong port order silently drops features. | H | M | One ordered delegate list per chain (§5.6); cascade/force-close tests; write-governance module-boundary tests; no runtime patching anywhere. |
| 6 | **Format migration of user saves.** `.inkframe` collision strands beta ZIPs or silently mis-imports; injector-era v4 files exist. | H | M | §5.1: v3-only writer, legacy import action, content sniffing, v4-background import; migration notice; no auto-conversion of on-disk files. |
| 7 | **Resource caps / OOM.** 120 frames × frame-local layers × 4096² ARGB; undo 40 × full snapshots × 4 projects (>500 MB). | H | M | Enforce 4×120 caps + MAXDIM 4096 at model boundary; tiled/delta undo store with memory-budget test; autosave writes one project graph at a time; export caps one raw frame in flight (progress-ack). |
| 8 | **Ghost trail default-ON.** Balanced preset ships comet trail ON (65/380/130); dropping it changes shipped feel; porting it adds an overlay pass. | M | H | Port envelope/gap math + overlay (§4.5/row 12); only droppable with explicit product sign-off; tier-2 envelope goldens. |
| 9 | **Brush parity scope.** 8 of 10 brushes are v1 index.html code (most of visible character); 38-module v2 suite incl. Lab/coach/identities is the single largest work item. | H | H | M2 dedicated; seeded goldens per brush; dev-tooling chain (coach/identities/recovery/history/preview) consciously DROPped per brush.md §4 with sign-off; `shouldHandle` routing preserved. |
| 10 | **Pinned-target ambiguity.** Checked-in index.html ≠ shipped behavior (injectors); "web app" must be one configuration. | H | M | Pin = release injection (§0 header); rectangular board fallback + v1-only mode explicitly out of scope; recorded in CHANGELOG + this doc. |
| 11 | **Premultiplied-alpha round-trip loss.** Web ImageData straight-alpha; Android Bitmap premultiplied → undo/fill/FX low-alpha drift. | M | H | IntArray (explicit ARGB) pipelines for undo/fill/FX; avoid Bitmap round-trips in the snapshot store; tier-0/2 low-alpha fixtures. |
| 12 | **RNG nondeterminism.** Grain field + jitter/specks/blooms/scratches use unseeded `Math.random()`; exact pixel parity impossible. | M | H | Seeded per-document `kotlin.random.Random`; goldens pinned to seed; document that web-vs-native strokes are statistically, not bitwise, identical. |
| 13 | **segCR tangent quirk.** p3==p2 for n=4; mirror only n<4 — curves diverge subtly if "fixed". | M | M | Replicate exactly (§4.6); curve goldens. |
| 14 | **GIF golden churn after quantizer fix.** Fixing box order changes bytes vs old native exports. | M | M | Fix lands first in M4 before any golden is pinned (§5.7); CHANGELOG notes parity restoration. |
| 15 | **Rate-sensitive paths.** Fixed-stabilizer mode is endpoint-EMA (rate-sensitive); 80 ms reset gaps (filters/radius); 48 ms contact settle; coalesced-batch order + dedupe tolerances. | M | M | Preserve historical-batch order and tolerances (0.25 ms/1e-4 px/1e-5); map `getCoalescedEvents`→MotionEvent history 1:1; no synthetic gaps under load (event delivery on UI thread only). |
| 16 | **Version single-source drift.** web 0.4.0/targetSdk 35 vs app 0.5.0-native-mainline1/36; version-smoke fails. | M | H | Decision executed in M6: gradle props is source; web metadata.json regenerated for injectors; version-smoke updated and wired into CI (§7). |
| 17 | **Web test suite un-wired from CI.** 6,713 LOC of parity spec rots if unused. | M | H | Wire kept web tests into `native/port` CI job; JUnit ports gate every milestone exit (§6). |
| 18 | **History loss.** Squashed main; pre-squash Gradle web-asset wiring unrecoverable; recovery SHAs in MAINLINE_KOTLIN_MIGRATION.md absent locally. | M | M | Do not depend on pre-squash artifacts; `inkframe-v0.1.1-agent.bundle` retained read-only as the last WebView reference; fetch from origin before citing recovery SHAs. |
| 19 | **Working-tree breakage.** settings.gradle.kts/gradle.properties/gradlew deleted in this checkout → local builds fail. | M | M | `git checkout -- <files>` first; CI unaffected; note in contributor docs. |
| 20 | **Init-order/hoisting semantics.** JS relies on TDZ stubs (`hOf`, `refreshLayers`), post-boot `pushU`/`setCur` wrapping; layer ops assume `frames[cur]` non-null. | M | M | Explicit initialization graph in the document controller; mutation hooks as `SharedFlow`; no null-frame states by construction. |
| 21 | **Toolchain drift.** Kotlin 1.9.24 (EOL) + AGP 8.5.2 vs compileSdk 36/34 split. | L | M | Do not bump toolchains during the port; schedule separately after M6. |
| 22 | **Pointer quirks per device.** Barrel button delivery varies (S-Pen); `arc(…,0,7)` & negative drawImage relied upon; MotionEvent axis variance. | L | M | Barrel = `button 2 || buttons&2` mapping + BARREL_MODES default 'pick'; Skia handles >2π arcs/negative rects (verify on CPU twin); keep stylus diagnostics panel during bring-up. |
| 23 | **Glass Horizon contract vs 1:1 web behavior.** `docs/GLASS_HORIZON_VISUAL_CONTRACT.md` is binding; where the web UI and the contract differ, one must win. | M | L | The web orb UI *is* the Glass Horizon design (same design language, themes, geometry); treat the contract as the visual acceptance bar at M5/M6 owner review; flag any divergence explicitly rather than improvising. |
| 24 | **Repo policy gates.** Artifact lock (no APK/AAB from main until owner approval); no StudioScreen/WebView references; offline-first/no analytics. | M | L | Port lands on `native/port`; no artifacts; `native-boundary` greps stay green; zero network deps added; CHANGELOG per milestone. |

---

## 9. Appendix: web file → classification quick table

Every file under `web/` @ `934f7ec` (LOC via `wc -l`). P=PORT 1:1 · A=ADAPT · R=REUSE · D=DROP.

| File | LOC | Class | Note |
|---|---|---|---|
| `index.html` | 5,663 | P (engine/UI) | Split per §4 rows 1-5,7,9-10,13-21,31-43,47; CSS → Compose theme tokens |
| `autosave.js` | 257 | A | Session v3 schema/migration/cadence → files + coroutines; fix env defect |
| `brush-math.js` | 127 | P | → core-common.brush `BrushMath` |
| `canvas-shape.js` | 120 | P geom / A UI | Injected-only; geometry ε 1e-7 ports verbatim |
| `creator-statement.js` | 63 | P content | Byte-exact strings → strings.xml + card |
| `feedback-report.js` | 216 | P core / A shell | Redaction + report layout port; bridges → ClipboardManager/MediaStore |
| `flood-fill.js` | 150 | R (D as source) | JS is a 1:1 port of existing `FloodFill.kt` — keep Kotlin, JS is spec |
| `gif-encoder.js` | 500 | R (D as source) | JS is a 1:1 port of existing Kotlin gif/* — spec + golden generator |
| `gif_encoder_demo.gif` | 3,923 B | D | Unreferenced sample artifact |
| `layer-workspace.js` | 153 | A (+P normalizer) | Commands → ViewModel intents on layer repository |
| `manifest.webmanifest` | 27 | D | Superseded by AndroidManifest (native branding pinned by tests) |
| `metadata.json` | 12 | A | Version contract moves to gradle props; keep for injectors |
| `onion-skin-studio.js` | 162 | A (+P data) | DEFAULTS/PRESETS/normalizer port; panel → Compose sheet |
| `package.json` | 15 | D | Web tooling |
| `radial-timeline.js` | 610 | P math / A render | Geometry → core-common.timing `RadialGeometry`; board → Compose |
| `radial-timing-editor.js` | 310 | P math / A UI | Hold arcs/drag/loop handles |
| `radial-timing-patterns.js` | 296 | P | 6 patterns, scope engine, 25-deep timing undo |
| `radial-timing-recipes.js` | 228 | P | Store + canonicalization math; DataStore backend |
| `radial-timing-variations.js` | 210 | P | Deterministic transforms |
| `radial-timing-morph.js` | 186 | P | LCM blend |
| `radial-timing-phrases.js` | 219 | P compiler / A UI | ≤8 segments × repeat 4 |
| `radial-timing-phrase-library.js` | 238 | P | ≤16 store + drift detection |
| `radial-timing-score.js` | 305 | P compiler / A UI | ≤8 sections × repeat 4, two-level resolve |
| `radial-timing-score-library.js` | 290 | P | ≤12 store + two-level drift |
| `tablet-command-deck.js` | 207 | A | Deck → Compose panel + ViewModel; normalizer ports |
| `timeline-workspace.js` | 139 | A (+P normalizer) | 12 commands → timeline repository intents |
| `vite.config.js` | 11 | D | Web tooling |
| `brush-engine-v2/sample.js` | 58 | P | → core-common.brush `BrushSample` |
| `brush-engine-v2/batch.js` | 200 | P | → `InputBatchNormalizer` (MotionEvent history seam ~10 LOC adapted) |
| `brush-engine-v2/validator.js` | 235 | P | → `SampleValidator` (exact constants §4.5) |
| `brush-engine-v2/contact.js` | 136 | P | → `ContactBoundaryGuard` |
| `brush-engine-v2/stabilizer.js` | 251 | P | → `PositionStabilizer` (exact integrator, Double) |
| `brush-engine-v2/filters.js` | 169 | P | → `StrokeFilter` |
| `brush-engine-v2/path.js` | 72 | P | → `QuadraticPathBuilder` |
| `brush-engine-v2/arc-sampler.js` | 86 | P | → `ArcSampler` |
| `brush-engine-v2/radius.js` | 91 | P | → `RadiusContinuityGuard` |
| `brush-engine-v2/engine.js` | 246 | P | → `BrushEngine` (dab output contract) |
| `brush-engine-v2/tuning.js` | 313 | P | → `BrushTuning`/`TuningMapper` (storage seam → DataStore) |
| `brush-engine-v2/rasterizer.js` | 229 | A | Profile/dab math P verbatim; `paint*` → engine-gl `DabPainter`s |
| `brush-engine-v2/trace.js` | 60 | P core / D tooling | Recorder + `parseTrace` kept for golden-stroke QA; replay UI dropped |
| `brush-engine-v2/adapter.js` | 532 | A | Lifecycle/env/mode glue ports; DOM panel + trace file UI dropped |
| `brush-engine-v2/input.js` | 181 | A | → `StylusInputBridge`; diagnostics ring dropped |
| `brush-engine-v2/session.js` | 144 | A | → lifecycle continuity on cancel/visibility/focus |
| `brush-engine-v2/ghost-trail.js` | 283 | A | Shipping feature (default-ON): math P, overlay render rewritten |
| `brush-engine-v2/ghost-runtime.js` | 46 | A | Fold into engine `onDab` hook |
| `brush-engine-v2/runtime.js` | 126 | A→D | Build-variant policy → `BuildConfig.DEBUG`; compact recorder ~20 LOC if trace kept |
| `brush-engine-v2/native.js` | 87 | D | Debug WebView bridge; meaningless natively |
| `brush-engine-v2/user-presets.js` | 152 | A | Store logic P; DataStore backend (24/4/32 bounds) |
| `brush-engine-v2/coverage-ui.js` | 149 | D | DOM lab controls → rebuilt in ui.brushlab if Lab v2 ships |
| `brush-engine-v2/stabilizer-ui.js` | 135 | D | same |
| `brush-engine-v2/ghost-ui.js` | 90 | D | same |
| `brush-engine-v2/lab-ui.js` | 240 | D | same (tab shell regroups rows) |
| `brush-engine-v2/preset-ui.js` | 137 | D | same |
| `brush-engine-v2/preview-pad.js` | 392 | D | Dev/preview tooling |
| `brush-engine-v2/preview-compare.js` | 107 | D | Dev tooling (+ dynamic loader chain) |
| `brush-engine-v2/preview-replay.js` | 331 | D | Dev tooling |
| `brush-engine-v2/brush-coach.js` | 58 | D | Recommendation UX |
| `brush-engine-v2/coach-session.js` | 70 | D | same |
| `brush-engine-v2/calibration-report.js` | 79 | D | same |
| `brush-engine-v2/profile-recovery.js` | 80 | D | Profile lock UX (schema noted §4.14) |
| `brush-engine-v2/profile-recovery-observer.js` | 17 | D | MutationObserver watcher |
| `brush-engine-v2/profile-identities.js` | 44 | D (data noted) | 6 curated identities — portable data if feature ships |
| `brush-engine-v2/identity-mixer.js` | 59 | D | Tuning lerp UX |
| `brush-engine-v2/brush-match.js` | 53 | D | Match UX |
| `brush-engine-v2/brush-signature.js` | 46 | D | Signature UX |
| `brush-engine-v2/profile-history.js` | 71 | D | History UX |
| `tests/` (74 `.mjs` files) | 6,713 | A | Parity spec — mined per §7; not ported as code |

**Totals:** web root 10,714 LOC · brush-engine-v2 5,855 · tests 6,713. Port net: ~5,200 LOC PORT 1:1,
~2,100 ADAPT, ~3,400 DROP (dev tooling + web shell), 650 REUSE-as-spec (flood-fill + gif-encoder);
index.html splits across all categories per §4 rows.

---
*End of PORT_MAP. Generated from output/audit/{native,engine,brush,ui,timeline,io}.md against repo @ 934f7ec. Line citations verified on main.*
