# InkFrame Architecture

This document describes how InkFrame is structured, how a brush stroke travels from a
stylus to pixels on screen, and what's planned next.

---

## 1. Module graph

```
        ┌─────────┐
        │  :app   │  Activity, theme, composition root
        └────┬────┘
             │
   ┌─────────┼───────────────┬───────────────┐
   ▼         ▼               ▼               ▼
:feature-  :feature-      :feature-      (more features…)
 canvas     timeline       layers
   │
   ▼
:engine-gl   ── OpenGL ES paint engine
   │
   ▼
:core-model  ── document data classes
   │
   ▼
:core-common ── pure math + undo stack
```

**Rule:** dependencies only point downward. `core-common` and `core-model` have **no
Android UI dependencies**, so they run on the plain JVM and are unit-tested without an
emulator. `engine-gl` depends on `android.opengl.*` but its *logic* pieces
(`StrokeProcessor`) are pure and tested too.

## 2. The drawing pipeline (stylus → pixels)

```
MotionEvent (CanvasView, UI thread)
   │  getHistorical* batched samples + pressure
   ▼
EngineEvent queue (lock-free ConcurrentLinkedQueue)
   │  drained at start of each GL frame
   ▼
PaintEngine.beginStroke / extendStroke / endStroke   (GL thread)
   │
   ▼
StrokeProcessor                       (pure logic, unit-tested)
   │  1. exponential smoothing of position
   │  2. Catmull-Rom interpolation between control points
   │  3. arc-length resampling → evenly spaced Dabs
   ▼
BrushRenderer.stamp                   (GPU)
   │  uploads dab instances → GL_POINTS → brush.vert / brush.frag
   │  draws into the active cel's GlSurface (an FBO-backed RGBA8 texture)
   ▼
Compositor.flatten                    (GPU, per frame)
   │  blends visible layers bottom→top with per-layer opacity + blend mode
   │  ping-pong between two accumulator surfaces
   ▼
Compositor.present                    (GPU)
   │  draws the flattened canvas to the screen over a checkerboard
   ▼
Screen
```

### Threading model

All GL calls happen on the `GLSurfaceView` render thread. The UI thread never touches
GL: it converts input into immutable `EngineEvent`s and posts them onto a lock-free
queue. The renderer drains that queue at the top of `onDrawFrame`. Rendering is
`RENDERMODE_WHEN_DIRTY`; input and the playback loop call `requestRender()`.

### Why arc-length resampling?

Raw stylus samples arrive at irregular spatial intervals (fast strokes = sparse points).
Stamping dabs at raw samples would give uneven coverage. We resample the smoothed spline
at a fixed distance (`spacing × diameter`) so coverage is uniform regardless of speed.
Validated by `StrokeProcessorTest` (avg gap stays within tolerance of the target).

## 2a. Stroke-buffer compositing (no dab-overlap darkening)

Naively stamping each dab straight onto the cel with `source-over` and the brush opacity
baked in causes **overlap darkening**: where dabs pile up (dense spacing, soft tips, slow
strokes, stroke turns) coverage accumulates and the line looks blotchy/too dark. The fix
mirrors how desktop paint apps work — separate *per-dab flow* from *whole-stroke opacity*:

```
beginStroke ──► clear stroke scratch surface
  each dab ──► stamp into scratch:
                 • normal brush  → GL_MAX blend  (out = max(dst, src))  → uniform coverage
                 • build-up brush → additive blend (airbrush accumulates on purpose)
  per frame ──► preview = blit(cel) then overlay(scratch @ brushOpacity)
                 → substituted for the cel while the stroke is wet (cel untouched)
endStroke  ──► composite scratch onto the REAL cel ONCE:
                 • paint  → source-over at brush opacity
                 • eraser → subtract: out.a = dst.a * (1 - src.a)
```

Because GL_MAX takes the maximum coverage where dabs overlap, fifty stacked dabs at one
pixel produce exactly the same coverage as one dab — no darkening. The brush's overall
opacity is then applied a single time at composite. The CPU equivalents of these blend
equations are unit-tested in `StrokeBlendMathTest` (proving overlap stays uniform for
normal brushes, builds up for the airbrush, and that the eraser subtracts coverage).

Key types: `Brush.flow` / `Brush.flowForPressure` (per-dab), `Brush.opacity` (whole
stroke), `Brush.buildUp` (accumulate vs. max); `BrushRenderer.stampToScratch`,
`compositeScratchToCel`, `blit`; `PaintEngine`'s `strokeScratch` / `strokePreview`.

## 2b. Undo/redo & dirty-region snapshots

Snapshotting the whole canvas per stroke would be wasteful (a 1280×720 RGBA8 cel is
~3.5 MB). Instead, undo captures only the rectangle a stroke actually touched:

```
beginStroke ──► DirtyRegion.reset()
  each dab ──► DirtyRegion.addCircle(center, diameter)   // accumulate bounds
endStroke  ──► rect = DirtyRegion.toIntRect(canvas, pad=2)  // clamp + pad for soft edges
               before = cel.readPixels(rect)               // pristine (cel untouched until now)
               compositeScratchToCel(...)                  // bake stroke onto cel
               after  = cel.readPixels(rect)
               undoStack.pushAlreadyApplied(
                   StrokeCommand(before, after, restore = writePixels))
```

- The stroke-buffer design is what makes this clean: because the cel is **untouched
  until `endStroke`**, its current pixels already *are* the "before" state — no separate
  pre-snapshot pass is needed.
- `StrokeCommand.revert()` writes `before`; `apply()` (redo) writes `after`. Restores go
  through `GlSurface.writePixels` (`glTexSubImage2D`) on the GL thread.
- **Coordinate flip:** `DirtyRegion` works in top-left canvas space; `glReadPixels`/
  `glTexSubImage2D` use bottom-left origin. `PaintEngine.topToGlRect` converts.
- Undo/redo are posted as `EngineEvent`s so they execute on the GL thread; the engine's
  `onHistoryChanged` callback updates the toolbar's enabled state.
- `DirtyRegion`, `IntRect`, `UndoStack.pushAlreadyApplied`, and the `StrokeCommand`
  apply/revert/round-trip are all unit-tested without GL (the restore lambda is injected).

## 3. Document model

```
Project
 ├─ CanvasSpec (w, h, fps, pixel aspect, background)
 ├─ colorPalette: List<RgbaColor>
 └─ scenes: List<Scene>
       └─ Scene (frameCount, playbackRange, loop)
            └─ layers: List<Layer>   (index 0 = bottom of stack)
                 ├─ opacity / visible / locked / blendMode
                 └─ cels: Map<Int, Cel>   (sparse, keyed by frame)
                      └─ Cel(surfaceId, transform)
```

- Models are **immutable data classes**; structural edits go through `StudioState`,
  which copies and bumps `modifiedAt`. This keeps state snapshotting (for undo and
  serialization) trivial.
- A `Cel` holds only a lightweight `surfaceId` handle — the actual pixels live in a
  GPU `GlSurface`. This makes document copies cheap.
- **Frame holds:** `Layer.celAt(frame)` returns the cel at `frame`, or the most recent
  earlier cel if that frame is empty — the classic exposure-sheet behaviour.

## 4. Surfaces & ids

- `StudioState` mints monotonic `surfaceId`s and records them in the model.
- `PaintEngine.getOrCreateSurface(id)` lazily allocates the GPU `GlSurface` the first
  time an id is drawn/composited — on the GL thread. This decouples document structure
  (UI thread) from GPU resource creation (GL thread).

## 5. Shaders

| File             | Role                                                            |
|------------------|----------------------------------------------------------------|
| `brush.vert`     | Maps dab center (canvas px) → clip space; sets `gl_PointSize`.  |
| `brush.frag`     | Soft radial falloff dab; `uHardness` controls edge crispness.  |
| `composite.vert` | Fullscreen quad.                                               |
| `composite.frag` | Blends one layer over the accumulator (8 blend modes).         |
| `present.frag`   | Draws final canvas over a transparency checkerboard.           |

---

## 6. Roadmap (prioritized)

## 2c. Persistence — the `.inkframe` package

A project saves as a ZIP with this layout:

```
  document.json          structural model (ProjectCodec JSON, pretty-printed)
  cels/<surfaceId>.png    one RGBA PNG per cel surface
```

The split keeps the document human-readable and diffable while pixel data stays
out-of-band. The design is layered so almost everything is testable without GL:

```
ProjectCodec   (core-model)  Project  <-> JsonValue  <-> String   [pure, tested]
Json           (core-common) dependency-free JSON parser/writer   [pure, tested]
ProjectPackage (core-model)  zip read/write + CelImageIO bridge   [pure, tested]
GlCelImageIO   (engine-gl)   GlSurface <-> PNG bytes (Android)     [GL bridge]
```

- `ProjectPackage.CelImageIO` is the only platform seam: `encode(surfaceId) -> PNG?`
  and `decode(surfaceId, png)`. Tests inject an in-memory fake; production uses
  `GlCelImageIO`, which reads back pixels (`glReadPixels`) → `Bitmap` → PNG, and
  decodes PNG → `Bitmap` → `glTexSubImage2D`. It flips rows because GL is bottom-up
  while `Bitmap` is top-down, so a save→load cycle preserves orientation.
- `PaintEngine.celImageIO()` binds the bridge to the live surface map;
  `resetForLoad()` releases GPU surfaces and clears history before a load.
- `CanvasView.saveProject` / `loadProject` perform the pixel work on the GL thread and
  report results via a callback (the UI bounces them back to the main thread).
- On load, `StudioState.replaceProject` advances the surface-id counter past every id in
  the loaded document so freshly drawn cels never collide with restored ones.
- Versioned via `ProjectCodec.FORMAT_VERSION`; loading a newer-than-supported file fails
  fast with a clear message, and decoding tolerates missing optional fields.

## 2d. Canvas navigation (pan / zoom / rotate)

A single `ViewportTransform` (core-common) drives both what you see and where the brush
lands, so they can never disagree. It's a 2D similarity (uniform scale + rotation +
translation) stored as a complex linear part `a = ax + i·ay` plus translation `b`:

```
  canvasToView(c) = a·c + b        viewToCanvas(v) = (v − b) / a
```

This complex form makes the gesture math a one-liner. Given the previous and current
positions of two fingers, the unique similarity taking the old configuration to the new
is `M_a = (curB − curA) / (prevB − prevA)` (complex division) — that single expression
captures pinch-zoom, two-finger rotation, and pan simultaneously (`applyGesture`).

- **Display:** `present.frag` maps each screen fragment back through the packed inverse
  affine (`ViewportTransform.inverseCoeffs()`) into canvas UV space, sampling the canvas
  and showing a checkerboard outside it. No quad transforms — it's a per-pixel inverse
  map, so rotation is exact and edges stay crisp.
- **Input:** the stylus uses `viewport.viewToCanvas(...)`. A unit test
  (`inverseCoeffs_matchViewToCanvas`) asserts the shader's inverse equals `viewToCanvas`
  exactly, guaranteeing the painted point is under the finger.
- **Arbitration (`CanvasView`):** one pointer draws; a second pointer abandons the wet
  stroke and switches to NAVIGATE; lifting back to one pointer idles. Zoom is clamped
  about the gesture midpoint (`withScaleClamped`) so it can't run away.
- **Defaults:** the view fits the canvas on first layout (`fit`); the toolbar exposes
  Fit and tap-to-100%, with a live zoom %.
- All transform math is pure and unit-tested (12 tests), including the defining property
  that a gesture reproduces both finger positions exactly.

## 2e. Export (MP4 / GIF / PNG sequence)

Getting an animation *out* of the app, built in the now-familiar pure-core + thin-bridge
pattern so the hard parts are unit-tested without an emulator:

```
ExportPlanner   (core-model)   scene + canvas -> render plan (which frames, durations)  [pure]
GifEncoder      (core-common)  GIF89a container, NETSCAPE loop, per-frame GCE           [pure]
  ├─ MedianCutQuantizer        ARGB pixels -> <=256-color palette + indices + transp.   [pure]
  └─ LzwEncoder                indices -> GIF variable-width LZW, sub-blocked            [pure]
YuvConverter    (core-common)  ARGB -> YUV420 (I420/NV12), BT.601 limited range         [pure]
Mp4Encoder      (feature)      MediaCodec H.264 + MediaMuxer, color-format detection     [thin]
ExportManager   (feature)      drives MP4 / GIF / PNG-sequence over a plan               [thin]
PaintEngine.renderFrameToArgb  flatten any timeline frame off-screen -> ARGB            [GL]
```

- **Planning is pure & drift-free.** `ExportPlanner` resolves the playback/all range,
  applies fps overrides and frame-stepping (e.g. "on twos"), and accumulates fractional
  milliseconds so a long export's total length tracks the true frame rate without
  rounding drift. GIF delays are converted to centiseconds with a sane minimum.
- **GIF is a from-scratch GIF89a encoder.** Median-cut quantization reduces each frame to
  ≤256 colors (reserving one slot for full transparency), LZW compresses the indices, and
  the container writes a NETSCAPE2.0 loop block plus a per-frame Graphic Control Extension
  (delay, transparency, disposal=restore-to-background). It streams frames so memory stays
  bounded.
- **Verification.** `LzwEncoderTest` round-trips through an *independent* decoder
  (including table-growth and clear-code cases); a sanity check confirmed Java's own
  ImageIO reads our output back as the right frame count and size. A demo lives at
  `docs/samples/gif_encoder_demo.gif`.
- **Frame source.** `PaintEngine.renderFrameToArgb` reuses the layer compositor to
  flatten any frame's draw list off-screen (no onion skin, no viewport transform) and
  reads it back top-down via the shared `PixelConvert` helper (same orientation logic as
  save/load). `StudioState.buildExportDrawList(frame)` supplies per-frame specs.
- **PNG sequence** writes a ZIP of zero-padded `frame_0000.png …` via Android's Bitmap
  PNG codec, ready to import into any video editor.
- **MP4 is H.264 via MediaCodec + MediaMuxer.** The tricky, device-variable part — the
  RGB→YUV 4:2:0 colour conversion — is the pure `YuvConverter` (BT.601 limited range,
  libyuv integer coefficients, 2×2 chroma averaging, transparent pixels composited over a
  background). `Mp4Encoder` queries the encoder's actual preferred colour format and emits
  **I420 (planar)** or **NV12 (semi-planar)** to match, picks a sensible bitrate
  (~0.18 bpp, clamped), forces even dimensions (a YUV 4:2:0 requirement), and assigns each
  planned frame a presentation timestamp from its `durationMs` — so variable holds, fps
  overrides and "on twos" all time correctly in the video.
- **YUV verification.** `YuvConverterTest` checks pure-colour outputs against hand-computed
  BT.601 reference values (e.g. red → Y=82,U=90,V=240), plus 2×2 subsampling, I420 vs NV12
  plane placement, alpha compositing, and even-dimension validation — all on the JVM.

## 2f. Timeline editing (exposure sheet)

The exposure-sheet edits an animator lives in, built as pure model transformations in
`TimelineOps` (core-model) so the tricky frame-shifting + hold interactions are
unit-tested without GL:

```
TimelineOps (core-model, pure)            StudioState wiring            engine (GL)
  clearCel / setCel                        clearCelAtCurrentFrame
  moveCel        (keeps surfaceId)
  duplicateCel   (new surfaceId) ───┐      duplicateCelToNextFrame ───► cloneSurface(src,dst)
  pasteCel       (new surfaceId) ───┤      copy/cut/paste (clipboardCel)
  shiftCels                          └────► (pixels copied via blit)
  insertFrames / removeFrames               insertFrame / removeFrame
  extendExposure                            extendExposure (holds)
```

- **Surface semantics are explicit.** `moveCel` keeps the cel's `surfaceId` (the same
  pixels relocate). `duplicateCel` / `pasteCel` require a caller-minted `newSurfaceId`
  and the engine clones the source pixels into it (`PaintEngine.cloneSurface`, a `blit`
  into a fresh surface) — so a duplicated drawing is independently editable, not a shared
  reference. The model only ever stores lightweight handles.
- **Frame ops act across the whole scene.** `insertFrames` / `removeFrames` shift every
  layer's cels and adjust `frameCount` + `playbackRange` together; `removeFrames` never
  drops below one frame. `extendExposure` is "insert blank frames after this drawing" so
  the current cel holds longer (classic frame-hold via `Layer.celAt`).
- **Drift-free range math.** Playback in/out points move with inserts and clamp on
  removes, verified by tests.
- UI: an action row in the timeline (insert, duplicate, hold, copy, paste, clear, remove)
  with buttons auto-enabled by `hasCelAtCurrentFrame` / `canPaste`.

## 2g. GL context-loss recovery

When Android backgrounds the app it may destroy the EGL context; every GL texture and
FBO then becomes invalid, so all artwork would vanish from the GPU. InkFrame handles this
with two layers of defence:

```
on pause ──► CanvasView.onPause() ──► renderer.backupSurfaces()
                                         └─ PaintEngine.backupSurfaces(store)   [GL thread]
                                              reads each surface -> top-down ARGB in CPU heap
context lost & recreated ──► onSurfaceCreated() fires again
   hadContext && store not empty?  →  fresh PaintEngine + restoreSurfaces(store)
                                         └─ re-uploads ARGB -> new GL textures
                                      onContextRestored()  →  redraw
```

- **Primary:** `setPreserveEGLContextOnPause(true)` asks the system to keep the context
  across pauses; most modern devices honour it and lose nothing.
- **Fallback:** `SurfaceBackupStore` is plain heap memory (a `ConcurrentHashMap` of
  top-down ARGB snapshots), so it *survives* context loss. On pause we snapshot every live
  surface into it; on context **re-creation** (detected via a `hadContext` flag) the new
  engine re-uploads from it instead of starting blank.
- **Orientation safety:** backup uses `PixelConvert.rgbaBottomUpToArgbTopDown` and restore
  uses its exact inverse `argbTopDownToRgbaBottomUp`; a unit test asserts the round-trip is
  identity (no flips/colour shifts) — the core correctness guarantee.
- **Lifecycle wiring:** `StudioScreen` observes the Activity lifecycle (`LifecycleEventObserver`)
  and forwards ON_PAUSE/ON_RESUME to the GL view. `onEngineReady` re-fires on recreation so
  `StudioState` rebinds to the new engine instance.
- **Known limitation:** the in-memory undo history resets across a context loss (artwork is
  preserved; only the `UndoStack` is new). Acceptable and standard; full-fidelity undo would
  require serializing the stack.
- The backup store doubles as a cheap in-memory autosave hook for future use.

## 2h. Storage Access Framework (open / save / export anywhere)

Save, Open and Export go through Android's **Storage Access Framework** instead of a
private app folder, so users pick real destinations (Downloads, Drive, Photos) and the
files are visible to other apps. The format/MIME/extension routing is a pure, tested seam
so only the thinnest layer touches Android `Uri`s:

```
MediaTypes (core-model, pure)        StudioScreen (Compose)              CanvasView (GL thread)
  DocumentKind: mime + extension      rememberLauncherForActivityResult   saveProjectTo(out)
  suggestedFileName(name, kind)         CreateDocument / OpenDocument      loadProjectFrom(in)
  sanitizeBaseName / extensionOf      ContentResolver open{Input,Output}  exportAnimationTo(out|fd)
  PROJECT_OPEN_MIME_TYPES               Stream / FileDescriptor  ─────────►
```

- **Pure routing.** `MediaTypes` maps each `DocumentKind` (PROJECT / MP4 / GIF /
  PNG_SEQUENCE) to its MIME type + extension, builds a safe suggested file name from the
  project title, and parses/validates extensions — all unit-tested without Android.
- **Streams vs. file descriptors.** GIF/PNG/project I/O run over `ContentResolver`
  `OutputStream`/`InputStream`. MP4 is special: `MediaMuxer` needs a **seekable** fd, so
  the export opens the Uri with mode `"rw"` and passes `pfd.fileDescriptor` to
  `Mp4Encoder`'s fd constructor (the stream/File variants stay for tests + internal use).
- **Lifecycle-safe.** The chosen export format is held in a `remember`ed state across the
  picker round-trip; the picked `Uri` then drives the export on the GL thread, with the
  pfd closed in the result callback.
- **Why this design:** SAF Uris can't be reopened later without persisted permissions, and
  pushing the Android-specific bits to the very edge keeps the engine and model testable.

## 2i. Brush settings panel

The engine has long supported rich brush parameters (size, min-size, opacity, flow,
hardness, spacing, smoothing, pressure→size, pressure→opacity, build-up) — the panel
finally surfaces them, with a pure validation layer in between:

```
BrushAdjustments (core-model, pure)     StudioState           StudioScreen (Compose)
  withSize / withMinSize / withOpacity   var brush (state)     BrushSettingsPanel
  withFlow / withHardness / withSpacing   updateBrush{ }         LabeledSlider × 7
  withSmoothing / toggles / reset        showBrushSettings       ToggleRow × 3
  *_RANGE constants (= slider bounds)
```

- **Validation can't be bypassed.** Every edit goes through `BrushAdjustments`, which
  clamps to the engine's accepted range and keeps invariants (e.g. `minSizePx` is forced
  ≤ `sizePx` when either changes, spacing never hits 0 → no infinite-dab loop). The
  `*_RANGE` constants are reused as the slider bounds, so the UI and the validator can't
  drift apart.
- **Immutable + observable.** `Brush` stays a data class; the panel calls
  `state.updateBrush { BrushAdjustments.withX(it, v) }` and the next stroke simply reads
  the updated `state.brush` — no engine plumbing needed.
- **Discoverable gesture:** tapping the already-selected brush (or the dedicated tune
  button) opens the panel; **Reset** restores that brush's factory defaults by id.
- All 12 adjustment behaviours (clamping, the min/size invariant, reset, chained edits
  staying valid) are unit-tested without Android.

## 2j. Multi-frame onion skinning (tinted)

The single untinted ghost was replaced with configurable multi-frame onion skinning, with
the classic red-past / blue-future tinting that lets an animator read motion at a glance:

```
OnionSkinPlanner (core-model, pure)     StudioState.buildDrawList        composite.frag (GL)
  plan(currentFrame, settings,           ghost -> LayerDrawSpec(           uTint + uTintStrength
       surfaceAt) -> [OnionGhost]          tintRGB, tintStrength, op)        mix(layer.rgb, tint, s)
  linear opacity falloff, far→near order
```

- **Pure selection + falloff.** `OnionSkinPlanner` walks `framesBefore`/`framesAfter`
  around the current frame, skips frames with no drawing, applies a linear opacity falloff
  (nearest = `nearOpacity`, farthest = `farOpacity`), and returns ghosts ordered
  farthest→nearest so nearer frames stack on top. Decoupled from the document via a
  `surfaceAt(frame)` lambda, so it's unit-tested with no GL.
- **Tinting in the compositor.** `LayerDrawSpec`/`LayerDraw` carry a tint colour +
  strength; `composite.frag` does `layer.rgb = mix(layer.rgb, uTint, uTintStrength)`
  before blending. Normal layers pass strength 0, so they're untouched — the same shader
  path serves both.
- **Active-layer only.** Ghosts are generated for the active layer only (where you're
  drawing), composited beneath its current cel; ghost opacity is further scaled by the
  layer opacity.
- **Settings panel:** range (0–8 each side), near/far opacity, tint strength, with red/blue
  swatch indicators. Toolbar has a toggle plus a gear for the panel.
- 11 planner behaviours (range, skipping, ordering, falloff, asymmetry, tint propagation)
  are unit-tested.

## 2k. HSV colour picker

The fixed 8-swatch palette was joined by a full HSV picker so artists can choose any
colour, with the colour-space math kept pure and reference-tested:

```
Hsv (core-model, pure)            StudioState                 StudioScreen (Compose)
  toRgba() / fromRgba()            color + commitColor()        ColorPickerDialog
  withHue/Sat/Value/Alpha          recentColors (MRU)            H/S/V/A sliders + preview
  wrapHue / normalized            showColorPicker                "#AARRGGBB" readout
RecentColors (pure)               recent swatches row
  add() MRU, dedup by ARGB, capped
```

- **Standard HSV↔RGB** with hue in degrees (wrapping), tested against the six primaries,
  greys, value/saturation scaling, and full RGB→HSV→RGB round-trips (alpha preserved).
- **`RecentColors`** is an immutable MRU ring buffer that de-duplicates by *packed ARGB*
  (so float noise doesn't create near-identical entries) and caps its length.
- **`commitColor`** records the *previous* colour into recents, so the recent row collects
  colours actually committed to — not every value dragged through on a slider.
- The picker edits in HSV (the natural space for hue/sat/brightness sliders), shows a live
  preview swatch and the hex value, and preserves the source alpha.
- 19 colour behaviours (HSV conversions + recents) are unit-tested without Android.

## 2l. Eyedropper (sample colour from canvas)

Pick any colour off the artwork and drop it straight into the picker/recents:

```
ColorSampler (core-model, pure)        PaintEngine (GL)               CanvasView / StudioScreen
  sampleAt / sampleAverage              sampleColorAt(specs,x,y,r)      eyedropperActive (one-shot)
  bounds + neighbourhood averaging        flatten -> readPixels(small    onColorSampled -> commitColor
  skips transparent pixels                region) -> ColorSampler
```

- **Cheap & correct.** `sampleColorAt` flattens the current frame's draw list, then reads
  back **only a small clamped region** around the tap (not the whole canvas) via
  `glReadPixels`, converts it top-down, and averages a `2r+1` neighbourhood with
  `ColorSampler` for a steady reading on anti-aliased art.
- **Reuses existing infrastructure** — the same compositor + `PixelConvert` path as export
  and context-loss backup; no new GL code.
- **One-shot UX.** Arm the eyedropper in the toolbar, tap the canvas once → the colour is
  committed (and pushed to recents), and the tool disarms automatically. Transparent /
  off-canvas taps report "nothing to pick" and leave the colour unchanged.
- **Input arbitration.** When armed, a single-finger `ACTION_DOWN` samples instead of
  starting a stroke; two-finger pan/zoom still works.
- 9 sampler behaviours (exact pixel, bounds, alpha, neighbourhood averaging, transparency
  skipping, edge clamping) are unit-tested without GL.

## 2m. Flood-fill bucket

Tap an enclosed area to fill it — essential for colouring cel line-art:

```
FloodFill (core-common, pure)          PaintEngine (GL)                CanvasView / StudioScreen
  fill(argb,w,h,seed,color,tol)         floodFill(surfaceId,x,y,color)   fillActive (one-shot)
  scanline span algorithm                read cel -> fill -> upload        onFilled -> status
  per-channel tolerance, dirty rect        only the dirty rect back        mutually exclusive w/ eyedropper
```

- **Scanline (span) algorithm**, not recursion: fills each horizontal run then queues the
  rows above/below, so a 600×600 region fills without stack overflow (unit-tested).
- **Tolerance** matches the seed colour within a per-channel threshold, so anti-aliased
  line-art edges can be included; a no-op guard handles fill == target.
- **Operates on the cel's own pixels** (not the composite): the engine reads the cel back,
  runs the pure fill, and uploads **only the changed dirty rectangle**.
- **Undo for free** — reuses `StrokeSnapshot`/`StrokeCommand` + `pushAlreadyApplied`, so a
  fill undoes/redoes exactly like a brush stroke.
- **One-shot UX**, mutually exclusive with the eyedropper; transparent/off-canvas or
  already-filled taps report "nothing to fill".
- 10 fill behaviours (enclosed regions, borders, concave/snake connectivity, tolerance,
  dirty-rect bounds, large-region safety) are unit-tested without GL.

## 2n. Drag-to-move cels

Reorder drawings on the exposure sheet by dragging a frame cell:

```
TimelineDrag (core-model, pure)        StudioState              StudioScreen (Compose)
  frameAt(x, cellW, gap, start)         moveCel(from, to)        FrameStrip + detectDragGestures
  resolveDrag(startX,endX,hasCel)         (TimelineOps.moveCel)    cell pitch from LocalDensity
```

- **Pure hit-testing.** `TimelineDrag` converts pointer x → frame index using the cell
  pitch (width + gap), clamping off-strip positions; `resolveDrag` returns source/dest or
  `null` if the start cell has no drawing (so the caller falls back to a plain tap-seek).
- **No GPU work.** `TimelineOps.moveCel` keeps the cel's `surfaceId` — only its timeline
  key changes — so a move is a pure model edit; the same pixels just expose at a new frame.
- **Gesture.** The frame strip uses `detectDragGestures`; the start cell must contain a
  drawing to begin a move, otherwise taps still seek. Destination is clamped to the strip.
- 10 drag-geometry behaviours (cell mapping, clamping, strip offset, move vs. tap,
  no-cel-source, single-frame, validation) are unit-tested without Android.

## 2o. Layer management (reorder / rename / flags)

The layer panel gained full management on top of the existing visibility/opacity/blend
model fields:

```
LayerOps (core-model, pure)            StudioState                  StudioScreen (Compose)
  moveUp / moveDown / moveTo            moveLayerUp/Down             LayerRow (eye, name, ↑↓, edit, ⌫)
  rename / delete / activeAfterDelete   renameLayer / deleteLayer    RenameLayerDialog
  toggleVisible / toggleLocked          toggleLayerVisible           per-layer opacity slider
  setOpacity / setBlendMode             setLayerOpacity
```

- **Z-order is explicit:** index 0 = bottom of the stack (composited first); "move up" in
  the panel moves a layer toward the end of the list (drawn on top). The panel renders the
  list reversed so the top layer appears first.
- **Pure list ops.** Reorder/rename/delete are referentially-transparent `Scene` edits.
  Reordering carries each layer's cels along untouched (no GPU work — surface ids are
  unchanged), verified by a test.
- **Safe deletion.** A scene always keeps ≥1 layer; `activeAfterDelete` re-selects a
  sensible active layer (the one taking the deleted slot, else the new top) so the UI never
  points at a removed layer.
- 19 layer behaviours (reorder edges, clamping, rename trim/fallback, delete guards,
  active-after-delete, flag toggles, opacity clamp, cel preservation) are unit-tested.
- **Blend modes** are surfaced per-layer via an `ExposedDropdownMenuBox` populated from
  `BlendMode.entries` (labels from `BlendMode.displayName`); selection flows through
  `LayerOps.setBlendMode` to the same `uBlend` uniform the compositor already consumed.

## 2p. Playback range (in/out points) & frame rate

The timeline gained loop in/out points, a loop toggle, and an FPS stepper:

```
PlaybackOps (core-model, pure)         StudioState                  StudioScreen (Compose)
  setInPoint / setOutPoint             setInPointToCurrent          set-in / set-out / loop buttons
  clampRange / fullRange / length      setOutPointToCurrent         FpsStepper (−/value/+)
  clampFps / frameDurationMs           setFps / toggleLoop          FrameStrip dims out-of-range
  nextFrame(current,range,loop)        advancePlayback              cells + accents the in/out edges
```

- **Range stays valid by construction.** `setInPoint`/`setOutPoint` push or pull the other
  endpoint so `0 <= in <= out <= last` always holds; `clampRange` repairs anything loaded
  from disk. The frame strip dims out-of-range cells and outlines the in/out edges.
- **Looping is pure.** `nextFrame` returns `(frame, stillPlaying)` — advancing within the
  range, looping to the in-point, or stopping at the out-point when loop is off; it also
  jumps an out-of-range `current` back to the in-point. `advancePlayback` just applies it.
- **Frame rate** is clamped to 1–120; the Compose playback loop keys on
  `state.frameDurationMs` and the fps value, so changing fps restarts the loop at the new
  cadence immediately.
- 12 playback behaviours (fps clamping, frame duration, range setters with push/pull,
  looping, single-frame, out-of-range jump) are unit-tested without Android.

### Near-term foundations
1. ~~**Stroke-buffer compositing**~~ ✅ **Done.** A stroke accumulates in a scratch
   surface (GL_MAX for normal brushes → uniform coverage, no darkening; additive for
   build-up brushes like the airbrush). A preview surface (`cel + scratch`) shows the
   wet stroke; the scratch is baked onto the cel once, at the brush opacity, on
   `endStroke`. See "Stroke-buffer compositing" below.
2. ~~**Undo/redo wiring**~~ ✅ **Done.** Each stroke captures before/after RGBA8 pixels of
   only its dirty rectangle and registers a `StrokeCommand` on the engine's `UndoStack`
   (via `pushAlreadyApplied`, since the stroke is already on the cel). Toolbar undo/redo
   buttons reflect availability. See "Undo/redo & dirty-region snapshots" below.
3. ~~**Persistence**~~ ✅ **Done.** `.inkframe` = zip of `document.json` + one PNG per cel
   surface (read back via `glReadPixels`, restored via `glTexSubImage2D`). See §2c.
   Save/Open now go through the **Storage Access Framework** (§2h), so projects live
   anywhere the user chooses. *Still to add: a project browser and autosave.*

### Editor capability
4. ~~**Canvas navigation**~~ ✅ **Done.** Pinch-zoom, two-finger pan & rotate via a single
   `ViewportTransform`; input and display share the same transform so the brush always
   lands under the finger at any zoom/rotation. See §2d.
5. ~~**Export**~~ ✅ **Done (MP4 + GIF + PNG sequence).** Pure-Kotlin GIF89a encoder
   (median-cut quantization + LZW), a PNG-sequence ZIP exporter, and H.264 MP4 via
   `MediaCodec`/`MediaMuxer` (§2e). Targets are chosen via the **Storage Access
   Framework** (§2h), so exports save to Downloads/Drive/Photos.
6. ~~**Timeline depth**~~ ✅ **Done.** Cel copy/cut/paste/clear, duplicate-to-next,
   insert/remove frame, extend-exposure (holds) via `TimelineOps` (§2f); multi-frame
   onion skinning with tint colours via `OnionSkinPlanner` (§2j); and **drag-to-move
   cels** via `TimelineDrag` (§2n); and **loop in/out points + FPS control** via
   `PlaybackOps` (§2p). Timeline editing is feature-complete.

### Engine depth
7. **16-bit / linear color** compositing to avoid banding.
8. **Brush controls** ✅ **Partly done.** A live **brush settings panel** exposes size,
   min-size, opacity, flow, hardness, spacing, smoothing and the pressure/build-up toggles
   (§2i). *Still to add: textured brush tips (sampler in `brush.frag`), tilt/azimuth from
   S-Pen, velocity dynamics, custom brush import.*
9. **Tiled surfaces** so large (4K+) canvases aren't one giant texture; partial redraw.
10. ~~**GL context-loss recovery**~~ ✅ **Done.** `setPreserveEGLContextOnPause(true)`
    plus a CPU-side `SurfaceBackupStore` that re-uploads artwork into a fresh engine when
    the context is recreated. See §2g.

### Platform polish
11. S-Pen button mapping, palm rejection, radial quick menu, customizable gestures.
12. Project browser, templates, and settings.

## 7. Testing strategy

- **JVM unit tests** for everything pure: math, undo, model resolution, color, stroke
  processing. Fast, no emulator. (34 tests today.)
- **Instrumented tests** (planned) for GL: render a known stroke offscreen and assert
  pixel coverage via `glReadPixels`.
- **Screenshot/Compose tests** (planned) for UI panels.
