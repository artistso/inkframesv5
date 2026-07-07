# AI Native Worker Brief

Use this brief when asking another AI/coding agent to independently improve InkFrame's native Android app and return a tested patch or report.

## Mission

InkFrame is moving from a WebView prototype into a native Android tablet app built with Kotlin, Jetpack Compose, and the existing OpenGL paint engine. Your job is to make focused, testable improvements that can be pulled back into this repo without fighting parallel work.

Primary areas:

1. Canvas feel and stylus performance.
2. Timeline/exposure-sheet editing.
3. Brush engine quality and Brush Lab UX.
4. Elemental Heart/Earth/Wind/Water/Fire radial-control prototype.
5. Button spacing, hit targets, padding, and drag/drop affordances.

Read first:

- `docs/NATIVE_CREATIVE_ROADMAP.md`
- `app/src/main/kotlin/com/inkframe/studio/MainActivity.kt`
- `feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/StudioScreen.kt`
- `feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/StudioState.kt`
- `feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/CanvasView.kt`
- `engine-gl/src/main/kotlin/com/inkframe/engine/gl/PaintEngine.kt`
- `engine-gl/src/main/kotlin/com/inkframe/engine/gl/StrokeProcessor.kt`
- `core-model/src/main/kotlin/com/inkframe/core/model/Brush.kt`
- `core-model/src/main/kotlin/com/inkframe/core/model/TimelineOps.kt`

## Ground rules

- Keep changes small and reviewable. Prefer one focused patch over a broad rewrite.
- Do not reintroduce WebView as the runtime path.
- Do not delete or rewrite large modules unless explicitly asked.
- Do not add network services, accounts, analytics, or remote AI dependencies.
- Preserve offline-first behavior.
- Prefer pure Kotlin/model tests for logic before adding UI-only behavior.
- If you add UI metrics, route them through `StudioMetrics` or an equivalent centralized design token object.
- If you add brush math, make the math deterministic where possible so exports/tests can reproduce strokes.
- If you touch drag/drop, define the gesture grammar in comments or docs before adding complex behavior.

## Suggested independent tasks

Pick one task per patch.

### Task A: Canvas/stylus diagnostics

Goal: add a debug overlay or diagnostic state that helps measure stylus feel without changing brush output.

Possible scope:

- Count historical samples consumed per stroke.
- Track last pressure, pointer type, and sample rate.
- Expose a toggle in the native UI.
- Add pure tests for any non-Android math.

Avoid:

- Changing brush rendering output in the same patch.
- Adding device-specific hacks without comments.

### Task B: Timeline drag preview

Goal: make timeline drag behavior clearer before implementing full range editing.

Possible scope:

- Add transient drag state for source/target frame.
- Highlight the target frame while dragging.
- Keep existing move behavior through `TimelineDrag.resolveDrag`.
- Add or update tests around drag math in `core-model`.

Avoid:

- Combining move, duplicate, range-select, and hold-stretch in one patch.

### Task C: Brush-engine pressure curve foundation

Goal: introduce reusable pressure-curve math without changing all brushes yet.

Possible scope:

- Add a small pure Kotlin pressure curve model.
- Support linear, eased, and custom-point curves.
- Unit test clamping, monotonicity, and representative pressures.
- Wire one brush parameter only if tests are in place.

Avoid:

- Big shader changes without snapshots or visual test notes.

### Task D: Elemental control prototype

Goal: add a non-destructive Heart elemental button prototype.

Possible scope:

- Add state for elemental fan open/closed.
- Add Heart button that opens Earth/Wind/Water/Fire/Heart child buttons.
- The child buttons may only display labels/icons initially.
- Document future drop targets in code comments.

Avoid:

- Implementing destructive effects before the interaction model is tested.
- Copying trademarked Captain Planet imagery; use an original heart/planet/ring mark or text label.

### Task E: UI spacing audit

Goal: improve button padding and hit targets without changing app behavior.

Possible scope:

- Expand `StudioMetrics` into grouped tokens: rail, toolbar, timeline, dialog, layer row.
- Replace remaining magic dp values where it is safe.
- Add comments explaining compact timeline exceptions.

Avoid:

- Visual restyles that make it impossible to compare behavior.

## Test commands

Run the most specific command first, then broader checks if available.

```bash
# Use Java 17 for Kotlin/Android Gradle compatibility when needed.
mise exec java@17.0.2 -- ./gradlew :feature-canvas:compileDebugKotlin --stacktrace
mise exec java@17.0.2 -- ./gradlew :app:assembleDebug --stacktrace
mise exec java@17.0.2 -- ./gradlew test --stacktrace
```

If the wrapper cannot download Gradle or dependencies because of a network/proxy issue, try the system Gradle with Java 17:

```bash
mise exec java@17.0.2 -- gradle :feature-canvas:compileDebugKotlin --stacktrace
mise exec java@17.0.2 -- gradle :app:assembleDebug --stacktrace
mise exec java@17.0.2 -- gradle test --stacktrace
```

If Gradle cannot resolve Android dependencies, still run any pure checks you can, such as file readability, targeted pure Kotlin tests if cached, or static inspection. Report the limitation clearly.

## Required return format

Return a concise report with:

1. **Summary** — what changed.
2. **Files changed** — bullet list with paths.
3. **Testing** — exact commands run and pass/fail/warning result.
4. **Risks / follow-ups** — anything that needs tablet validation.
5. **Patch or branch** — where to pull the work from.

Testing result notation:

- `PASS`: command completed successfully.
- `WARN`: blocked by environment/dependency/device limitation.
- `FAIL`: code/test failed and needs fixing.

Example:

```text
Summary
- Added timeline drag preview state and target highlighting.

Files changed
- feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/StudioScreen.kt
- core-model/src/test/kotlin/com/inkframe/core/model/TimelineDragTest.kt

Testing
- PASS: mise exec java@17.0.2 -- ./gradlew :core-model:test --stacktrace
- WARN: mise exec java@17.0.2 -- ./gradlew :app:assembleDebug --stacktrace (Android Gradle plugin unavailable in sandbox)

Risks / follow-ups
- Needs tablet validation for finger/stylus drag cancellation.
```
