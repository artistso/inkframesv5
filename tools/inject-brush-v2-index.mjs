#!/usr/bin/env node
// Generate an Android-only Brush Engine V2 index from the checked-in browser
// fallback. Debug and release variants receive explicit, verifiable policies.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { injectCanvasShape } from './inject-canvas-shape.mjs';
import { injectViewportGestures } from './inject-viewport-gestures.mjs';
import { injectOnionSkinStudio } from './inject-onion-skin-studio.mjs';
import { injectFeedbackReport } from './inject-feedback-report.mjs';
import { injectStaticBackground } from './inject-static-background.mjs';

const input = resolve(process.argv[2] || 'web/index.html');
const output = resolve(process.argv[3] || 'build/generated/webAssets/debug/index.html');
const rawOptions = process.argv.slice(4);

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = rawOptions.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const variant = option('variant', 'debug') === 'release' ? 'release' : 'debug';
const diagnostics = option('diagnostics', variant === 'debug' ? 'true' : 'false') === 'true';
const defaultBrushEngine = option('default-engine', 'v2') === 'original' ? 'original' : 'v2';
const traceTools = diagnostics;
const buildConfig = Object.freeze({ variant, diagnostics, traceTools, defaultBrushEngine });

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
const nativeScript = diagnostics ? '<script src="brush-engine-v2/native.js"></script>\n' : '';
const performanceUiScript = diagnostics ? '<script src="brush-engine-v2/performance-ui.js"></script>\n' : '';
const scripts = `<script src="brush-math.js"></script>
<!-- INKFRAME_BRUSH_V2_RUNTIME: generated into APK assets only -->
<script>window.InkFrameBuild=Object.freeze(${JSON.stringify(buildConfig)});</script>
<script src="creator-statement.js"></script>
<script src="brush-engine-v2/sample.js"></script>
<script src="brush-engine-v2/batch.js"></script>
<script src="brush-engine-v2/validator.js"></script>
<script src="brush-engine-v2/contact.js"></script>
<script src="brush-engine-v2/stabilizer.js"></script>
<script src="brush-engine-v2/filters.js"></script>
<script src="brush-engine-v2/path.js"></script>
<script src="brush-engine-v2/arc-sampler.js"></script>
<script src="brush-engine-v2/radius.js"></script>
<script src="brush-engine-v2/rasterizer.js"></script>
<script src="brush-engine-v2/ghost-trail.js"></script>
<script src="brush-engine-v2/trace.js"></script>
<script src="brush-engine-v2/runtime.js"></script>
${nativeScript}<script src="brush-engine-v2/engine.js"></script>
<script src="brush-engine-v2/tuning.js"></script>
<script src="brush-engine-v2/user-presets.js"></script>
<script src="brush-engine-v2/adapter.js"></script>
<script src="brush-engine-v2/session.js"></script>
<script src="brush-engine-v2/ghost-runtime.js"></script>
<script src="brush-engine-v2/performance.js"></script>
<script src="brush-engine-v2/input.js"></script>
<script src="native-studio-bridge.js"></script>
<script src="artist-canvas-ui.js"></script>
<script src="brush-engine-v2/coverage-ui.js"></script>
<script src="brush-engine-v2/stabilizer-ui.js"></script>
<script src="brush-engine-v2/ghost-ui.js"></script>
<script src="brush-engine-v2/lab-ui.js"></script>
${performanceUiScript}<script src="brush-engine-v2/preset-ui.js"></script>
<script src="brush-engine-v2/preview-compare.js"></script>
<script src="brush-engine-v2/preview-pad.js"></script>
<script src="flood-fill.js"></script>`;
html = replaceOnce(html, scriptsNeedle, scripts, 'sibling script list');

const helperNeedle = '  // Pressure + position stabilization: the drawn point trails the raw stylus on a short';
const helper = `  // Android runtime bridge for Brush Engine V2. This is injected into staged
  // APK assets only; the checked-in browser source remains the fallback engine.
  function makeBrushV2Env(){
    const inputRect=canvas.getBoundingClientRect();
    const inputTransform=Object.freeze({
      left:Number(inputRect.left)||0,
      top:Number(inputRect.top)||0,
      scaleX:W/(Number(inputRect.width)||1),
      scaleY:H/(Number(inputRect.height)||1),
      width:W,
      height:H
    });
    return {
      canvas,
      layerCtx:fctx,
      mainCtx:ctx,
      width:W,
      height:H,
      brushId:brush.id,
      color,
      coordinateTransform:inputTransform,
      profile:{ size, minSize:_bpMin, opacity, spacing:_bpS, hardness:_bpH, response:_bpR },
      toSample(ev){
        const c=toC(ev);
        const clientX=Number(ev.clientX), clientY=Number(ev.clientY);
        return {
          x:Number.isFinite(clientX)?(clientX-inputTransform.left)*inputTransform.scaleX:c.x,
          y:Number.isFinite(clientY)?(clientY-inputTransform.top)*inputTransform.scaleY:c.y,
          pressure:c.p,
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
      abort(s){ if(s) restoreSnap(s); render(); }
    };
  }
  window.InkFrameBrushV2Environment=()=>makeBrushV2Env();
  window.InkFrameNativeStudioEnvironment=()=>{
    const project=projects[pi]||{};
    const syntheticPen={
      pointerId:1,pointerType:'pen',pressure:.5,buttons:1,button:0,
      clientX:0,clientY:0,timeStamp:performance.now(),preventDefault(){}
    };
    const supported=!!(window.InkFrameBrushV2Adapter &&
      window.InkFrameBrushV2Adapter.shouldHandle(brush.id,syntheticPen));
    const canvasShape=project.canvasShape==='circle'?'circle':'square';
    const contextToken=[pi,cur,W,H,brush.id,color,size,opacity,canvasShape].join('|');
    return {
      canvas,
      brushEnvironment:makeBrushV2Env(),
      width:W,
      height:H,
      brushId:brush.id,
      color,
      size,
      opacity,
      canvasShape,
      projectIndex:pi,
      frameIndex:cur,
      contextToken,
      supported
    };
  };

${helperNeedle}`;
html = replaceOnce(html, helperNeedle, helper, 'V2 environment bridge');

const downNeedle = '    e.preventDefault();drawing=true;drawPid=e.pointerId;drawPidType=e.pointerType;pend=snap();';
const downHook = `    if(window.InkFrameBrushV2Adapter && window.InkFrameBrushV2Adapter.shouldHandle(brush.id,e)){
      const v2env=makeBrushV2Env();
      const handled=window.InkFrameBrushV2InputBridge
        ? window.InkFrameBrushV2InputBridge.begin(e,v2env)
        : window.InkFrameBrushV2Adapter.begin(e,v2env);
      if(handled) return;
    }
${downNeedle}`;
html = replaceOnce(html, downNeedle, downHook, 'pointerdown handoff');

const moveNeedle = '    if(!drawing||e.pointerId!==drawPid)return;    // only the owning pointer extends the stroke';
const moveHook = `    if(window.InkFrameBrushV2Adapter){
      const handled=window.InkFrameBrushV2InputBridge
        ? window.InkFrameBrushV2InputBridge.move(e)
        : window.InkFrameBrushV2Adapter.move(e);
      if(handled){ updateLens(e); return; }
    }
${moveNeedle}`;
html = replaceOnce(html, moveNeedle, moveHook, 'pointermove handoff');

const upNeedle = '  const up=e=>{\n    // Compare-drag release: just clear the drag lock so future taps work.';
const upHook = `  const up=e=>{
    if(window.InkFrameBrushV2Adapter){
      const handled=window.InkFrameBrushV2InputBridge
        ? window.InkFrameBrushV2InputBridge.end(e)
        : window.InkFrameBrushV2Adapter.end(e);
      if(handled){ endBarrelEraser(); return; }
    }
    // Compare-drag release: just clear the drag lock so future taps work.`;
html = replaceOnce(html, upNeedle, upHook, 'pointerup handoff');

html = injectCanvasShape(html, replaceOnce);
html = injectViewportGestures(html, replaceOnce);
html = injectOnionSkinStudio(html, replaceOnce);
html = injectFeedbackReport(html, replaceOnce);
html = injectStaticBackground(html, replaceOnce);

const requiredMarkers = [
  'INKFRAME_BRUSH_V2_RUNTIME',
  'window.InkFrameBuild=Object.freeze',
  `"variant":"${variant}"`,
  `"diagnostics":${diagnostics}`,
  `"defaultBrushEngine":"${defaultBrushEngine}"`,
  'creator-statement.js',
  'viewport-gestures.js',
  'InkFrameViewportEnvironment',
  'onion-skin-studio.js',
  'InkFrameOnionStudioEnvironment',
  'feedback-report.js',
  'InkFrameFeedbackEnvironment',
  'newBackground',
  'drawProjectBackground',
  'backgroundPixels',
  'makeBrushV2Env()',
  'coordinateTransform:inputTransform',
  'InkFrameBrushV2Environment',
  'InkFrameNativeStudioEnvironment',
  'InkFrameBrushV2Adapter.begin',
  'InkFrameBrushV2Adapter.move',
  'InkFrameBrushV2Adapter.end',
  'InkFrameBrushV2InputBridge.begin',
  'InkFrameBrushV2InputBridge.move',
  'InkFrameBrushV2InputBridge.end',
  'native-studio-bridge.js',
  'artist-canvas-ui.js',
  'brush-engine-v2/batch.js',
  'brush-engine-v2/contact.js',
  'brush-engine-v2/stabilizer.js',
  'brush-engine-v2/radius.js',
  'brush-engine-v2/ghost-trail.js',
  'brush-engine-v2/ghost-runtime.js',
  'brush-engine-v2/performance.js',
  'brush-engine-v2/runtime.js',
  'brush-engine-v2/session.js',
  'brush-engine-v2/input.js',
  'brush-engine-v2/coverage-ui.js',
  'brush-engine-v2/stabilizer-ui.js',
  'brush-engine-v2/ghost-ui.js',
  'brush-engine-v2/user-presets.js',
  'brush-engine-v2/lab-ui.js',
  'brush-engine-v2/preset-ui.js',
  'brush-engine-v2/preview-compare.js',
  'brush-engine-v2/preview-pad.js',
];
if (diagnostics) requiredMarkers.push('brush-engine-v2/native.js', 'brush-engine-v2/performance-ui.js');
for (const marker of requiredMarkers) {
  if (!html.includes(marker)) throw new Error(`Generated index failed verification: ${marker}`);
}
if (!diagnostics && html.includes('<script src="brush-engine-v2/native.js"></script>')) {
  throw new Error('Release index must not load native diagnostics');
}
if (!diagnostics && html.includes('<script src="brush-engine-v2/performance-ui.js"></script>')) {
  throw new Error('Release index must not load performance diagnostics');
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, html, 'utf8');
console.log(`Generated Brush V2 ${variant} index: ${output}`);
