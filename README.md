<div align="center">

# InkFrame Studio

### The Glass Horizon · Native Android drawing and frame-by-frame animation studio

<img src="media/The_Glass_Horizon_Project_Philosophy.png" alt="InkFrame Studio — the Glass Horizon interface, floating rose-quartz orbs around a paper-white canvas" width="100%" />

<br/>

<img src="media/demo.gif" alt="An animated GIF of a leaping cat drawn frame-by-frame in InkFrame" width="320" />

<br/>

**Native Kotlin · Jetpack Compose · OpenGL ES · offline-first · stylus-first.**

</div>

---

InkFrame Studio is a **2D drawing and frame-by-frame animation app** with the Glass Horizon interface: glowing rose-quartz command orbs around a centered paper canvas, a perimeter frame board, a glass scrub rail, and a stylus-first native drawing surface.

The current Android product is **not** a WebView wrapper. Android startup is owned by Kotlin, Jetpack Compose, and OpenGL ES. The historical web implementation remains in the repository only as a visual and interaction reference for the native port.

Canonical status: [`docs/NATIVE_STATUS.md`](docs/NATIVE_STATUS.md)

## Current product boundary

- **Android runtime:** native Kotlin / Jetpack Compose / OpenGL ES.
- **Artwork path:** native `CanvasView`, `feature-canvas`, and `engine-gl`.
- **Launch path:** `SplashActivity -> MainActivity -> ClosedBetaGlassHorizonScreen`.
- **Offline by design:** no account, no advertising, no analytics, no automatic upload path.
- **No Android WebView:** no `WebView`, no JavaScript bridge, no packaged browser runtime, no `INTERNET` permission.
- **Web reference only:** `web/index.html` remains the historical Glass Horizon design reference, not the Android runtime.

## Quick start

```bash
# Clone
gh repo clone artistso/inkframesv5
cd inkframesv5

# Run all JVM/unit tests
./inkframe-cli test

# Build a local developer APK when an Android SDK is available
./inkframe-cli build-apk
```

For CI-built QA artifacts, use GitHub Actions. The current native QA release lane publishes a non-debuggable `com.inkframe.studio.qa` APK tied to an exact commit and SHA-256 record.

## Native build requirements

| Requirement | Version / notes |
|---|---|
| JDK | 17 |
| Android SDK | API 36 platform, Build Tools 35.x |
| Minimum Android | API 26 |
| Target device | Samsung Galaxy Tab S10+ with S Pen |
| Build system | Gradle wrapper, Android Gradle Plugin, Kotlin |

Native Android metadata is stored in `gradle/inkframe-app.properties`.

## Features under the native line

**Drawing**

- Native OpenGL ES canvas.
- S Pen, finger, pressure, hover/lens, pan, and zoom pathways.
- Brush selection, size controls, color swatches, eyedropper/fill hooks, undo/redo routing.

**Animation**

- Frame board around the drawing stage.
- Bottom scrub rail.
- Frame add, duplicate, delete, copy/paste, loop, and playback controls.
- Layer operations routed through the native model.

**Files and export**

- `.inkframe` project save/open path through Android document pickers.
- GIF, MP4, and PNG sequence export pathways through native Android file destinations.
- Offline project recovery.

**Interface**

- Glass Horizon atmosphere.
- Rose/plum optical nodes.
- Perimeter frame board.
- Stylus lens overlay.
- Tablet-first landscape layout.

## Repository layout

```text
app/                    Native Android application shell, Compose host, signing/package config
core-common/            Pure utilities and math
core-model/             Document model, package codec, defaults, export planning
engine-gl/              OpenGL ES paint/compositor engine
feature-canvas/         Native canvas, Glass Horizon Compose surface, export/recovery bridge
feature-layers/         Layer feature code
web/                    Historical Glass Horizon reference and web prototype, not Android runtime
docs/
  NATIVE_STATUS.md      Current source of truth for Android runtime status
  MAINLINE_KOTLIN_MIGRATION.md
  GLASS_HORIZON_VISUAL_CONTRACT.md
gradle/
  inkframe-app.properties
.github/workflows/      Native CI, QA APK, signing, and release checks
inkframe-cli            Local and agent command entry point
```

## Development rules

1. Keep Android native: no WebView, JavaScript bridge, packaged web runtime, or browser storage dependency.
2. Keep the artwork path offline and private.
3. Treat `gradle/inkframe-app.properties` as the native Android metadata source.
4. Treat `docs/NATIVE_STATUS.md` and `docs/GLASS_HORIZON_VISUAL_CONTRACT.md` as binding documentation.
5. Preserve the historical web app only as a design reference until the native port no longer needs it.
6. Never commit keystores, service-account JSON, passwords, signing secrets, or generated private credentials.
7. Add tests or package-inspection gates for behavior, persistence, signing, Android storage, and network-boundary changes.

## Release boundary

A QA APK is a test artifact, not a public release. It must be recorded with its exact commit, artifact name, package name, certificate, and SHA-256.

A production release requires:

- native tests passing;
- package inspection proving no WebView, no packaged web assets, and no `INTERNET` permission;
- Galaxy Tab S10+ physical acceptance;
- owner approval of the Glass Horizon visual result;
- permanent production signing credentials for `com.inkframe.studio`.

## License

MIT — free to use, modify, and redistribute. See [`LICENSE`](LICENSE).

Privacy: InkFrame is offline-first, with no account requirement, advertising, analytics, or automatic uploads. See [`PRIVACY.md`](PRIVACY.md).

---

<div align="center">

*Built with the Glass Horizon design system · native Android first · stylus, finger, and S Pen focused.*

</div>
