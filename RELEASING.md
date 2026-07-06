# Releasing InkFrame Studio to Google Play

A copy-paste checklist for shipping. Two phases: a **one-time setup**, then a fast
**repeat loop** for every update. App identity for reference:

| | |
|---|---|
| Application ID | `com.inkframe.studio` |
| Min / Target SDK | 26 (Android 8.0) / 34 |
| Upload format | **`.aab`** (App Bundle) — `.apk` is for sideload testing only |
| Marketing version | `versionName` in `app/build.gradle.kts` (e.g. `0.1.0`) |
| Build number | `versionCode` — **auto-incremented in CI**, never hand-edit |

---

## Phase 1 — One-time setup (~30–45 min)

### 1. Create your upload keystore (do this once, then guard it)

```bash
keytool -genkey -v -keystore inkframe-release.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias inkframe
```

- [ ] Keystore created
- [ ] **Backed up** the `.jks` + passwords somewhere safe (a password manager).
      ⚠️ If you self-sign and lose this, you can never update the app — see step 4.

### 2. Create the app in Play Console

- [ ] <https://play.google.com/console> → **Create app**
- [ ] Name: *InkFrame Studio* · Type: **App** · Free/Paid · accept declarations
- [ ] Complete the initial **Dashboard** setup tasks Google lists (privacy policy,
      data safety, content rating, target audience, store listing). These are required
      before any public track, but **Internal testing** needs only a few.

### 3. Enrol in Play App Signing (strongly recommended)

- [ ] When you create the first release, Play offers **Play App Signing** → accept.
      Google then holds the *app signing key*; your `.jks` becomes only the *upload key*
      (which can be reset if lost). This is the safety net for step 1's warning.

### 4. First release MUST be uploaded by hand

Google requires the very first build of a new app to be uploaded manually.

```bash
cp keystore.properties.example keystore.properties   # then fill in real values
./gradlew :app:bundleRelease
# -> app/build/outputs/bundle/release/app-release.aab
```

- [ ] Play Console → **Testing ▸ Internal testing ▸ Create new release**
- [ ] Upload `app-release.aab`, add release notes, **Review → Start rollout**
- [ ] **Testers tab** → add your Google account (or a tester list) → copy the **opt-in
      link**, open it on your device, become a tester, install from Play.

### 5. (Optional) Wire CI auto-publish for every future update

GitHub → repo **Settings ▸ Secrets and variables ▸ Actions ▸ New repository secret**:

| Secret | How to produce it |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 inkframe-release.jks` (whole file) — macOS: `base64 -i inkframe-release.jks \| tr -d '\n'` |
| `KEYSTORE_PASSWORD` | your keystore password |
| `KEY_ALIAS` | `inkframe` (from step 1) |
| `KEY_PASSWORD` | your key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | full JSON of a Play service account (below) |

**Service account (for `PLAY_SERVICE_ACCOUNT_JSON`):**

- [ ] Play Console → **Setup ▸ API access** → create/link a Google Cloud project
- [ ] Create a **service account**, download its **JSON key**
- [ ] Back in API access → **Grant access** to that service account →
      permission **“Release to testing tracks”** (and *Manage production releases* later
      if you want CI to push to production)
- [ ] Paste the JSON file's entire contents as the `PLAY_SERVICE_ACCOUNT_JSON` secret

> The service account can only publish to an app that **already exists** and whose first
> release was made manually (step 4). That's why Phase 1 is one-time.

---

## Phase 2 — The repeat loop (every update, ~2 min of your time)

Once Phase 1 is done, shipping an update is just a tag push.

```bash
# 1. (only for meaningful releases) bump the marketing version:
#    edit app/build.gradle.kts -> val baseVersionName = "0.1.1"

# 2. commit your work
git add -A && git commit -m "Describe the change"

# 3. tag + push -> CI builds a signed, auto-versioned .aab and uploads to Internal testing
git tag v0.1.1
git push origin main --tags
```

What CI does on a `v*` tag (`.github/workflows/release.yml`):

1. Builds a **signed `.aab` + `.apk`** (versionCode auto-set from the run number).
2. Attaches both to a **GitHub Release**.
3. If `PLAY_SERVICE_ACCOUNT_JSON` is set → uploads the `.aab` to the **internal** track.

Then on your device: open Play (as an opted-in tester) → the update appears within a few
minutes. Iterate as fast as you like.

- [ ] Watch the run in the **Actions** tab (green check = published)
- [ ] Update lands on the **Internal testing** track
- [ ] Install/refresh on device, test, repeat

### Handy variations

```bash
# Build locally without CI (signed):
./gradlew :app:bundleRelease

# Publish locally to a different track:
PLAY_TRACK=alpha ./gradlew :app:publishReleaseBundle

# Force a specific versionCode (normally unnecessary):
INKFRAME_VERSION_CODE=120 ./gradlew :app:bundleRelease
```

---

## Quick troubleshooting

| Symptom | Cause / fix |
|---|---|
| Play rejects upload: *“Version code N already used”* | Re-running CI reuses a run number rarely; just push a new tag, or set `INKFRAME_VERSION_CODE` higher. |
| CI publish step skipped | `PLAY_SERVICE_ACCOUNT_JSON` secret not set (build/Release still succeed). |
| `The caller does not have permission` | Service account missing **Release to testing tracks** in API access. |
| `APK signed with the wrong key` | First manual upload chose a different key than CI; align on the Play App Signing upload key. |
| Tester can't see the app | They haven't opened the **opt-in link** / aren't on the testers list. |
| First CI tag failed to publish | Expected if the app's first release wasn't done manually yet (step 4). |

See `BUILD.md` for the full build reference (Android Studio, CLI, CI artifacts).
