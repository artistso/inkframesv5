<div align="center">

# InkFrame Studio

### The Glass Horizon · A free 2D animation & drawing studio

<img src="media/The_Glass_Horizon_Project_Philosophy.png" alt="InkFrame Studio — the Glass Horizon interface, floating rose-quartz orbs around a paper-white canvas" width="100%" />

<br/>

<img src="media/demo.gif" alt="An animated GIF of a leaping cat drawn frame-by-frame in InkFrame" width="320" />

<br/>

**Radial glass-orb interface · stylus-first · runs anywhere HTML runs.**

[![Android CI](https://github.com/artistso/inkframesv5/actions/workflows/android.yml/badge.svg)](https://github.com/artistso/inkframesv5/actions/workflows/android.yml)

</div>

---

InkFrame is a **2D drawing and frame-by-frame animation app** that doesn't look like anything else. Instead of docked toolbars, **glowing rose-quartz orbs** fan out around your canvas – brushes left, colour/actions right, timeline bottom. Everything stays out of the way of the drawing.

The entire app is a single-file HTML build (`web/index.html`) that runs in any browser and ships as an Android APK via a thin WebView shell.

- **Zero install** – open `web/index.html`, draw.
- **Fully offline** – IndexedDB autosaves every 800 ms. No account, no network, no AI in your artwork.
- **Same code everywhere** – browser, PWA, tablet APK are identical.
- **Free forever** – no subscription, no purchase price, and no advertising.
- **MIT Licensed**

---

## A personal statement from Steven Michael Allen Owens

> **Personal testimony:** The following is Steven Michael Allen Owens’s own account, published in his own words. It is presented as a personal statement and not as an independently verified factual finding.

Hi, my name is **Steven Michael Allen Owens**.

In January 2018, I became, in my account, a victim of kidnapping and torture. I believe I was forcibly chemically castrated against my will, without a judge or an attorney. I took a simple muscle relaxer and walked into a small clinic in Hoquiam, Washington. I have not seen my family and friends in nearly nine years.

I believe I was turned into a trans female against my will. A sign was placed around my neck that read, **“I have the mind of an 8 year old, please do not sexualize me,”** and I was paraded around three different cities.

I took to social media in the hope that people in and around Ocean Shores, Washington would no longer hit me, hurt me, throw rocks at me, infantilize me, or attempt to murder me again.

Throughout all of this, I made this brilliant and wonderful art and animation application. I am giving **InkFrame** away for free: no subscriptions, no cost, and no ads. I hope that you remember my name.

I am Steven Owens. I have hyperthymesia. I am a polymath, computer scientist, mathematician, physicist, and more. I have worked in botany and nursery construction. I was a table-games dealer and a pit boss. I miss my mommy, my two sisters, my brother, and my nephews and nieces.

I believe that on July 15, 2026, I will be placed on high amounts of neurological sedatives that will take away my name again, cripple my neurology, and kill me. These are my last words to the world.

I love my two kitty cats: **The Sonshine and The Universe**. They brought me out of polypharmacy, amnesia, and anesthesia. They help me stay calm throughout what I describe as this kidnapping, and they help me continue trying to care for them at every turn.

— **Steven Michael Allen Owens**

---

## Quick start

```bash
# Try it – no build
open web/index.html

# Dev server with HMR
./inkframe-cli dev
# → http://localhost:5173

# Build web
./inkframe-cli build-web
# → web/dist/

# Build Android APK (debug, fully wrapped)
./inkframe-cli build-apk
# → app/build/outputs/apk/debug/app-debug.apk
```

Grab a prebuilt debug APK from any green CI run: **Actions → Android CI → inkframe-debug-apk**

---

## CLI pipeline

All build / release / export tasks go through `./inkframe-cli`:

```
dev              Vite HMR dev server
build-web        Production build → web/dist/
serve            Static server http://localhost:8080
build-apk        Gradle debug APK
test             ./gradlew test (210 JVM unit tests)
bump <patch|minor|major>  Bump web/metadata.json + package.json
release-check    Verify release readiness, print git tag commands
export-gif in.inkframe out.gif [--fps 12] [--width 1024]
help
```

Full docs: [`AGENT.md`](AGENT.md)

### Headless export

```bash
# GIF – bit-identical to the in-app encoder
./inkframe-cli export-gif myproject.inkframe out.gif --fps 24

# MP4 – via ffmpeg
ffmpeg -i out.gif -movflags +faststart -pix_fmt yuv420p out.mp4
```

The GIF exporter needs puppeteer once:
`cd web && npm install puppeteer --save-dev`

---

## Agent Mode / GitHub CLI

No AI is embedded in InkFrame itself. Agent Mode drives the repo from outside via GitHub CLI:

```bash
# clone
gh repo clone artistso/inkframesv5

# run a CI build remotely (apk / web / test / all)
gh workflow run agent-build.yml -f task=apk
gh run watch
gh run download -n inkframe-agent-apk

# cut a signed release – builds verified APK and Play-ready AAB
./inkframe-cli bump patch
./inkframe-cli release-check
git tag v0.x.y && git push origin v0.x.y
# → .github/workflows/release.yml signs and publishes APK, AAB, and checksums
```

The signed workflow is fail-closed and requires the repository's permanent Android upload-key secrets. AABs from ordinary Android CI use a disposable verification key and must not be uploaded to Google Play.

Agent workflow: [`.github/workflows/agent-build.yml`](.github/workflows/agent-build.yml)

CLI helper for agents: [`tools/inkframe-cli.mjs`](tools/inkframe-cli.mjs) – `export-gif`, version bump, release check. Wrap it in your own Agent Mode runner; no API keys needed.

---

## Features

**Drawing**
- 9 brushes: pencil, ink (tilt-aware), marker, watercolor, frost glass, smudge/blur, glow, neon, star
- Brush Lab – long-press any brush: size / opacity / hardness / spacing / jitter / taper / texture / response – per-brush, persisted
- StreamLine smoothing, QuickShape (hold → snap to line/ellipse)
- Catmull-Rom spline strokes, palm rejection, stylus-only mode
- Living Line – inertial nib width + orientation

**Animation**
- Multi-frame timeline, per-frame holds
- Layers per frame – opacity, visibility, 11 blend modes
- Onion skin – past/future tint, scrub-reach
- Motion blur, dissolve playback, loop in/out, 1–24 fps

**I/O**
- Import reference image (PNG/JPEG/GIF/WebP, drag-drop)
- Export PNG, GIF (pure-JS GIF89a), MP4/WebM (MediaRecorder)
- IndexedDB autosave, `.inkframe` archive import/export
- Multi-project gallery – 4 canvases

**Ergonomics**
- Themes, Zen mode, fullscreen
- 2-finger pinch = zoom, 2-finger tap = undo, 3-finger tap = redo
- PWA installable

Full feature list & architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## Repository layout

```
web/
  index.html          # the whole app – UI + engine, single file
  gif-encoder.js      # GIF89a encoder (port of core-common/gif/)
  autosave.js         # IndexedDB persistence
  brush-math.js       # grain, angle ease, Catmull-Rom
  manifest.webmanifest
app/                  # Android WebView shell (Kotlin)
core-common/          # legacy Kotlin utilities – still tested
core-model/           # legacy Kotlin data model
engine-gl/            # legacy OpenGL ES paint engine
feature-canvas/
feature-layers/
media/                # hero.png, demo.gif, …
.github/workflows/
  android.yml         # CI – tests + debug APK + disposable-key production verification
  release.yml         # v* tag → permanent-key signed APK/AAB → GitHub Release
  agent-build.yml     # workflow_dispatch – for Agent Mode
tools/
  inkframe-cli.mjs    # export-gif, version helpers
  bump-version.mjs
  prepare-release.mjs
  update-release-notes.mjs
ARCHITECTURE.md       # app structure and module map
BUILD.md              # Android/web build notes
AGENT.md              # CLI + agent workflow guide
PRIVACY.md            # offline/privacy notes
RELEASING.md          # GitHub Release process
RELEASE_CHECKLIST.md  # tester smoke checklist
RELEASE_NOTES.md      # generated tester-facing notes
ROADMAP.md            # canonical current development plan
CIRCULAR_CANVAS_PLAN.md # shipped historical design record

docs/
  BRUSH_ENGINE_ROADMAP.md # shipped stabilizer research record
```

The `core-*`, `engine-gl`, `feature-*` modules are the earlier native Kotlin implementation. They still compile and test in CI, but the shipping app is the WebView build – faster to iterate. See `ARCHITECTURE.md`.

---

## Build – Android APK and Play AAB

Debug APK – fully wrapped, offline, sideload-ready. No Play signing.

```bash
./inkframe-cli build-apk
# app/build/outputs/apk/debug/app-debug.apk
```

A version tag matching `web/metadata.json` triggers the signed release workflow. With the permanent upload key configured, it produces:

- `InkFrame-v<version>-signed.apk`
- `InkFrame-v<version>-signed.aab`
- `SHA256SUMS.txt`

The signed AAB is the artifact intended for manual upload to the Google Play Console internal-testing track.

Full Android build notes: [`BUILD.md`](BUILD.md)

---

## Contributing

PRs against `main`. CI runs web smoke + JVM unit tests + debug APK.

Update `CHANGELOG.md` for meaningful changes.

---

## License

MIT – free to use, modify, redistribute. See [`LICENSE`](LICENSE).

Privacy: InkFrame is offline-first, no account, no ads, no analytics. See [`PRIVACY.md`](PRIVACY.md).

---

<div align="center">

*Built with the Glass Horizon design system · runs on stylus, finger, or mouse.*

*CLI pipeline: `./inkframe-cli help`*

</div>
