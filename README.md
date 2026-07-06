# InkFrame Studio — Web build

A self-contained web version of InkFrame for **previewing on a tablet** and for
**building an APK/AAB via aistudioapk.com** (which runs `npm install && npm run build`).

## Try it right now (no build needed)
Open `index.html` in any browser — phone, tablet, or desktop. Everything works offline;
it's a single file with no external dependencies.

## What's here
- **`index.html`** — the entire app (HTML + CSS + JS in one file).
- **`package.json`** — the build descriptor the APK builder reads (`npm run build` → Vite).
- **`vite.config.js`** — relative-path build so assets load inside an APK wrapper.
- **`metadata.json`** — app name / package id / orientation for the wrapper.

## Build it yourself
```bash
cd web
npm install
npm run build      # outputs dist/index.html
npm run preview    # serve the production build locally
```

## Features
Brushes (pencil / ink / marker / soft / eraser), size & opacity, color picker + palette,
undo/redo, clear, multi-frame timeline (add / duplicate / delete), onion skinning,
playback with adjustable FPS, and PNG export.

> Note: this web build is a lightweight companion for quick testing/preview. The full
> native engine (OpenGL ES, layers, GIF/MP4 export, save/load) lives in the Kotlin
> modules in the repo root and builds via `./gradlew` / GitHub Actions.
