# Glass Horizon native visual contract

Status: **binding design source for the Kotlin port**

The native application must reproduce the original InkFrame **Glass Horizon** workspace. It must not reinterpret the product as a conventional drawing application, substitute a generic Material dashboard, or reduce the interface to approximate colors and floating buttons.

## Authoritative source

The visual and interaction source of truth is:

- `web/index.html`
- reference commit: `e1c4addbe04e9f4cdec705559e55d1a1e54bc8c0`
- product title: `InkFrame · The Glass Horizon`

The web implementation is a design specification only. The shipped Android runtime remains Kotlin/Compose/OpenGL and must not package or execute the web application.

## Rejected implementations

The following are explicitly not acceptable production targets:

1. `StudioScreen` — conventional left brush rail, top toolbar, right panel, and bottom timeline.
2. `GlassCanvasScreen` from closed PR #134 — flat plum field, oversized plain canvas, static Material-icon circles, top-only frame dots, and generic centered cards.

Neither screen may be launched, copied, renamed, or incrementally polished into the final product.

## 1. Atmospheric world

The workspace is a full-screen visual world, not a dark application background.

The default Glass Horizon theme must reproduce these layers in this order:

1. **Horizon gradient**
   - top-centered radial field equivalent to `radial-gradient(120% 82% at 50% -12%, ...)`;
   - exact color progression: `#ffd9e2`, `#f7cac9`, `#d77fa0`, `#a52766`, `#4d0a33`, `#1a001a`;
   - the bright rose horizon must remain clearly visible across the upper third of a landscape tablet.
2. **Light rays**
   - conic rays originating at the top center;
   - screen/additive composition;
   - approximately 42% opacity with a soft two-pixel-class blur.
3. **Fine grain**
   - subtle fractal/noise texture;
   - overlay composition near 5% opacity;
   - no obvious repeating tile or large speckles.
4. **Vignette**
   - transparent central region through approximately 55% of the radial field;
   - deep plum-black edge falloff equivalent to `rgba(20,0,14,.55)`.
5. **Transient glint layer**
   - separate additive layer for interaction flashes;
   - never baked into the static background.

A nearly uniform plum, burgundy, black, or Material surface fails this contract.

## 2. Product title

The title is fixed at the top center, outside the drawing frame:

- `InkFrame` in a display serif/Cinzel-class face;
- 20sp-class size, bold, uppercase presentation, approximately `.22em` tracking;
- vertical text gradient from white through rose to accent red;
- subtle luminous text shadow;
- subtitle exactly `The Glass Horizon`;
- subtitle approximately 10sp, `.28em` tracking, uppercase, rose-dim color;
- top offset equivalent to 14px in the reference layout.

The subtitle must not be renamed to `The Glass Canvas`.

## 3. Drawing stage and frame glass

The drawing surface is centered and preserves the document aspect ratio.

### Frame glass

- rounded outer radius equivalent to 30px;
- 14px-class optical padding around the canvas;
- translucent 160-degree glass gradient using the theme's strong and normal glass values;
- approximately 20px backdrop blur and 150% saturation response where supported;
- one-pixel rose glass border;
- deep exterior shadow, bright inner top rim, and faint internal bloom.

### Canvas

- fitted by document aspect ratio, never stretched to an arbitrary screen rectangle;
- reference default: 1024 × 768 (4:3);
- rounded radius equivalent to 16px;
- default paper `#fff0f3`;
- one-pixel dark edge plus deep lower shadow;
- enough surrounding space for nodes, the perimeter frame board, and the scrub rail;
- no modal should cover the canvas by default after an existing project has loaded.

The canvas must not occupy most of the tablet width merely because space is available. Its scale is derived from aspect ratio and reserved command space.

## 4. Perimeter frame board

The animation frame board wraps the **entire perimeter** of `frameGlass`.

- slots are approximately 18 × 18px with five-pixel rounded corners;
- positions run continuously around top, right, bottom, and left edges;
- frame numbers remain legible;
- filled, empty, next, current, selected, and held states are visually distinct;
- current frame scales to approximately 1.35× and uses the blush-to-accent gradient;
- selected frame uses a white outer ring plus accent glow;
- held frames show the small luminous rose hold indicator;
- an optional capacity badge sits below the frame glass.

A top-only row of dots, circles, or generic pagination indicators fails this contract.

## 5. Timeline scrub rail

A separate horizontal glass rail sits below the centered stage:

- previous and next step controls;
- loop-region visualization;
- loop-in and loop-out handles;
- playhead positioned on the track;
- held-frame timing represented proportionally;
- current-frame count such as `1 / 12`;
- same glass language as the nodes and frame.

The rail is not replaced by a conventional bottom toolbar.

## 6. Primary glass nodes

The command system consists of circular optical nodes positioned around the stage.

Required primary nodes:

- Tools
- Line
- Color
- Layers
- Actions
- Frames
- Studio
- Gallery

Each primary node must:

- be approximately 58px in diameter;
- use the shared translucent glass gradient, border, external shadow, inner rim, and bloom;
- include a darker radial optical center behind the glyph for contrast;
- use custom thin white vector line glyphs based on the reference SVG language;
- show an uppercase tracked label below the orb;
- support dragging and persistent normalized placement;
- show a stronger glow while open or dragging;
- remain outside the active drawing surface unless the artist intentionally drags it there.

Material icon discs with fixed offsets fail this contract.

## 7. Radial child menus

Opening a primary node reveals child controls that fan out from the node center.

- child nodes are approximately 48px circles;
- collapsed state begins at the parent center near 0.35× scale and zero opacity;
- opening uses the reference spring-like cubic animation;
- child direction and spacing adapt to screen edges and parent position;
- nested branches are allowed;
- selected/on states use accent gradients and glow;
- labels remain associated with their child nodes;
- brush, color, frame, dial, theme, and action children retain their specialized visual states.

Generic rectangular dropdowns or centered panels are not substitutes for the primary command interaction.

## 8. Live glass lens

Stylus hover/contact displays the original live lens cursor:

- approximately 100px optical lens field centered on the pen tip;
- translucent ring with bright rim;
- white nib/vector indicator;
- soft plum drop shadow;
- short opacity transition;
- hidden when no stylus interaction is active.

The lens is a separate overlay and must not be drawn into artwork.

## 9. Overlays

Studio, Projects, Start, Export, Brush Lab, Stylus diagnostics, and Help must follow the original frosted language:

- dim and blur the world behind them;
- rounded 22–26px-class cards;
- translucent rose/plum gradients rather than opaque Material surfaces;
- rose glass border, strong shadow, bright inner rim;
- display-serif headings with tracked subtitles;
- theme-aware text contrast;
- original information hierarchy and actions.

A generic centered `Surface`, default Material button row, or opaque card fails this contract.

## 10. Responsive behavior

The target is the Samsung Galaxy Tab S10+ in landscape, with graceful support for other Android tablet sizes.

- the canvas remains aspect-ratio correct;
- nodes remain reachable and do not overlap system insets;
- perimeter slots remain attached to the frame geometry;
- labels do not clip at screen edges;
- radial children choose inward-safe arcs;
- title, stage, and rail maintain their visual hierarchy;
- portrait may reorganize geometry but may not become the rejected conventional rail/panel layout.

## 11. Native implementation constraints

- Kotlin and Jetpack Compose own the application shell.
- OpenGL ES owns committed artwork composition.
- HWUI/Compose may own atmosphere, glass chrome, nodes, labels, menus, and the live lens.
- No WebView, JavaScript bridge, packaged web runtime, or browser storage.
- No Material default styling may remain visible merely for implementation convenience.
- Custom vectors must be represented as native vector paths, not copied raster screenshots.

## 12. Acceptance gates

No APK may be described as the intended Glass Horizon build until all of these pass:

1. **Static visual review**
   - clean launch screenshot at the target tablet resolution;
   - screenshot with Tools expanded;
   - screenshot with Frames expanded;
   - screenshot of one frosted overlay;
   - explicit owner approval.
2. **Structural review**
   - full atmospheric stack present;
   - 4:3 default canvas fitted inside rounded frame glass;
   - frame slots on all four sides;
   - separate timeline rail;
   - eight draggable primary nodes;
   - radial child menus;
   - live stylus lens.
3. **Runtime review**
   - no launch reference to `StudioScreen` or rejected `GlassCanvasScreen`;
   - no web assets in the APK;
   - native unit tests and package inspection pass.
4. **Device review**
   - Galaxy Tab S10+ landscape launch;
   - S Pen draw, hover, pressure, eraser, pan, and zoom;
   - rotation, background/resume, and process restart;
   - no visual fallback to conventional Material UI.

Until owner approval is recorded, screenshots and APKs must be labeled **prototype — not design approved**.
