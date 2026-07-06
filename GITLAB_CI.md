# GitLab CI/CD Setup Guide

This document explains how to configure GitLab CI/CD for InkFrame Studio,
including signing secrets, Play Store publishing, and optional GitHub mirroring.

---

## 1. CI/CD Variables (Settings → CI/CD → Variables)

Add the following variables. Mark all of them **Masked** and **Protected**.

| Variable | Required | Description |
|---|---|---|
| `KEYSTORE_BASE64` | Yes (release) | Base64 of your `.jks` keystore: `base64 -w0 inkframe-release.jks` |
| `INKFRAME_KEYSTORE_PASSWORD` | Yes (release) | Keystore password |
| `INKFRAME_KEY_ALIAS` | Yes (release) | Key alias (e.g. `inkframe`) |
| `INKFRAME_KEY_PASSWORD` | Yes (release) | Key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | Optional | Full JSON of a Play Console service account — enables automatic upload to the internal track |
| `INKFRAME_VERSION_CODE` | Optional | Override the auto-incrementing versionCode (defaults to `CI_PIPELINE_IID`) |

### Generating the keystore (first time only)

```bash
keytool -genkey -v -keystore inkframe-release.jks \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -alias inkframe

# Then encode it for the CI variable:
base64 -w0 inkframe-release.jks
```

Paste the output as the value of `KEYSTORE_BASE64`.

---

## 2. Triggering a Release

Push a version tag to build and publish a signed release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers the `build-release` job which:
1. Builds a signed `.aab` (App Bundle) and `.apk`
2. Uploads both as GitLab job artifacts (downloadable from the pipeline)
3. If `PLAY_SERVICE_ACCOUNT_JSON` is set, publishes the `.aab` to the Play Store **internal** track automatically

To promote from internal → production, use the Play Console.

---

## 3. Mirror to GitHub (optional)

If you want GitLab to push every commit back to your GitHub repository:

1. Go to **Settings → Repository → Mirroring repositories**
2. Click **Add new**
3. Set:
   - **Git repository URL**: `https://github.com/artistso/inkframesv5.git`
   - **Mirror direction**: Push
   - **Authentication**: use a GitHub Personal Access Token (PAT) with `repo` scope
     - URL format: `https://<your-github-username>:<PAT>@github.com/artistso/inkframesv5.git`
4. Click **Mirror repository**

GitLab will sync on every push. GitHub Actions will then also run on the mirrored commits.

---

## 4. Pipeline Overview

```
Every push / MR:
  unit-tests  →  (on main/master only) build-debug-apk

On v* tag:
  build-release  →  artifacts + optional Play Store upload
```

- **unit-tests**: JVM tests for all modules (`core-model`, `core-common`, `engine-gl`, etc.)
- **build-debug-apk**: Debug APK, downloadable from the pipeline artifacts
- **build-release**: Signed AAB + APK; auto-publishes to Play internal track if credentials are set
