# Device recording diagnosis — 2026-07-18

Recording: `Screen_Recording_20260718_014145_InkFrame Studio.mp4`

## Verified observations

- Android input reaches the native `CanvasView`; the UI reports queued/committed ink contacts.
- No live or committed stroke is visible on the paper surface.
- The visible paper colour matches the Compose `HorizonBlush` fallback host rather than the project/OpenGL background.
- Primary radial nodes can be dragged over the drawing surface and remain there, obstructing the canvas.

## Repair boundary

The one-shot repair removes the opaque Compose paper host, keeps the `GLSurfaceView` behind Compose controls, adds GL texture readback evidence after stroke commit, and temporarily locks primary radial nodes to their designed positions.

The resulting device status must distinguish:

- `INK VISIBLE · <count> PX · CEL <id>` — non-transparent pixels were read back from the cel texture;
- `INK LOST · <count> DABS · CEL <id>` — input was processed but the cel texture remained transparent.

This deliberately avoids guessing from touch status alone and creates a direct device-level acceptance signal for the next QA recording.
