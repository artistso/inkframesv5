# InkFrame Studio — Agent Mode Guide

Status: **native Android agent guide**  
See also: [`docs/NATIVE_STATUS.md`](docs/NATIVE_STATUS.md)

InkFrame is ready for external coding agents, but the product boundary is strict:

> InkFrame for Android is a native Kotlin / Jetpack Compose / OpenGL ES application. The historical web app is retained only as a Glass Horizon reference and is not packaged or executed by Android.

No AI or network service is embedded in the application. Agents operate on the repository; the shipped app remains offline-first.

## Current architecture

Current Android runtime:

- `app/` — Kotlin Android application shell, signing, packaging, launcher path;
- `feature-canvas/` — native Glass Horizon Compose workspace, Android file/export/recovery bridges, native canvas host;
- `engine-gl/` — OpenGL ES paint and compositor engine;
- `core-model/` — document model, defaults, archive/package codec, export planning;
- `core-common/` — pure math, utility, undo, JSON, and testable platform-free logic;
- `feature-layers/` — layer feature support.

Historical reference only:

- `web/index.html`;
- `web/*.js`;
- `web/brush-engine-v2/`.

The web directory may be used as a visual and interaction reference for Glass Horizon parity. It must not be restored as the Android runtime.

## Fast start

```bash
gh repo clone artistso/inkframesv5
cd inkframesv5

# Native tests
./inkframe-cli test

# Local developer APK, requires Android SDK
./inkframe-cli build-apk

# Release Kotlin compile without publishing
./gradlew :app:compileReleaseKotlin test --stacktrace --console=plain
```

The local developer APK is written to:

```text
app/build/outputs/apk/debug/app-debug.apk
```

The authoritative device-test artifact is the stable native QA release APK published by GitHub Actions and recorded in issue #142.

## Repository rules

1. Keep Android native. Do not add `WebView`, `android.webkit`, `JavascriptInterface`, packaged web assets, browser storage, or JavaScript bridge code to the Android runtime.
2. Keep the artwork path offline. Do not add analytics, advertising, cloud inference, account requirements, or remote artwork processing.
3. Treat `gradle/inkframe-app.properties` as the native Android metadata source.
4. Treat `docs/NATIVE_STATUS.md` as the runtime-status source of truth.
5. Treat `docs/GLASS_HORIZON_VISUAL_CONTRACT.md` as the binding visual and interaction target.
6. Preserve `web/` only as historical reference until the native port no longer needs it.
7. Never commit keystores, service-account JSON, passwords, base64 signing material, or generated private credentials.
8. Release packaging is fail-closed. A production APK or AAB must never fall back to the Android debug certificate.
9. Add or update tests for behavioral changes. Preserve artwork Undo, timing Undo, project schema, archive compatibility, preference, randomness, and network write-boundary contracts.
10. Update `CHANGELOG.md` for meaningful user-facing changes.

## CI and workflow surface

Primary workflows:

- `.github/workflows/android.yml` — native boundary checks, release Kotlin compile/tests, stable QA APK, conditional signed production APK;
- `.github/workflows/release.yml` — controlled signed release publication path;
- `.github/workflows/agent-build.yml` — manually dispatched agent build entry point;
- `.github/workflows/agent-cli.yml` — path-filtered CLI and release-helper safety checks;
- `.github/workflows/release-policy-diagnostics.yml` — release-policy diagnostics and generated-asset contracts.

Stable QA artifacts prove device-test readiness only. They are not public-release approval.

## Safe release procedure

A release is deliberately not a one-command unattended push.

### 1. Prepare the version bump

```bash
./inkframe-cli gh-release patch
# or: minor, major, or an explicit semantic version
```

This updates release metadata and stops. It does not commit, tag, or push.

### 2. Review and commit

```bash
git status --short
git diff
git add <reviewed-files>
git commit -m "Prepare InkFrame <version>"
git push origin main
```

### 3. Wait for green CI and perform tablet acceptance

Install the validated QA or release-candidate APK on the target Samsung Galaxy Tab S10+ and complete the relevant acceptance checklist.

### 4. Run the release preflight

```bash
./inkframe-cli release-check
```

The preflight requires a clean, synchronized `main`, verifies metadata and generated notes, checks local and remote tags, and prints the exact tag commands.

### 5. Tag using the printed commands

A matching `v*` tag triggers the permanent-key signed workflow. Expected public artifacts are:

```text
InkFrame-v<version>-signed.apk
InkFrame-v<version>-signed.aab
SHA256SUMS.txt
```

## CLI surface

```text
Local:
  dev
  build-web        historical/reference web build only
  serve            historical/reference web server only
  build-apk        local developer APK
  test
  bump <patch|minor|major|version>
  release-check

GitHub / Agent:
  gh-clone [dir]
  gh-ci [apk|web|test|all]
  gh-ci-get <run-id>
  gh-release <patch|minor|major|version>   # prepare only; never auto-pushes
  agent build
  agent web        historical/reference web build only
  agent release <patch|minor|major|version>
```

Unknown local commands and unknown `agent` subtasks must fail with a nonzero exit status.

## Media export contract

PNG sequence, animated GIF, and MP4 export are supported through the native Android app's file/export pathways.

Headless `.inkframe` archive conversion is not currently supported. Do not claim that an external exporter is bit-identical to the application unless a current archive fixture and output comparison prove that contract.

## Repository map

```text
app/                    Native Android application shell and signed packaging
core-common/            Pure utilities
core-model/             Document model and package codec
engine-gl/              OpenGL ES paint/compositor engine
feature-canvas/         Native canvas, Glass Horizon surface, export/recovery bridge
feature-layers/         Layer feature support
web/                    Historical Glass Horizon reference only
.github/workflows/      CI, diagnostics, agent, and release workflows

docs/NATIVE_STATUS.md
docs/MAINLINE_KOTLIN_MIGRATION.md
docs/GLASS_HORIZON_VISUAL_CONTRACT.md
ARCHITECTURE.md
BUILD.md
PRIVACY.md
RELEASING.md
RELEASE_CHECKLIST.md
RELEASE_NOTES.md
CHANGELOG.md
```

## Required reading before high-risk changes

- Runtime status: `docs/NATIVE_STATUS.md`
- Visual contract: `docs/GLASS_HORIZON_VISUAL_CONTRACT.md`
- Native migration policy: `docs/MAINLINE_KOTLIN_MIGRATION.md`
- Paint engine or document model: `ARCHITECTURE.md`
- Android assets, signing, or variants: `BUILD.md` and `RELEASING.md`
- Release metadata or publication: `RELEASING.md` and `RELEASE_CHECKLIST.md`
- Privacy or network behavior: `PRIVACY.md`

Keep feature work bounded and reviewable. Do not merge archived stacked PRs wholesale, and do not alter an artifact under device or Play review from an unrelated development path.
