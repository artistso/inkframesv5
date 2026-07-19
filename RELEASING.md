# Releasing InkFrame Studio

InkFrame Studio ships through a **fail-closed signed native Android release pipeline**.

The Android product is native Kotlin / Jetpack Compose / OpenGL ES. It is not a WebView wrapper and must not package or execute the historical web application.

See also:

- [`docs/NATIVE_STATUS.md`](docs/NATIVE_STATUS.md)
- [`BUILD.md`](BUILD.md)
- [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md)

| | |
|---|---|
| Production application ID | `com.inkframe.studio` |
| Stable QA application ID | `com.inkframe.studio.qa` |
| Min / Target SDK | 26 / 36 |
| Release formats | signed `.apk` and signed `.aab` |
| Native metadata source | `gradle/inkframe-app.properties` |
| Signing policy | release packaging fails when the real key is unavailable |

## One-time production signing setup

Create one long-lived **upload keystore** and protect it permanently. The upload key signs the APK/AAB produced by this repository. For a new Google Play app, Play App Signing then manages the separate app-signing key used on APKs delivered to users.

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

On macOS:

```bash
base64 < inkframe-release.jks | tr -d '\n' > inkframe-release.jks.base64
```

Add these repository secrets under **Settings -> Secrets and variables -> Actions**:

| Secret | Value |
|---|---|
| `INKFRAME_KEYSTORE_BASE64` | contents of `inkframe-release.jks.base64` |
| `INKFRAME_KEYSTORE_PASSWORD` | keystore password |
| `INKFRAME_KEY_ALIAS` | normally `inkframe` |
| `INKFRAME_KEY_PASSWORD` | key-entry password |

Store the original `.jks`, alias, and passwords in at least two secure offline locations. Do not commit the keystore, its base64 form, or passwords.

## Local signed build

Copy `keystore.properties.example` to the ignored `keystore.properties` file and enter real local values:

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

Gradle intentionally refuses to package a release when any signing value is missing or when the keystore path does not resolve to a file. It never falls back to Android's debug certificate.

## Release preparation

1. Add accepted user-facing changes under `CHANGELOG.md` `[Unreleased]`, or create a non-empty `release-notes/<next-version>.md` for a large release.
2. Run the safe release preparation command:

```bash
./inkframe-cli gh-release <patch|minor|major|version>
```

3. Review the complete diff:

```bash
git status --short
git diff
```

4. Verify generated notes and release metadata.
5. Commit only reviewed release files.
6. Push `main` and wait for native CI.
7. Complete `RELEASE_CHECKLIST.md` on the target Samsung Galaxy Tab S10+.
8. Merge or tag only after explicit approval.

## Native CI gates

Required native gates include:

- native Glass Horizon boundary check;
- release Kotlin compilation and native unit tests;
- no Android WebView, no JavaScript bridge, no packaged web runtime, and no `INTERNET` permission;
- stable QA APK artifact for `com.inkframe.studio.qa` when testing is needed;
- production signing readiness for `com.inkframe.studio` before public release.

## Private signed dry run

After permanent upload-key secrets are configured, use a manual signed-release dry run to prove the real signing path before public tagging or Play submission.

The dry run must:

1. compile native Kotlin;
2. run unit tests;
3. build release APK/AAB artifacts;
4. verify signatures;
5. inspect package boundaries;
6. record checksums.

A dry-run artifact is validly signed but must not be represented as the public tagged release.

## Publish a signed GitHub release

From an approved, green commit on `main`, derive the tag from committed release metadata and run the tag commands printed by `./inkframe-cli release-check`.

Expected public files:

```text
InkFrame-v<version>-signed.apk
InkFrame-v<version>-signed.aab
SHA256SUMS.txt
```

Only a matching `v*` tag can publish. A manual workflow run must not create the public GitHub Release.

## Production versus QA runtime

QA and production artifacts use separate package/signing identities:

- **QA:** `com.inkframe.studio.qa`, stable public QA signing identity, device-test artifacts only.
- **Production:** `com.inkframe.studio`, permanent private upload signing lineage, public release artifacts only after approval.

Both paths must remain native-only and offline-first.

## First Google Play release

The first bundle for `com.inkframe.studio` must be uploaded manually because the Google Play Publishing API cannot create a new app/package registration.

1. Create **InkFrame Studio** in Play Console.
2. Select English (United States) as the default language.
3. Complete app-access, ads, content-rating, target-audience, Data safety, privacy-policy, and store-listing forms.
4. Create an **Internal testing** release.
5. Enroll the app in **Play App Signing**.
6. Upload the approved AAB whose version matches the release metadata and whose signature comes from the permanent upload key.
7. Confirm Play Console shows the expected package, version name, version code, target SDK, and upload certificate.
8. Resolve all blocking errors before adding testers.

Do not upload a QA artifact or disposable-key artifact to Google Play production.

Version-controlled Play listing text is stored under:

```text
app/src/main/play/
```

The public privacy statement is maintained in `PRIVACY.md`. Publish that content at a stable HTTPS URL and enter the URL in Play Console before submission.

## Later internal-track automation

After the first manual AAB has registered the package:

1. enable the Google Play Android Developer API in a Google Cloud project;
2. create a service account and JSON key;
3. invite the service-account email in Play Console;
4. grant only the permissions needed for testing tracks and listing management;
5. store the JSON key outside the repository;
6. point `PLAY_SERVICE_ACCOUNT_JSON_FILE` to the protected JSON file;
7. publish subsequent AABs through Gradle Play Publisher.

The existing Gradle configuration defaults to the `internal` track. A typical later upload is:

```bash
PLAY_SERVICE_ACCOUNT_JSON_FILE=/secure/path/play-service-account.json \
./gradlew :app:publishReleaseBundle --track internal --release-status draft
```

Promote only after Internal testing passes. Keep production rollout a separate, explicit decision.
