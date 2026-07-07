# InkFrame Native Creative Roadmap

This roadmap is the working plan for turning the native Android/Compose/GL app into the primary InkFrame experience. The web build remains useful as a visual reference, but tablet performance, stylus feel, timeline flow, and export reliability now belong to Kotlin and OpenGL.

## Principles

- **Tablet first**: every control must be reachable with pen or thumb without covering the drawing hand.
- **Organic, not generic**: borrow proven ideas from professional art and animation tools, but translate them into InkFrame's glass-orb language instead of recreating desktop panels.
- **Fast strokes over flashy chrome**: if a visual effect competes with brush latency, brush latency wins.
- **Predictable gestures**: drag, hold, scrub, flick, and tap should mean the same thing across brush, timeline, layer, and elemental controls.
- **Incremental parity**: port the web prototype's best ideas in slices that can compile and be tested on-device.

## Canvas priorities

1. **Stylus feel baseline**
   - Track input latency from `MotionEvent` sample to GL stroke preview.
   - Preserve historical batched samples for smoother curves.
   - Add a visible brush cursor / nib preview for size, opacity, and tilt state.
   - Add optional palm-rejection modes: finger pan only, stylus-only draw, mixed input.

2. **Navigation and view control**
   - Standardize pinch zoom, two-finger pan, double-tap fit, and zoom reset.
   - Keep canvas transforms isolated from artwork pixels.
   - Add a one-handed tablet mode where canvas controls stay away from the dominant drawing hand.

3. **Rendering quality**
   - Expand GL brush stamps with texture, grain, wet edge, and soft falloff variants.
   - Add onion-skin compositing presets for rough animation, cleanup, and inbetweening.
   - Add visual debug overlays for dirty rects, FPS, stroke dab spacing, and input samples.

## Timeline priorities

1. **Exposure-sheet mental model**
   - Treat frame cells like cels/exposures, not just rectangular buttons.
   - Support drag-to-move, duplicate, stretch holds, range select, and onion-skin range editing.
   - Show playback in/out and held frames clearly.

2. **Animation actions**
   - Add quick actions for twos, reverse, ping-pong, duplicate range, and clear range.
   - Add audio/reference track planning later, but avoid adding it before core timeline editing feels excellent.

3. **Drag/drop grammar**
   - Drag from frame to frame = move cel.
   - Long-drag frame edge = extend or shrink exposure.
   - Drag brush/color/element onto frame = apply a frame effect or annotate a planned operation.
   - Drag layer onto timeline = expose that layer's cel strip.

## Brush engine priorities

1. **Brush families**
   - Pencil: grain, pressure taper, paper texture pickup.
   - Ink: stabilizer, pressure-to-width, clean taper, optional dry start/end.
   - Marker: broad nib, direction-aware opacity, overlap modes.
   - Watercolor: wet edge, pigment pooling, slow bleed simulation.
   - Smudge/blur: sample-and-push behavior with strength and falloff.
   - Glow/neon: additive bloom-style preview with export-safe flattening.

2. **Math and control curves**
   - Add editable pressure curves for size and opacity.
   - Separate smoothing from stabilization: smoothing follows the pen, stabilization intentionally trails.
   - Support velocity effects for taper, opacity, and spacing.
   - Add per-brush jitter using seeded noise so strokes can be replayed/exported deterministically.

3. **Brush Lab UX**
   - Keep sliders grouped as Shape, Flow, Texture, Stabilizer, Dynamics.
   - Preview every edit on a small live test strip.
   - Save named presets and allow import/export of brush packs.

## Elemental button concept

The elemental button is a central radial control that opens five child orbs:

- **Earth**: texture, grit, paper grain, chalk, grounding/snap tools.
- **Wind**: motion, smear, speed lines, onion flow, frame interpolation helpers.
- **Water**: watercolor, blur, blend, liquify/smudge, soft transitions.
- **Fire**: glow, bloom, spark, energy strokes, destructive/erase variants.
- **Heart**: the unifying orb; opens the elemental fan and can host favorites, harmony palettes, or "bring it together" actions.

The heart icon can intentionally nod to the Captain Planet-style fifth element idea without copying trademarked art. Use an original heart/planet/ring mark in InkFrame's glass style.

### Elemental interaction rules

- Tap Heart: open/close elemental fan.
- Long-press Heart: configure which actions each element exposes.
- Drag an element onto canvas: temporarily switch brush family or effect mode.
- Drag an element onto a frame: apply/plans frame effect.
- Drag an element onto a layer: set layer blend/effect defaults.
- Drag brush/color into an element: save as an elemental preset.

## Button spacing and hit-target rules

- Primary circular controls: 48 dp minimum target, 56 dp preferred for tablet/thumb use.
- Compact timeline controls: 32 dp minimum target only when surrounded by low-risk actions.
- Rail padding: 8 dp minimum, 12 dp preferred when room allows.
- Between-orb spacing: 8 dp minimum, 10-12 dp preferred for radial fans.
- Text and sliders should use 4 dp internal rhythm; destructive actions need extra separation.
- Any draggable control needs a visual lift state, drop target glow, and cancellation affordance.

## First implementation milestones

1. **Native app boots**: app launches `StudioScreen` directly, no WebView runtime.
2. **Metric cleanup**: centralize button sizes, rail widths, frame-cell sizes, and padding constants.
3. **Canvas feel pass**: stylus cursor, input debug overlay, pressure curve diagnostics.
4. **Timeline feel pass**: clearer frame cells, drag preview, hold stretching.
5. **Brush Lab pass**: grouped controls and live preview.
6. **Elemental prototype**: Heart button with Earth/Wind/Water/Fire/Heart fan and no destructive effects yet.
7. **Elemental integration**: drag/drop from elemental fan to canvas, frame, layer, and brush preset targets.
