# InkFrame Studio – Agent Mode Guide

This repo is Agent-Mode ready. No AI is embedded in the app – Agent Mode drives the repo from outside via GitHub CLI + `./inkframe-cli`.

## Quick Agent tasks

```bash
# 1. Clone
gh repo clone artistso/inkframesv5
cd inkframesv5

# 2. Build locally (no Android SDK needed for web)
./inkframe-cli agent web     # → web/dist/
./inkframe-cli agent build   # test + APK (needs JDK 17 + Android SDK)

# 3. Trigger a remote CI build (no local SDK)
./inkframe-cli gh-ci apk
gh run watch
./inkframe-cli gh-ci-get <run-id>
# APK at ./inkframe-agent-apk/app-debug.apk

# 4. Cut a release
./inkframe-cli agent release patch
# → bumps version, tags vX.Y.Z, pushes
# → GitHub Actions builds InkFrame-vX.Y.Z-debug.apk
# → attaches to GitHub Release automatically
```

## CLI surface for agents

```
./inkframe-cli help

Local:
  dev / build-web / serve / build-apk / test
  bump / release-check
  export-gif in.inkframe out.gif

GitHub:
  gh-clone [dir]
  gh-ci [apk|web|test|all]
  gh-ci-get <run-id>
  gh-release [patch|minor|major]

Agent:
  agent build          # test + build-apk
  agent web            # npm ci + build
  agent release patch  # bump → tag → push
  agent export-gif in out
```

Node helper: `node tools/inkframe-cli.mjs export-gif in.inkframe out.gif --fps 24 --width 1280`

Export needs puppeteer once: `cd web && npm install puppeteer --save-dev`

## Workflows

- `.github/workflows/android.yml` – CI on every push: web smoke → unit tests → debug APK artifact
- `.github/workflows/release.yml` – tag `v*` → debug APK → GitHub Release
- `.github/workflows/agent-build.yml` – workflow_dispatch – Agent Mode entry point
  ```
  gh workflow run agent-build.yml -f task=apk -f version_bump=none
  ```

All builds produce the **same debug-signed, fully-wrapped, offline APK**. No Play Store keystore, no AAB.

## Repo layout

```
web/index.html          # whole app, single file
app/                    # Android WebView shell
core-*/engine-gl/feature-*/  # legacy Kotlin – still tested, not shipped
tools/
  inkframe-cli.mjs      # headless export
  bump-version.mjs
  prepare-release.mjs
  update-release-notes.mjs
docs/
  ARCHITECTURE.md
  BUILD.md
  PIPELINE.md
  RELEASING.md
  RELEASE_CHECKLIST.md
  PRIVACY.md
  RELEASE_NOTES.md
```

## Agent Mode – DO / DON'T

DO:
- Use `./inkframe-cli` for all builds/exports/releases
- Trigger remote builds via `gh workflow run agent-build.yml`
- Bump versions with `node tools/bump-version.mjs patch`
- Export `.inkframe` archives via headless `export-gif`
- Read `docs/ARCHITECTURE.md` before touching the paint engine

DON'T:
- Embed AI/LLM calls in `web/index.html` – keep it offline
- Commit a keystore – releases are debug-signed intentionally
- Edit `versionCode` by hand – CI auto-increments
- Delete `core-*` – tests still run in CI (210 tests)

## Release checklist (short)

1. `./inkframe-cli test`
2. `./inkframe-cli build-apk` – sideload smoke test
3. `./inkframe-cli bump patch`
4. `./inkframe-cli release-check`
5. `git tag vX.Y.Z && git push origin main --tags`
6. Wait for Release workflow → download `InkFrame-vX.Y.Z-debug.apk`

Full checklist: `docs/RELEASE_CHECKLIST.md`
