# Core Runtime Recovery

This checkpoint responds to physical Galaxy Tab testing where the native QA build rendered the workspace but produced no visible drawing and did not visibly advance the timeline.

## Runtime corrections

- `CanvasView` is explicitly presented as an RGBA `GLSurfaceView` above the Compose window inside the canvas bounds.
- Gestures beginning inside the drawing surface are translated into canvas-local coordinates and routed directly to the native `CanvasView`.
- The drawing surface disallows parent interception once a stroke begins.
- The temporary recovery wrapper has been removed; `GlassHorizonScreen` is again the sole artist-facing workspace.

## Timeline corrections

- Add Frame inserts after the current frame and selects the new frame.
- Adding a frame expands playback to the full timeline rather than preserving a one-frame range.
- Playback refuses to pretend to run when the project contains fewer than two playable frames.
- Starting playback at the range end restarts from the range beginning.

## Original Glass Horizon measurements restored in this checkpoint

- Title top offset: 14
- Title size: 20
- Subtitle size: 10
- Primary orb diameter: 58
- Radial child diameter: 48
- Perimeter frame slot: 18

These values follow the binding `web/index.html` reference. This checkpoint is not visual approval and does not complete the one-to-one Kotlin port.

## Physical acceptance gate

The next stable QA APK must demonstrate on the Galaxy Tab:

1. a visible finger stroke;
2. a visible S Pen stroke;
3. undo and redo of the stroke;
4. adding at least three frames;
5. distinct frame-local artwork;
6. visible playback advancement at 12 FPS;
7. pause and frame navigation without artwork loss.
