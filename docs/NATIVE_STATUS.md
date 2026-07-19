# InkFrame native Android status

Status: **binding current repository status**  
Last reviewed: 2026-07-18

InkFrame Android development is now a **native Kotlin / Jetpack Compose / OpenGL ES** application.

The Android application must not be described as a WebView wrapper, a browser runtime, or a packaged copy of `web/index.html`.

## Current runtime truth

- Production package: `com.inkframe.studio`
- QA package: `com.inkframe.studio.qa`
- Native metadata source: `gradle/inkframe-app.properties`
- Current native version line: `0.5.0-native-mainline1`
- Current Android target SDK: API 36
- Minimum Android version: API 26
- Application shell: Kotlin + Jetpack Compose
- Artwork engine: native OpenGL ES through `feature-canvas` and `engine-gl`
- Launch path: `SplashActivity -> MainActivity -> ClosedBetaGlassHorizonScreen`

## Web reference boundary

The historical web implementation remains in the repository only as a **visual and interaction reference** for the Glass Horizon design.

Allowed uses of `web/`:

- inspect the original Glass Horizon layout, colors, rhythm, and interaction language;
- compare Kotlin visual parity against the original browser prototype;
- preserve historical release context and migration evidence.

Rejected uses of `web/`:

- packaging web assets into the Android APK;
- launching Android through WebView;
- adding a JavaScript bridge;
- restoring browser storage as the Android persistence layer;
- describing the current Android product as HTML-first.

## Release boundary

QA APKs may be produced for physical-device testing when they are explicitly labeled as QA/prototype artifacts and tied to an exact commit and checksum.

A public production release still requires:

1. native Kotlin compilation and tests;
2. APK package inspection proving no WebView, no packaged web runtime, and no `INTERNET` permission;
3. Galaxy Tab S10+ physical acceptance;
4. owner approval of the Glass Horizon visual result;
5. permanent production signing credentials for `com.inkframe.studio`.

The stable QA signing identity is intentionally separate from production signing and has no authority over Google Play production artifacts.

## Documentation rule

Any document that mentions Android must use this wording:

> InkFrame for Android is a native Kotlin / Jetpack Compose / OpenGL ES application. The historical web app is retained only as a Glass Horizon reference and is not packaged or executed by Android.

Do not reintroduce WebView-first, browser-first, or single-file HTML shipping claims for the Android product.
