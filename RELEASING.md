# Releasing InkFrame Studio

InkFrame Studio ships as a **debug APK** on GitHub Releases. The APK is
sideload-ready, fully offline, and uses the canonical application ID
`com.inkframe.studio`.

| | |
|---|---|
| Application ID | `com.inkframe.studio` |
| Min / Target SDK | 26 (Android 8.0) / 35 |
| Release format | **`.apk`** (debug-signed) — `InkFrame-vX.Y.Z-debug.apk` |
| Marketing version | `versionName` from `web/metadata.json` (e.g. `0.1.1`) |
| Build number | `versionCode` — auto-incremented in CI from the GitHub run number |

---

## Quick release

```bash
# 1. Make sure CHANGELOG.md [Unreleased] describes what's shipping.

# 2. Bump the marketing version and regenerate release notes:
node tools/bump-version.mjs 0.1.1

# 3. Review the generated RELEASE_NOTES.md, then commit:
git add -A
git commit -m "v0.1.1"

# 4. Tag and push — CI builds and publishes InkFrame-v0.1.1-debug.apk:
git tag -a v0.1.1 -m "InkFrame Studio 0.1.1"
git push origin main v0.1.1
```

Then watch the release workflow:
<https://github.com/artistso/inkframesv5/actions/workflows/release.yml>

When it finishes, the APK is attached to a GitHub Release at:
<https://github.com/artistso/inkframesv5/releases>

---

## Before you tag

Run the release prep helper to catch common mistakes:

```bash
node tools/prepare-release.mjs
```

It checks:

- `web/metadata.json` and `web/package.json` versions match.
- `RELEASE_NOTES.md` is current.
- Git working tree is clean and in sync with `origin/main`.
- The target tag does not already exist.

If everything passes, it prints the exact `git tag` and `git push` commands.

---

## What CI does on a `v*` tag

`.github/workflows/release.yml`:

1. Installs JDK 17 and Android SDK platform 35.
2. Runs `./gradlew :app:assembleDebug`.
3. Renames the output to `InkFrame-vX.Y.Z-debug.apk`.
4. Creates a GitHub Release using `RELEASE_NOTES.md` as the body.
5. Attaches the APK to the release.

No repository secrets are required.

---

## Sideloading the release APK

1. Download `InkFrame-vX.Y.Z-debug.apk` from the GitHub Release.
2. Copy it to your Android device.
3. Enable *Settings ▸ Security ▸ Install unknown apps* for your file manager.
4. Tap the APK to install.

---

## Optional: Google Play / signed release

If you later want to publish on Google Play, the signed-release wiring is still
present in `app/build.gradle.kts` and `keystore.properties.example`. You would
need to create a separate workflow or restore the old signed-release logic from
git history. See `docs/BUILD.md` §"Optional: signed release / Google Play" for
keystore and Play service-account setup.

The default `release.yml` intentionally does **not** build signed artifacts so
that releases stay simple and secret-free.
