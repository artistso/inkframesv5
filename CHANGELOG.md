# Changelog

All notable changes to InkFrame Studio are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
semantic versioning once it reaches a public release.

## [Unreleased]

### Brush input quality
- Added an active coalesced-sample quality layer in front of the existing painter without replacing its rendering, undo, taper, or stabilization logic.
- Removes duplicate micro-samples and caps pathological pointer batches while always preserving the newest physical endpoint.
- Adds velocity-aware pressure cleanup that follows fast pressure changes while damping slow hand jitter.
- Explicitly preserves native S Pen pressure, tilt, altitude, azimuth, barrel-button state, twist, and contact geometry, including inherited `PointerEvent` fields.

### Canvas panning and zooming
- Added a stylus-safe viewport wrapper around the square canvas. Canvas document pixels and the existing painter remain unchanged.
- Two-finger gestures now combine the existing pinch scaling with midpoint-anchored panning, keeping the artwork under the fingers instead of drifting away.
- Added **Hand** mode for deliberate one-finger or pen panning without drawing, plus two-pointer pan/zoom while Hand mode is active.
- Added cursor-anchored mouse-wheel/trackpad zoom, **Fit**, a live zoom percentage, tap-to-reset navigation, Space-drag, and middle-mouse panning.
- View movement is clamped so the canvas cannot be completely lost offscreen.

### Interaction regression protection
- Added deterministic smoke tests for coalesced pressure filtering, native stylus-field preservation, viewport wrapping, anchor correction, Hand mode, Fit, zoom display, and reset behavior.
- APK assembly is blocked unless the new brush-input and canvas-navigation tests pass with the existing square-canvas, Classic Plus, vector, dynamics, JVM, and boot checks.

## [0.2.0] - 2026-07-10

### Stable square-canvas release
- **Froze the publishable runtime on the proven square-canvas path.** Circular canvas, circular scrubber, and experimental layout/glass/flat override modules remain in the repository for future work but are no longer loaded by the stable APK.
- **Restored the original movable orb button system.** Classic root buttons and child controls retain their smoother movement and expansion behavior without the later layout takeover layers.
- **Added Classic Plus tablet controls.** The UI now includes persistent lock/unlock, two-tap UI reset, collapsible dock, four-corner dock placement, and compact/normal/large button sizing.
- **Added release guardrails.** Startup explicitly opens the square canvas input path, disables retired blocking overlays, restores classic UI state, and exposes release diagnostics.
- **Expanded automated release testing.** CI now syntax-checks runtime modules and verifies brush, dynamics, vector, Classic UI, square-canvas, dock, corner, size, reset, lock, and boot behavior before APK assembly.

### Brush and vector engine foundation
- Added renderer-independent Kotlin and JavaScript brush-engine cores with pressure, velocity, tilt, smoothing, taper, spacing, stamp planning, and shared presets.
- Added advanced brush dynamics with response curves, deterministic texture jitter, symmetry-assisted dabs, quality metrics, smoothness scoring, replay cost, and replay descriptors.
- Added renderer-independent vector path planning with point simplification, Catmull-Rom to cubic Bézier conversion, snapping, symmetry, stroke-outline planning, sampling, bounds, anchors, and SVG path export.
- Added matching JVM and JavaScript smoke tests to keep Kotlin/WebView behavior aligned during the native migration.

## [0.1.2] - 2026-07-07

### Brush engine — stabilizer overhaul
- **Replaced the simple EMA StreamLine with a velocity-adaptive rope + directional-bias stabilizer.** Fast strokes reduce smoothing so the line stays 1:1; slow strokes use the full per-brush Stabilize amount. Perpendicular jitter is suppressed more than forward progress, and sub-pixel noise is gated so the stroke no longer "breathes" while holding still.
- **Pressure smoothing is now stabilizer-aware.** Higher Stabilize values also damp pressure jitter, but never enough to feel late.
- **Predicted-stroke overlay is now tunable per brush.** A new **Predict** slider in Brush Lab controls overlay opacity; the overlay fades along the predicted segment so it reads as "future ink" rather than a full stroke.
- **Retuned default brush profiles** for ink (0.05 stabilize), pencil (0.22), marker (0.28), watercolor (0.45), frost (0.32), smudge (0.16), glow/neon (0.18–0.22), star (0.10), and eraser (0.12).
- Added `docs/BRUSH_ENGINE_ROADMAP.md` documenting research from Procreate, Photoshop, Clip Studio Paint, Krita, Fresco, Infinite Painter, and Rebelle.

## [0.1.1] - 2026-07-07

### Release pipeline — debug APK is the canonical release
- **Promoted the debug APK to the primary release artifact.** `.github/workflows/release.yml` now builds `./gradlew :app:assembleDebug` and publishes `InkFrame-vX.Y.Z-debug.apk` to GitHub Releases. The release body is pulled from `RELEASE_NOTES.md`.
- **Removed the `.debug` application ID suffix** from the debug build type in `app/build.gradle.kts` so the released APK uses the canonical package name `com.inkframe.studio`.
- **Added the missing `.github/workflows/agent-build.yml`** workflow referenced by the Agent Mode docs (`./inkframe-cli gh-ci`). It supports `apk`, `web`, `test`, and `all` tasks via `workflow_dispatch`.
- **Retired the default Play/AAB path** from the main release workflow. The `release` build type and signing config remain in `app/build.gradle.kts` for optional future Play Store use, but the standard GitHub Release is now the debug APK only.

### Web build — tablet, stylus, brush texture, and gallery perf
- **Tablet-first coarse-pointer polish.** Touch devices get larger orbs, kid buttons, rail controls, slider thumbs, project buttons, and a wider Brush Lab without changing desktop density.
- **Readable text mode + typography pass.** Actions ▸ Text toggles high-contrast label capsules, stronger shadows, heavier weights, and brighter secondary text for glare/low-vision tablet use; the base UI font stack, label weights, letter spacing, button padding, touch targets, and input heights were tuned for better tablet readability.
- **Frost glass brush.** A new frosted-glass brush paints a milky translucent body, icy rim highlights, tint wash, and crystalline scratch texture; Brush Lab texture controls how heavy the ice grain feels.
- **Smudge / blur brush.** A new Smudge brush pulls active-layer pixels along the stroke direction with a soft circular nib; opacity controls strength and Texture adds blur/grain for a glassy smear.
- **Pen brush overhaul.** Ink/pen defaults now target low-latency 1:1 tablet feel: no entry/exit pooling, a true pressure hairline, tighter dab spacing, longer clean tapers, lower stabilization, and a pressure curve tuned to avoid start/end blobs. Brush Lab adds **Min size** and **Stabilize** sliders, and existing installs migrate old ink pooling settings once.
- **Timeline power pass.** The frame List branch now shows live thumbnails, supports long-press multi-select, highlights selected ranges on the physical rail/perimeter board, and adds batch actions for duplicate sequence, delete, clear, reverse, ping-pong loop generation, insert +4 blanks, hold +/−, on-twos, selected/loop GIF + video export, select all, and clear selection.
- **Monopoly-board perimeter timeline.** A new frame board wraps around the canvas outside edge, scales with canvas zoom, shows existing frames plus placeholder slots, supports drag-to-select ranges around the board, displays a live frame-cap badge, lets users tap placeholders to add frames, and enforces a hard 120-frame cap to protect tablet memory.
- **Layer merge/flatten tools.** Layers now includes **Merge** (active layer composited down into the layer below using opacity/blend mode) and **Flat** (flatten all visible layers into one transparent layer), both undoable with structural snapshots.
- **Onion skin control upgrade.** Actions now exposes onion depth, ghost opacity, tint strength, past/future tint colour pickers, and an active-layer-only onion mode, with settings persisted across launches.
- **Quick Help overlay.** Actions ▸ Help opens an in-app tablet manual covering backup/archive safety, Brush Lab, stylus/barrel modes, timeline multi-select/export, layers, and gestures, with direct Backup archive and Projects shortcuts.
- **Brush texture control.** Brush Lab now has a **Texture** slider that gates pigment through the paper-grain field. Pencil/marker/watercolor/frost ship with toothy defaults; neon/star/glow stay smooth.
- **Portable brush profiles.** Brush Lab can export/import `.inkbrush` profile JSON for the current brush, making custom brush settings easy to back up and share.
- **Custom brush library.** Brush Lab now has a per-brush saved preset list: save named presets, tap **Use** to apply them, export a saved preset, or delete old experiments. Imported `.inkbrush` files are added to the library automatically.
- **Named project templates.** Gallery ▸ Manage now offers one-tap starters: Classic sketch, HD animation, Square social, Phone vertical, Pixel art, and Neon loop, with sensible canvas sizes, frame counts, FPS, and paper colours.
