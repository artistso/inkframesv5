# InkFrame Kotlin migration — mainline policy

Status: **binding repository workflow**  
See also: [`NATIVE_STATUS.md`](NATIVE_STATUS.md)

InkFrame Android development proceeds on the native mainline. The Android product target is Kotlin / Jetpack Compose / OpenGL ES.

## Single source of development truth

- `main` is the active development branch.
- New Kotlin, Compose, OpenGL, persistence, input, export, and UI work lands on the native mainline.
- GitHub pull requests created during the earlier migration are archived implementation evidence, not active product branches.
- Archived branches remain available only as recovery snapshots. They must not be built, distributed, or used as competing product entry points.
- The original `web/index.html` remains a visual and behavior reference while the implementation is translated. It is not the Android runtime.

## Product target

The Android application is a native Kotlin / Jetpack Compose / OpenGL ES implementation of the original **InkFrame · The Glass Horizon** design.

The following interfaces are rejected and may not own production startup:

- `StudioScreen` with a conventional rail, toolbar, side panel, and bottom timeline;
- the rejected `GlassCanvasScreen` approximation from closed PR #134;
- any generic Material dashboard substituted for the original Glass Horizon composition;
- any WebView, JavaScript bridge, packaged browser runtime, or Android browser-storage launch path.

The binding visual requirements are in `docs/GLASS_HORIZON_VISUAL_CONTRACT.md`.

## Runtime boundary

The Android runtime must preserve all of these properties:

1. `MainActivity` launches the native Glass Horizon surface.
2. `MainActivity` contains no WebView or JavaScript bridge.
3. No rejected screen owns production startup.
4. Android packaging contains no web app assets, browser runtime, or JavaScript application bundle.
5. The manifest does not request `android.permission.INTERNET`.
6. Kotlin/Compose owns chrome, controls, overlays, and application shell.
7. OpenGL ES owns committed artwork composition.
8. Physical S Pen interaction is tested on Galaxy Tab S10+ before public release.

## Artifact policy

There are three distinct artifact classes.

### 1. Local developer/debug artifacts

Local debug builds may be created for development when the Android SDK is available. They are not release artifacts and must not be described as accepted Glass Horizon builds.

### 2. Stable QA artifacts

Stable QA APKs may be produced from the native mainline when they are explicitly labeled as QA/prototype artifacts.

A valid QA artifact record must include:

- exact commit SHA;
- workflow run;
- artifact name and ID when available;
- APK filename;
- SHA-256 checksum;
- package name, normally `com.inkframe.studio.qa`;
- QA certificate fingerprint;
- note that production signing remains separate.

QA APKs are for physical testing only. They are not public release approval, Play submission approval, or owner visual approval.

### 3. Production artifacts

No production APK, AAB, Play upload, version tag, or public release may be produced until all of the following are true:

1. native Kotlin compilation and tests pass;
2. package inspection proves no WebView, no packaged web runtime, and no `INTERNET` permission;
3. clean, Tools-open, Frames-open, and frosted-overlay screenshots are reviewed;
4. the owner explicitly approves the visual design;
5. physical Galaxy Tab S10+ acceptance passes;
6. permanent production signing credentials are configured for `com.inkframe.studio`;
7. release notes and version metadata are reviewed.

## Preserved recovery points

These commits are archived references. They are not active branches and must not be merged wholesale:

- Kotlin-only runtime boundary: `112fca7853a820f567eee3ee40cc4f804e89115c`
- Frame-local model and archive work: `b0ee2d246cbc3a073a5c775b16419370183e512d`
- Rejected Glass Canvas shell: `2575019764628f1aee1de3657cd393a8f1761114`
- Glass Horizon visual contract branch: `c67af6734b03d0c874c3626b5de11bdbbb7dd217`
- Artifact-lock refinement: `977c095feb193de956b4dbea6a6ec42fd34cfa11`

Useful code may be copied deliberately into `main` in small reviewed commits. Rejected launchers, WebView runtime paths, and UI approximations must not be copied.

## Mainline implementation order

1. Preserve the original Glass Horizon visual contract.
2. Add the faithful native atmosphere and measured stage geometry.
3. Add frame glass, four-sided frame board, and scrub rail.
4. Add draggable optical nodes, native vector glyphs, and radial child menus.
5. Add the live stylus lens and native S Pen callbacks.
6. Connect the native OpenGL canvas and editor state.
7. Port the validated frame-local model and archive compatibility.
8. Capture screenshots and obtain owner approval.
9. Promote only the approved, verified commit to production release.

This file supersedes the previous branch-and-PR migration process. Runtime status details live in `docs/NATIVE_STATUS.md`.
