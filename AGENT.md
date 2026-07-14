# InkFrame Studio — Agent Mode Guide

InkFrame is ready for external coding agents. No AI or network service is embedded in the application; agents operate on the repository, while the shipped app remains offline-first.

## Current architecture

The shipping browser and Android application use the same web runtime:

- `web/index.html` — primary drawing and animation application
- `web/*.js` and `web/brush-engine-v2/` — supporting runtime modules
- `tools/inject-brush-v2-index.mjs` — generates variant-specific Android index files
- `app/` — Kotlin WebView shell and Android packaging
- `core-*`, `engine-gl`, and `feature-*` — earlier native implementation; still compiled and tested

Do not delete the native modules merely because they are not the current shipping UI.

## Fast start

```bash
gh repo clone artistso/inkframesv5
cd inkframesv5

# Browser development
./inkframe-cli dev

# Web production build
./inkframe-cli build-web

# JVM tests
./inkframe-cli test

# Debug APK
./inkframe-cli build-apk
```

The debug APK is written to:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Remote CI

```bash
./inkframe-cli gh-ci apk
gh run watch
./inkframe-cli gh-ci-get <run-id>
```

Available agent workflow tasks are `apk`, `web`, `test`, and `all`.

## Repository rules

1. Keep the artwork path offline. Do not add analytics, advertising, cloud inference, account requirements, or remote artwork processing.
2. Treat `web/metadata.json` as the source of truth for version, package, and Android SDK metadata. `web/package.json` must carry the same version.
3. Keep debug and release Android assets isolated. Release builds must not package native input diagnostics or raw trace tooling.
4. Never commit a keystore, service-account JSON, passwords, base64 signing material, or generated private credentials.
5. Release packaging is fail-closed. A production APK or AAB must never fall back to the Android debug certificate.
6. When an injector imports another postprocessor, declare that imported file as a Gradle task input so incremental builds cannot reuse a stale generated index.
7. Add or update tests for behavioral changes. Preserve artwork Undo, timing Undo, project schema, preference, randomness, and network write-boundary contracts.
8. Update `CHANGELOG.md` for meaningful user-facing changes.

## Workflows

- `.github/workflows/android.yml` — web and brush tests, JVM tests, debug APK, and disposable-key production-path verification
- `.github/workflows/release-policy-diagnostics.yml` — release-policy diagnostics and generated-asset contracts
- `.github/workflows/agent-build.yml` — manually dispatched agent build entry point
- `.github/workflows/agent-cli.yml` — path-filtered shell and release-helper safety checks
- `.github/workflows/release.yml` — permanent-key signed APK/AAB workflow and GitHub Release publication

Artifacts from the disposable CI signing job prove the production build path only. They must not be uploaded to Google Play.

## Safe release procedure

A release is deliberately not a one-command unattended push.

### 1. Prepare the version bump

```bash
./inkframe-cli gh-release patch
# or: minor, major, or an explicit semantic version
```

This updates version metadata and generated release notes, then stops. It does not commit, tag, or push.

### 2. Review and commit

Inspect the diff, confirm `CHANGELOG.md` and release notes, then commit only the intended release files and push `main`.

```bash
git status --short
git diff
git add <reviewed-files>
git commit -m "Prepare InkFrame <version>"
git push origin main
```

### 3. Wait for green CI and perform tablet acceptance

Install the validated debug release-candidate APK on the target Samsung tablet and complete `RELEASE_CHECKLIST.md`.

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

See `RELEASING.md` for signing setup, private dry runs, Google Play handling, and publication policy.

## CLI surface

```text
Local:
  dev
  build-web
  serve
  build-apk
  test
  bump <patch|minor|major|version>
  release-check
  export-gif <input.inkframe> <output.gif>

GitHub / Agent:
  gh-clone [dir]
  gh-ci [apk|web|test|all]
  gh-ci-get <run-id>
  gh-release <patch|minor|major|version>   # prepare only; never auto-pushes
  agent build
  agent web
  agent release <patch|minor|major|version>
  agent export-gif <input> <output>
```

## Repository map

```text
web/                    shipping web runtime and tests
app/                    Android WebView shell and signed packaging
core-common/            pure utilities
core-model/             document model and package codec
engine-gl/              earlier OpenGL paint engine
feature-canvas/         native canvas feature module
feature-layers/         native layer feature module
tools/                  injectors, release tools, CLI helpers
.github/workflows/       CI, diagnostics, agent, and release workflows

ARCHITECTURE.md
BUILD.md
PRIVACY.md
RELEASING.md
RELEASE_CHECKLIST.md
RELEASE_NOTES.md
CHANGELOG.md
```

## Required reading before high-risk changes

- Paint engine or document model: `ARCHITECTURE.md`
- Android assets, signing, or variants: `BUILD.md` and `RELEASING.md`
- Release metadata or publication: `RELEASING.md` and `RELEASE_CHECKLIST.md`
- Privacy or network behavior: `PRIVACY.md`

Keep feature work in a dedicated branch and pull request. Do not merge stacked draft PRs out of dependency order, and do not alter the AAB currently under Play review from an unrelated development branch.
