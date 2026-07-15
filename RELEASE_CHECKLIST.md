# InkFrame Release & Tablet Smoke Checklist

Use this checklist for every release candidate, signed build, fresh APK install,
or new Android tablet/WebView version.

## 1. Back up artwork first

Inside InkFrame:

1. Open **Studio**.
2. Tap **Backup archive**.
3. Save the downloaded `.inkframe` outside browser/app storage, such as Downloads, Drive, or external storage.
4. Optional: open **Gallery ▸ Manage** and use **Export archive** as a second path.

Browser storage, APK reinstalls, and WebView data clears can remove local autosaves. A `.inkframe` archive is the portable backup.

## 2. Wait for release-candidate CI

Open the latest Android CI run:

<https://github.com/artistso/inkframesv5/actions/workflows/android.yml>

Required green jobs:

- **Web and Brush Engine V2**
- **Unit tests (JVM)**
- **Build debug APK**
- **Verify signed production APK and AAB**

The web job must include the Canvas pinch navigation contract plus core geometry,
ribbon coverage, radius continuity, contact boundaries, session continuity,
discontinuity segmentation, coalesced input, runtime policy, debug assets, release
assets, and generated-index boot. The production verification job must assemble both
formats with a disposable CI-only key, verify signatures, and inspect the packaged
production assets, including `canvas-navigation.js`.

## 3. Install the debug RC APK

1. Open the completed Android CI run.
2. Download the **`inkframe-debug-apk`** artifact.
3. Unzip it.
4. Install `app-debug.apk` on the target tablet.
5. Confirm the Studio panel initially reports **Engine · V2** on a fresh app-data install.

Debug contains full trace and native S Pen diagnostics. Do not use it as the
public signed release.

## 4. Brush Engine V2 release gate

Use an S Pen with:

```text
Engine: V2
Preset: Balanced
Coverage: Ribbon
Width guard: Guarded
Contact: Strict
```

Test all of the following:

- 50 separate short strokes with large pen relocations between strokes.
- One uninterrupted 15-second spiral.
- Rapid zigzags and abrupt reversals.
- Slow, medium, and flick-speed diagonals.
- Taps and one-move dashes.
- Deliberate light-to-heavy and heavy-to-light pressure ramps.
- Ink and Eraser.
- Pause/resume, app background/foreground, and lock-screen interruption.
- Open and close Studio/Brush controls during drawing.

Acceptance criteria:

- No long diagonal bridge between separate strokes.
- No long bridge inside an uninterrupted stroke.
- A corrupted coordinate may create a small safe gap or isolated cap, never a connecting line.
- Taps and short dashes remain visible.
- Intentional pressure ramps remain monotonic and responsive.
- Eraser never reconnects to an earlier eraser location.
- Undo treats each physical stroke as one operation.

Switch to **Original** and repeat a control set. Confirm the fallback remains
independent and usable.

If any spike survives, stop immediately and export the debug trace before drawing
again. Do not tag the release until the trace is reviewed.

## 5. Canvas pan and pinch-zoom release gate

Use the physical tablet screen rather than a mouse or emulator:

- Draw with the S Pen immediately after touching down; pen input must remain immediate.
- Place two fingers on the canvas and spread/pinch them. Zoom must remain anchored under the gesture midpoint.
- Move both fingers together. The canvas must pan with the midpoint.
- Change the angle between both fingers while keeping roughly the same span. The canvas must not rotate or wobble.
- Begin several pinches with one finger landing slightly before the other. No unwanted dot or short stroke may remain.
- Lift one finger while the other remains down. The remaining finger must not start drawing.
- Exercise the minimum and maximum zoom limits. The transform must remain finite and enough canvas must remain visible to recover it.
- After panning and zooming, draw with the S Pen. The stroke must land directly beneath the nib on the transformed canvas.
- Repeat after pause/resume and display rotation.

Complete this physical gate before approving the Play candidate.

## 6. General browser/PWA smoke test

Verify:

- Start overlay appears on a fresh/no-recovery session.
- **Import archive** restores a `.inkframe`.
- **Gallery ▸ Manage** opens.
- Project templates and custom width/height/FPS/frame count work.
- Export archive creates a `.inkframe` and import restores it.
- Brush Lab opens and texture/preset Save/Use/Export/Import/Delete work.
- Stylus diagnostics reports pressure/tilt/button data where supported.
- Barrel mode cycles **Pick → Erase → Off**.

## 7. General APK smoke test

Verify:

- App launches fully offline.
- Drawing works with S Pen and supported touch/finger controls.
- Palm rejection and stylus-only toggles behave.
- PNG export saves to `Pictures/InkFrame`.
- GIF export completes and saves.
- Video export completes or reports unsupported cleanly.
- Archive export/import works from Studio and Gallery.
- App pause/resume does not lose work.
- Rotation/background/lock-screen recovery behaves acceptably.

## 8. Version and generated notes

For a normal release, add accepted user-facing changes under `CHANGELOG.md`
`[Unreleased]`. A large release may instead use
`release-notes/<next-version>.md`. The version command fails before modifying
metadata when neither source contains release notes.

Replace the placeholders and run:

```bash
./inkframe-cli bump <next-version> --date YYYY-MM-DD
node tools/update-release-notes.mjs --check
node web/tests/version-smoke.mjs
```

Review `RELEASE_NOTES.md`, commit the changes, wait for every required CI gate,
and run:

```bash
./inkframe-cli release-check
```

## 9. Signing prerequisites

Confirm all Actions secrets exist:

```text
INKFRAME_KEYSTORE_BASE64
INKFRAME_KEYSTORE_PASSWORD
INKFRAME_KEY_ALIAS
INKFRAME_KEY_PASSWORD
```

Confirm the original `.jks`, alias, and passwords are stored securely outside
GitHub. See `RELEASING.md` for setup and recovery requirements.

## 10. Publish and verify the signed release

After the approved release candidate is merged to `main`, derive the tag from the
committed metadata rather than typing a historical version:

```bash
VERSION="$(node -p "require('./web/metadata.json').version")"
git tag -a "v${VERSION}" -m "InkFrame Studio ${VERSION}"
git push origin main "v${VERSION}"
```

Watch:

<https://github.com/artistso/inkframesv5/actions/workflows/release.yml>

The workflow must pass signature and packaged-asset verification and publish:

```text
InkFrame-v${VERSION}-signed.apk
InkFrame-v${VERSION}-signed.aab
SHA256SUMS.txt
```

Install the signed APK on a clean device and repeat the minimum Brush Engine V2,
canvas navigation, offline launch, archive, PNG, and GIF tests before distributing it broadly.
