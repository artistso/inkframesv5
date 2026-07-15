# InkFrame Studio Roadmap

Status date: 2026-07-15
Current public release: `0.4.0`
Current integrated development baseline: `8bba8e0c3b773a48c791c172ae10889a1a7649b0`

This document is the canonical development roadmap. Historical design plans and stacked pull requests remain implementation and acceptance records, but they do not override the state of `main`.

## Public release baseline

InkFrame 0.4.0 established the production foundation:

- Brush Engine V2 with profile recovery, identity tools, matching, signatures, previews, and coaching
- Square and circular project canvases
- Organic radial frame navigation and S Pen scrubbing
- Direct timing plus rhythms, recipes, variations, morphs, phrases, libraries, and scores
- Exact 25-step timing Undo/Redo with a tablet history inspector
- Offline project recovery, portable archives, Android export bridging, and signed release verification
- Glass Horizon launcher, splash, and radial studio presentation

The detailed shipped record is maintained in `CHANGELOG.md` and `ARCHITECTURE.md`.

## Integrated development baseline on `main`

The following work is integrated after 0.4.0 but is not automatically considered a public release or physical-device acceptance:

### Animator and tablet workspaces

- Onion Skin Studio with deterministic presets, independent past/future opacity, tint controls, color swapping, and active-layer-only mode
- Offline Feedback Report with privacy-bounded technical state, explicit copy/save actions, and no artwork or project-name access
- Tablet Command Deck with Draw, Frames, Layers, Actions, Brush Lab, transport, live editor state, and tablet-first control sizing
- Contextual Timeline Workspace for frame selection, holds, duplication, deletion, reverse, and ping-pong operations
- Contextual Layer Workspace for layer selection, opacity, visibility, blend, ordering, duplication, deletion, and merge-down

### Project-wide Static Background

- One editable shared background canvas per project, rendered below onion skins and frame layers
- Original and Brush Engine V2 editing through the established drawing paths
- Visibility, opacity, blend, clear, fill, selection, Layer FX, and exact Undo/Redo support
- Autosave payload v3 with v1/v2 migration
- `.inkframe` archive v4 with earlier-archive migration
- Correct live, playback, thumbnail, PNG, GIF, video, eyedropper, and A/B rendering
- Contextual `Static BG` controls with per-frame structural-operation isolation

Tracking:

- Implementation: PR #100 and issue #98
- Integrated physical acceptance: issue #104

### Build and repository infrastructure

- Active GitHub Actions use `actions/checkout@v7`, `actions/setup-node@v7`, and explicit Node 24
- Automatic setup-node package-manager caching is disabled unless deliberately enabled
- A repository contract prevents regression to older action runtimes or inconsistent Node selection
- Debug APK and disposable-key production APK/AAB paths remain mandatory CI gates

Tracking: PR #101 and issue #83.

## Active release line

### 1. Integrated Galaxy Tab acceptance

Complete issue #104 against the exact recorded APK and SHA-256.

Required coverage includes:

- Upgrade and cold-start behavior
- Existing autosave and archive migration
- Original and Brush Engine V2 S Pen editing
- Static Background selection, properties, isolation, and Undo/Redo
- Onion, playback, thumbnail, and export compositor order
- Portrait/landscape, Android WebView, MediaStore, and active-stroke behavior

A new implementation commit invalidates the recorded acceptance artifact and requires replacement hashes.

### 2. Preserve component-level evidence

Issues #74, #77, #89, #94, and #97 retain exact historical component artifacts for Onion Skin Studio, Feedback Report, Tablet Command Deck, Timeline Workspace, and Layer Workspace.

The associated stacked draft PRs are historical implementation records. Their feature code is already represented in the integrated `main` baseline through later integration work. Do not merge or rewrite those branches merely to make their PR state resemble current `main`; preserve their exact heads when component-level acceptance evidence is still needed.

### 3. Prepare the next public release

After integrated acceptance succeeds:

1. Update `CHANGELOG.md` `[Unreleased]` with the accepted user-facing behavior.
2. Regenerate and verify `RELEASE_NOTES.md`.
3. Select and apply the release version with `./inkframe-cli bump`.
4. Run `./inkframe-cli release-check` from a clean, synchronized `main`.
5. Complete a protected signed-release dry run.
6. Tag only the exact accepted and verified commit.
7. Publish the GitHub Release and manually submit the signed AAB to the intended Google Play track.

## Candidate engineering after acceptance

These are investigation areas, not committed release promises:

- Performance budgets and memory diagnostics for long 120-frame projects
- Accessible high-contrast and reduced-motion Glass Horizon variants
- Per-brush velocity curves for width and opacity
- Wet-edge and pigment transport for watercolor and frost media
- Post-stroke vector-backed ink or editable line layers
- Expanded QuickShape geometry and editable shape constraints

Each candidate should begin with a narrow issue, explicit read/write boundaries, deterministic tests, and a separate acceptance artifact when Android WebView, S Pen, storage, or picker behavior is involved.

## Engineering constraints

Every new feature must preserve:

- Offline-first operation
- No account requirement, advertising, analytics, or automatic uploads
- Artwork isolation unless the feature explicitly edits artwork
- Project and archive backward compatibility
- Original-engine and Brush Engine V2 interoperability
- Generated Android asset determinism
- Explicit Gradle inputs for every imported index postprocessor
- Debug APK and signed production APK/AAB verification in CI
- Physical tablet acceptance for stylus, keyboard, picker, storage, or WebView-sensitive behavior
- Exact artifact and commit recording for acceptance builds

## Historical documents

- `CIRCULAR_CANVAS_PLAN.md` — original circular-canvas design record; shipped in 0.4.0
- `docs/BRUSH_ENGINE_ROADMAP.md` — original stabilizer research and shipped 0.1.2 implementation record

Historical plans should state their shipped status and point back to this roadmap rather than presenting completed work as future work.
