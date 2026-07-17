# Legacy InkFrame Web Archive v4

Status: verified migration contract  
Source of truth: the historical web studio and its Canvas Shape / Static Background injectors  
Importer policy: read-only; never modify or overwrite the source archive

## 1. Container and media type

The historical `.inkframe` export is **not a ZIP archive**.

It is UTF-8 JSON text downloaded with:

- extension: `.inkframe`
- MIME type: `application/x-inkframe+json`
- raster payloads: PNG `data:` URLs embedded directly in JSON

This differs from the existing native Kotlin package, which is a ZIP containing `document.json` and separate cel PNG files. Import routing must inspect content rather than trusting the extension or provider MIME type.

## 2. Top-level v4 envelope

```json
{
  "v": 4,
  "app": "InkFrame Studio",
  "kind": "inkframe-web-archive",
  "savedAt": 0,
  "active": 0,
  "projects": []
}
```

Compatibility behavior in the historical reader also accepts a single `project` object in place of `projects`.

Version history relevant to migration:

- v1/v2: earlier project/frame representations;
- v3: multi-project archive with paper, holds, frame-local layers, and canvas shape after Circular Canvas integration;
- v4: adds one editable project-wide static background.

## 3. Project object

```json
{
  "name": "Canvas",
  "w": 1280,
  "h": 720,
  "cur": 0,
  "fps": 12,
  "paper": "#fff0f3",
  "canvasShape": "square",
  "background": {},
  "holds": [1],
  "frames": []
}
```

Fields:

| Field | Meaning | Historical fallback |
|---|---|---|
| `name` | Artist-visible project name | `Canvas` |
| `w`, `h` | Project pixel dimensions | application defaults |
| `cur` | Current frame index | `0`, clamped |
| `fps` | Playback/export frame rate | `12` |
| `paper` | CSS paper colour | `#fff0f3` |
| `canvasShape` | `square` or `circle` | `square` |
| `background` | Shared editable static-background layer | transparent background |
| `holds` | Per-frame timing multipliers | one per frame, default `1` |
| `frames` | Ordered frame-local layer stacks | one blank frame |

Current artist-facing hold controls normalize values to `1..8`.

## 4. Static background

```json
{
  "visible": true,
  "opacity": 1.0,
  "blend": "source-over",
  "png": "data:image/png;base64,..."
}
```

The background is shared by every frame in the project and remains independently editable. It is composited after paper and before frame layers. Circle projects clip the shared background to the inscribed circle without modifying its stored rectangular pixels.

Historical readers also accept `dataUrl` or `data` instead of `png`.

## 5. Frame object

```json
{
  "active": 0,
  "layers": []
}
```

`active` is the selected layer index for that frame. Each frame owns its own ordered layer list.

## 6. Frame-local layer object

```json
{
  "name": "Layer",
  "visible": true,
  "opacity": 1.0,
  "blend": "source-over",
  "png": "data:image/png;base64,..."
}
```

Historical readers also accept `dataUrl` or `data` instead of `png`. A legacy frame containing a direct `png`, `dataUrl`, or `data` field is upgraded to one layer named `Layer 1`.

Canvas 2D blend strings map to the native compositor as follows:

| Web blend | Native blend |
|---|---|
| `source-over` | `NORMAL` |
| `multiply` | `MULTIPLY` |
| `screen` | `SCREEN` |
| `overlay` | `OVERLAY` |
| `lighter` | `ADD` |
| `darken` | `DARKEN` |
| `lighten` | `LIGHTEN` |
| `difference` | `DIFFERENCE` |

Unknown blend values must not be silently interpreted as an unrelated mode. The importer should either use a documented safe fallback with a migration warning or reject the affected project.

## 7. Critical model mismatch

The historical web product uses:

```text
Project
  -> Frame
       -> frame-local ordered Layer list
```

The current native Kotlin prototype uses:

```text
Project
  -> persistent ordered Layer list
       -> sparse frame-to-Cel map
```

These are not generally isomorphic.

A web project may change layer count, active layer, layer name, visibility, opacity, blend mode, and artwork independently on every frame. Mapping layers only by list index into persistent native layers can:

- merge unrelated layers;
- hold artwork into later frames where the source frame was blank;
- lose per-frame names or compositor settings;
- alter which layer is active;
- make an imported project render differently.

Therefore, a lossless legacy importer must not be built on the current persistent-layer assumption. The canonical Kotlin model must first support frame-local layer topology, or a deliberately lossy flattening mode must be separately specified and require explicit artist consent.

## 8. Import safety requirements

The read-only importer must:

1. Distinguish JSON web archives from ZIP native packages by magic/content inspection.
2. Bound JSON bytes, project count, frame count, layer count, dimensions, decoded PNG bytes, and total pixel allocation before decoding.
3. Validate finite opacity and timing values.
4. Decode only PNG `data:` URLs; reject unsupported or malformed payloads.
5. Preserve the original source file unchanged.
6. Build the migrated project in isolation and publish it only after every required structural and raster validation succeeds.
7. Report any fallback, omitted unknown metadata, or lossy conversion explicitly.

## 9. Autosave distinction

IndexedDB autosave v3 is a separate browser-internal payload using JavaScript `Blob` values. Its project fields resemble archive v4, including `canvasShape`, `background`, `holds`, and frame-local layers, but it is not itself a portable `.inkframe` file. Archive import and browser-recovery extraction are separate migration tasks.
