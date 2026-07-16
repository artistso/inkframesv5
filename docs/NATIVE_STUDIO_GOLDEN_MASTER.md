# InkFrame Native Studio Golden Master

## Product definition

The product is the complete original **InkFrame · The Glass Horizon** artist studio. The separate Native Ink Lab and simplified Native Canvas Beta are engineering prototypes only. They do not define the application interface, project model, timeline, controls, or workflow.

The Kotlin migration must preserve the original studio continuously. A web subsystem may be removed only after its Kotlin replacement reaches visual, behavioral, project-data, and Galaxy Tab S Pen parity.

## Visual golden master

The approved studio presentation is the full tablet interface captured before the native prototypes became separate launcher surfaces. Its required visual structure is:

1. Glass Horizon radial-gradient environment, rays, grain, vignette, glass blur, rim highlights, shadows, theme switching, and readable labels.
2. Central framed canvas with square and circular project modes.
3. Perimeter frame timeline around the canvas, including current-frame emphasis, thumbnails, holds, selection, and playback position.
4. Circular/radial timeline and timing controls.
5. Top command deck with Engine, Brush Lab, Play, Center, All Rings, Scrub, and Timing controls.
6. Left-side Tools and Line roots with their radial child controls.
7. Right-side Color, FX, Actions, and Themes roots with their radial child controls.
8. Bottom Studio, Gallery, Frames, Layers, Select, Report, and linear timeline rail.
9. Contextual radial/fan menus for brush, export, onion skin, timing, frame operations, color, and project tools.
10. Expanded/full-canvas mode that preserves access to the established controls and returns to the complete studio.
11. Pink, blue, and other established theme palettes without changing control geometry or project data.
12. Debug stylus diagnostics only in debug builds and never as production chrome.

## Functional golden master

The Kotlin application must preserve:

- existing projects, frames, layers, thumbnails, holds, loops, and timing;
- square and circular canvases;
- radial and perimeter timeline navigation;
- playback, scrub, selection, duplication, deletion, insertion, and range operations;
- Undo and Redo boundaries;
- onion skin and Ghost Trail controls;
- brush selection, pressure, size, opacity, streamline, tilt, eraser, hover, and palm rejection;
- gallery, autosave, recovery, import, export, PNG, GIF, video, and sharing workflows;
- viewport fit, center, pan, zoom, Hand mode, actual-pixel view, and modal isolation;
- all established buttons, options, menus, keyboard shortcuts, S Pen ownership rules, and accessibility semantics.

## Migration architecture

```text
Complete original studio
├── authoritative project/frame/layer/timeline behavior
├── established visual geometry and themes
└── native Kotlin S Pen surface over the real canvas
    ├── direct MotionEvent input
    ├── pressure, tilt, hover, eraser, and palm handling
    ├── native live-stroke rendering
    └── completed-stroke commit into the established active frame/layer
```

The next migration layers are Kotlin project/timeline models and Kotlin native chrome. The existing studio remains visible and functional while each layer is replaced.

## Non-regression rules

1. Production has one InkFrame launcher: the complete studio.
2. Native prototypes must not appear as alternative production products.
3. No original control is deleted because its Kotlin replacement is unfinished.
4. No project schema is replaced without import/export and rollback coverage.
5. No native UI milestone is accepted without screenshot comparison at the Galaxy Tab target resolution.
6. No S Pen milestone is accepted without physical tablet testing.
7. Draft PRs remain unmerged until both automated parity checks and physical acceptance pass.
