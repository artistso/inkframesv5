# InkFrame Native Release & Tablet Smoke Checklist

Use this checklist for every native QA APK, signed build, fresh install, release candidate, or Google Play submission candidate.

Target device: **Samsung Galaxy Tab S10+ with S Pen**.

## 1. Identify the artifact

Record before installation:

- commit SHA;
- workflow run;
- artifact name and ID;
- APK or AAB filename;
- SHA-256 checksum;
- package name;
- certificate fingerprint;
- build type: local debug, stable QA, private signed dry run, or production release.

A QA APK is a physical-test artifact only. It is not public release approval.

## 2. Back up artwork first

Inside InkFrame:

1. Open the current Gallery or Project controls.
2. Save a `.inkframe` archive through the Android system picker.
3. Store the archive outside app-local storage.
4. Reopen that archive once before testing destructive operations.

Clearing app storage or uninstalling the app may remove local recovery data. A `.inkframe` archive is the portable backup.

## 3. Wait for native CI

Open the latest native Android workflow:

<https://github.com/artistso/inkframesv5/actions/workflows/android.yml>

Required green checks for a QA artifact:

- native Glass Horizon boundary check;
- release Kotlin compile and native tests;
- stable non-debuggable QA APK build;
- APK inspection proving no WebView, no packaged web assets, and no `INTERNET` permission.

Required green checks for a production artifact:

- all QA gates above;
- permanent signing readiness;
- signed non-debuggable production APK build;
- production package inspection for `com.inkframe.studio`.

## 4. Install the native QA APK

1. Open issue #142 or the completed native Android workflow run.
2. Download the latest `inkframe-native-qa-release-<sha>` artifact.
3. Verify the SHA-256 checksum.
4. Install the APK on the target tablet.
5. Confirm package name is `com.inkframe.studio.qa` for QA.
6. Confirm launch path is `SplashActivity -> MainActivity -> native Glass Horizon surface`.

Do not use a QA APK as the public signed release.

## 5. Glass Horizon visual gate

Capture and review screenshots for:

- clean launch;
- Tools opened;
- Frames opened;
- one frosted overlay;
- canvas with visible native ink.

Acceptance criteria:

- full rose/plum atmospheric world, not a uniform dark background;
- title and subtitle remain `InkFrame` and `The Glass Horizon`;
- aspect-ratio-correct paper inside rounded frame glass;
- frame board wraps all four sides of the drawing stage;
- bottom scrub rail is separate from the frame board;
- radial glass nodes remain reachable and do not default over the drawing surface;
- stylus lens appears only for S Pen hover/contact;
- no conventional Material dashboard, rail, side panel, or WebView/browser frame appears.

Owner visual approval is required before production release.

## 6. S Pen and drawing gate

Use an S Pen and test:

- separate short strokes with large pen relocations between strokes;
- one uninterrupted long spiral;
- rapid zigzags and abrupt reversals;
- slow, medium, and flick-speed diagonals;
- taps and one-move dashes;
- light-to-heavy and heavy-to-light pressure ramps;
- eraser where supported;
- hover/lens behavior;
- pan and zoom;
- pause/resume, app background/foreground, and lock-screen interruption;
- open and close Glass Horizon controls during drawing.

Acceptance criteria:

- no connecting bridge between separate strokes;
- taps and short dashes remain visible;
- pressure ramps remain responsive;
- eraser behavior remains isolated;
- undo treats each physical stroke as one operation.

## 7. Animation gate

Verify:

- frame selection from the perimeter board;
- frame add;
- frame duplicate/copy/paste/delete where available;
- held/current/filled frame visual states;
- bottom scrub rail navigation;
- play/pause;
- loop behavior;
- onion skin if available;
- thumbnail/playback compositor order.

## 8. Project and archive gate

Verify:

- create project;
- save `.inkframe` archive;
- open saved archive;
- app pause/resume does not lose work;
- force-close/relaunch recovery behaves acceptably;
- archive migration works for intentionally supported older fixtures;
- active frame, layers, canvas shape, artwork, and preferences remain intact after restore.

## 9. Export gate

Verify:

- PNG sequence export;
- GIF export;
- MP4 export if enabled;
- cancellation handling;
- failure messages are explicit and non-destructive;
- exported files open from the selected Android destination.

## 10. Privacy and package boundary gate

Verify from CI inspection and device behavior:

- no `android.permission.INTERNET`;
- no `android.webkit.WebView` markers;
- no `addJavascriptInterface` markers;
- no packaged `web/index.html` or browser JS runtime;
- no analytics, advertising, account, crash-reporting, remote inference, or automatic upload prompt;
- airplane mode does not block normal drawing, save, open, or export workflows.

## 11. Version and generated notes

For a normal release, add accepted user-facing changes under `CHANGELOG.md` `[Unreleased]` or create a non-empty `release-notes/<next-version>.md` for a large release.

Then run the release preparation command and review the diff:

```bash
./inkframe-cli gh-release <patch|minor|major|version>
git status --short
git diff
```

Review `RELEASE_NOTES.md`, commit only reviewed release files, wait for every required CI gate, and run:

```bash
./inkframe-cli release-check
```

## 12. Signing prerequisites

Confirm production signing readiness in `RELEASING.md` before producing a public release.

## 13. Publish and verify the signed release

After the approved release candidate is on `main`, derive the tag from committed metadata and follow `RELEASING.md`.

The release workflow must pass signature and package-boundary verification and publish:

```text
InkFrame-v${VERSION}-signed.apk
InkFrame-v${VERSION}-signed.aab
SHA256SUMS.txt
```

Install the signed APK on a clean device and repeat the minimum native launch, S Pen drawing, archive, PNG, GIF, MP4, privacy, and lifecycle tests before distributing broadly.
