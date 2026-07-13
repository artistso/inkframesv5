# InkFrame Studio 0.2.0 Release Gate

This document separates automated proof from the human-controlled steps required
before InkFrame Studio 0.2.0 can be merged, tagged, and submitted to Google Play.

## Candidate identity

| Field | Value |
|---|---|
| Version | `0.2.0` |
| Package | `com.inkframe.studio` |
| Target SDK | 35 |
| Release branch | `release/brush-engine-v2-0.2.0-rc1` |
| Consolidated PR | `#23` |
| Default brush engine | V2 |
| Original fallback | v0.1.1 |

## Automated gates

These gates must remain green on the final release-candidate head.

- [x] Version and package metadata are internally consistent.
- [x] Google Play listing text passes title, description, and release-note limits.
- [x] Privacy statement and declared Android permissions pass the repository validator.
- [x] Brush Engine V2 geometry, replay, ribbon, radius, contact, session,
      discontinuity, and coalesced-input suites pass.
- [x] Original browser engine boot test passes.
- [x] Generated Android debug interface boot test passes.
- [x] JVM and Android unit tests pass.
- [x] Debug RC APK assembles and uploads.
- [x] Production release APK and AAB assemble with a disposable CI key.
- [x] APK and AAB signatures verify.
- [x] Production package is `com.inkframe.studio`.
- [x] Production assets select Brush Engine V2 by default.
- [x] Native diagnostics, raw event retention, and trace laboratory controls are
      excluded from the production variant.
- [x] Final raster coverage refuses implausible cross-canvas bridges.

## Tablet acceptance

Complete these on the target Samsung tablet using the latest RC APK.

- [ ] Fifty separate Ink strokes with large pen relocations produce no bridges.
- [ ] Fifteen-second uninterrupted spiral produces no spikes or unexplained gaps.
- [ ] Rapid zigzags and abrupt direction reversals remain continuous.
- [ ] Slow, medium, and fast diagonal strokes remain stable.
- [ ] Pressure ramps expand and contract without isolated width bulges.
- [ ] Eraser follows the same stable path behavior as Ink.
- [ ] Lost focus, interruption, and resumed drawing do not reconnect old strokes.
- [ ] Original engine fallback can be selected and remains usable.
- [ ] Project save, reopen, undo, redo, and export remain functional after V2 use.
- [ ] No release-blocking regression is reproducible.

Record the tablet model, Android version, WebView version, test date, and result
in the PR conversation before sign-off.

## Permanent signing

- [ ] Create or locate the permanent upload keystore.
- [ ] Verify the alias and passwords locally.
- [ ] Store the keystore and recovery details in at least two secure offline locations.
- [ ] Add the four protected GitHub Actions signing secrets.
- [ ] Run **Signed Android Release** manually with `expected_version=0.2.0`.
- [ ] Verify the dry-run APK installs and reports version 0.2.0.
- [ ] Verify dry-run APK and AAB checksums from `SHA256SUMS.txt`.
- [ ] Record the upload certificate SHA-256 fingerprint in secure release records.

## Play Console preparation

- [ ] Create InkFrame Studio with package `com.inkframe.studio`.
- [ ] Set default language to English (United States).
- [ ] Publish `PRIVACY.md` at a stable public HTTPS URL.
- [ ] Complete app access and ads declarations.
- [ ] Complete content rating and target audience declarations.
- [ ] Complete Data safety using the current offline/no-analytics behavior.
- [ ] Upload phone/tablet screenshots, app icon, and feature graphic.
- [ ] Import the listing text from `app/src/main/play/listings/en-US/`.
- [ ] Create the first Internal testing release.
- [ ] Enroll in Play App Signing.
- [ ] Upload an approved AAB signed with the permanent upload key.
- [ ] Confirm package, version name, version code, target SDK, and upload certificate.
- [ ] Resolve every Play Console blocking error.
- [ ] Complete an Internal testing install and smoke test.

## Final authorization

Do not perform these actions implicitly.

- [ ] Explicit approval to mark PR #23 ready for review.
- [ ] Explicit approval to merge PR #23 into `main`.
- [ ] Explicit approval to create and push tag `v0.2.0`.
- [ ] Explicit approval to promote beyond Internal testing.

The public release is signed off only when every applicable gate above is
complete and no long spike or bridge remains reproducible.
