// Circular Canvas postprocessor for the generated Android studio.
// Kept separate from Brush V2 injection so nested studio template literals are
// emitted verbatim and the base brush generator stays small and reviewable.

const block=(...lines)=>lines.join('\n');

export function injectCanvasShape(html,replaceOnce){
  html=replaceOnce(html,
    block('<script src="brush-math.js"></script>','<!-- INKFRAME_BRUSH_V2_RUNTIME: generated into APK assets only -->'),
    block('<script src="brush-math.js"></script>','<script src="canvas-shape.js"></script>','<!-- INKFRAME_BRUSH_V2_RUNTIME: generated into APK assets only -->'),
    'Circular Canvas runtime script');

  html=replaceOnce(html,'  function frameComposite(fr, w, h){','  function frameComposite(fr, w, h, canvasShape){','frame composite shape argument');
  html=replaceOnce(html,
    block("    g.restore(); g.globalAlpha=1; g.globalCompositeOperation='source-over';",'    fr._compV=fr._v;'),
    block("    g.restore(); g.globalAlpha=1; g.globalCompositeOperation='source-over';",'    if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.maskComposite(fr._comp,w,h,canvasShape||activeCanvasShape());','    fr._compV=fr._v;'),
    'frame composite circular mask');

  html=replaceOnce(html,
    block('  function newProject(w,h){ w=w||W0; h=h||H0; return {','    frames:[newFrame(w,h)], holds:[1], cur:0, undo:[], redo:[], w, h, fps:12,',"    name:'Canvas', paper:DEFAULT_PAPER }; }"),
    block('  function newProject(w,h){ w=w||W0; h=h||H0; return {','    frames:[newFrame(w,h)], holds:[1], cur:0, undo:[], redo:[], w, h, fps:12,',"    name:'Canvas', paper:DEFAULT_PAPER, canvasShape:'square' }; }"),
    'new project canvas shape');
  html=replaceOnce(html,
    block('    return { frames, holds:frames.map(()=>1), cur:0, undo:[], redo:[], w, h,',"      fps:t.fps||12, name:t.name||'Canvas', paper:t.paper||DEFAULT_PAPER };"),
    block('    return { frames, holds:frames.map(()=>1), cur:0, undo:[], redo:[], w, h,',"      fps:t.fps||12, name:t.name||'Canvas', paper:t.paper||DEFAULT_PAPER, canvasShape:'square' };"),
    'template project canvas shape');
  html=replaceOnce(html,
    block('    return { frames:framesCopy, holds:holdsCopy,','      cur:Math.min(Math.max(0,P.cur|0),framesCopy.length-1), undo:[], redo:[], w, h,',"      fps:P.fps||12, name:name || ((P.name||'Canvas')+' copy'), paper:P.paper||DEFAULT_PAPER };"),
    block('    return { frames:framesCopy, holds:holdsCopy,','      cur:Math.min(Math.max(0,P.cur|0),framesCopy.length-1), undo:[], redo:[], w, h,',"      fps:P.fps||12, name:name || ((P.name||'Canvas')+' copy'), paper:P.paper||DEFAULT_PAPER,","      canvasShape:P.canvasShape==='circle'?'circle':'square' };"),
    'cloned project canvas shape');
  html=replaceOnce(html,
    '    if(!P.paper) P.paper = DEFAULT_PAPER;    // back-compat for pre-paper projects',
    block('    if(!P.paper) P.paper = DEFAULT_PAPER;    // back-compat for pre-paper projects',"    if(P.canvasShape!=='circle') P.canvasShape='square';"),
    'project switch shape default');

  html=replaceOnce(html,
    block('        const c=toC(ev);','        const clientX=Number(ev.clientX), clientY=Number(ev.clientY);','        return {','          x:Number.isFinite(clientX)?(clientX-inputTransform.left)*inputTransform.scaleX:c.x,','          y:Number.isFinite(clientY)?(clientY-inputTransform.top)*inputTransform.scaleY:c.y,'),
    block('        const c=toC(ev);','        const mapped=window.InkFrameCanvasShape','          ? window.InkFrameCanvasShape.mapEventPoint(ev,canvas,W,H,activeCanvasShape())','          : c;','        return {','          x:mapped.x,','          y:mapped.y,'),
    'V2 sample circular clamp');
  html=replaceOnce(html,
    block('    return {x:(e.clientX-r.left)*(W/r.width), y:(e.clientY-r.top)*(H/r.height),','            p:e.pressure&&e.pressure>0?e.pressure:0.5, az, flat, type:e.pointerType};};'),
    block('    const raw={x:(e.clientX-r.left)*(W/r.width), y:(e.clientY-r.top)*(H/r.height)};','    const mapped=window.InkFrameCanvasShape','      ? window.InkFrameCanvasShape.mapEventPoint(e,canvas,W,H,activeCanvasShape())','      : raw;','    return {x:mapped.x, y:mapped.y,','            p:e.pressure&&e.pressure>0?e.pressure:0.5, az, flat, type:e.pointerType};};'),
    'canvas coordinate shape clamp');

  html=replaceOnce(html,
    block("  canvas.addEventListener('pointerdown',e=>{",'    updateStylusDiag(e);'),
    block("  canvas.addEventListener('pointerdown',e=>{",'    updateStylusDiag(e);','    if(window.InkFrameCanvasShape && !window.InkFrameCanvasShape.acceptsPointerDown(e,canvas,W,H,activeCanvasShape())){','      e.preventDefault(); return;','    }'),
    'circle pointerdown rejection');
  html=replaceOnce(html,
    block("  canvas.addEventListener('pointermove',e=>{",'    updateStylusDiag(e);',"    if(e.pointerType==='pen') penSeen=performance.now();"),
    block("  canvas.addEventListener('pointermove',e=>{",'    updateStylusDiag(e);',"    if(e.pointerType==='pen') penSeen=performance.now();",'    if(window.InkFrameCanvasShape && circleBoundaryPointer!==e.pointerId){','      const bridge=window.InkFrameBrushV2InputBridge;','      const stats=bridge&&bridge.stats?bridge.stats():null;','      const ownsV2=!!(stats&&stats.active&&stats.pointerId===e.pointerId);','      const ownsOriginal=!!(drawing&&e.pointerId===drawPid);','      if(ownsV2||ownsOriginal){','        const boundary=window.InkFrameCanvasShape.boundaryEvent(e,canvas,W,H,activeCanvasShape());','        if(boundary){','          circleBoundaryPointer=e.pointerId;','          setTimeout(()=>{','            try{','              const latest=bridge&&bridge.stats?bridge.stats():null;','              if(latest&&latest.active&&latest.pointerId===boundary.pointerId) bridge.end(boundary);','              else if(drawing&&drawPid===boundary.pointerId) up(boundary);','            }finally{circleBoundaryPointer=null;}','          },0);','        }','      }','    }'),
    'circle boundary stroke finish');

  html=replaceOnce(html,
    block('  function applyCanvas(){',"    canvas.style.width=Math.round(W*cScale)+'px'; canvas.style.height=Math.round(H*cScale)+'px';","    if(timelineReady && typeof buildFrameBoard==='function') requestAnimationFrame(buildFrameBoard);",'  }','  cScale=fitScale(); applyCanvas();'),
    block('  function applyCanvas(){',"    canvas.style.width=Math.round(W*cScale)+'px'; canvas.style.height=Math.round(H*cScale)+'px';","    if(timelineReady && typeof buildFrameBoard==='function') requestAnimationFrame(buildFrameBoard);",'    if(window.InkFrameCanvasShape) requestAnimationFrame(()=>window.InkFrameCanvasShape.sync());','  }','  function activeCanvasShape(){',"    const P=projects&&projects[pi]; return P&&P.canvasShape==='circle'?'circle':'square';",'  }','  function invalidateCanvasShape(P){','    if(!P)return;',"    for(const fr of P.frames||[]){fr._comp=null;fr._compV=-1;fr._thumb=null;fr._thumbSig='';}","    P._thumb=null;P._thumbSig='';",'  }','  let circleBoundaryPointer=null;','  window.InkFrameCanvasShapeEnvironment=()=>({','    canvas,frameGlass,','    getProject:()=>projects[pi],','    getShape:()=>activeCanvasShape(),','    getSize:()=>({width:W,height:H}),','    setShape(next){','      const adapter=window.InkFrameBrushV2Adapter;','      if(drawing||(adapter&&adapter.isActive&&adapter.isActive()))return false;','      const P=projects[pi];if(!P)return false;',"      P.canvasShape=next==='circle'?'circle':'square';",'      invalidateCanvasShape(P);','      render();refreshFrames();refreshLayers();refreshActions();rebuildGallery();','      AUTOSAVE.schedule();','      return true;','    }','  });','  cScale=fitScale(); applyCanvas();'),
    'canvas shape project bridge');

  html=replaceOnce(html,
    block('  function frameThumbData(fr){',"    const sig=(fr._v||0)+':'+paper()+':'+(fr.layers||[]).map(L=>`${L.id}:${L.visible!==false}:${L.opacity}:${L.blend}`).join('|');"),
    block('  function frameThumbData(fr){',"    const sig=(fr._v||0)+':'+paper()+':'+activeCanvasShape()+':'+(fr.layers||[]).map(L=>`${L.id}:${L.visible!==false}:${L.opacity}:${L.blend}`).join('|');"),
    'frame thumbnail shape signature');
  html=replaceOnce(html,
    block('    const t=mkAt(56,42), g=t.getContext(\'2d\');','    g.fillStyle=paper(); g.fillRect(0,0,t.width,t.height);','    try{ g.drawImage(frameComposite(fr),0,0,t.width,t.height); }catch(_){ }'),
    block('    const t=mkAt(56,42), g=t.getContext(\'2d\');','    if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.paintExportPaper(g,t.width,t.height,activeCanvasShape(),paper());','    else { g.fillStyle=paper(); g.fillRect(0,0,t.width,t.height); }','    try{ g.drawImage(frameComposite(fr),0,0,t.width,t.height); }catch(_){ }'),
    'frame thumbnail circular paper');
  html=replaceOnce(html,
    block('  function thumbSig(P){','    const fr=upgradeFrame(P.frames[P.cur||0], P.w, P.h);',"    const layerSig=fr.layers.map(L=>`${L.id}:${L.visible!==false?1:0}:${L.opacity}:${L.blend}`).join('|');","    return `${P.w}x${P.h}:${P.paper}:${P.cur||0}:${fr._v||0}:${layerSig}`;",'  }'),
    block('  function thumbSig(P){','    const fr=upgradeFrame(P.frames[P.cur||0], P.w, P.h);',"    const layerSig=fr.layers.map(L=>`${L.id}:${L.visible!==false?1:0}:${L.opacity}:${L.blend}`).join('|');","    return `${P.w}x${P.h}:${P.paper}:${P.canvasShape||'square'}:${P.cur||0}:${fr._v||0}:${layerSig}`;",'  }'),
    'project thumbnail shape signature');
  html=replaceOnce(html,
    block("    const t=mkAt(64,Math.round(64*P.h/P.w)); const tc=t.getContext('2d');","    tc.fillStyle=(P.paper||'#fff0f3'); tc.fillRect(0,0,t.width,t.height);",'    const fr=upgradeFrame(P.frames[P.cur||0], P.w, P.h);','    tc.drawImage(frameComposite(fr), 0,0, t.width, t.height);'),
    block("    const t=mkAt(64,Math.round(64*P.h/P.w)); const tc=t.getContext('2d');","    if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.paintExportPaper(tc,t.width,t.height,P.canvasShape,P.paper||'#fff0f3');","    else { tc.fillStyle=(P.paper||'#fff0f3'); tc.fillRect(0,0,t.width,t.height); }",'    const fr=upgradeFrame(P.frames[P.cur||0], P.w, P.h);','    tc.drawImage(frameComposite(fr,undefined,undefined,P.canvasShape), 0,0, t.width, t.height);'),
    'project thumbnail circular rendering');
  html=replaceOnce(html,
    block('    if(!P.paper) P.paper=DEFAULT_PAPER;','    refreshFctx(); applyPaperBg();'),
    block('    if(!P.paper) P.paper=DEFAULT_PAPER;',"    if(P.canvasShape!=='circle') P.canvasShape='square';",'    refreshFctx(); applyPaperBg();'),
    'direct project bind shape default');
  html=replaceOnce(html,
    block('  function repaintProjectShell(){','    canvas.width=W; canvas.height=H; syncPredictedSize(); clampCanvas(); applyCanvas();','    render(); refreshFrames(); refreshLayers(); refreshActions(); rebuildGallery();','  }'),
    block('  function repaintProjectShell(){','    canvas.width=W; canvas.height=H; syncPredictedSize(); clampCanvas(); applyCanvas();','    render(); refreshFrames(); refreshLayers(); refreshActions(); rebuildGallery();','    if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.sync();','  }'),
    'project shell shape sync');

  html=replaceOnce(html,
    block("    return { name:P.name||'Canvas', w, h, cur:Math.min(Math.max(0,P.cur|0),framesSrc.length-1),","      fps:P.fps||12, paper:P.paper||DEFAULT_PAPER,",'      holds:framesSrc.map((_,i)=>Math.max(1,Math.round((P.holds&&P.holds[i])||1))),','      frames:framesOut };'),
    block("    return { name:P.name||'Canvas', w, h, cur:Math.min(Math.max(0,P.cur|0),framesSrc.length-1),","      fps:P.fps||12, paper:P.paper||DEFAULT_PAPER, canvasShape:P.canvasShape==='circle'?'circle':'square',",'      holds:framesSrc.map((_,i)=>Math.max(1,Math.round((P.holds&&P.holds[i])||1))),','      frames:framesOut };'),
    'archive canvas shape export');
  html=replaceOnce(html,
    block('      restored.push({ frames:framesOut, holds, cur:Math.min(Math.max(0,P.cur|0),framesOut.length-1),',"        undo:[], redo:[], w, h, fps:P.fps||12, name:P.name||'Canvas', paper:P.paper||DEFAULT_PAPER });"),
    block('      restored.push({ frames:framesOut, holds, cur:Math.min(Math.max(0,P.cur|0),framesOut.length-1),',"        undo:[], redo:[], w, h, fps:P.fps||12, name:P.name||'Canvas', paper:P.paper||DEFAULT_PAPER,","        canvasShape:P.canvasShape==='circle'?'circle':'square' });"),
    'archive canvas shape restore');

  html=replaceOnce(html,
    block("  actKid('@export','PNG',()=>{const o=mk(),oc=o.getContext('2d');oc.fillStyle=paper();oc.fillRect(0,0,W,H);oc.drawImage(frameComposite(frames[cur]),0,0);","    const a=document.createElement('a');a.download='inkframe-'+(cur+1)+'.png';a.href=o.toDataURL('image/png');a.click();flash('Exported PNG');});"),
    block("  actKid('@export','PNG',()=>{const o=mk(),oc=o.getContext('2d');",'    if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.paintExportPaper(oc,W,H,activeCanvasShape(),paper());','    else {oc.fillStyle=paper();oc.fillRect(0,0,W,H);}','    oc.drawImage(frameComposite(frames[cur]),0,0);',"    const a=document.createElement('a');a.download='inkframe-'+(cur+1)+'.png';a.href=o.toDataURL('image/png');a.click();flash('Exported PNG');});"),
    'PNG circular export');
  html=replaceOnce(html,
    block("      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';",'      g.fillStyle = paper();             // paper -- matches render() clearRect fill','      g.fillRect(0, 0, width, height);'),
    block("      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';",'      if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.paintExportPaper(g,width,height,activeCanvasShape(),paper());','      else { g.fillStyle = paper(); g.fillRect(0, 0, width, height); }'),
    'GIF circular export paper');
  html=replaceOnce(html,
    block('        // Composite onto the offscreen: paper background then frame layers.','        g.fillStyle = paper(); g.fillRect(0,0,width,height);','        const fr = upgradeFrame(P.frames[frameIndex], width, height);'),
    block('        // Composite onto the offscreen: shape-aware paper background then frame layers.','        if(window.InkFrameCanvasShape) window.InkFrameCanvasShape.paintExportPaper(g,width,height,activeCanvasShape(),paper());','        else { g.fillStyle = paper(); g.fillRect(0,0,width,height); }','        const fr = upgradeFrame(P.frames[frameIndex], width, height);'),
    'video circular export paper');

  for(const marker of ['canvas-shape.js','InkFrameCanvasShapeEnvironment','InkFrameCanvasShape.acceptsPointerDown','InkFrameCanvasShape.boundaryEvent','InkFrameCanvasShape.maskComposite',"canvasShape:P.canvasShape==='circle'?'circle':'square'"]){
    if(!html.includes(marker))throw new Error(`Circular Canvas injection verification failed: ${marker}`);
  }
  return html;
}
