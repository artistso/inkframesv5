# Circular Canvas and Radial Timeline — Shipped Design Record

Status: shipped in InkFrame Studio 0.4.0
Original planning date: 2026-07-07
Implementation record updated: 2026-07-14

This document preserves the original Circular Canvas design intent and records the decisions made by the shipped implementation. Current development priorities live in `ROADMAP.md`.

## Vision

Circular Canvas Mode turns InkFrame from a standard rectangular drawing surface into a round creative workspace. The canvas, glass controls, thumbnails, exports, and radial frame systems behave as one tablet-first instrument while the square workflow remains available.

## Shipped behavior

- Canvas shape is stored per project as `square` or `circle`.
- New projects and templates begin in Square Mode.
- Project duplication preserves the selected shape.
- `.inkframe` archive export and restore preserve the selected shape.
- Existing projects without shape metadata migrate safely to Square Mode.
- Circular projects clip display rendering and frame composites to the inscribed circle.
- Pointer-down events outside the circle are rejected.
- Original-engine and Brush Engine V2 strokes are clamped to the circular boundary and finish cleanly when they leave it.
- Shape changes are blocked during an active stroke.
- Gallery, frame, and project thumbnail cache signatures include canvas shape.
- PNG and animation export preparation clips paper and artwork to the circle while retaining the rectangular bitmap container and transparent corners outside the circular paper.
- The radial timeline and frame-board systems remain compatible with both shapes.
- Shape changes invalidate affected render and thumbnail caches and schedule local recovery autosave.

## Implementation surfaces

- `web/canvas-shape.js` — geometry, pointer acceptance, boundary clamping, masks, export-paper clipping, toggle UI, and circular rim
- `tools/inject-canvas-shape.mjs` — generated Android project model, archive, renderer, export, input, cache, and autosave integration
- `web/tests/canvas-shape.test.mjs` — deterministic geometry and masking behavior
- `web/tests/canvas-shape-boot.test.mjs` — generated-studio integration
- Radial timeline boot and release-policy suites — cross-feature compatibility

## Original goals and disposition

1. **Square/Circle switching** — shipped.
2. **Circular clipping for drawing, onion skin, layers, playback, and previews** — shipped through the shared composite path.
3. **Shape toggle in the UI** — shipped as a tablet control on the canvas frame.
4. **Radial frame navigation compatibility** — shipped.
5. **Outside-circle hit testing** — shipped for pointer-down and boundary exit behavior.
6. **QuickShape, onion skin, layers, exports, playback, and restore validation** — covered by generated boot and release-policy gates.
7. **Per-project persistence** — shipped in project state, duplication, autosave, and archives.

## Resolved design questions

- **Per project or global?** Per project.
- **Export representation?** Rectangular image/video frame with the circular paper/artwork clipped inside it; corners outside the circle remain transparent where the format supports transparency.
- **Hybrid square canvas with circular timeline?** The radial timeline is independent of canvas shape and works with both Square and Circle modes.

## Continuing constraints

Future work touching canvas shape must preserve:

- Backward-compatible project and archive migration
- Original-engine and Brush Engine V2 boundary behavior
- Shared compositor clipping rather than a second renderer
- Thumbnail/export consistency
- Active-stroke safety
- Offline persistence and deterministic generated Android packaging
