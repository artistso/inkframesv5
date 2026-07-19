# InkFrame Studio Roadmap

Status date: 2026-07-18  
Current native development line: `0.5.0-native-mainline1`  
Current public historical baseline: `0.4.0`

This document is the canonical development roadmap. Runtime status is defined by [`docs/NATIVE_STATUS.md`](docs/NATIVE_STATUS.md). The binding visual target for the Kotlin port is [`docs/GLASS_HORIZON_VISUAL_CONTRACT.md`](docs/GLASS_HORIZON_VISUAL_CONTRACT.md).

## Current product direction

InkFrame for Android is now a **native Kotlin / Jetpack Compose / OpenGL ES** application.

The historical web implementation remains in the repository only as a Glass Horizon visual and interaction reference. It is not the Android runtime and must not be packaged into Android APKs.

## Historical public baseline

InkFrame 0.4.0 established the pre-native production foundation:

- Brush Engine V2 with profile recovery, identity tools, matching, signatures, previews, and coaching;
- square and circular project canvases;
- organic radial frame navigation and S Pen scrubbing;
- direct timing plus rhythms, recipes, variations, morphs, phrases, libraries, and scores;
- exact 25-step timing Undo/Redo with a tablet history inspector;
- offline project recovery, portable archives, Android export bridging, and signed release verification;
- Glass Horizon launcher, splash, and radial studio presentation.

That baseline remains useful historical evidence, but it does not override the native mainline.

## Native mainline baseline

The active mainline target is:

- Kotlin and Jetpack Compose application shell;
- OpenGL ES artwork canvas and compositor;
- no WebView, no JavaScript bridge, no packaged web runtime, and no `INTERNET` permission;
- `SplashActivity -> MainActivity -> ClosedBetaGlassHorizonScreen` launch path;
- stable non-debuggable QA APK lane for `com.inkframe.studio.qa`;
- conditional permanent-key production APK lane for `com.inkframe.studio`.

## Active release line

### 1. Native Glass Horizon acceptance

Complete issue #136 against the exact recorded APK and SHA-256 for the current native mainline.

Required coverage includes:

- clean Galaxy Tab S10+ landscape launch;
- no fallback to the rejected conventional Material screen;
- no WebView/WebKit/runtime browser markers;
- Glass Horizon atmosphere, title, framed paper, perimeter frame board, scrub rail, radial nodes, and stylus lens;
- S Pen draw, hover, pressure, eraser, pan, zoom, orientation, background/resume, and process restart;
- save/open `.inkframe` archive path;
- GIF, MP4, and PNG-sequence export paths;
- project recovery path;
- QA artifact recorded with exact commit, APK name, package, certificate, and SHA-256.

A new implementation commit invalidates the previous acceptance artifact and requires a replacement artifact record.

### 2. Preserve component-level evidence

Historical issues and stacked PRs remain implementation evidence. They should not be merged, rewritten, or treated as competing active branches merely to make their state resemble current `main`.

Useful code may be copied deliberately into `main` in small reviewed commits, but archived launchers, rejected UI approximations, and WebView runtime paths must not be restored.

### 3. Prepare the next public release

After native acceptance succeeds:

1. Update `CHANGELOG.md` `[Unreleased]` with accepted user-facing behavior.
2. Regenerate and verify `RELEASE_NOTES.md`.
3. Select and apply the release version with `./inkframe-cli bump` or `./inkframe-cli gh-release`.
4. Run `./inkframe-cli release-check` from a clean, synchronized `main`.
5. Complete a protected signed-release dry run.
6. Tag only the exact accepted and verified commit.
7. Publish the GitHub Release.
8. Manually submit the signed AAB to the intended Google Play track if Play release is approved.

## Candidate engineering after acceptance

These are investigation areas, not committed release promises:

- split `ClosedBetaGlassHorizonScreen` into smaller Compose surfaces and effect controllers;
- add node docking/drag persistence tests against the Glass Horizon contract;
- add screenshot-driven visual acceptance fixtures for clean, Tools-open, Frames-open, and frosted-overlay states;
- performance budgets and memory diagnostics for long 120-frame projects;
- accessible high-contrast and reduced-motion Glass Horizon variants;
- per-brush velocity curves for width and opacity;
- wet-edge and pigment transport for watercolor and frost media;
- post-stroke vector-backed ink or editable line layers;
- expanded QuickShape geometry and editable shape constraints.

Each candidate should begin with a narrow issue, explicit read/write boundaries, deterministic tests, and a separate acceptance artifact when Android, S Pen, storage, export, or lifecycle behavior is involved.

## Engineering constraints

Every new feature must preserve:

- native Android runtime ownership;
- no WebView, JavaScript bridge, packaged web runtime, or `INTERNET` permission;
- offline-first operation;
- no account requirement, advertising, analytics, or automatic uploads;
- artwork isolation unless the feature explicitly edits artwork;
- project and archive backward compatibility;
- original-engine and Brush Engine V2 interoperability where still applicable;
- generated Android asset determinism;
- explicit Gradle inputs for every generated or imported asset postprocessor;
- debug/developer, QA, and production signing boundary separation;
- physical tablet acceptance for stylus, keyboard, picker, storage, export, lifecycle, or WebView-sensitive behavior;
- exact artifact and commit recording for acceptance builds.

## Historical documents

- `CIRCULAR_CANVAS_PLAN.md` — original circular-canvas design record; shipped in 0.4.0.
- `docs/BRUSH_ENGINE_ROADMAP.md` — original stabilizer research and shipped 0.1.2 implementation record.
- `web/` — historical Glass Horizon reference only, not Android runtime.

Historical plans should state their shipped or archived status and point back to this roadmap and `docs/NATIVE_STATUS.md` rather than presenting completed or rejected work as the current product path.
