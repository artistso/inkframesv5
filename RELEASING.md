# Releasing InkFrame Studio

InkFrame Studio 0.2.0 and later ships through a **fail-closed signed Android
release pipeline**. A release tag produces both a sideloadable APK and a Google
Play-ready Android App Bundle from the same release variant.

| | |
|---|---|
| Application ID | `com.inkframe.studio` |
| Min / Target SDK | 26 (Android 8.0) / 35 |
| Release formats | signed `.apk` and signed `.aab` |
| Marketing version | `versionName` from `web/metadata.json` |
| Build number | `versionCode`, supplied by CI from the workflow run number |
| Signing policy | release packaging fails when the real key is unavailable |

## One-time signing setup

Create one long-lived **upload keystore** and protect it permanently. The upload
key signs the APK/AAB produced by this repository. For a new Google Play app,
Play App Signing then manages the separate app-signing key used on APKs delivered
to users.

```bash
keytool -genkeypair -v \
  -keystore inkframe-release.jks \
  -alias inkframe \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Create a base64 representation without committing the keystore:

```bash
base64 -w 0 inkframe-release.jks > inkframe-release.jks.base64
```

On macOS, use:

```bash
base64 < inkframe-release.jks | tr -d '\n' > inkframe-release.jks.base64
```

Add these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `INKFRAME_KEYSTORE_BASE64` | contents of `inkframe-release.jks.base64` |
| `INKFRAME_KEYSTORE_PASSWORD` | keystore password |
| `INKFRAME_KEY_ALIAS` | normally `inkframe` |
| `INKFRAME_KEY_PASSWORD` | key-entry password |

Store the original `.jks`, alias, and passwords in at least two secure offline
locations. Do not commit the keystore, its base64 form, or passwords.

## Local signed build

Copy `keystore.properties.example` to the ignored `keystore.properties` file and
enter real values:

```properties
storeFile=/absolute/path/to/inkframe-release.jks
storePassword=...
keyAlias=inkframe
keyPassword=...
```

Then build and verify:

```bash
./gradlew :app:assembleRelease :app:bundleRelease
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --verbose --print-certs \
  app/build/outputs/apk/release/app-release.apk
jarsigner -verify -certs \
  app/build/outputs/bundle/release/app-release.aab
```

Gradle intentionally refuses to package a release when any signing value is
missing or when the keystore path does not resolve to a file. It never falls
back to Android's debug certificate.

## Release preparation

1. Confirm `CHANGELOG.md` or `release-notes/<version>.md` describes the release.
2. Align `web/metadata.json` and `web/package.json`.
3. Regenerate and verify notes and Play listing metadata:

```bash
node tools/update-release-notes.mjs
node tools/update-release-notes.mjs --check
node web/tests/version-smoke.mjs
node tools/validate-play-release.mjs
```

4. Run the full PR CI and install its debug RC APK on the target Samsung tablet.
5. Complete `RELEASE_CHECKLIST.md`, including the Brush Engine V2 bridge tests.
6. Merge the release candidate only after explicit approval.

## Publish a signed GitHub release

From an approved, green commit on `main`:

```bash
git tag -a v0.2.0 -m "InkFrame Studio 0.2.0"
git push origin main v0.2.0
```

The tag must exactly match `web/metadata.json` (`0.2.0` → `v0.2.0`). The
**Signed Android Release** workflow then:

1. validates the tag and metadata version;
2. decodes the upload keystore from Actions secrets;
3. runs metadata, JVM, and Brush Engine V2 regression tests;
4. builds the release-specific production web assets;
5. assembles the signed APK and AAB;
6. verifies the APK with `apksigner` and AAB with `jarsigner`;
7. generates `SHA256SUMS.txt`;
8. uploads the workflow artifact;
9. creates the GitHub Release and attaches all three files.

Expected files:

```text
InkFrame-v0.2.0-signed.apk
InkFrame-v0.2.0-signed.aab
SHA256SUMS.txt
```

A manual `workflow_dispatch` run builds and verifies artifacts but does not
publish a GitHub Release because it is not associated with a version tag.

## Production versus debug brush runtime

The two Android variants use separate generated asset directories:

- **Debug:** V2 default, Original fallback, tuning, replay/import/export, native
  MotionEvent telemetry, sanitized WebView samples, and full trace diagnostics.
- **Release:** V2 default, Original fallback, bounded controls, no native
  telemetry, no raw event retention, and no trace import/replay/export controls.

This separation is enforced by generated-index tests and by the Gradle variant
asset pipeline.

## First Google Play release

The first bundle for `com.inkframe.studio` must be uploaded manually because the
Google Play Publishing API cannot create a new app/package registration.

1. Create **InkFrame Studio** in Play Console.
2. Select English (United States) as the default language.
3. Complete the app-access, ads, content-rating, target-audience, Data safety,
   privacy-policy, and store-listing forms.
4. Create an **Internal testing** release.
5. Enroll the app in **Play App Signing**.
6. Upload `InkFrame-v0.2.0-signed.aab`, signed with the permanent upload key.
7. Confirm Play Console shows the expected package, version name, version code,
   target SDK, and upload certificate.
8. Resolve all blocking errors before adding testers.

Do not upload an artifact from the CI disposable-key verification job. Those
artifacts prove the release path but are intentionally not retained for
production use.

Version-controlled Play listing text is stored under:

```text
app/src/main/play/
```

The public privacy statement is currently maintained in `PRIVACY.md`. Publish
that content at a stable HTTPS URL and enter the URL in Play Console before
submission.

## Later internal-track automation

After the first manual AAB has registered the package:

1. enable the Google Play Android Developer API in a Google Cloud project;
2. create a service account and JSON key;
3. invite the service-account email in Play Console;
4. grant only the permissions needed for testing tracks and listing management;
5. store the JSON key outside the repository;
6. point `PLAY_SERVICE_ACCOUNT_JSON_FILE` to the protected JSON file;
7. publish subsequent AABs through Gradle Play Publisher.

The existing Gradle configuration defaults to the `internal` track. A typical
subsequent upload is:

```bash
PLAY_SERVICE_ACCOUNT_JSON_FILE=/secure/path/play-service-account.json \
./gradlew :app:publishReleaseBundle --track internal --release-status draft
```

Promote only after Internal testing passes. Keep production rollout a separate,
explicit decision.
