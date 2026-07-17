# InkFrame Kotlin-Only Migration

Status: active implementation branch  
Branch: `native/kotlin-only-studio`

## Product boundary

InkFrame is an Android application written in Kotlin. The historical web studio is a temporary
reference implementation used to define visual and behavioral parity; it is not an Android runtime,
packaged asset, fallback editor, or permanent subsystem.

The production launch path is:

```text
SplashActivity
  -> MainActivity
      -> Jetpack Compose StudioScreen
          -> native CanvasView
              -> OpenGL ES PaintEngine
```

The Android package must not:

- create or host a `WebView`;
- enable JavaScript or install a JavaScript interface;
- package `web/index.html` or `web/brush-engine-v2`;
- run Node/Vite/injector tasks as part of APK or AAB construction;
- derive Android versioning or SDK levels from web metadata;
- request internet access for the offline studio;
- replay completed S Pen strokes through JavaScript.

## Reused native foundation

The migration retains and develops the existing Kotlin modules:

- `core-common`: geometry, transforms, JSON, undo primitives, flood fill, GIF/LZW, YUV;
- `core-model`: projects, scenes, layers, cels, brushes, onion skin, playback and export planning;
- `engine-gl`: GPU cel surfaces, brush stamping, wet-stroke scratch compositing and layer compositing;
- `feature-canvas`: Compose studio, native `GLSurfaceView`, S Pen input, SAF project I/O and export;
- native S Pen laboratory code: historical samples, pressure, tilt, orientation, eraser and hover research.

## Migration gates

### Gate 1 — Native application boundary

- [x] Native application metadata replaces `web/metadata.json` for Android packaging.
- [x] `MainActivity` launches `StudioScreen` directly.
- [x] Android Gradle no longer stages or injects web assets.
- [x] Production manifest removes internet access and migration prototype activities.
- [x] CI rejects packaged web assets and JavaScript brush-engine assets.
- [ ] Native debug APK builds and launches on the Galaxy Tab.

### Gate 2 — Canonical Kotlin persistence

- [ ] Define the complete Kotlin project schema for frames, holds, layers, backgrounds and brushes.
- [ ] Add atomic autosave, backup rotation, bounded decoding and corruption quarantine.
- [ ] Implement read-only import for existing web autosave/archive versions.
- [ ] Preserve existing artwork without write-back into the legacy format.

### Gate 3 — Native input and brush parity

- [ ] Route normalized `MotionEvent` samples directly to the Kotlin brush engine.
- [ ] Integrate unbuffered S Pen dispatch, hover, eraser and palm rejection.
- [ ] Port deterministic Brush Engine V2 geometry and tuning to pure Kotlin.
- [ ] Validate recorded-stroke parity for dots, pressure ramps, corners, circles and fast scribbles.

### Gate 4 — Full studio parity

- [ ] Translate the Glass Horizon radial controls to Compose/native Android.
- [ ] Translate perimeter and circular timelines.
- [ ] Translate project, layer, onion-skin, timing and Brush Lab workspaces.
- [ ] Add static project backgrounds and circular-canvas export parity.
- [ ] Pass screenshot, behavior, accessibility and physical-device parity gates.

### Gate 5 — Reference retirement

- [ ] Preserve a tagged archival snapshot of the web golden master.
- [ ] Remove web code, injectors and browser tests from the active Android repository.
- [ ] Replace parity tests with Kotlin/JVM, instrumentation, screenshot and macrobenchmark suites.

## Release rule

No merge to `main`, release tag, Play upload or public rollout occurs until the exact branch head:

1. passes native CI;
2. preserves existing project data through tested migration;
3. passes physical Galaxy Tab and S Pen acceptance;
4. exposes the complete InkFrame product rather than a reduced editor.
