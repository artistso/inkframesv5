# InkFrame native Android status

Status: **binding current repository status**  
Last reviewed: 2026-07-19

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
- Launch path: `SplashActivity -> MainActivity -> HoldAwareGlassHorizonScreen -> ClosedBetaGlassHorizonScreen`

## Current native parity slices

The active Kotlin runtime currently includes these bounded parity slices:

- pressure-responsive native stroke processing with spacing, smoothing, pressure response, and S Pen eraser routing;
- explicit per-frame hold values from 1 through 8, including hold-aware playback and export timing;
- the first native Brush Lab surface with Direct, Balanced, and Smooth stroke-feel presets;
- live Brush Lab controls for size, minimum pressure size, opacity, hardness, spacing, smoothing, pressure response, and build-up;
- independent per-brush tuning retained while switching tools during the current studio session;
- six native project starters: Classic sketch, HD animation, Square social, Phone vertical, Pixel art, and Neon loop;
- a native custom-canvas creator with validated dimensions, FPS, starter frames, paper selection, preview, and explicit replacement action;
- blank-project CanvasView recreation isolated from archive open/recovery so loaded GPU cel surfaces are retained;
- a five-layer native Glass Horizon theme world: horizon, rays, fine grain, vignette, and transient glint;
- the exact binding rose/plum horizon progression plus a complete blue counterpart with persistent native theme selection;
- landscape corner-derived gradient geometry and draw-time ray feathering that remain consistent across API 26 through API 36;
- crash-safe local project recovery and native archive save/open.

Brush Lab named-preset persistence, `.inkbrush` import/export, Ghost Trail, advanced diagnostic controls, multi-project gallery persistence, thumbnails, duplicate/rename/delete management, durable custom-template storage, final title typography, approved frame-glass optics, eight-node drag persistence, spring radial animation, and the complete live stylus lens are not yet native parity claims.

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
