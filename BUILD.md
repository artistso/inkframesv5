# Building InkFrame Studio → APK

This project is a complete, self-contained Android app. **No special/manual dependencies
are needed** — everything beyond AndroidX + Jetpack Compose (JSON, GIF, YUV, etc.) was
written from scratch and lives in the source tree. Gradle downloads AndroidX/Compose
automatically on the first build.

> ⚠️ The APK cannot be produced in the Arena sandbox (it has no Android SDK and only
> JDK 11). Build it on your machine with **Android Studio** or a local **Android SDK**,
> using **JDK 17**.

---

## What you need

| Requirement        | Version / notes                                   |
|--------------------|---------------------------------------------------|
| Android Studio     | **Koala (2024.1)** or newer (bundles JDK 17)      |
| JDK                | **17** (Android Studio ships one; or install Temurin 17) |
| Android SDK        | Platform **API 34**, Build-Tools 34.x             |
| Min device         | Android 8.0 (API 26)+, OpenGL ES 3.0 (any modern phone/tablet) |

Versions already pinned in the project: Gradle **8.9**, AGP **8.5.2**, Kotlin **1.9.24**,
compileSdk **34**, minSdk **26**.

---

## Option A0 — GitHub Actions (no local SDK needed) ✅ easiest to *get an APK*

The repo ships two workflows in `.github/workflows/`:

- **`android.yml`** — on every push/PR (and via the Actions tab's *Run workflow*): runs
  the unit tests, builds the debug APK, and uploads it as an artifact.
- **`release.yml`** — on pushing a `v*` tag: builds the APK and attaches it to a GitHub
  Release.

**To get an installable APK without installing anything locally:**

1. Push the project to GitHub (see README/below).
2. Open the **Actions** tab → wait for the *Android CI* run to finish (green check).
3. Open the run → **Artifacts** → download **`inkframe-debug-apk`** → unzip → sideload
   `app-debug.apk` onto your device.

Or cut a versioned release that anyone can download:

```bash
git tag v0.1.0
git push origin v0.1.0      # release.yml publishes InkFrame-v0.1.0.apk to Releases
```

The CI runners already have the Android SDK + JDK 17, so this path needs nothing on your
machine but git.

---

## Option A — Android Studio (easiest to *develop*)

1. **Open** Android Studio → *File ▸ Open* → select the `InkFrame/` folder.
2. Studio will sync Gradle and offer to install any missing SDK bits (API 34,
   Build-Tools) — accept. First sync downloads AndroidX/Compose (a few minutes).
3. Plug in a device (USB debugging on) or start an emulator (API 26+).
4. Press **Run ▶** (or *Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)*).
5. The debug APK lands at:
   `app/build/outputs/apk/debug/app-debug.apk`

> If Studio complains about the JDK, set *Settings ▸ Build ▸ Build Tools ▸ Gradle ▸
> Gradle JDK* to **17** (the bundled "jbr-17" is fine).

---

## Option B — Command line

Requires a local Android SDK and JDK 17.

```bash
# 1) Point Gradle at your SDK (once). Either set the env var…
export ANDROID_HOME=$HOME/Android/Sdk        # macOS: ~/Library/Android/sdk
#    …or create local.properties in the project root:
echo "sdk.dir=$ANDROID_HOME" > local.properties

# 2) Make sure JDK 17 is active
java -version          # must say 17

# 3) Build a debug APK
./gradlew :app:assembleDebug

# Output:
#   app/build/outputs/apk/debug/app-debug.apk

# Install on a connected device:
./gradlew installDebug

# Run the 210 JVM unit tests (no device needed):
./gradlew test
```

### Release (signed) — for Google Play

Signing is already wired in `app/build.gradle.kts`. It reads credentials from a local
`keystore.properties` **or** from environment variables (CI), and falls back to debug
signing if neither is set.

**1. Create a keystore once** (keep it safe & backed up — losing it means you can't update
the app):

```bash
keytool -genkey -v -keystore inkframe-release.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias inkframe
```

**2. Local signed build** — copy the template and fill it in:

```bash
cp keystore.properties.example keystore.properties   # then edit the values
./gradlew :app:bundleRelease     # -> app/build/outputs/bundle/release/app-release.aab  (upload to Play)
./gradlew :app:assembleRelease   # -> app/build/outputs/apk/release/app-release.apk     (sideload test)
```

> Google Play requires the **.aab** (App Bundle). The signed **.apk** is just for quick
> on-device testing.

**3. Signed builds in CI** — add these repo secrets
(*Settings ▸ Secrets and variables ▸ Actions*), then push a `v*` tag:

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 inkframe-release.jks` (the whole file, base64) |
| `KEYSTORE_PASSWORD` | keystore password |
| `KEY_ALIAS` | e.g. `inkframe` |
| `KEY_PASSWORD` | key password |

```bash
git tag v0.1.0 && git push origin v0.1.0
# release.yml builds the signed .aab + .apk and attaches them to a GitHub Release.
```

> **Play Console tip:** for a brand-new app, enrol in **Play App Signing** (recommended).
> Upload the `.aab` to an **Internal testing** track first — it reaches your own device in
> minutes, and you can push update after update straight to that track.

### Auto-incrementing versionCode

You no longer hand-edit `versionCode`. It's derived in `app/build.gradle.kts`:

- **In CI**, it's `versionCodeBase + GITHUB_RUN_NUMBER`, so every CI build climbs and Play
  never rejects a duplicate.
- **Locally**, it stays at the base (1) for convenience.
- **Override** anytime with `INKFRAME_VERSION_CODE=42 ./gradlew :app:bundleRelease`.

`versionName` (the human "0.1.0") still lives in `app/build.gradle.kts` — bump it for
meaningful releases.

### Auto-publish to the Play "internal" track (optional)

The [Triple-T Gradle Play Publisher](https://github.com/Triple-T/gradle-play-publisher) is
wired up. Once configured, pushing a `v*` tag uploads the signed `.aab` straight to your
Internal testing track.

**1. Create a Play service account** (Play Console ▸ Setup ▸ API access ▸ create/link a
Google Cloud service account, grant it *Release to testing tracks*), download its JSON key.

**2. Local publish:**

```bash
cp play-service-account.json   # place the downloaded key here (git-ignored)
./gradlew :app:publishReleaseBundle            # -> internal track
PLAY_TRACK=alpha ./gradlew :app:publishReleaseBundle   # or another track
```

**3. CI publish:** add one more repo secret and push a tag:

| Secret | Value |
|---|---|
| `PLAY_SERVICE_ACCOUNT_JSON` | the full contents of the service-account JSON |

```bash
git tag v0.1.1 && git push origin v0.1.1
# release.yml: builds signed .aab/.apk, attaches to a GitHub Release, AND uploads
# the .aab to the Play internal track (only if PLAY_SERVICE_ACCOUNT_JSON is set).
```

> First upload of a brand-new app must be done **manually** in the Play Console (Google
> requires the initial release by hand); subsequent updates can flow through CI.

---

## Sideloading the debug APK

1. Copy `app-debug.apk` to your device.
2. Enable *Settings ▸ Security ▸ Install unknown apps* for your file manager.
3. Tap the APK to install. (Debug APKs are signed with a debug key, so this just works.)

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Unsupported class file major version` / Gradle JDK error | Use **JDK 17** (Studio: Gradle JDK = jbr-17). |
| `SDK location not found` | Create `local.properties` with `sdk.dir=...` (Option B step 1). |
| First sync is slow / offline failure | First build needs internet to fetch AndroidX/Compose from Google Maven. |
| `Failed to find Build Tools` / `platform 34` | Let Studio install them, or `sdkmanager "platforms;android-34" "build-tools;34.0.0"`. |
| Preview/canvas looks blank in Studio Preview | Expected — the GL canvas only renders on a real device/emulator. |

---

## Verifying without an APK

Even without the SDK you can confirm the pure logic is healthy:

```bash
./gradlew :core-common:test :core-model:test :engine-gl:test
```

210 unit tests cover JSON, the GIF/LZW encoder, YUV conversion, HSV color,
onion-skin planning, timeline ops, undo, viewport math, and more.
