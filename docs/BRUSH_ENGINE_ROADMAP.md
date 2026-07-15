# InkFrame Brush Engine — Stabilizer Research and Shipped Record

Status: stabilizer overhaul shipped in 0.1.2; Brush Engine V2 expanded in 0.4.0
Original roadmap date: 2026-07-07
Record updated: 2026-07-14

This document preserves the research that informed InkFrame’s stabilizer work and records what shipped. Current priorities live in `ROADMAP.md`.

## Baseline before the overhaul

InkFrame already had:

- Per-brush profiles for size, opacity, minimum size, stabilization, hardness, spacing, jitter, taper, pooling, texture, and pressure response
- Catmull–Rom spline strokes through recent samples
- Velocity-adaptive dab spacing
- Pressure seat-in to prevent start blobs
- Living Line nib-width and orientation inertia
- A predicted-stroke overlay from the confirmed path toward the raw pen tip
- A single-EMA StreamLine smoother

## Reference models considered

The research compared several established approaches:

- **Procreate StreamLine** — virtual rope behavior with speed-dependent catch-up
- **Photoshop Smoothing** — snap/rope smoothing with end-of-stroke catch-up concepts
- **Clip Studio Paint** — per-brush correction and post-stroke simplification
- **Krita** — mass/spring/damper stabilization with separate signal treatment
- **Adobe Fresco** — pressure/velocity shaping and live predictive feedback
- **Infinite Painter** — rope stabilization and prediction
- **Rebelle** — wet-media behavior relevant to later pigment research

These references informed general interaction principles; InkFrame’s implementation remains its own offline JavaScript engine.

## Shipped in 0.1.2

The original stabilizer plan was completed:

1. The single EMA was replaced by velocity-adaptive rope and directional-bias smoothing.
2. Slow movement receives stronger smoothing while fast strokes retain direct response.
3. Perpendicular jitter is suppressed more aggressively than forward progress.
4. Sub-pixel stationary noise is gated so a held stylus does not make the line breathe.
5. Pressure smoothing became stabilizer-aware and velocity-sensitive.
6. Predicted ink became tunable per brush and visually fades as future ink.
7. Brush defaults were retuned individually for ink, pencil, marker, watercolor, frost, smudge, glow, neon, star, and eraser.
8. The existing Stabilize control remained the primary artist-facing parameter.

The canonical release record is in `CHANGELOG.md`.

## Expanded in Brush Engine V2 and 0.4.0

Later work built a deterministic modular engine around the stabilizer foundation:

- Original/V2 runtime selection and generated Android policy
- Coalesced input normalization and discontinuity segmentation
- Contact-boundary and radius-continuity guards
- Continuous ribbon coverage
- Corner-preservation controls
- Ghost Trail feedback
- Tablet Brush Lab categories and safety controls
- Custom presets and profile history/recovery
- Non-destructive preview pad, A/B comparison, and reference-stroke replay
- Local deterministic Brush Coach
- Brush identities, Identity Mixer, Brush Match, and Brush Signature
- Generated browser/Android boot isolation and release-policy verification

## Candidate research, not committed release work

The remaining ideas are exploratory and must begin with narrow issues and explicit write boundaries:

- Post-stroke simplification with editable QuickShape geometry
- Per-brush velocity-to-opacity and velocity-to-width curves
- Wet-edge, pigment transport, and drying behavior for watercolor and frost
- Vector-backed or editable ink layers for nondestructive line revision and deep zoom
- Additional performance instrumentation for long sessions and 120-frame projects

None of these candidates should bypass physical tablet acceptance when stylus latency, pointer capture, WebView behavior, or memory pressure is involved.

## Continuing constraints

Brush work must preserve:

- Original-engine compatibility
- Deterministic V2 replay and generated Android assets
- Per-brush profile migration and recovery
- Project/archive backward compatibility
- No network dependency or automatic telemetry
- Non-destructive diagnostics and previews
- Active-stroke ownership and pointer-capture safety
- Debug APK plus signed production APK/AAB verification
