# Native Studio Tablet Test Plan

Use this checklist for Track B native APK builds from PR #4.

## Build under test

Record these before testing:

- PR: #4
- Branch: `codex/scan-repo-for-app-enhancements-4tg2t1`
- Commit SHA
- GitHub Actions run number
- APK artifact name
- Tablet model and Android version

## First launch

1. Install the debug APK.
2. Open InkFrame in landscape.
3. Confirm the native Compose studio appears.
4. Confirm there is no blank screen or immediate crash.
5. Open the welcome/info dialog and close it.

## Drawing and stylus feel

- Draw with finger.
- Draw with S Pen or stylus.
- Draw slow curved lines.
- Draw fast flicks.
- Draw short taps/dots.
- Test pressure-sensitive strokes.
- Switch between at least three brushes.
- Open Brush settings and change size, opacity, spacing, smoothing, and pressure curve.
- Undo and redo strokes.

## Canvas navigation

- Fit canvas to screen.
- Reset zoom to 100%.
- Use two-finger navigation.
- Confirm drawing resumes after navigation.
- Rotate/pause/resume the tablet and confirm artwork remains visible.

## Layers and color

- Add a layer.
- Select another layer.
- Toggle layer visibility.
- Change layer opacity.
- Change blend mode.
- Rename a layer.
- Delete a non-final layer.
- Pick a color from the palette.
- Use eyedropper if available.
- Use fill if available.

## Animation

- Add frames.
- Select frames from the circular frame strip.
- Drag or scrub through frames.
- Toggle onion skin.
- Open onion settings and adjust before/after frame counts.
- Play and pause animation.
- Change FPS if available.

## Project I/O

- Save a `.inkframe` project through the Android file picker.
- Open that saved project.
- Confirm artwork, layers, frames, onion settings, and colors survive reload.

## Export

- Export GIF.
- Export MP4.
- Export PNG sequence zip.
- Confirm exported files can be opened by Android apps.
- Confirm progress/status messages appear and do not freeze the app.

## Failure report format

When something breaks, report:

- Commit SHA and APK artifact.
- What tool/control was used.
- Exact steps to reproduce.
- What happened.
- What was expected.
- Whether saving/exporting still works afterward.

## Release gate

Do not mark Track B ready for main until:

- CI passes.
- Native APK installs.
- Drawing works with stylus.
- Project save/open works.
- At least one animation export works.
- No crash occurs during pause/resume.
