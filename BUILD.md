# Building InkFrame Studio for Android

Status: **native Android build documentation**  
See also: [`docs/NATIVE_STATUS.md`](docs/NATIVE_STATUS.md)

InkFrame for Android is a **native Kotlin / Jetpack Compose / OpenGL ES** application.

The Android app is not built by wrapping `web/index.html` in WebView. The historical web app remains in the repository only as a Glass Horizon reference and is not packaged or executed by Android.

## Current build facts

| Item | Current value |
|---|---|
| Runtime | Kotlin + Jetpack Compose + OpenGL ES |
| Production package | `com.inkframe.studio` |
| Stable QA package | `com.inkframe.studio.qa` |
| Metadata source | `gradle/inkframe-app.properties` |
| Current native version line | `0.5.0-native-mainline1` |
| Target SDK | API 36 |
| Minimum SDK | API 26 |
| JDK | 17 |
| Android SDK | API 36 platform, Build Tools 35.x |
| Target acceptance device | Samsung Galaxy Tab S10+ with S Pen |

## Repository setup

```bash
gh repo clone artistso/inkframesv5
cd inkframesv5
chmod +x ./gradlew ./inkframe-cli
```

## Local verification

Run the unit-test suite:

```bash
./inkframe-cli test
# equivalent: ./gradlew test
```

Compile the release Kotlin path without producing a public artifact:

```bash
./gradlew :app:compileReleaseKotlin test --stacktrace --console=plain
```

## Local developer APK

A local developer/debug APK can be built when an Android SDK is available:

```bash
./inkframe-cli build-apk
# equivalent: ./gradlew :app:assembleDebug
```

Output:

```text
app/build/outputs/apk/debug/app-debug.apk
```

This path is for local development only. It is not the stable QA release lane and must not be described as the production artifact.

## Stable QA APK in GitHub Actions

The authoritative device-test lane is the native QA release job in `.github/workflows/android.yml`.

It builds a non-debuggable APK using:

- package: `com.inkframe.studio.qa`;
- stable public QA signing identity;
- exact commit and SHA-256 artifact recording;
- package inspection proving no WebView, no packaged web assets, and no `INTERNET` permission.

The latest QA artifact record is maintained in issue #142.

## Production APK

Production artifacts use package `com.inkframe.studio` and require the permanent signing lineage.

Required repository secrets:

| Secret | Purpose |
|---|---|
| `INKFRAME_KEYSTORE_BASE64` | Base64-encoded permanent upload keystore |
| `INKFRAME_KEYSTORE_PASSWORD` | Keystore password |
| `INKFRAME_KEY_ALIAS` | Upload key alias |
| `INKFRAME_KEY_PASSWORD` | Key password |

Release packaging is fail-closed. If permanent signing is requested without all four credentials, Gradle must fail rather than falling back to debug signing.

## Local signed production build

Create and protect a keystore outside Git. Never commit it.

```bash
keytool -genkey -v -keystore inkframe-release.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias inkframe
```

Then provide signing values with environment variables or a local ignored `keystore.properties` file.

```bash
INKFRAME_KEYSTORE=/absolute/path/to/inkframe-release.jks \
INKFRAME_KEYSTORE_PASSWORD='...' \
INKFRAME_KEY_ALIAS='inkframe' \
INKFRAME_KEY_PASSWORD='...' \
./gradlew :app:assembleRelease
```

Output:

```text
app/build/outputs/apk/release/app-release.apk
```

For Google Play, build an AAB after the Play release process is explicitly approved:

```bash
./gradlew :app:bundleRelease
# app/build/outputs/bundle/release/app-release.aab
```

## Play publishing boundary

The Gradle Play Publisher plugin is wired but must not be treated as automatic release approval.

Before any Play upload:

1. native tests must pass;
2. package inspection must prove no WebView, no packaged web runtime, and no `INTERNET` permission;
3. Galaxy Tab S10+ physical acceptance must pass;
4. owner visual approval must be recorded;
5. production signing must be configured;
6. release notes and version metadata must be reviewed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Gradle JDK/class-file error | Use JDK 17. Android Studio's bundled JBR 17 is acceptable. |
| `SDK location not found` | Set `ANDROID_HOME` or create `local.properties` with `sdk.dir=/path/to/Android/Sdk`. |
| Missing API 36 | Install `platforms;android-36`. |
| Missing build tools | Install Build Tools 35.x. |
| Release signing failure | Add all four permanent signing values or use the QA lane instead. |
| APK contains web markers | Treat as a release blocker; Android must remain native-only. |
| Unexpected `INTERNET` permission | Treat as a privacy/release blocker. |

## Native runtime inspection targets

Every release-like artifact should preserve these boundaries:

```text
No android.webkit.WebView
No addJavascriptInterface
No packaged web/index.html
No packaged browser JS runtime
No android.permission.INTERNET
Exactly one launcher path: SplashActivity -> MainActivity
```
