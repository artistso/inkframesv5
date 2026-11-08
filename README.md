<div align="center">

# InkFrame Studio

### The Glass Horizon

**A native Android studio for drawing and frame-by-frame animation.**

<img src="media/The_Glass_Horizon_Project_Philosophy.png" alt="InkFrame Studio's Glass Horizon visual direction: rose-quartz light around a paper canvas" width="100%" />

**Kotlin · Jetpack Compose · OpenGL ES · offline-first**

[**Releases and APKs**](https://github.com/artistso/inkframesv5/releases) · [Visual contract](docs/GLASS_HORIZON_VISUAL_CONTRACT.md) · [Native status](docs/NATIVE_STATUS.md)

</div>

---

InkFrame is being built around its original **Glass Horizon** workspace: a luminous rose-and-plum atmosphere, a paper drawing stage, a perimeter frame board, a glass scrub rail, and optical command nodes. The Android application is native Kotlin, Compose, and OpenGL ES; the historical web app is retained as a design reference and is not packaged or run by Android.

## Build status

The native project and automated Android build are active. A green compile or QA APK build confirms that the code builds and package checks pass; it does **not** replace S Pen/touch acceptance or visual review on a physical tablet. QA APKs are test artifacts, not production releases. Use the Releases page for published artifacts and check each release's notes and validation status before installing.

## Product boundary

- **Native Android runtime:** Kotlin, Jetpack Compose, and OpenGL ES.
- **Offline artwork path:** no account, ads, analytics, or automatic artwork upload.
- **No browser runtime:** no WebView, JavaScript bridge, packaged web app, or Android INTERNET permission.
- **Reference material:** `web/` is historical design and interaction reference only.

## Current areas of work

- Stylus and touch drawing, pressure response, brushes, undo/redo, and canvas navigation.
- Frame-by-frame animation, held-frame timing, playback, layers, and a perimeter frame board.
- `.inkframe` project files, local recovery, and GIF, MP4, and PNG-sequence export.
- Glass Horizon visual and interaction parity, including original node placement, timeline behavior, and responsive touch controls.

These are active development areas; automated tests do not imply every interaction has passed physical-device acceptance. See [`docs/NATIVE_STATUS.md`](docs/NATIVE_STATUS.md) for the current implementation boundary and known parity gaps.

## Development

Requirements: JDK 17, Android SDK API 36, and Android Build Tools 35.0.0.

```bash
# JVM/unit tests
./gradlew test --stacktrace --console=plain

# Release Kotlin compile and tests
./gradlew :app:compileReleaseKotlin test --stacktrace --console=plain

# Local developer APK (requires the Android SDK)
./inkframe-cli build-apk
```

Native app metadata lives in `gradle/inkframe-app.properties`. Production APK/AAB packaging is fail-closed and requires the permanent production signing identity; QA signing is separate and cannot publish to Google Play.

## Repository map

```text
app/                    Native Android application and packaging
core-common/            Platform-free math and utilities
core-model/              Document model, project archives, export planning
engine-gl/               OpenGL ES paint and compositor engine
feature-canvas/          Glass Horizon workspace, canvas, recovery and export
feature-layers/          Layer support
web/                     Historical design reference only
docs/                    Native status, architecture and visual contract
.github/workflows/       Android CI, QA packaging and release policy
```

## Privacy and license

InkFrame is offline-first. See [`PRIVACY.md`](PRIVACY.md). The source is MIT licensed; see [`LICENSE`](LICENSE).
