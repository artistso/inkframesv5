# Kotlin Brush Engine Core

InkFrame now has a native, pure-Kotlin brush planning core at:

```text
app/src/main/kotlin/com/inkframe/studio/brush/BrushEngine.kt
```

This module mirrors the portable JavaScript contract in `web/brush-engine.js`, but it intentionally does **not** depend on Android UI, WebView, Canvas, Compose, or MotionEvent APIs. It is designed to sit between input adapters and future native renderers.

## Current role

The current WebView painter remains authoritative for drawing in this prototype. The Kotlin brush core is a parallel foundation layer for the native transition.

The core can already:

- sanitize brush profiles
- normalize stylus points
- compute pressure, velocity, and tilt response
- stabilize and smooth incoming points
- sample stroke segments
- produce stamp plans
- expose a compact Kotlin/JS interop signature
- run in JVM tests without Android instrumentation

## Data contract

### `BrushProfile`

Brush behavior and material identity.

Key fields:

- `id`
- `name`
- `shape`
- `blendMode`
- `spacing`
- `size`
- `minSize`
- `maxSize`
- `opacity`
- `flow`
- `softness`
- `grain`
- `pressureSize`
- `pressureOpacity`
- `velocitySize`
- `velocityOpacity`
- `tiltSize`
- `tiltAngle`
- `smoothing`
- `stabilization`
- `stampCap`

### `RawStylusPoint`

Input adapter payload. This should eventually be produced from Android `MotionEvent` / S Pen samples.

```kotlin
BrushEngine.RawStylusPoint(
    x = x,
    y = y,
    timeMs = eventTime,
    pressure = pressure,
    tiltX = tiltX,
    tiltY = tiltY,
)
```

### `StylusPoint`

Normalized input point with velocity and clamped pressure/tilt values.

### `StrokeState`

Immutable-ish stroke continuation state. Feed points through `BrushEngine.feedPoint(...)` and keep the returned state for the next point.

### `StrokeSample`

A planned point along the stroke, with resolved size, opacity, taper, angle, softness, and grain.

### `StampPlan`

Renderer-ready dab instruction:

- position
- radius
- hard radius
- feather
- opacity
- angle
- grain
- blend mode
- shape

A native renderer can consume `StampPlan` without knowing about smoothing or raw stylus input.

## Presets

The native core currently includes:

- `LovelyInk`
- `GlassPencil`
- `RoseBrush`
- `VectorInk`

These mirror the JavaScript foundation presets and will become the bridge between Brush Lab settings and native Kotlin rendering.

## Next integration step

The next safe step is to add an Android-side adapter that converts input into `RawStylusPoint` without yet taking over drawing:

```text
MotionEvent / S Pen sample
        ↓
RawStylusPoint
        ↓
BrushEngine.feedPoint(...)
        ↓
StrokeSample + StampPlan telemetry
        ↓
Debug report / optional overlay
```

After that telemetry is verified, we can introduce a native renderer behind a feature flag.

## Testing

JVM tests live at:

```text
app/src/test/kotlin/com/inkframe/studio/brush/BrushEngineTest.kt
```

Covered behavior:

- unsafe profile values are clamped
- point normalization computes velocity and clamps pressure
- stroke planning produces samples and stamps
- pressure changes stamp radius
- `feedPoint` carries stroke state forward
- the Kotlin signature documents the interop contract

Run with:

```bash
./gradlew test
```

## Transition rule

Do not replace the current painter in one jump. The migration should happen in three staged layers:

1. **Core parity** — pure Kotlin engine mirrors JS planning. Done.
2. **Input telemetry** — Kotlin observes stylus events and reports planned samples/stamps. Next.
3. **Renderer flag** — Kotlin renderer can be enabled per brush/tool after telemetry matches expected behavior.
