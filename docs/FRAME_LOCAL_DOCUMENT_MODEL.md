# Canonical Frame-Local Kotlin Document Model

Status: proposed architecture for issue #132  
Parent migration: #129  
Compatibility work: #131

## Decision

InkFrame's canonical Kotlin document must preserve the original artist-facing topology:

```text
Project
  ├─ Canvas specification and paper
  ├─ One project-wide editable static background
  └─ Scene
       ├─ Playback range and loop policy
       └─ Ordered Frames
            ├─ Hold duration
            ├─ Active layer identity
            └─ Ordered frame-local Layers
                 └─ Optional persistent raster asset reference
```

The current prototype topology—persistent layers containing sparse frame-to-cel maps—is transitional and must not become the final archive model. It cannot represent arbitrary historical projects without merging unrelated layers or inventing artwork exposure.

## Why frame-local layers are required

The original InkFrame studio permits every frame to have a different:

- layer count;
- layer order;
- active layer;
- layer name;
- visibility;
- opacity;
- blend mode;
- raster payload.

These properties are serialized independently for each frame in web archive v4. A persistent timeline layer assumes identity and compositor state across frames that may not exist in the source document.

## Proposed pure Kotlin types

The names below specify semantics; implementation names may change during review.

```kotlin
data class Project(
    val id: ProjectId,
    val name: String,
    val canvas: CanvasSpec,
    val background: StaticBackground,
    val scenes: List<Scene>,
    val activeSceneId: SceneId?,
    val palette: List<RgbaColor>,
    val createdAtEpochMs: Long,
    val modifiedAtEpochMs: Long,
)

data class StaticBackground(
    val visible: Boolean = true,
    val opacity: Float = 1f,
    val blendMode: BlendMode = BlendMode.NORMAL,
    val rasterId: RasterAssetId? = null,
)

data class Scene(
    val id: SceneId,
    val name: String,
    val frames: List<AnimationFrame>,
    val activeFrameIndex: Int = 0,
    val playbackRange: IntRange,
    val loop: Boolean = true,
)

data class AnimationFrame(
    val id: FrameId,
    val hold: Int = 1,
    val layers: List<FrameLayer>,
    val activeLayerId: LayerId,
)

data class FrameLayer(
    val id: LayerId,
    val name: String,
    val visible: Boolean = true,
    val locked: Boolean = false,
    val opacity: Float = 1f,
    val blendMode: BlendMode = BlendMode.NORMAL,
    val rasterId: RasterAssetId? = null,
)
```

### Required invariants

- Every project contains at least one scene.
- Every scene contains at least one frame.
- Every frame contains at least one layer.
- `activeFrameIndex` is valid for the scene.
- `playbackRange` is ordered and lies inside the frame list.
- `activeLayerId` identifies exactly one layer in its frame.
- Frame holds are integers in `1..8`.
- Opacity is finite and lies in `0..1`.
- Dimensions and FPS remain within bounded native limits.
- IDs are non-empty and unique within their domain.
- A null `rasterId` means a transparent, lazily unallocated layer—not a held raster from another frame.

## Raster identity is not a GPU handle

A persistent project file must not serialize OpenGL texture names or process-local engine handles.

Use a stable `RasterAssetId` in the document and a runtime registry:

```text
RasterAssetId (persistent UUID/string)
        ↓
SurfaceRegistry (runtime ownership and reference counts)
        ↓
PaintEngine surface handle (process-local Long)
```

Native packages store encoded pixels under stable paths such as:

```text
rasters/<rasterAssetId>.png
```

The registry owns GPU upload, eviction, readback, and handle regeneration after context loss. Document equality and migration do not depend on a particular GL process lifetime.

## Copy-on-write raster sharing

Frame duplication and migration may initially reference the same immutable raster asset from multiple layers. Editing must never mutate every reference accidentally.

Before the first pixel mutation:

1. Query the registry reference count for the target `RasterAssetId`.
2. If it has one owner, edit in place.
3. If it has multiple owners, clone the raster to a new asset ID.
4. Replace only the active layer's reference.
5. Commit the stroke to the unique runtime surface.

This provides efficient duplication while preserving independent frame editing.

## Static background semantics

The project-wide background is not a normal frame layer.

Compositing order:

```text
paper colour
→ static background, if visible
→ current frame layers from bottom to top
→ transient onion/selection/preview overlays
```

For circular canvases, paper, static background, frame layers, thumbnails, playback, and exports use the same inscribed-circle clip. Rectangular raster pixels remain intact so switching back to Square restores the full image.

## Frame and layer operation semantics

### Insert frame

- Insert one blank frame at the selected index.
- Create one blank, unlocked, visible Normal layer.
- Hold defaults to `1`.
- Shift playback and active-frame indices deterministically.

### Duplicate frame

- Copy frame-local layer structure and compositor properties.
- Assign new frame and layer IDs.
- Initially share raster assets through copy-on-write references.
- Preserve the source hold unless the command explicitly requests `1`.

### Remove frame

- Remove exactly one frame and its layer topology.
- Never reduce a scene below one frame.
- Clamp active frame and playback range.
- Release unreferenced raster assets after the document transaction commits.

### Add, delete, reorder, rename, or modify a layer

- Affect only the active frame unless an explicit multi-frame command is invoked.
- Keep at least one layer in the frame.
- Re-select a deterministic neighboring layer after deletion.
- Never infer persistent layer identity from list position.

### Paste or move pixels

- Operate on the active frame's selected layer.
- Allocate or detach its raster through copy-on-write before mutation.
- Structural undo and raster undo commit as one transaction boundary.

## Onion-skin semantics

The planner must support both historical modes:

1. **Composite onion:** flatten the neighboring frame's complete visible stack.
2. **Layer-only onion:** use a documented frame-local selection rule.

For legacy parity, layer-only lookup should use the neighboring frame's layer at the current active-layer index when present; otherwise it contributes no ghost. Future explicit cross-frame layer linking may be added, but must not be inferred during import.

## Export and playback timing

- Each frame contributes `hold / fps` seconds.
- Export planning accumulates fractional milliseconds to avoid long-run drift.
- Frame-step export aggregates the held duration of every skipped source frame into the emitted sample.
- Live preview uses monotonic deadlines; it must not permanently accumulate scheduler delay by repeatedly sleeping a rounded interval from the prior wake-up.

## Persistence format direction

The canonical package remains a ZIP-like container, but its structural schema must move beyond transitional native format v2.

Proposed layout:

```text
document.json
rasters/<stable-raster-id>.png
previews/project.webp          optional and disposable
```

`document.json` references stable raster asset IDs. Runtime texture handles are never serialized.

## Migration paths

### Web archive v3/v4

1. Parse into the bounded frame-local DTO in `LegacyWebArchiveParser`.
2. Allocate stable IDs for project, scene, frames, layers, background, and raster assets.
3. Preserve frame-local order and active-layer indices exactly.
4. Map known Canvas 2D blend modes explicitly.
5. Decode PNGs in isolation under byte and pixel limits.
6. Publish the project only after all required structures and rasters validate.
7. Keep the source archive unchanged.

### Transitional native v1/v2

The sparse cel model may share one exposed cel across multiple timeline positions. Migration should preserve appearance through shared copy-on-write raster references, then detach only when a frame is edited. Any semantic ambiguity must be surfaced as a migration warning and covered by fixtures.

## Transaction boundary

A document mutation that changes both structure and pixels must commit atomically from the user's perspective:

```text
input command
→ validate target context
→ prepare raster clone/readback if required
→ produce immutable document revision
→ publish engine mutation and document revision
→ append one undo transaction
→ schedule coalesced atomic autosave
```

A failed raster operation must not publish the structural revision.

## Rejected alternatives

### Persistent layers with index-based web import

Rejected because list position does not prove layer identity across frames and changes rendered/editable meaning.

### Flatten every imported frame

Rejected as the default because it destroys editable layers. It may exist only as a separately named, explicitly lossy import mode with artist confirmation.

### Persist GL `Long` surface handles

Rejected because handles are runtime resources, can be regenerated after context loss, and are not durable document identity.

### Duplicate every raster immediately

Rejected as the only strategy because it multiplies storage and import cost. Stable asset references plus copy-on-write preserve independence without mandatory duplication.

## Implementation sequence

1. Add typed IDs, frame-local types, invariants, and pure operations behind JVM tests.
2. Add stable raster registry and copy-on-write contract.
3. Add native package schema v3 and v1/v2 migration.
4. Convert compositor, onion planner, export planner, and `StudioState` to frames.
5. Convert project save/open and autosave.
6. Implement web archive v3/v4 conversion from the validated DTO.
7. Replace the current timeline/layer UI adapters.
8. Run rendered golden fixtures and physical Galaxy Tab acceptance.

No production importer or release may bypass this sequence by flattening or index-merging artist data.
