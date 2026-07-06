# InkFrame Release & Tablet Smoke Checklist

Use this checklist whenever you push a build, install a fresh APK, or test in a new Android tablet browser.

## 1. Back up artwork first

Inside InkFrame:

1. Open **Studio**.
2. Tap **Backup archive**.
3. Save the downloaded `.inkframe` somewhere outside browser/app storage, such as Downloads, Drive, or external storage.
4. Optional: open **Gallery ▸ Manage** and use **Export archive** as a second path.

Why: browser storage, APK reinstalls, and WebView data clears can remove local autosaves. A `.inkframe` archive is the portable backup.

## 2. Push / wait for CI

After pushing to `main`, open the latest Android CI run:

<https://github.com/artistso/inkframesv5/actions/workflows/android.yml>

A good run should show:

- **Web boot smoke (jsdom)** — success
- **Unit tests (JVM)** — success
- **Build debug APK** — success

## 3. Download the APK artifact

1. Open the completed Android CI run.
2. Scroll to **Artifacts**.
3. Download **`inkframe-debug-apk`**.
4. Unzip it.
5. Install `app-debug.apk` on the tablet.

## 4. Browser/PWA smoke test

In the browser build, verify:

- Start overlay appears on a fresh/no-recovery session.
- **Import archive** from Start restores a `.inkframe`.
- **Gallery ▸ Manage** opens.
- Project templates render and create canvases.
- Custom template width/height/FPS/frame count works.
- Export archive creates a `.inkframe`.
- Import archive restores the gallery.
- Brush Lab opens by long-pressing a brush.
- Brush texture slider changes preview/paint feel.
- Brush preset **Save / Use / Export / Import / Del** works.
- Stylus **Pen** diagnostics reports pressure/tilt/button data where supported.
- Barrel mode cycles **Pick → Erase → Off**.

## 5. APK smoke test

In the installed APK, verify:

- App launches offline.
- Drawing works with pen, finger, and/or S-Pen.
- Palm rejection / stylus-only toggles behave.
- PNG export saves to `Pictures/InkFrame`.
- GIF export completes and saves.
- Video export either completes or reports unsupported cleanly.
- Archive export/import works from Studio and Gallery.
- App pause/resume does not lose work.
- Rotate/background/lock-screen recovery behaves acceptably.

## 6. Version metadata and release notes

Before tagging a release, update:

- `web/metadata.json` `version` — this drives the in-app Studio version and Android `versionName`
- `web/package.json` `version` — CI verifies it matches `web/metadata.json`
- `CHANGELOG.md`

Then regenerate notes and verify:

```bash
node tools/update-release-notes.mjs
node tools/update-release-notes.mjs --check
```

CI runs the same release-notes check before building the APK.

Then tag:

```bash
git tag v0.1.0
git push origin main --tags
```

Release workflow:

<https://github.com/artistso/inkframesv5/actions/workflows/release.yml>
