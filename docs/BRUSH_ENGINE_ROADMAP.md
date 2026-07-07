# InkFrame Brush Engine — Stabilizer & Brush Refinement Roadmap

## What we have today (v0.1.1)
- Per-brush profiles: size, opacity, minSize, stabilize, hard, spacing, jitter, taperIn/Out, entry/exit pool, texture, response.
- Catmull-Rom spline strokes through the last 4 samples.
- Velocity-adaptive dab spacing.
- Pressure seat-in (anti-blob at stroke start).
- Living Line: nib width + orientation inertia (Nolan weight).
- Predicted-stroke overlay from last confirmed sample to raw pen tip.
- StreamLine: a single EMA `pen += (raw - pen) * factor`.

## What the big programs do
- **Procreate StreamLine**: "pen on a rope" — virtual string length scales with the slider; fast strokes shorten the rope so the line catches up; slow strokes get a longer rope and more smoothing.
- **Photoshop Smoothing**: stroke-snap + rope length; pulls toward a smoothed point with optional "catch-up on stroke end".
- **Clip Studio Paint**: post-stroke correction (line simplification), plus per-brush "correction" that acts like a weighted average with velocity gating.
- **Krita**: mass-spring-damper stabilizer; heavier mass = smoother, slower line; explicitly separates position/pressure smoothing.
- **Fresco**: vector-raster hybrid; velocity curves affect width and taper; live preview is drawn ahead of the touch.
- **Infinite Painter**: rope stabilizer + predictive stroke extrapolation.
- **Rebelle**: paint-engine simulation; not directly relevant to the stabilizer but informs wet-brush behaviour.

## v0.1.2 plan — stabilizer overhaul
1. Replace the single EMA with a **velocity-adaptive rope + directional bias** smoother.
   - Smoothing factor is high at low velocity, reduced at high velocity.
   - Perpendicular jitter is suppressed more than forward progress.
   - Tiny movements (< jitter gate) are ignored so the line doesn't "breathe" when holding still.
2. Separate smoothing paths for:
   - Position (x, y)
   - Pressure (already partly smoothed; make it velocity-aware too)
   - Tilt/azimuth (already EMA; keep it)
3. Enhance the predicted overlay:
   - Use `getPredictedEvents()` to draw a multi-point predicted curve.
   - Fade the predicted line so it reads as "future ink".
4. Keep per-brush Stabilize slider (0–100) as the primary control.
5. Add a lightweight "Predict" amount to Brush Lab so artists can tune how far ahead the overlay reaches.
6. Tune default profiles:
   - ink: 0.05 (near 1:1, already good)
   - pencil: 0.22
   - marker: 0.28
   - watercolor: 0.45
   - frost: 0.32
   - smudge: 0.16
   - glow/neon: 0.22
   - star: 0.10
   - eraser: 0.12

## Future ideas (not in v0.1.2)
- Post-stroke line simplification / QuickShape ellipse snap.
- Brush dynamics: velocity → opacity/width curves per brush.
- Wet-edge and pigment simulation for water/frost.
- Vector-backed ink layer for infinite zoom.
