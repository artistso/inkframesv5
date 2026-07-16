# InkFrame Studio 0.5.0-rc1 Release Notes

_Date: 2026-07-16_

<!-- Generated release-candidate notes. Final 0.5.0 notes will be regenerated after tablet acceptance. -->

InkFrame 0.5.0 is the first Kotlin-first production candidate: the complete Glass Horizon artist studio remains intact while the high-frequency S Pen path is rendered natively and validated against typed Kotlin project, frame, layer, canvas, brush, and timeline state.

## Before installing

1. Open **Studio**.
2. Export a **Backup archive** outside application storage.
3. Keep the archive until the release candidate has passed save/reload and project-recovery testing.
4. Install the APK over the existing signed test build when signatures match.

## Native S Pen production path

- Added native Kotlin/HWUI S Pen rendering inside the complete InkFrame studio.
- Preserved pressure, historical samples, hover, reverse-stylus erasing, and palm-safe pen ownership.
- Bound every completed stroke to its exact project, frame, layer or Static Background, canvas geometry, brush state, and revision.
- Added schema-2 stroke envelopes and independent Kotlin and JavaScript stale-context validation before history changes.

## Complete studio parity

- Preserved the framed canvas, perimeter timeline, circular timeline, radial controls, layers, projects, playback, onion skin, Undo/Redo, save/reload, and export workflows.
- Kept the simplified native canvas and renderer laboratory out of the production launcher.
- Hid the engineering Brush Engine strip from the normal workspace while retaining Brush Lab through the Control Deck.

## Kotlin state architecture

- Added read-only Kotlin project reconciliation for project, scene, frame, layer, Static Background, canvas shape, selection, playback range, FPS, loop, and holds.
- Added a typed timeline and exposure model with exact active cel addressing.
- Added a Kotlin artist-context HUD for frame, layer, hold, shape, and playback status.

## Canvas and navigation

- Added exact 1:1 actual-pixel inspection.
- Added anchored pinch, two-finger pan, Hand mode, Fit, Center, and keyboard navigation.
- Added a geometry-only canvas navigator that never reads artwork pixels and ignores S Pen input.
- Added brush-size and eraser-aware native hover previews.

## Android and Play release engineering

- Targets Android 16 / API 36 for the 2026 Google Play update requirement.
- Uses Android Gradle Plugin 8.10.1, Gradle 8.11.1, and JDK 17.
- Produces a signed Android App Bundle for Google Play and a signed APK for direct tablet acceptance.
- Fails closed when permanent release signing credentials are unavailable.
- Excludes native diagnostics, raw telemetry, and the debug laboratory from production artifacts.

## Privacy and availability

InkFrame remains offline, ad-free, account-free, subscription-free, and free of analytics or personal-data collection.

## Release-candidate boundary

This candidate must remain on the internal track until physical Galaxy Tab validation confirms native drawing fluidity, project recovery, frame/layer isolation, both timelines, circular canvas, Undo/Redo, playback, exports, and upgrade installation. The final public release will use version name **0.5.0** and an explicitly supplied Play version code greater than the currently published build.
