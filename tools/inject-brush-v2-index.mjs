#!/usr/bin/env node
// Generate the Android-only A/B index from the checked-in original engine.
// The source web/index.html stays byte-for-byte unchanged; APK staging writes the
// instrumented copy into build/generated/webAssets/index.html.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const input = resolve(process.argv[2] || 'web/index.html');
const output = resolve(process.argv[3] || 'build/generated/webAssets/index.html');
let html = readFileSync(input, 'utf8');

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Brush V2 injection marker missing: ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`Brush V2 injection marker is not unique: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const scriptsNeedle = '<script src="brush-math.js"></script>\n<script src="flood-fill.js"></script>';
const scripts = `<script src="brush-math.js"></script>
<!-- INKFRAME_BRUSH_V2_AB: generated into APK assets only -->
<script src="brush-engine-v2/sample.js"></script>
<script src="brush-engine-v2/validator.js"></script>
<script src="brush-engine-v2/filters.js"></script>
<script src="brush-engine-v2/path.js"></script>
<script src="brush-engine-v2/arc-sampler.js"></script>
<script src="brush-engine-v2/radius.js"></script>
<script src="brush-engine-v2/rasterizer.js"></script>
<script src="brush-engine-v2/trace.js"></script>
<script src="brush-engine-v2/engine.js"></script>
<script src="brush-engine-v2/tuning.js"></script>
<script src="brush-engine-v2/adapter.js"></script>
<script src="brush-engine-v2/coverage-ui.js"></script>
<script src="flood-fill.js"></script>`;
html = replaceOnce(html, scriptsNeedle, scripts, 'sibling script list');

const helperNeedle = '  // Pressure + position stabilization: the drawn point trails the raw stylus on a short';
const helper = `  // Android test-build bridge for Brush Engine V2. This is injected into the
  // staged APK index only; the checked-in browser source remains the v0.1.1 engine.
  function makeBrushV2Env(){
    return {
      canvas,
      layerCtx:fctx,
      mainCtx:ctx,
      width:W,
      height:H,
      brushId:brush.id,
      color,
      profile:{
        size,
        minSize:_bpMin,
        opacity,
        spacing:_bpS,
        hardness:_bpH,
        response:_bpR,
      },
      toSample(ev){
        const c=toC(ev);
        return {
          x:c.x, y:c.y, pressure:c.p,
          tiltX:ev.tiltX||0, tiltY:ev.tiltY||0,
          twist:ev.twist||0,
          altitudeAngle:Number.isFinite(ev.altitudeAngle)?ev.altitudeAngle:Math.PI/2,
          azimuthAngle:Number.isFinite(ev.azimuthAngle)?ev.azimuthAngle:(Number.isFinite(c.az)?c.az:0),
          width:ev.width||0, height:ev.height||0,
          timeStamp:Number.isFinite(ev.timeStamp)?ev.timeStamp:performance.now(),
          pointerId:ev.pointerId, pointerType:ev.pointerType||'pen'
        };
      },
      snapshot:()=>snap(),
      renderLive:()=>{ bumpFrame(frames[cur]); render(); },
      finishUi:()=>{ hideLens(); clearPredicted(); clearTimeout(qsTimer); },
      commit(s){
        bumpFrame(frames[cur]);
        if(typeof refreshCurrentThumb==='function') refreshCurrentThumb();
        if(s) pushU(s);
        render();
      },
      abort(s){
        if(s) restoreSnap(s);
        render();
      }
    };
  }
  window.InkFrameBrushV2Environment=()=>makeBrushV2Env();

${helperNeedle}`;
html = replaceOnce(html, helperNeedle, helper, 'V2 environment bridge');

const downNeedle = '    e.preventDefault();drawing=true;drawPid=e.pointerId;drawPidType=e.pointerType;pend=snap();';
const downHook = `    if(window.InkFrameBrushV2Adapter && window.InkFrameBrushV2Adapter.shouldHandle(brush.id,e)){
      if(window.InkFrameBrushV2Adapter.begin(e,makeBrushV2Env())) return;
    }
${downNeedle}`;
html = replaceOnce(html, downNeedle, downHook, 'pointerdown handoff');

const moveNeedle = '    if(!drawing||e.pointerId!==drawPid)return;    // only the owning pointer extends the stroke';
const moveHook = `    if(window.InkFrameBrushV2Adapter && window.InkFrameBrushV2Adapter.move(e)){
      updateLens(e);
      return;
    }
${moveNeedle}`;
html = replaceOnce(html, moveNeedle, moveHook, 'pointermove handoff');

const upNeedle = '  const up=e=>{\n    // Compare-drag release: just clear the drag lock so future taps work.';
const upHook = `  const up=e=>{
    if(window.InkFrameBrushV2Adapter && window.InkFrameBrushV2Adapter.end(e)){
      endBarrelEraser();
      return;
    }
    // Compare-drag release: just clear the drag lock so future taps work.`;
html = replaceOnce(html, upNeedle, upHook, 'pointerup handoff');

for (const marker of [
  'INKFRAME_BRUSH_V2_AB',
  'makeBrushV2Env()',
  'InkFrameBrushV2Environment',
  'InkFrameBrushV2Adapter.begin',
  'InkFrameBrushV2Adapter.move',
  'InkFrameBrushV2Adapter.end',
  'brush-engine-v2/radius.js',
  'brush-engine-v2/coverage-ui.js',
]) {
  if (!html.includes(marker)) throw new Error(`Generated index failed verification: ${marker}`);
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, html, 'utf8');
console.log(`Generated Brush V2 A/B index: ${output}`);
