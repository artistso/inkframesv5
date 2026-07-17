# Native S Pen Stroke Dynamics

InkFrame's native Kotlin/OpenGL stroke pipeline now consumes Android stylus data directly.

## Implemented in `9ef81a9492030bfc1f326b186413b36191852c2c`

- Pressure continues to control brush diameter and flow.
- Android `AXIS_TILT` and `AXIS_ORIENTATION` are preserved in every native `InputSample`.
- Pencil, ink, and marker tips generate rotated elliptical dabs as the S Pen tilts.
- Round brushes remain circular and ignore tilt geometry by design.
- The physical S Pen eraser tip temporarily uses the native eraser engine without replacing the user's selected brush.
- Completed strokes report frame, sample count, pressure range, maximum tilt, eraser state, and barrel-button use in the Glass Horizon status chip.
- The OpenGL dab vertex layout includes aspect ratio, and the fragment shader evaluates a rotated ellipse rather than assuming every dab is circular.

## Automated verification

The guarded implementation passed release Kotlin compilation and the complete unit-test suite before it was committed. Unit tests cover tilted pencil geometry and round-brush tilt isolation.

## Physical Galaxy Tab acceptance

The stable QA APK must still be tested for:

1. slow pressure-varying strokes;
2. fast strokes and continuity;
3. low- and high-tilt pencil/ink/marker strokes;
4. physical eraser-tip switching;
5. barrel-button telemetry;
6. undo and redo;
7. frame-local artwork persistence while switching frames.

The QA artifact is not a public release or final device approval.
