# Changelog

All notable changes to InkFrame Studio are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
semantic versioning once it reaches a public release.

## [Unreleased]

### Added (playback range & frame rate)
- **Loop in/out points, loop toggle, and an FPS stepper** on the timeline. The frame strip
  dims out-of-range cells and highlights the in/out edges; pause icon while playing.
- `PlaybackOps` (`core-model`, pure) — in/out setters that keep the range valid, fps
  clamping, frame duration, and a `nextFrame` looping helper; `StudioState` playback wiring
  now uses it (replacing inline logic). Changing FPS restarts the playback cadence live.
- 12 new tests (`PlaybackOpsTest`), 271 total.

### Added (per-layer blend-mode picker)
- **Blend-mode dropdown** in the layer panel — pick any of the 8 modes (Normal, Multiply,
  Screen, Overlay, Add, Darken, Lighten, Difference) per layer; the compositor already
  supported them, this surfaces them in the UI.
- `BlendMode.displayName` (title-case label) for the picker; `StudioState.setLayerBlendMode`.
- 1 new test (blend-mode labels), 259 total.

### Added (layer management)
- **Layer reorder, rename, delete, and visibility toggle** in the side panel, plus a
  per-layer opacity slider. Each row has an eye toggle, name, up/down, rename, and delete;
  deletion safely re-selects an active layer and keeps ≥1 layer.
- `LayerOps` (`core-model`, pure) — z-order moves, rename (trim/fallback), delete guards,
  `activeAfterDelete`, flag/opacity/blend setters; wired via `StudioState`.
- 19 new tests (`LayerOpsTest`), 258 total.

### Added (drag-to-move cels)
- **Drag a frame cell** on the timeline to move that drawing to another frame (tap still
  seeks). The cel keeps its surfaceId — no GPU work, just a model edit.
- `TimelineDrag` (`core-model`, pure) — pointer-x → frame hit-testing + drag resolution;
  `StudioState.moveCel`/`hasCelAt` wire it to `TimelineOps.moveCel`; the frame strip uses
  `detectDragGestures`.
- 10 new tests (`TimelineDragTest`), 239 total.

### Added (flood-fill bucket)
- **Bucket fill** — arm it and tap an enclosed area to flood-fill with the current colour
  (one-shot, mutually exclusive with the eyedropper). Undoes/redoes like a stroke.
- `FloodFill` (`core-common`, pure) — scanline span fill with per-channel tolerance and a
  dirty-rect result; `PaintEngine.floodFill` reads the cel, fills, and uploads only the
  changed rows back (reusing the existing snapshot/undo path).
- 10 new tests (`FloodFillTest`), 229 total.

### Added (eyedropper tool)
- **Eyedropper** — arm it in the toolbar and tap the canvas to sample a colour into the
  picker + recents (one-shot, auto-disarms). Single-finger tap samples; two-finger
  pan/zoom still works.
- `ColorSampler` (`core-model`, pure) — exact + neighbourhood-averaged sampling with
  bounds/transparency handling; `PaintEngine.sampleColorAt` reads back only a small
  region around the tap (reuses the compositor + `glReadPixels` path).
- 9 new tests (`ColorSamplerTest`), 219 total.

### Added (HSV colour picker)
- **Full HSV colour picker** (hue/saturation/brightness/alpha sliders, live preview, hex
  readout) replacing the fixed-palette-only workflow, plus a **recent colours** row.
- `Hsv` (`core-model`, pure) — HSV↔RGB conversion with hue wrapping; `RecentColors` — an
  immutable, ARGB-deduplicated, capped MRU list; `StudioState.commitColor`.
- 19 new tests (`HsvTest`, `RecentColorsTest`), 210 total.

### Added (multi-frame onion skinning)
- **Multi-frame onion skinning with tint colours** — ghost several drawings before/after
  the current frame, tinted red (past) / blue (future) with linear opacity falloff and a
  settings panel (range 0–8 per side, near/far opacity, tint strength).
- `OnionSkinSettings` + `OnionSkinPlanner` (`core-model`, pure) — frame selection &
  falloff; tint plumbed through `LayerDrawSpec`/`Compositor.LayerDraw` and a new
  `uTint`/`uTintStrength` path in `composite.frag` (normal layers use strength 0).
- 11 new tests (`OnionSkinPlannerTest`), 191 total.

### Added (brush settings panel)
- **Live brush settings panel** exposing size, min-size, opacity, flow, hardness, spacing
  and smoothing sliders plus pressure→size, pressure→opacity and build-up toggles, with a
  per-brush **Reset to default**. Open via the tune button or by tapping the selected brush.
- `BrushAdjustments` (`core-model`, pure) — clamped, invariant-preserving mutators whose
  range constants double as the slider bounds; `StudioState.updateBrush` + a settings flag.
- 12 new tests (`BrushAdjustmentsTest`), 180 total.

### Added (Storage Access Framework)
- **Save / Open / Export now use the system file picker** (SAF), so projects and exports
  go to Downloads / Drive / Photos — anywhere the user chooses — and are visible to other
  apps, instead of a private app folder.
- `MediaTypes` (`core-model`, pure) — MIME/extension routing per `DocumentKind`, safe
  suggested file names, extension parsing.
- `CanvasView` stream/fd variants (`saveProjectTo`, `loadProjectFrom`, `exportAnimationTo`)
  and an `Mp4Encoder` `FileDescriptor` constructor (MediaMuxer needs a seekable fd).
- 10 new tests (`MediaTypesTest`), 168 total.

### Added (MP4 video export)
- **Export to H.264 .mp4** via `MediaCodec` + `MediaMuxer`, alongside GIF and PNG-sequence.
  Per-frame presentation timestamps honour holds / fps overrides / "on twos".
- `YuvConverter` (`core-common`, pure) — ARGB → YUV 4:2:0 (I420 & NV12), BT.601 limited
  range with 2×2 chroma averaging and background compositing for transparent pixels.
- `Mp4Encoder` (`feature-canvas`) — encoder colour-format detection (planar/semi-planar),
  auto bitrate (~0.18 bpp clamped), even-dimension enforcement, EOS/drain handling.
- 11 new tests (`YuvConverterTest`, verified against BT.601 reference values), 158 total.

### Added (robustness: GL context-loss recovery)
- **Survives GL-context loss** (app backgrounding / display reset): artwork is no longer
  lost when the EGL context is destroyed. `setPreserveEGLContextOnPause(true)` plus a
  CPU-side `SurfaceBackupStore` that re-uploads surfaces into a fresh engine on context
  re-creation.
- `PaintEngine.backupSurfaces` / `restoreSurfaces`; `PixelConvert.argbTopDownToRgbaBottomUp`
  (exact inverse of the existing readback); `CanvasView.onPause/onResume` wired to the
  Activity lifecycle; `CanvasRenderer` detects re-creation and restores.
- 11 new tests (`SurfaceBackupStoreTest`, `PixelConvertTest` round-trip + orientation),
  147 total.

### Added (timeline editing)
- **Exposure-sheet editing** from the timeline: insert/remove frame, duplicate cel to
  next frame, copy/cut/paste/clear cel, and extend-exposure (holds) — with buttons
  auto-enabled by cel/clipboard availability.
- `TimelineOps` (`core-model`, pure) — clear/set/move/duplicate/paste cel, shift cels,
  insert/remove frames, extend exposure; explicit GPU-surface semantics (move keeps the
  id, duplicate/paste mint a new one).
- `PaintEngine.cloneSurface` — copies a cel's pixels into a fresh surface so duplicated
  drawings are independently editable; `StudioState` cel clipboard + timeline actions.
- 16 new tests (`TimelineOpsTest`), 136 total.

### Added (export)
- **Export animations** to **animated GIF** and **PNG sequence (.zip)** from the toolbar,
  using the scene's playback range at the project frame rate (with progress in the title).
- `GifEncoder` — a from-scratch, dependency-free **GIF89a** encoder (`core-common`):
  NETSCAPE2.0 looping, per-frame Graphic Control Extension (delay/transparency/disposal),
  streaming frames.
- `MedianCutQuantizer` — ARGB → ≤256-color palette + indices with a reserved transparent
  slot; `LzwEncoder` — GIF variable-width LZW with sub-block framing.
- `ExportPlanner` (`core-model`) — drift-free frame/timing plan (range, fps override,
  frame-step "on twos", GIF centisecond delays, zero-padded file names).
- `PaintEngine.renderFrameToArgb` (off-screen frame flatten + readback) and the shared
  `PixelConvert` helper; `ExportManager` + `CanvasView.exportAnimation`;
  `StudioState.buildExportDrawList`.
- 30 new tests (LZW round-trip via an independent decoder, GIF structure, quantizer,
  planner), 120 total. Demo: `docs/samples/gif_encoder_demo.gif`.

### Added (canvas navigation)
- **Pan / zoom / rotate** the canvas with two-finger gestures, driven by a single
  `ViewportTransform` (uniform scale + rotation + translation) shared by display and
  input — the brush always lands under the finger at any zoom/rotation.
- `present.frag` rewritten to inverse-map each screen pixel into canvas space (exact
  rotation, checkerboard outside the canvas); `Compositor.present` /
  `PaintEngine.composeAndPresent` now take the inverse-affine coeffs.
- `CanvasView` input arbitration: 1 pointer draws, 2 pointers navigate (abandoning a
  wet stroke); zoom clamped about the gesture midpoint. Fit-to-screen, 100%, and a live
  zoom % in the toolbar.
- 12 new tests (`ViewportTransformTest`), 90 total.

### Added (save / load)
- **`.inkframe` project persistence** — save/load a project as a ZIP of `document.json`
  + one PNG per cel surface, with Open/Save buttons in the top toolbar.
- `Json` — a small dependency-free JSON parser/writer (`core-common`).
- `ProjectCodec` — `Project` ⇄ JSON with `FORMAT_VERSION`, tolerant decoding, and a
  fast-fail on newer-than-supported files (`core-model`).
- `ProjectPackage` — ZIP read/write with a `CelImageIO` seam (`referencedSurfaceIds`,
  `readDocumentOnly` for previews) (`core-model`).
- `GlCelImageIO` — GPU surface ⇄ PNG bridge with GL↔Bitmap row-flip (`engine-gl`).
- `PaintEngine.celImageIO()` / `resetForLoad()`, `CanvasView.saveProject/loadProject`,
  `StudioState.replaceProject` (surface-id counter advanced past loaded ids).
- 24 new tests (`JsonTest`, `ProjectCodecTest`, `ProjectPackageTest`,
  `SaveLoadIntegrationTest`), 78 total.

### Added (undo/redo)
- **Undo/redo for strokes** — each stroke snapshots before/after RGBA8 pixels of just its
  dirty rectangle and registers a `StrokeCommand` on the engine's `UndoStack`. Toolbar
  Undo/Redo buttons (auto-enabled/disabled) plus onion-skin and transparency-checker
  toggles in a new top toolbar.
- `DirtyRegion` + `IntRect` (pure, tested) accumulate a stroke's touched bounds so undo
  snapshots stay small. `GlSurface.readPixels`/`writePixels` for snapshot capture/restore.
- `UndoStack.pushAlreadyApplied` registers an already-performed action without re-applying.
- 11 new tests (`DirtyRegionTest`, `StrokeCommandTest`), 54 total.

### Changed
- **Stroke-buffer compositing** — strokes now accumulate in a scratch surface and are
  baked onto the cel once at the brush opacity, eliminating dab-overlap darkening for
  normal brushes. `GL_MAX` blend gives uniform coverage; build-up brushes (airbrush) use
  additive accumulation. A live preview surface shows the wet stroke without modifying
  the cel until the stroke ends. New shader `stroke_overlay.frag`.
- `Brush` now separates per-dab `flow` (+ `flowForPressure`) from whole-stroke `opacity`,
  and adds a `buildUp` flag. `Dab.opacity` renamed to `Dab.flow`.
- 9 new unit tests (`StrokeBlendMathTest` + brush flow/build-up), 43 total.

### Added
- Multi-module Gradle project (`:app`, `:core-common`, `:core-model`, `:engine-gl`,
  `:feature-canvas`, `:feature-timeline`, `:feature-layers`) with version catalog.
- OpenGL ES 3.0 paint engine: FBO-backed `GlSurface`s, point-sprite `BrushRenderer`,
  layer `Compositor` with 8 blend modes, and an off-UI-thread event queue.
- `StrokeProcessor`: Catmull-Rom smoothing + arc-length resampling into even dabs.
- Document model: `Project`/`Scene`/`Layer`/`Cel`/`Brush`/`RgbaColor` with frame-hold
  (exposure) cel resolution.
- `UndoStack` (bounded, redo-branch clearing) — implemented, not yet UI-wired.
- Jetpack Compose studio shell: brush rail, GL canvas host, timeline bar, layer/color
  side panel; frame-rate playback loop and onion skinning.
- GLSL shaders for brush dabs, layer compositing, and checkerboard presentation.
- **Foundation pass:** 34 JVM unit tests (math, undo, model, color, brush, stroke),
  README, architecture doc, `.gitignore`, GitHub Actions CI, launcher icons.

### Known gaps / next up
- Persistence (save/load), undo wiring to strokes, stroke-buffer compositing,
  canvas pan/zoom/rotate, export (GIF/MP4), GL context-loss recovery.
  See `docs/ARCHITECTURE.md` §6.
