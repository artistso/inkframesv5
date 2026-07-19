# InkFrame Native Tablet Test Plan

Use this checklist for every native QA APK or release-candidate APK before deciding whether it is ready for release promotion.

Target device: **Samsung Galaxy Tab S10+ with S Pen**.

## Artifact identity

Before installing, record:

- commit SHA;
- workflow run;
- artifact name and ID;
- APK filename;
- SHA-256 checksum;
- package name, usually `com.inkframe.studio.qa` for QA;
- certificate fingerprint.

A QA APK is not public release approval. It is a physical-test artifact.

## Install

1. Download the latest native QA APK artifact from GitHub Actions or issue #142.
2. Verify the recorded SHA-256 checksum.
3. Install it on the Samsung tablet.
4. Open InkFrame in landscape.
5. Confirm the app launches through `SplashActivity` into the native Glass Horizon surface.
6. Confirm there is no blank screen, browser frame, WebView fallback, or conventional Material dashboard.

## Runtime boundary smoke test

Verify:

- the app runs offline;
- airplane mode does not block launch, drawing, save, or export actions;
- no account prompt appears;
- no analytics, advertising, or external service prompt appears;
- Android settings do not show unexpected network-sensitive behavior;
- the APK was inspected by CI for no WebView, no packaged web assets, and no `INTERNET` permission.

## Core drawing smoke test

- Draw with S Pen.
- Draw with finger if touch drawing is enabled.
- Test hover/lens behavior.
- Test pressure variation.
- Test eraser behavior where supported.
- Change brush size.
- Change color.
- Undo and redo.
- Pan and zoom.
- Open Brush Lab or the current brush controls and adjust one setting.

## Animation smoke test

- Add frames.
- Select frames from the perimeter frame board.
- Use the bottom scrub rail.
- Duplicate/copy/paste/delete frames if controls are available.
- Toggle onion skin if available.
- Play and pause animation.
- Confirm frame board and scrub rail update correctly.

## Project safety smoke test

- Create a new project.
- Save a `.inkframe` archive through the Android picker.
- Open the saved archive.
- Close and reopen the app.
- Confirm recovery restores expected local state.
- Confirm no artwork is uploaded or sent anywhere automatically.

## Export smoke test

- Export PNG sequence.
- Export GIF.
- Export MP4 if available.
- Confirm exported files are readable from the selected Android destination.
- Confirm export cancellation is handled cleanly.

## Lifecycle smoke test

- Rotate device if orientation behavior is enabled.
- Background and foreground the app.
- Lock and unlock the screen.
- Force-close and relaunch.
- Confirm drawing state, current frame, layer state, and recovery behavior remain acceptable.

## Report format

When something fails, report:

- APK artifact name and checksum;
- commit SHA;
- tablet model;
- Android version;
- what you tapped or drew;
- what happened;
- what you expected;
- whether save/export/recovery still worked;
- whether the failure is visual, input, persistence, export, lifecycle, or release-boundary related.

## Release decision

A build is a release candidate only when:

- native launch is reliable;
- no WebView/browser fallback is visible;
- S Pen drawing and undo/redo work;
- frame controls work;
- `.inkframe` backup/open works;
- PNG/GIF/MP4 export paths work or fail cleanly with explicit messaging;
- lifecycle recovery works;
- no critical tablet workflow is blocked;
- owner visual approval has been recorded.
