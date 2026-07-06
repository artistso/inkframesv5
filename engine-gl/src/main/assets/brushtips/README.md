# Brush Tip Textures

Place PNG tip textures here to enable textured brush rendering.
Each file must be named after the lowercase `BrushKind` enum value:

| File              | BrushKind  | Description                          |
|-------------------|------------|--------------------------------------|
| `pencil.png`      | PENCIL     | Graphite grain texture               |
| `ink.png`         | INK        | Ink nib / calligraphy tip            |
| `round.png`       | ROUND      | Soft round bristle                   |
| `airbrush.png`    | AIRBRUSH   | Spray spatter pattern                |
| `marker.png`      | MARKER     | Chisel/flat marker tip               |
| `eraser.png`      | ERASER     | (usually left procedural)            |

## Format requirements
- Square PNG, power-of-two size recommended (e.g. 128×128 or 256×256)
- RGBA — the alpha channel drives coverage; RGB is tinted toward the brush colour
- White/light pixels = opaque coverage; transparent = no ink
- Pre-multiplied alpha is NOT required; the shader handles straight alpha

## Fallback
If no file exists for a given BrushKind, the renderer falls back to the
procedural soft-round dab (the classic radial falloff). This means you can
add tip textures incrementally without breaking existing brushes.
