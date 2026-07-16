# InkFrame 0.5.0 Google Play Release Gate

This document controls promotion of InkFrame 0.5.0 from signed release candidate to Google Play production. It does not authorize publication by itself.

## Release identity

- Package: `com.inkframe.studio`
- Candidate version name: `0.5.0-rc1`
- Final public version name: `0.5.0`
- Target SDK: Android 16 / API 36
- Minimum SDK: API 26
- Publishing format: Android App Bundle (`.aab`)
- Direct tablet acceptance format: signed APK
- Play version code: supplied explicitly at release time and greater than every version code already uploaded to Play Console

## Required protected secrets

The `google-play` GitHub environment must provide:

- `INKFRAME_KEYSTORE_BASE64`
- `INKFRAME_KEYSTORE_PASSWORD`
- `INKFRAME_KEY_ALIAS`
- `INKFRAME_KEY_PASSWORD`
- `PLAY_SERVICE_ACCOUNT_JSON_BASE64`

The environment should require manual approval. Secrets must never be committed, printed, uploaded as artifacts, or copied into issue/PR text.

## Build and provenance gate

- [ ] AGP 8.10.1 and Gradle 8.11.1 compile with JDK 17.
- [ ] API 36 is installed and used for `compileSdk` and `targetSdk`.
- [ ] JVM, Web/Brush, generated Android boot, and release-policy suites pass on the exact release commit.
- [ ] Signed release APK and AAB are built from the same commit and version code.
- [ ] APK signature verification passes with `apksigner`.
- [ ] AAB signature verification passes with `jarsigner`.
- [ ] SHA-256 checksums are retained with the release artifacts.
- [ ] Production assets declare `variant=release`, `diagnostics=false`, and `defaultBrushEngine=v2`.
- [ ] `NativeInkLabActivity`, `libgraphics-core.so`, raw trace tooling, and debug telemetry are absent.
- [ ] The production manifest exposes one InkFrame launcher.

## Artist regression gate

- [ ] Existing project archive exported before installation.
- [ ] Upgrade install succeeds without uninstalling or losing local projects.
- [ ] Full Glass Horizon canvas, perimeter timeline, circular timeline, radial controls, layers, gallery, Studio, and export surfaces are present.
- [ ] Native S Pen pressure, hover, eraser, palm rejection, and rapid curves remain fluid.
- [ ] Completed strokes bind to the correct project, frame, layer, or Static Background.
- [ ] Undo/Redo, frame switching, layer visibility, onion skin, playback, holds, loops, and selected-frame operations work.
- [ ] Square and circular canvases draw, navigate, save, reload, and export correctly.
- [ ] Fit, Center, 1:1, pinch, Hand mode, and geometry navigator remain aligned.
- [ ] PNG, GIF, video, and `.inkframe` archive exports succeed or provide an accurate unsupported message.
- [ ] Force-close/reopen and device rotation do not corrupt the active project.

## Google Play policy and listing gate

- [ ] Store title, short description, full description, release notes, screenshots, feature graphic, icon, and privacy-policy URL are current.
- [ ] Data safety states that InkFrame collects and shares no personal data, consistent with the shipping application.
- [ ] Ads declaration is **No**.
- [ ] App access declares no login or restricted account requirement.
- [ ] Content rating questionnaire reflects a general-purpose drawing and animation application with user-created local content.
- [ ] Target audience and designed-for-families answers match the actual product positioning.
- [ ] No sensitive permission is introduced without a matching policy and data-safety update.
- [ ] Play App Signing/upload-key configuration matches the existing published package.

## Rollout sequence

1. Run `Google Play Internal Release` with `confirm_upload=DRY-RUN`.
2. Download and verify the private APK/AAB/checksum artifact.
3. Complete the physical Galaxy Tab acceptance gate.
4. Confirm the next available Play version code in Play Console.
5. Run the workflow with that exact version code and `confirm_upload=UPLOAD` to the **internal** track.
6. Install the Play-generated device APK from the internal track and repeat upgrade/project/export tests.
7. Promote to closed or open testing only after internal acceptance.
8. Promote to production using a staged rollout, beginning at the smallest practical percentage.
9. Monitor Android vitals, crashes, ANRs, reviews, and export/project-loss reports before increasing rollout.
10. Halt rollout immediately for project corruption, incorrect frame/layer commits, input regression, launch failure, or signing/update incompatibility.

## Public-release conversion

The public release must change metadata from `0.5.0-rc1` to `0.5.0`, regenerate release notes from `release-notes/0.5.0.md`, rerun every gate, and use a new monotonically increasing Play version code. The RC AAB must not be promoted as the final release under an unchanged version name.
