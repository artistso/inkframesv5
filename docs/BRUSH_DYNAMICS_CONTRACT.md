# Brush Dynamics Contract

InkFrame now has a dedicated brush dynamics layer on both sides of the app:

```text
app/src/main/kotlin/com/inkframe/studio/brush/BrushDynamics.kt
web/brush-dynamics.js
```

This layer sits **above** the base brush engine and **below** any renderer. It does not draw directly. It converts base brush stroke samples and stamp plans into dynamic dabs that can be consumed by the current WebView painter or a future native Kotlin renderer.

## Purpose

Modern drawing apps expose expressive brush dynamics rather than a single linear pressure multiplier. This module gives InkFrame the same foundation:

- pressure response curves
- opacity response curves
- velocity damping
- taper response
- deterministic texture/jitter
- symmetry-aware dab generation
- stable presets for ink, pencil texture, and vector-clean strokes

## Core types

### `CurvePoint`

A control point in a response curve.

```kotlin
CurvePoint(input = 0.5f, output = 0.25f)
```

Inputs are clamped to `0..1`. Outputs are clamped to `0..2`, allowing curves to either attenuate or exaggerate a response.

### `ResponseCurve`

A smoothed piecewise curve. The engine uses it for pressure, opacity, velocity, and taper behavior.

Built-in curves:

- `Linear`
- `SoftStart`
- `FirmMiddle`
- `InkSnap`
- `ReverseVelocity`
- `ReverseGentle`
- `gamma(...)`

### `DynamicsPreset`

Artist-facing brush dynamics settings:

- `pressureSize`
- `pressureOpacity`
- `velocitySize`
- `velocityOpacity`
- `taper`
- `pressureDeadZone`
- `pressureGain`
- `velocityScale`
- `jitterAmount`
- `jitterSeed`

### `DynamicBrush`

Combines a base `BrushProfile` with a `DynamicsPreset`.

```kotlin
BrushDynamics.DynamicBrush(
    brushProfile = BrushEngine.VectorInk,
    dynamics = BrushDynamics.VectorClean,
)
```

### `DynamicDab`

Renderer-ready dab payload after all curves and dynamics have been resolved:

- `x`
- `y`
- `radius`
- `hardRadius`
- `feather`
- `opacity`
- `angle`
- `grain`
- `pressure`
- `velocity`
- `taper`
- `symmetryIndex`

### `DynamicStrokePlan`

Full dynamic stroke result:

- base `BrushEngine.StrokePlan`
- generated dabs
- symmetry mode
- symmetry center
- dynamics preset

## Presets

### Smooth Ink

Responsive ink feel with pressure snap and mild velocity damping.

```text
smooth-ink
```

### Pencil Texture

Softer pressure start, stronger opacity falloff, and deterministic jitter.

```text
pencil-texture
```

### Vector Clean

Stable low-jitter profile for clean editable/vector strokes.

```text
vector-clean
```

## Symmetry bridge

`BrushDynamics` depends on the pure vector geometry module for symmetry copies. This is intentional: symmetry is a geometry operation, not a renderer operation.

```text
BrushEngine raw stroke
        ↓
BrushEngine samples + stamps
        ↓
VectorEngine symmetry copies
        ↓
BrushDynamics dynamic dabs
        ↓
Renderer
```

## Migration path

1. Current WebView painter continues drawing normally.
2. Brush dynamics can be used first for telemetry and Brush Lab previews.
3. Native Kotlin renderer can consume `DynamicDab` directly.
4. Individual brushes can opt into dynamics one at a time.

## Safety rule

Do not wire this layer directly into drawing until the report/test path proves that dynamic dab counts, pressure ranges, opacity ranges, and symmetry counts are stable on-device.

## Tests

Kotlin:

```text
app/src/test/kotlin/com/inkframe/studio/brush/BrushDynamicsTest.kt
```

JavaScript:

```text
web/tests/brush-dynamics-smoke.mjs
```

CI runs both before assembling the APK.
