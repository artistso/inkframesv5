# InkFrame Studio 0.1.0 Release Notes

_Date: 2026-07-06_

InkFrame Studio is an offline-first 2D drawing and frame-by-frame animation app with a radial Glass Horizon interface. This release focuses on making the tablet/browser workflow safer, more polished, and easier to back up before APK installs or browser storage changes.

## Highlights

### Android and release readiness

- Target SDK updated to Android 15 / API 35.
- `web/metadata.json` is the single source for in-app version/package/SDK display and Android Gradle `versionName`/SDK values.
- CI installs Android platform/build-tools 35 before APK/AAB builds and runs a version metadata smoke test.
- Android WebView Blob export bridge added for GIF/video exports.
- MIME-aware MediaStore routing:
  - images → `Pictures/InkFrame`
  - videos → `Movies/InkFrame`
  - other future files → Downloads
- Added MIT `LICENSE` and offline/privacy notes in `PRIVACY.md`.

### Project management and backup

- **Gallery ▸ Manage** project browser with thumbnails, names, stats, switch, duplicate, scale-copy, clear, and delete.
- Portable `.inkframe` archive export/import for the whole gallery.
- Archive import/export runs asynchronously with progress text to stay tablet-friendly.
- Studio panel includes a direct **Backup archive** action.
- First-launch Start overlay offers templates, archive import, project manager, blank canvas, skip, and “don’t show again.”

### Templates

- One-tap starters:
  - Classic sketch
  - HD animation
  - Square social
  - Phone vertical
  - Pixel art
  - Neon loop
- Template cards show aspect/paper/frame-count preview chips.
- Custom template creator supports width, height, frames, FPS, and paper color.

### Brush and stylus polish

- Brush Lab **Texture** slider for paper-tooth pigment gating.
- Portable `.inkbrush` export/import.
- Per-brush saved preset library with **Save preset**, **Use**, **Export**, and **Del**.
- Stylus diagnostics panel for pressure, tilt, button, contact patch, and canvas coordinates.
- Barrel/side-button mode cycle:
  - Pick
  - Temporary eraser
  - Off

### Export performance

- GIF export streams one flattened frame at a time instead of keeping all raw frames in memory.
- GIF export reuses a single flattening canvas.
- Very large GIF exports warn before starting.
- Video export cleans up capture tracks if recorder setup fails.

## Recommended tablet smoke test

See `RELEASE_CHECKLIST.md` for the full test flow. Minimum smoke test:

1. Open Studio → **Backup archive**.
2. Create a project from Start or Gallery templates.
3. Draw with pen/stylus.
4. Test Brush Lab texture and presets.
5. Test Gallery archive export/import.
6. Export PNG, GIF, and video where supported.
7. Install the APK artifact from CI and repeat the core drawing/export checks.

## Known limitations

- Browser/Android media support varies; video export may fall back or report unsupported depending on WebView/browser codecs.
- `.inkframe` archives are JSON with PNG data URLs, not a compressed ZIP package yet.
- Local autosave is device/browser storage; use `.inkframe` archive export for real backups.
