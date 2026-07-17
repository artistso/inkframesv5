# Core Runtime Recovery

This checkpoint responds to physical Galaxy Tab testing where the native QA build rendered the workspace but produced no visible drawing and did not visibly advance the timeline.

## Recording evidence from 17 July 2026

The 76.9-second device recording for commit `6473312` established that:

- the Glass Horizon workspace and radial menus launch and respond;
- Pencil and a 6 px line were visibly selected, but repeated canvas contacts left no visible dots or strokes;
- frame insertion and manual frame navigation worked to at least eight frames;
- the permanent timeline lacked a directly accessible play/pause control;
- `setZOrderOnTop(true)` placed the OpenGL surface above Compose, visibly cutting the center out of the About overlay;
- a transient gray canvas rectangle confirmed an unstable surface/composition path.

That build remains rejected.

## Device-safe runtime corrections

- `CanvasView` now uses media-overlay ordering rather than top-of-window ordering, keeping the OpenGL drawing surface below Compose overlays.
- Gestures beginning inside the drawing surface remain translated into canvas-local coordinates and routed directly to the native `CanvasView`.
- The drawing surface disallows parent interception once a stroke begins.
- Visible `INK CONTACT` and `INK COMMITTED` status messages distinguish Android input delivery from raster failures during QA.
- The temporary recovery wrapper remains removed; `GlassHorizonScreen` is the sole artist-facing workspace.

## Deterministic stroke commit

The live wet-stroke preview remains OpenGL. Completed strokes now use a tested dirty-region CPU rasterizer to write exact RGBA pixels into the active OpenGL cel texture. This prevents device-specific framebuffer or blend behavior from accepting input without persistent artwork.

The deterministic commit path includes:

- pressure-sized round dabs;
- brush hardness and flow;
- max-coverage strokes and build-up brushes;
- source-over color/opacity compositing;
- eraser alpha reduction;
- existing stroke snapshot undo/redo integration.

OpenGL remains responsible for cel textures, layer compositing, onion skinning, presentation and export readback.

## Timeline corrections

- Play/pause is directly available on the permanent timeline rail.
- Add Frame inserts after the current frame and selects the new frame.
- Adding a frame expands playback to the full timeline rather than preserving a one-frame range.
- Playback refuses to pretend to run when the project contains fewer than two playable frames.
- Starting playback at the range end restarts from the range beginning.

## Original Glass Horizon measurements retained

- Title top offset: 14
- Title size: 20
- Subtitle size: 10
- Primary orb diameter: 58
- Radial child diameter: 48
- Perimeter frame slot: 18

These values follow the binding `web/index.html` reference. This checkpoint is not visual approval and does not complete the one-to-one Kotlin port.

## Physical acceptance gate

The next stable QA APK must demonstrate on the Galaxy Tab:

1. `INK CONTACT` appears on pen-down;
2. `INK COMMITTED` appears on pen-up;
3. a visible finger stroke;
4. a visible S Pen stroke;
5. undo and redo of the stroke;
6. adding at least three frames;
7. distinct frame-local artwork;
8. visible playback advancement at 12 FPS using the rail Play button;
9. About and Gallery overlays appearing completely above the canvas;
10. pause and frame navigation without artwork loss.
