# Glass Horizon Completion Registry

This registry is the authoritative completion ledger for the native Kotlin/Compose/OpenGL translation of InkFrame · The Glass Horizon.

The original `web/index.html` is the binding visual, interaction, geometry and feature specification. A Kotlin feature is not complete merely because code exists or CI is green.

## Status language

| Status | Meaning |
|---|---|
| `MISSING` | No native implementation exists. |
| `PARTIAL` | Some native structure exists, but required behavior or fidelity is absent. |
| `IMPLEMENTED` | Native implementation exists and is reachable. |
| `UNIT-VERIFIED` | Release compilation and automated tests cover the implementation. |
| `DEVICE-PENDING` | Automated verification passed; physical Galaxy Tab evidence is still required. |
| `DEVICE-REJECTED` | Physical testing disproved the implementation. |
| `DEVICE-VERIFIED` | Physical Galaxy Tab recording proves the acceptance contract. |
| `OWNER-APPROVED` | Steven Owens explicitly approved the visual and functional result. |

No row may advance directly from `IMPLEMENTED` or `UNIT-VERIFIED` to `OWNER-APPROVED` without physical-device evidence.

## Current validated baseline

- Native package under test: `com.inkframe.studio.qa`
- Stable QA certificate: `4D:44:43:44:DF:93:85:DE:84:39:CE:FB:79:E8:C5:5E:54:5C:59:D9:71:57:F8:D3:5B:DF:1F:CE:31:7B:E1:16`
- Deterministic-stroke source commit: `f750ca4b33709c070f897aee0fe71191aa9cd486`
- QA artifact commit: `d697b3c47e73832e3bcaceeb6165f35ea7b13b9f`
- QA artifact SHA-256: `acb162a4d861da33fd5f678d058bf5dfe28e605ad20f69cc203bf1df6bb3d468`
- Public release and Play submission: prohibited until all release gates are `DEVICE-VERIFIED` and the owner explicitly approves publication.

## Completion matrix

| ID | Original subsystem | Native status | Required evidence before completion |
|---|---|---|---|
| GH-001 | Horizon radial background | `PARTIAL` | Clean-launch screenshot matched against original color stops and focal geometry. |
| GH-002 | Screen-blended conic rays | `PARTIAL` | Device screenshot showing original ray count, angle, opacity and blur. |
| GH-003 | Grain overlay | `PARTIAL` | Device screenshot and performance check; no animated noise shimmer. |
| GH-004 | Vignette and glint layers | `PARTIAL` | Overlay ordering and brightness verified on tablet. |
| GH-005 | `INKFRAME` title and `THE GLASS HORIZON` subtitle | `PARTIAL` | Typography, spacing, gradient and contrast matched on device. |
| GH-006 | Fitted document stage and 14 px glass frame | `PARTIAL` | 1024×768 document fits with measured negative space on Galaxy Tab landscape. |
| GH-007 | Rounded paper surface and deep stage shadow | `PARTIAL` | Paper color, clipping, rim and shadow match the original. |
| GH-008 | Four-corner resize handles | `MISSING` | Resize interaction preserves artwork and updates document dimensions. |
| GH-009 | Four side reshape handles | `MISSING` | N/S/E/W resize behavior matches original constraints. |
| GH-010 | Four-sided perimeter frame board | `PARTIAL` | Current, filled, empty, next, selected and held states verified. |
| GH-011 | Frame capacity badge and 120-frame cap | `MISSING` | Capacity text, warning state and cap behavior verified. |
| GH-012 | Separate scrub rail | `PARTIAL` | Held timing, loop region, in/out handles, playhead and count all synchronized. |
| GH-013 | Permanent previous/play-pause/next transport | `UNIT-VERIFIED · DEVICE-PENDING` | Three-frame playback visibly advances at project FPS and pauses correctly. |
| GH-014 | Eight draggable primary orbs | `PARTIAL` | Exact default anchors, 58 px sizing, drag persistence and reset behavior verified. |
| GH-015 | Custom primary SVG-equivalent glyphs | `PARTIAL` | Native vector paths matched against all original glyphs. |
| GH-016 | 48 px radial children | `PARTIAL` | Exact fan radius, easing, label placement and selected states verified. |
| GH-017 | Edge-aware radial direction | `PARTIAL` | No child is clipped or unnecessarily covers the paper at tablet edges. |
| GH-018 | Nested radial branches | `MISSING` | All original nested command branches are native and functional. |
| GH-019 | Collapse-all glass control | `MISSING` | Original control location, glyph and behavior verified. |
| GH-020 | Tools brush library | `PARTIAL` | Every original brush is present, selectable and materially distinct. |
| GH-021 | Brush Lab | `PARTIAL` | Long-press opening, all original controls, presets, import/export and reset. |
| GH-022 | Line controls | `PARTIAL` | Size, opacity, smoothing/stabilization and original labels verified. |
| GH-023 | Color swatches and color picker | `PARTIAL` | Original palette, paper color and full picker workflow verified. |
| GH-024 | Layers command system | `PARTIAL` | Add, duplicate, visibility, delete, reorder, merge, flatten and reference import. |
| GH-025 | Actions command system | `PARTIAL` | Undo, redo, fit, 100%, readable text, stylus controls and gesture commands. |
| GH-026 | Frames command system | `PARTIAL` | Previous, play/pause, next, insert, remove, loop, list and timing operations. |
| GH-027 | Studio command system | `PARTIAL` | About, Help, Checker, Onion, themes, diagnostics and settings parity. |
| GH-028 | Gallery command system | `PARTIAL` | Projects, templates, open, save, archive import/export and recovery workflow. |
| GH-029 | Frosted About overlay | `PARTIAL` | Full original content, glass geometry and canvas-under-overlay stacking verified. |
| GH-030 | Project browser overlay | `MISSING` | Gallery, autosave and recovery controls implemented natively. |
| GH-031 | First-launch template picker | `MISSING` | All original templates and custom-size workflow implemented. |
| GH-032 | Quick Help overlay | `MISSING` | Original help categories and direct backup/projects actions implemented. |
| GH-033 | Stylus diagnostics panel | `PARTIAL` | Pressure, tilt, orientation, contact size, distance, buttons and tool type visible. |
| GH-034 | Live 100 px glass stylus lens | `IMPLEMENTED · DEVICE-PENDING` | Hover/contact/pressure/tilt/eraser/barrel behavior verified without intercepting input. |
| GH-035 | Finger and S Pen input routing | `UNIT-VERIFIED · DEVICE-PENDING` | `INK CONTACT` appears for valid contact and no false drawing outside paper. |
| GH-036 | Persistent stroke rasterization | `UNIT-VERIFIED · DEVICE-PENDING` | Visible finger and S Pen strokes remain after pen-up and frame switching. |
| GH-037 | Pressure-sensitive brush size/flow | `PARTIAL` | Light-to-heavy stroke visibly changes diameter and/or flow. |
| GH-038 | Tilt and orientation dynamics | `MISSING` | Reintroduced only after basic drawing is device-verified. |
| GH-039 | Physical eraser | `PARTIAL` | Hardware eraser removes pixels without changing selected brush. |
| GH-040 | Undo and redo | `UNIT-VERIFIED · DEVICE-PENDING` | Device recording proves exact stroke removal/restoration. |
| GH-041 | Frame-local cels | `UNIT-VERIFIED · DEVICE-PENDING` | Different artwork survives across at least three frames. |
| GH-042 | Onion skin | `PARTIAL` | Past/future depth, opacity, tint and active-layer-only behavior verified. |
| GH-043 | Holds, twos, reverse, ping-pong and multi-frame timing | `MISSING` | Original frame-list timing operations implemented and tested. |
| GH-044 | Project save/open | `PARTIAL` | Round-trip archive preserves pixels, layers, frames, holds, paper and settings. |
| GH-045 | Autosave and crash/process recovery | `MISSING` | Forced process death restores the latest safe project state. |
| GH-046 | EGL context-loss recovery | `IMPLEMENTED · DEVICE-PENDING` | Background/foreground and context recreation preserve artwork. |
| GH-047 | PNG export | `PARTIAL` | Exported pixels, dimensions, paper and transparency verified. |
| GH-048 | GIF export | `PARTIAL` | Timing, loop behavior, colors and frame order verified. |
| GH-049 | MP4 export | `PARTIAL` | Duration, FPS, dimensions and playback verified on device. |
| GH-050 | PNG sequence export | `PARTIAL` | Correct frame naming, dimensions and ordering verified. |
| GH-051 | `.inkframe` archive import/export | `PARTIAL` | Full gallery/document round trip verified against original format contract. |
| GH-052 | Theme worlds | `MISSING` | All original theme palettes update atmosphere, glass, labels and swatches. |
| GH-053 | Zen/canvas-expanded mode | `MISSING` | Title/orbs withdraw and frame geometry follows original behavior. |
| GH-054 | Circular canvas mode and organic perimeter timeline | `MISSING` | Native clipping, persisted canvas shape and timeline adaptation verified. |
| GH-055 | Two-finger pan/zoom without finger-angle rotation | `PARTIAL` | Gesture contract verified physically; programmatic rotation remains supported. |
| GH-056 | Two-finger undo and three-finger redo | `MISSING` | Gesture recognition is reliable and does not mark the canvas. |
| GH-057 | Accessibility and 48–52 dp touch targets | `PARTIAL` | All interactive controls reachable and readable on Galaxy Tab. |
| GH-058 | Offline/privacy boundary | `IMPLEMENTED` | No Internet permission, WebView, JS bridge, analytics, ads or account dependency. |
| GH-059 | Stable QA update lineage | `DEVICE-VERIFIED` | Current and future QA APKs install over the stable QA package. |
| GH-060 | Permanent production signing lineage | `MISSING` | Four long-lived GitHub secrets configured and verified without exposing key material. |
| GH-061 | Clean / Tools / Frames / overlay screenshots | `MISSING` | Approved screenshots attached to issue #136. |
| GH-062 | Owner final visual acceptance | `MISSING` | Explicit approval from Steven Owens after physical-device review. |
| GH-063 | Public GitHub release and Play AAB | `BLOCKED` | Allowed only after GH-062 and permanent production signing readiness. |

## Immediate execution order

1. Prove GH-035, GH-036, GH-013, GH-040 and GH-041 using the `d697b3c` QA APK.
2. Preserve the verified runtime and finish GH-001 through GH-019 from measured original geometry.
3. Complete radial command parity GH-020 through GH-028 without generic Material substitutes.
4. Complete overlays, project lifecycle and recovery GH-029 through GH-046.
5. Complete export and archive parity GH-047 through GH-051.
6. Complete themes, canvas modes, gestures and accessibility GH-052 through GH-057.
7. Capture acceptance evidence, configure permanent production signing, obtain owner approval, then produce the Play-ready AAB.

## Non-negotiable constraints

- Native Kotlin, Jetpack Compose and OpenGL/HWUI only.
- No WebView, JavaScript bridge, packaged web runtime, Electron or browser storage.
- Direct work on `main`; no feature branches or stacked PR program.
- No debug APKs.
- No public release, release tag, Play upload or production publication before owner approval.
- Never call a visual or functional subsystem complete without the evidence required by this registry.
