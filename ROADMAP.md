# InkFrame Studio Roadmap

Status date: 2026-07-14
Current public release: `0.4.0`

This document is the canonical development roadmap. Historical design plans remain in the repository as implementation records, but they no longer define current work.

## Current release baseline

InkFrame 0.4.0 established the production foundation:

- Brush Engine V2 with profile recovery, identity tools, matching, signatures, previews, and coaching
- Square and circular project canvases
- Organic radial frame navigation and S Pen scrubbing
- Direct timing plus rhythms, recipes, variations, morphs, phrases, libraries, and scores
- Exact 25-step timing Undo/Redo with a tablet history inspector
- Offline project recovery, portable archives, Android export bridging, and signed release verification
- Glass Horizon launcher, splash, and radial studio presentation

The detailed shipped record is maintained in `CHANGELOG.md` and `ARCHITECTURE.md`.

## Active development line

### 1. Onion Skin Studio

Tracking: PR #70 and issue #74.

A focused animator workspace for onion depth, independent past/future opacity, tint strength, colors, layer-only mode, color swapping, resets, and deterministic animator presets.

Gate before merge:

- Physical Galaxy Tab and S Pen acceptance
- Native color-picker lifecycle verification
- Persistence and compositor regression checks
- Exact tested APK and commit recorded in issue #74

### 2. Offline Feedback Report

Tracking: PR #76 and issue #77.

A privacy-bounded prerelease report surface for reproducible tablet diagnostics. It reports technical state without reading artwork, project names, layer names, archives, or clipboard contents. Copy and save occur only after explicit user action.

Gate before merge:

- Parent Onion Skin Studio branch accepted and merged first
- Physical Galaxy Tab presentation, keyboard, clipboard, and `.txt` save verification
- Redaction checks using deliberately distinctive project and layer names
- Original and Brush Engine V2 active-stroke guards
- Exact tested APK and commit recorded in issue #77

## Merge sequence

1. Complete issue #74 against the exact PR #70 artifact.
2. Mark PR #70 ready only after every required exception is resolved or documented.
3. Merge PR #70 into `main` with its expected head SHA.
4. Retarget or rebase PR #76 onto the updated `main` without changing behavior.
5. Rerun all mandatory CI and release-policy checks.
6. Complete issue #77 against the final PR #76 artifact.
7. Merge PR #76 only after acceptance.

This sequencing prevents untested child work from changing a physically approved parent build.

## Candidate research after the active line

These are investigation areas, not committed release promises:

- Per-brush velocity curves for width and opacity
- Wet-edge and pigment transport for watercolor and frost media
- Post-stroke vector-backed ink or editable line layers
- Expanded QuickShape geometry and editable shape constraints
- Performance budgets and memory diagnostics for long 120-frame projects
- Accessible high-contrast and reduced-motion variants of Glass Horizon

Each candidate should begin with a narrow issue, explicit project/write boundaries, deterministic tests, and a separate acceptance artifact.

## Engineering constraints

Every new feature must preserve:

- Offline-first operation
- No account requirement, advertising, analytics, or automatic uploads
- Artwork isolation unless the feature explicitly edits artwork
- Project/archive backward compatibility
- Original-engine and Brush Engine V2 interoperability
- Generated Android asset determinism
- Explicit Gradle inputs for every imported index postprocessor
- Debug APK and signed production APK/AAB verification in CI
- Physical tablet acceptance for stylus, keyboard, picker, storage, or WebView-sensitive behavior

## Historical documents

- `CIRCULAR_CANVAS_PLAN.md` — original circular-canvas design record; shipped in 0.4.0
- `docs/BRUSH_ENGINE_ROADMAP.md` — original stabilizer research and shipped 0.1.2 implementation record

Historical plans should state their shipped status and point back to this roadmap rather than presenting completed work as future work.
