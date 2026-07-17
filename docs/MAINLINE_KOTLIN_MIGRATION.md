# InkFrame Kotlin migration — mainline policy

Status: **binding repository workflow**

InkFrame development now proceeds directly on `main`. No feature branch, stacked pull request, release-candidate branch, or branch-specific APK is an active product path.

## Single source of development truth

- `main` is the only active development branch.
- New Kotlin, Compose, OpenGL, persistence, input, and UI work is committed directly to `main`.
- GitHub pull requests created during the earlier migration are archived, not merged.
- Archived branches remain available only as recovery snapshots. They must not be built, distributed, or used as competing product entry points.
- The original `web/index.html` remains a visual/behavior reference while the implementation is translated. It is not the target Android runtime.

## Product target

The Android application is a native Kotlin/Compose/OpenGL implementation of the original **InkFrame · The Glass Horizon** design.

The following interfaces are rejected and may not own production startup:

- `StudioScreen` with a conventional rail, toolbar, side panel, and bottom timeline;
- the rejected `GlassCanvasScreen` approximation from closed PR #134;
- any generic Material dashboard substituted for the original Glass Horizon composition.

The binding visual requirements are in `docs/GLASS_HORIZON_VISUAL_CONTRACT.md`.

## Artifact lock

No debug APK, signed APK, AAB, Play upload, release tag, or public artifact may be produced from `main` until all of the following are true:

1. `MainActivity` launches the faithful native `GlassHorizonScreen`.
2. `MainActivity` contains no WebView or JavaScript bridge.
3. Neither rejected screen is referenced by production startup.
4. Clean, Tools-open, Frames-open, and frosted-overlay screenshots are reviewed.
5. The owner explicitly approves the visual design.
6. Native tests and package inspection pass.
7. Physical Galaxy Tab S10+ acceptance passes.

Until then, CI runs tests only.

## Preserved recovery points

These commits are archived references. They are not active branches and must not be merged wholesale:

- Kotlin-only runtime boundary: `112fca7853a820f567eee3ee40cc4f804e89115c`
- Frame-local model and archive work: `b0ee2d246cbc3a073a5c775b16419370183e512d`
- Rejected Glass Canvas shell: `2575019764628f1aee1de3657cd393a8f1761114`
- Glass Horizon visual contract branch: `c67af6734b03d0c874c3626b5de11bdbbb7dd217`
- Artifact-lock refinement: `977c095feb193de956b4dbea6a6ec42fd34cfa11`

Useful code may be copied deliberately into `main` in small reviewed commits. Rejected launchers and UI approximations must not be copied.

## Mainline implementation order

1. Preserve the original Glass Horizon visual contract.
2. Add the faithful native atmosphere and measured stage geometry.
3. Add frame glass, four-sided frame board, and scrub rail.
4. Add draggable optical nodes, native vector glyphs, and radial child menus.
5. Add the live stylus lens and native S Pen callbacks.
6. Connect the native OpenGL canvas and editor state.
7. Port the validated frame-local model and archive compatibility.
8. Capture screenshots and obtain owner approval.
9. Re-enable APK/AAB construction only after approval.

This file supersedes the previous branch-and-PR migration process.