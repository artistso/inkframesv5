# InkFrame Tablet Test Plan

Use this checklist for every APK build before deciding whether it is ready for a release branch.

## Install

1. Download the latest APK artifact from GitHub Actions.
2. Install it on the Samsung tablet.
3. Open InkFrame in landscape.
4. Confirm the app loads into the canvas instead of a blank screen.

## Core drawing smoke test

- Draw with finger.
- Draw with stylus.
- Change brush size.
- Change color.
- Undo and redo.
- Toggle readable text mode if available.
- Open Brush Lab and adjust one brush setting.

## Animation smoke test

- Add frames.
- Duplicate or hold a frame if controls are available.
- Turn onion skin on and off.
- Play animation.
- Change FPS.
- Confirm the frame board/timeline updates correctly.

## Project safety smoke test

- Open Gallery or Projects.
- Rename a project.
- Duplicate a project.
- Export a `.inkframe` archive.
- Close and reopen the app.
- Confirm autosave/recovery restores the project.

## Export smoke test

- Export PNG.
- Export GIF.
- Export video if available.
- Confirm saved files appear in the expected Android folders.

## Android shell smoke test

- Tap any external link in the Studio/About panel.
- Confirm it opens outside InkFrame instead of trapping the tester inside the WebView.
- Return to InkFrame and confirm drawing still works.

## Report format

When something fails, report:

- APK artifact or PR number.
- Tablet model.
- Android version.
- What you tapped.
- What happened.
- What you expected.
- Whether backup/export still worked.

## Release decision

A build is a release candidate only when:

- Canvas loads reliably.
- Drawing and undo/redo work.
- Projects can be backed up.
- PNG/GIF export works.
- No critical tablet workflow is blocked.
