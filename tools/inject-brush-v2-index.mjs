#!/usr/bin/env node
// Generate an Android-only Brush Engine V2 index from the checked-in browser
// fallback. Debug and release variants receive explicit, verifiable policies.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
const scripts = `<script src="brush-math.js"></script>
<script src="canvas-shape.js"></script>
<!-- INKFRAME_BRUSH_V2_RUNTIME: generated into APK assets only -->
<script>window.InkFrameBuild=Object.freeze(${JSON.stringify(buildConfig)});</script>
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
<script src="brush-engine-v2/input.js"></script>
<script src="brush-engine-v2/coverage-ui.js"></script>
<script src="brush-engine-v2/stabilizer-ui.js"></script>
<script src="brush-engine-v2/ghost-ui.js"></script>
<script src="brush-engine-v2/lab-ui.js"></script>
<script src="brush-engine-v2/preset-ui.js"></script>
<script src="brush-engine-v2/preview-compare.js"></script>
<script src="brush-engine-v2/preview-pad.js"></script>
<script src="flood-fill.js"></script>`;
html = replaceOnce(html, scriptsNeedle, scripts, 'sibling script list');

html = replaceOnce(html,
  '  function frameComposite(fr, w, h){',
  '  function frameComposite(fr, w, h, canvasShape){',
  'frame composite shape argument');
html = replaceOnce(html,
  "    g.restore(); g.globalAlpha=1; g.globalCompositeOperation='source-over';\n    fr._compV=fr._v;",
  "    g.restore(); g.globalAlpha=1; g.globalCompositeOperation='source-over';\n    if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.maskComposite(fr._comp,w,h,canvasShape||activeCanvasShape());\n    fr._compV=fr._v;",
  'frame composite circular mask');

html = replaceOnce(html,
`  function newProject(w,h){ w=w||W0; h=h||H0; return {
    frames:[newFrame(w,h)], holds:[1], cur:0, undo:[], redo:[], w, h, fps:12,
    name:'Canvas', paper:DEFAULT_PAPER }; }`,
`  function newProject(w,h){ w=w||W0; h=h||H0; return {
    frames:[newFrame(w,h)], holds:[1], cur:0, undo:[], redo:[], w, h, fps:12,
    name:'Canvas', paper:DEFAULT_PAPER, canvasShape:'square' }; }`,
  'new project canvas shape');
html = replaceOnce(html,
`    return { frames, holds:frames.map(()=>1), cur:0, undo:[], redo:[], w, h,
      fps:t.fps||12, name:t.name||'Canvas', paper:t.paper||DEFAULT_PAPER };`,
`    return { frames, holds:frames.map(()=>1), cur:0, undo:[], redo:[], w, h,
      fps:t.fps||12, name:t.name||'Canvas', paper:t.paper||DEFAULT_PAPER, canvasShape:'square' };`,
  'template project canvas shape');
html = replaceOnce(html,
`    return { frames:framesCopy, holds:holdsCopy,
      cur:Math.min(Math.max(0,P.cur|0),framesCopy.length-1), undo:[], redo:[], w, h,
      fps:P.fps||12, name:name || ((P.name||'Canvas')+' copy'), paper:P.paper||DEFAULT_PAPER };`,
`    return { frames:framesCopy, holds:holdsCopy,
      cur:Math.min(Math.max(0,P.cur|0),framesCopy.length-1), undo:[], redo:[], w, h,
      fps:P.fps||12, name:name || ((P.name||'Canvas')+' copy'), paper:P.paper||DEFAULT_PAPER,
      canvasShape:P.canvasShape==='circle'?'circle':'square' };`,
  'cloned project canvas shape');
html = replaceOnce(html,
  '    if(!P.paper) P.paper = DEFAULT_PAPER;    // back-compat for pre-paper projects',
  "    if(!P.paper) P.paper = DEFAULT_PAPER;    // back-compat for pre-paper projects\n    if(P.canvasShape!=='circle') P.canvasShape='square';",
  'project switch shape default');

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
        const mapped=window.InkFrameCanvasShape
          ? window.InkFrameCanvasShape.mapEventPoint(ev,canvas,W,H,activeCanvasShape())
          : c;
        return {
          x:mapped.x,
          y:mapped.y,
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

${helperNeedle}`;
html = replaceOnce(html, helperNeedle, helper, 'V2 environment bridge');

html = replaceOnce(html,
`    return {x:(e.clientX-r.left)*(W/r.width), y:(e.clientY-r.top)*(H/r.height),
            p:e.pressure&&e.pressure>0?e.pressure:0.5, az, flat, type:e.pointerType};};`,
`    const raw={x:(e.clientX-r.left)*(W/r.width), y:(e.clientY-r.top)*(H/r.height)};
    const mapped=window.InkFrameCanvasShape
      ? window.InkFrameCanvasShape.mapEventPoint(e,canvas,W,H,activeCanvasShape())
      : raw;
    return {x:mapped.x, y:mapped.y,
            p:e.pressure&&e.pressure>0?e.pressure:0.5, az, flat, type:e.pointerType};};`,
  'canvas coordinate shape clamp');

html = replaceOnce(html,
`  canvas.addEventListener('pointerdown',e=>{
    updateStylusDiag(e);`,
`  canvas.addEventListener('pointerdown',e=>{
    updateStylusDiag(e);
    if(window.InkFrameCanvasShape && !window.InkFrameCanvasShape.acceptsPointerDown(e,canvas,W,H,activeCanvasShape())){
      e.preventDefault(); return;
    }`,
  'circle pointerdown rejection');

html = replaceOnce(html,
`  canvas.addEventListener('pointermove',e=>{
    updateStylusDiag(e);
    if(e.pointerType==='pen') penSeen=performance.now();`,
`  canvas.addEventListener('pointermove',e=>{
    updateStylusDiag(e);
    if(e.pointerType==='pen') penSeen=performance.now();
    if(window.InkFrameCanvasShape && circleBoundaryPointer!==e.pointerId){
      const bridge=window.InkFrameBrushV2InputBridge;
      const stats=bridge&&bridge.stats?bridge.stats():null;
      const ownsV2=!!(stats&&stats.active&&stats.pointerId===e.pointerId);
      const ownsOriginal=!!(drawing&&e.pointerId===drawPid);
      if(ownsV2||ownsOriginal){
        const boundary=window.InkFrameCanvasShape.boundaryEvent(e,canvas,W,H,activeCanvasShape());
        if(boundary){
          circleBoundaryPointer=e.pointerId;
          setTimeout(()=>{
            try{
              const latest=bridge&&bridge.stats?bridge.stats():null;
              if(latest&&latest.active&&latest.pointerId===boundary.pointerId) bridge.end(boundary);
              else if(drawing&&drawPid===boundary.pointerId) up(boundary);
            }finally{circleBoundaryPointer=null;}
          },0);
        }
      }
    }`,
  'circle boundary stroke finish');

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

html = replaceOnce(html,
`  function applyCanvas(){
    canvas.style.width=Math.round(W*cScale)+'px'; canvas.style.height=Math.round(H*cScale)+'px';
    if(timelineReady && typeof buildFrameBoard==='function') requestAnimationFrame(buildFrameBoard);
  }
  cScale=fitScale(); applyCanvas();`,
`  function applyCanvas(){
    canvas.style.width=Math.round(W*cScale)+'px'; canvas.style.height=Math.round(H*cScale)+'px';
    if(timelineReady && typeof buildFrameBoard==='function') requestAnimationFrame(buildFrameBoard);
    if(window.InkFrameCanvasShape) requestAnimationFrame(()=>window.InkFrameCanvasShape.sync());
  }
  function activeCanvasShape(){
    const P=projects&&projects[pi]; return P&&P.canvasShape==='circle'?'circle':'square';
  }
  function invalidateCanvasShape(P){
    if(!P)return;
    for(const fr of P.frames||[]){fr._comp=null;fr._compV=-1;fr._thumb=null;fr._thumbSig='';}
    P._thumb=null;P._thumbSig='';
  }
  let circleBoundaryPointer=null;
  window.InkFrameCanvasShapeEnvironment=()=>({
    canvas,frameGlass,
    getProject:()=>projects[pi],
    getShape:()=>activeCanvasShape(),
    getSize:()=>({width:W,height:H}),
    setShape(next){
      const adapter=window.InkFrameBrushV2Adapter;
      if(drawing||(adapter&&adapter.isActive&&adapter.isActive()))return false;
      const P=projects[pi];if(!P)return false;
      P.canvasShape=next==='circle'?'circle':'square';
      invalidateCanvasShape(P);
      render();refreshFrames();refreshLayers();refreshActions();rebuildGallery();
      AUTOSAVE.schedule();
      return true;
    }
  });
  cScale=fitScale(); applyCanvas();`,
  'canvas shape project bridge');

html = replaceOnce(html,
`  function frameThumbData(fr){
    const sig=(fr._v||0)+':'+paper()+':'+(fr.layers||[]).map(L=>\`${L.id}:${L.visible!==false}:${L.opacity}:${L.blend}\`).join('|');`,
`  function frameThumbData(fr){
    const sig=(fr._v||0)+':'+paper()+':'+activeCanvasShape()+':'+(fr.layers||[]).map(L=>\`${L.id}:${L.visible!==false}:${L.opacity}:${L.blend}\`).join('|');`,
  'frame thumbnail shape signature');
html = replaceOnce(html,
`    const t=mkAt(56,42), g=t.getContext('2d');
    g.fillStyle=paper(); g.fillRect(0,0,t.width,t.height);
    try{ g.drawImage(frameComposite(fr),0,0,t.width,t.height); }catch(_){ }`,
`    const t=mkAt(56,42), g=t.getContext('2d');
    if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.paintExportPaper(g,t.width,t.height,activeCanvasShape(),paper());
    else { g.fillStyle=paper(); g.fillRect(0,0,t.width,t.height); }
    try{ g.drawImage(frameComposite(fr),0,0,t.width,t.height); }catch(_){ }`,
  'frame thumbnail circular paper');

html = replaceOnce(html,
`  function thumbSig(P){
    const fr=upgradeFrame(P.frames[P.cur||0], P.w, P.h);
    const layerSig=fr.layers.map(L=>\`${L.id}:${L.visible!==false?1:0}:${L.opacity}:${L.blend}\`).join('|');
    return \`${P.w}x${P.h}:${P.paper}:${P.cur||0}:${fr._v||0}:${layerSig}\`;
  }`,
`  function thumbSig(P){
    const fr=upgradeFrame(P.frames[P.cur||0], P.w, P.h);
    const layerSig=fr.layers.map(L=>\`${L.id}:${L.visible!==false?1:0}:${L.opacity}:${L.blend}\`).join('|');
    return \`${P.w}x${P.h}:${P.paper}:${P.canvasShape||'square'}:${P.cur||0}:${fr._v||0}:${layerSig}\`;
  }`,
  'project thumbnail shape signature');
html = replaceOnce(html,
`    const t=mkAt(64,Math.round(64*P.h/P.w)); const tc=t.getContext('2d');
    tc.fillStyle=(P.paper||'#fff0f3'); tc.fillRect(0,0,t.width,t.height);
    const fr=upgradeFrame(P.frames[P.cur||0], P.w, P.h);
    tc.drawImage(frameComposite(fr), 0,0, t.width, t.height);`,
`    const t=mkAt(64,Math.round(64*P.h/P.w)); const tc=t.getContext('2d');
    if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.paintExportPaper(tc,t.width,t.height,P.canvasShape,P.paper||'#fff0f3');
    else { tc.fillStyle=(P.paper||'#fff0f3'); tc.fillRect(0,0,t.width,t.height); }
    const fr=upgradeFrame(P.frames[P.cur||0], P.w, P.h);
    tc.drawImage(frameComposite(fr,undefined,undefined,P.canvasShape), 0,0, t.width, t.height);`,
  'project thumbnail circular rendering');
html = replaceOnce(html,
  '    if(!P.paper) P.paper=DEFAULT_PAPER;\n    refreshFctx(); applyPaperBg();',
  "    if(!P.paper) P.paper=DEFAULT_PAPER;\n    if(P.canvasShape!=='circle') P.canvasShape='square';\n    refreshFctx(); applyPaperBg();",
  'direct project bind shape default');
html = replaceOnce(html,
`  function repaintProjectShell(){
    canvas.width=W; canvas.height=H; syncPredictedSize(); clampCanvas(); applyCanvas();
    render(); refreshFrames(); refreshLayers(); refreshActions(); rebuildGallery();
  }`,
`  function repaintProjectShell(){
    canvas.width=W; canvas.height=H; syncPredictedSize(); clampCanvas(); applyCanvas();
    render(); refreshFrames(); refreshLayers(); refreshActions(); rebuildGallery();
    if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.sync();
  }`,
  'project shell shape sync');
html = replaceOnce(html,
`    return { name:P.name||'Canvas', w, h, cur:Math.min(Math.max(0,P.cur|0),framesSrc.length-1),
      fps:P.fps||12, paper:P.paper||DEFAULT_PAPER,
      holds:framesSrc.map((_,i)=>Math.max(1,Math.round((P.holds&&P.holds[i])||1))),
      frames:framesOut };`,
`    return { name:P.name||'Canvas', w, h, cur:Math.min(Math.max(0,P.cur|0),framesSrc.length-1),
      fps:P.fps||12, paper:P.paper||DEFAULT_PAPER, canvasShape:P.canvasShape==='circle'?'circle':'square',
      holds:framesSrc.map((_,i)=>Math.max(1,Math.round((P.holds&&P.holds[i])||1))),
      frames:framesOut };`,
  'archive canvas shape export');
html = replaceOnce(html,
`      restored.push({ frames:framesOut, holds, cur:Math.min(Math.max(0,P.cur|0),framesOut.length-1),
        undo:[], redo:[], w, h, fps:P.fps||12, name:P.name||'Canvas', paper:P.paper||DEFAULT_PAPER });`,
`      restored.push({ frames:framesOut, holds, cur:Math.min(Math.max(0,P.cur|0),framesOut.length-1),
        undo:[], redo:[], w, h, fps:P.fps||12, name:P.name||'Canvas', paper:P.paper||DEFAULT_PAPER,
        canvasShape:P.canvasShape==='circle'?'circle':'square' });`,
  'archive canvas shape restore');

html = replaceOnce(html,
`  actKid('@export','PNG',()=>{const o=mk(),oc=o.getContext('2d');oc.fillStyle=paper();oc.fillRect(0,0,W,H);oc.drawImage(frameComposite(frames[cur]),0,0);
    const a=document.createElement('a');a.download='inkframe-'+(cur+1)+'.png';a.href=o.toDataURL('image/png');a.click();flash('Exported PNG');});`,
`  actKid('@export','PNG',()=>{const o=mk(),oc=o.getContext('2d');
    if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.paintExportPaper(oc,W,H,activeCanvasShape(),paper());
    else {oc.fillStyle=paper();oc.fillRect(0,0,W,H);}
    oc.drawImage(frameComposite(frames[cur]),0,0);
    const a=document.createElement('a');a.download='inkframe-'+(cur+1)+'.png';a.href=o.toDataURL('image/png');a.click();flash('Exported PNG');});`,
  'PNG circular export');
html = replaceOnce(html,
`      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = paper();             // paper -- matches render() clearRect fill
      g.fillRect(0, 0, width, height);`,
`      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.paintExportPaper(g,width,height,activeCanvasShape(),paper());
      else { g.fillStyle = paper(); g.fillRect(0, 0, width, height); }`,
  'GIF circular export paper');
html = replaceOnce(html,
`        // Composite onto the offscreen: paper background then frame layers.
        g.fillStyle = paper(); g.fillRect(0,0,width,height);
        const fr = upgradeFrame(P.frames[frameIndex], width, height);`,
`        // Composite onto the offscreen: shape-aware paper background then frame layers.
        if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.paintExportPaper(g,width,height,activeCanvasShape(),paper());
        else { g.fillStyle = paper(); g.fillRect(0,0,width,height); }
        const fr = upgradeFrame(P.frames[frameIndex], width, height);`,
  'video circular export paper');

const requiredMarkers = [
  'INKFRAME_BRUSH_V2_RUNTIME',
  'window.InkFrameBuild=Object.freeze',
  `"variant":"${variant}"`,
  `"diagnostics":${diagnostics}`,
  `"defaultBrushEngine":"${defaultBrushEngine}"`,
  'makeBrushV2Env()',
  'coordinateTransform:inputTransform',
  'InkFrameBrushV2Environment',
  'InkFrameCanvasShapeEnvironment',
  'InkFrameCanvasShape.acceptsPointerDown',
  'InkFrameCanvasShape.boundaryEvent',
  'InkFrameCanvasShape.maskComposite',
  'InkFrameBrushV2Adapter.begin',
  'InkFrameBrushV2Adapter.move',
  'InkFrameBrushV2Adapter.end',
  'InkFrameBrushV2InputBridge.begin',
  'InkFrameBrushV2InputBridge.move',
  'InkFrameBrushV2InputBridge.end',
  'canvas-shape.js',
  'brush-engine-v2/batch.js',
  'brush-engine-v2/contact.js',
  'brush-engine-v2/stabilizer.js',
  'brush-engine-v2/radius.js',
  'brush-engine-v2/ghost-trail.js',
  'brush-engine-v2/ghost-runtime.js',
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
if (diagnostics) requiredMarkers.push('brush-engine-v2/native.js');
for (const marker of requiredMarkers) {
  if (!html.includes(marker)) throw new Error(`Generated index failed verification: ${marker}`);
}
if (!diagnostics && html.includes('<script src="brush-engine-v2/native.js"></script>')) {
  throw new Error('Release index must not load native diagnostics');
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, html, 'utf8');
console.log(`Generated Brush V2 ${variant} index: ${output}`);
