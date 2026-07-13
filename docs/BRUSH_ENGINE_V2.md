# InkFrame Brush Engine V2

Status: foundation implementation; not wired to live drawing yet.

## Objective

Build a deterministic, tablet-first brush engine beside the restored v0.1.1 engine. The original engine remains the fallback until V2 is conclusively smoother and more reliable in same-APK A/B testing.

## Pipeline

```text
PointerEvent / recorded trace
  -> canonical sample normalization
  -> bounds, timestamp, and spike validation
  -> time-aware position / pressure / tilt filtering
  -> bounded midpoint-quadratic path construction
  -> arc-length dab placement
  -> pressure/profile mapping
  -> explicit rasterizer command
  -> layer canvas
```

The committed-pixel path does not use predicted events, global Canvas prototype interception, synthetic event-rate normalization, directional-bias correction, or velocity-controlled smoothing.

## Modules

| Module | Responsibility |
|---|---|
| `sample.js` | Immutable canonical sample shape and interpolation |
| `validator.js` | Bounds/timestamp checks and one-sample spike quarantine |
| `filters.js` | Delta-time position, pressure, tilt, and angle filtering |
| `path.js` | Local-hull midpoint quadratic segments |
| `arc-sampler.js` | Deterministic distance-based dab placement |
| `rasterizer.js` | Explicit reference ink and eraser commands |
| `trace.js` | JSON trace recording, parsing, and replay |
| `engine.js` | Pipeline composition and engine lifecycle |

Files are classic-script compatible. During browser integration they must be loaded in the order shown above so they populate `window.InkFrameBrushV2` without relying on `file://` ES-module support.

## Trace format

```json
{
  "format": "inkframe-brush-trace",
  "version": 1,
  "createdAt": "2026-07-11T00:00:00.000Z",
  "metadata": {
    "device": "Samsung tablet",
    "brush": "ink",
    "note": "fast spiral with visible defect"
  },
  "samples": [
    {
      "phase": "begin",
      "x": 412.4,
      "y": 288.1,
      "pressure": 0.18,
      "tiltX": -12,
      "tiltY": 21,
      "azimuth": 1.44,
      "time": 1358.4,
      "pointerId": 7,
      "pointerType": "pen"
    },
    {
      "phase": "move",
      "x": 416.7,
      "y": 291.8,
      "pressure": 0.24,
      "time": 1366.5,
      "pointerId": 7,
      "pointerType": "pen"
    },
    {
      "phase": "end",
      "x": 420.2,
      "y": 295.0,
      "pressure": 0,
      "time": 1374.6,
      "pointerId": 7,
      "pointerType": "pen"
    }
  ]
}
```

A trace must replay to the same ordered dab commands on every run. Device captures with defects become permanent regression fixtures.

## Geometry guarantees

1. Invalid samples never reach filtering or geometry.
2. Suspicious jumps are quarantined until the next sample confirms or rejects them.
3. Quadratic geometry remains inside the convex hull of its local start, control, and end points.
4. Dab spacing is measured in document pixels along the path, not in input-event count.
5. Ink and eraser render through explicit commands; no global Canvas behavior is modified.
6. Predicted samples may later drive a disposable preview only. They must never enter committed artwork.

## A/B integration plan

The first live-integration APK will add a persisted development setting:

```text
Brush engine
- Original v0.1.1
- V2 reference
```

Both engines will receive the same raw pointer stream, but only the selected engine will paint. During diagnostic capture, the inactive engine may compute commands into memory for comparison but must not touch the canvas.

The V2 option initially supports only:

- round ink;
- round eraser;
- pressure-to-width;
- time-aware stabilization;
- quadratic path construction;
- fixed arc-length spacing;
- trace recording.

All other brushes stay on the original engine until their V2 rasterizers are implemented and tablet-validated.

## Acceptance gates

Before V2 becomes the default:

- no spikes in repeated fast loops, diagonals, flicks, and tight spirals;
- visibly smoother or equal line quality to the original engine;
- deterministic replay of captured Samsung S Pen traces;
- near-equivalent output for geometrically equivalent low- and high-rate traces;
- no committed use of predicted events;
- no Canvas or PointerEvent prototype interception;
- no regression in pressure ramps, stroke starts, stroke endings, undo, or erasing;
- original engine remains immediately selectable throughout field testing.

## Next implementation PR

Wire the modules into a development-only A/B adapter in `web/index.html`, add an on-device trace export control, and route only ink and eraser through V2. Do not add velocity dynamics, wet media, texture, tilt nibs, or predictive rendering in that PR.
