# Circular Canvas and Radial Timeline Plan

Status: planning
Date: 2026-07-07
Target: future v0.3.0 work

## Vision

Circular Canvas Mode turns InkFrame from a standard rectangular drawing surface into a round creative workspace. The goal is to make the canvas, glass-orb controls, and frame timeline feel like one radial instrument.

## Goals

- Let users switch between Square Mode and Circular Mode.
- Clip drawing, onion skin, layers, playback, and previews to a circular canvas when the mode is enabled.
- Arrange timeline slots around the circular canvas instead of the rectangular perimeter.
- Keep the existing square workflow intact.
- Preserve offline-first behavior and tablet performance.

## Proposed UX

A new Shape control can live under Actions or Frames. It toggles Square and Circle. In Circle mode, the canvas gets a soft rim, frame slots wrap around the circle, and the playhead travels around the timeline path.

## Implementation steps

1. Add `canvasShape` state with `square` and `circle` modes.
2. Add circular clipping during render.
3. Add a Shape toggle in the UI.
4. Update frame-board layout to support circular coordinates.
5. Add hit testing so drawing outside the circle is ignored.
6. Test QuickShape, onion skin, layers, exports, playback, and project restore.
7. Add project persistence for the selected canvas shape.

## Files likely to change

- `web/index.html`
- `ARCHITECTURE.md`
- `CHANGELOG.md`
- release notes when the feature ships

## Risks

- Circular timeline math can get complex.
- Edge clipping must not make drawing feel broken.
- Long timelines need efficient frame-slot layout.
- Export behavior needs a clear decision: transparent corners, square export, or crop-to-circle.

## Open questions

1. Should Circular Mode be per project or a global preference?
2. Should exports preserve the full square bitmap or crop/mask the circle?
3. Should there be a hybrid mode with square canvas and circular timeline?
