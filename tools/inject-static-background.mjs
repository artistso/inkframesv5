// Project-wide static background postprocessor for generated Android assets.
// The checked-in browser fallback stays unchanged while staged APK assets gain
// a shared editable background rendered beneath every animation frame.

const block=(...lines)=>lines.join('\n');

export function injectStaticBackground(html,replaceOnce){
  const layerModelNeedle=block(
    "  function newLayer(w,h,name){ return {",
    "    id:__lid++, name:name||'Layer', visible:true, opacity:1, blend:'source-over',",
    "    canvas:mkAt(w||W,h||H)",
    "  }; }",
    "  function newFrame(w,h){ return { layers:[newLayer(w,h,'Layer 1')], active:0,",
    "                                    _comp:null, _compV:-1, _v:0 }; }",
    "  function frameActive(fr){ return fr.layers[fr.active] || fr.layers[0]; }",
    "  function frameActiveCtx(fr){ return frameActive(fr).canvas.getContext('2d'); }",
    "  function bumpFrame(fr){ if(fr) fr._v++; }"
  );
  const layerModel=block(
    "  function newLayer(w,h,name){ return {",
    "    id:__lid++, name:name||'Layer', visible:true, opacity:1, blend:'source-over',",
    "    canvas:mkAt(w||W,h||H)",
    "  }; }",
    "  function newBackground(w,h){ const B=newLayer(w,h,'Background'); B._v=0; return B; }",
    "  function ensureProjectBackground(P,w,h){",
    "    if(!P)return null; w=w||P.w||W; h=h||P.h||H;",
    "    if(!P.background)P.background=newBackground(w,h);",
    "    const B=P.background;",
    "    if(!B.canvas)B.canvas=mkAt(w,h);",
    "    if(B.canvas.width!==w||B.canvas.height!==h){",
    "      const c=mkAt(w,h); c.getContext('2d').drawImage(B.canvas,0,0); B.canvas=c; B._v=(B._v||0)+1;",
    "    }",
    "    if(typeof B.visible!=='boolean')B.visible=true;",
    "    if(typeof B.opacity!=='number')B.opacity=1;",
    "    if(!B.blend)B.blend='source-over';",
    "    return B;",
    "  }",
    "  function backgroundEditing(){ const P=projects&&projects[pi]; return !!(P&&P.backgroundActive); }",
    "  function newFrame(w,h){ return { layers:[newLayer(w,h,'Layer 1')], active:0,",
    "                                    _comp:null, _compV:-1, _v:0 }; }",
    "  function frameActive(fr){",
    "    if(backgroundEditing()&&fr===frames[cur])return ensureProjectBackground(projects[pi],W,H);",
    "    return fr.layers[fr.active] || fr.layers[0];",
    "  }",
    "  function frameActiveCtx(fr){ return frameActive(fr).canvas.getContext('2d'); }",
    "  function bumpFrame(fr){",
    "    if(backgroundEditing()&&fr===frames[cur]){const B=ensureProjectBackground(projects[pi],W,H);B._v=(B._v||0)+1;projects[pi]._thumbSig='';return;}",
    "    if(fr) fr._v++;",
    "  }",
    "  function drawProjectBackground(g,P,w,h){",
    "    const B=ensureProjectBackground(P,w,h);if(!B||B.visible===false||B.opacity<=0)return;",
    "    g.save();g.globalAlpha=B.opacity;g.globalCompositeOperation=B.blend||'source-over';g.drawImage(B.canvas,0,0,w||B.canvas.width,h||B.canvas.height);g.restore();",
    "    g.globalAlpha=1;g.globalCompositeOperation='source-over';",
    "  }"
  );
  html=replaceOnce(html,layerModelNeedle,layerModel,'static background layer model');

  html=replaceOnce(html,
    "    name:'Canvas', paper:DEFAULT_PAPER }; }",
    "    name:'Canvas', paper:DEFAULT_PAPER, background:newBackground(w,h), backgroundActive:false }; }",
    'new project static background');
  html=replaceOnce(html,
    "      fps:t.fps||12, name:t.name||'Canvas', paper:t.paper||DEFAULT_PAPER };",
    "      fps:t.fps||12, name:t.name||'Canvas', paper:t.paper||DEFAULT_PAPER, background:newBackground(w,h), backgroundActive:false };",
    'template static background');

  const cloneNeedle=block(
    "    const holdsCopy=framesCopy.map((_,i)=>Math.max(1,Math.round((P.holds&&P.holds[i])||1)));",
    "    return { frames:framesCopy, holds:holdsCopy,",
    "      cur:Math.min(Math.max(0,P.cur|0),framesCopy.length-1), undo:[], redo:[], w, h,",
    "      fps:P.fps||12, name:name || ((P.name||'Canvas')+' copy'), paper:P.paper||DEFAULT_PAPER };"
  );
  const cloneReplacement=block(
    "    const holdsCopy=framesCopy.map((_,i)=>Math.max(1,Math.round((P.holds&&P.holds[i])||1)));",
    "    const srcBg=ensureProjectBackground(P,srcW,srcH), background=newBackground(w,h);",
    "    if(srcBg){const bg=background.canvas.getContext('2d');if(scale)bg.drawImage(srcBg.canvas,0,0,w,h);else bg.drawImage(srcBg.canvas,0,0);background.visible=srcBg.visible!==false;background.opacity=typeof srcBg.opacity==='number'?srcBg.opacity:1;background.blend=srcBg.blend||'source-over';background._v=srcBg._v||0;}",
    "    return { frames:framesCopy, holds:holdsCopy,",
    "      cur:Math.min(Math.max(0,P.cur|0),framesCopy.length-1), undo:[], redo:[], w, h,",
    "      fps:P.fps||12, name:name || ((P.name||'Canvas')+' copy'), paper:P.paper||DEFAULT_PAPER, background, backgroundActive:false };"
  );
  html=replaceOnce(html,cloneNeedle,cloneReplacement,'clone project static background');

  html=replaceOnce(html,
    "    if(!P.paper) P.paper = DEFAULT_PAPER;    // back-compat for pre-paper projects\n    refreshFctx();",
    "    if(!P.paper) P.paper = DEFAULT_PAPER;    // back-compat for pre-paper projects\n    ensureProjectBackground(P,P.w,P.h);P.backgroundActive=false;\n    refreshFctx();",
    'project switch background migration');
  html=replaceOnce(html,
    "    if(!P.paper) P.paper=DEFAULT_PAPER;\n    refreshFctx(); applyPaperBg();",
    "    if(!P.paper) P.paper=DEFAULT_PAPER;\n    ensureProjectBackground(P,P.w,P.h);P.backgroundActive=false;\n    refreshFctx(); applyPaperBg();",
    'direct project bind background migration');

  const snapNeedle=block(
    "  const snap=()=>{",
    "    const fr=frames[cur], L=frameActive(fr);",
    "    return { kind:'pixels', frame:cur, active:fr.active,",
    "             data:L.canvas.getContext('2d').getImageData(0,0,L.canvas.width,L.canvas.height) };",
    "  };",
    "  // Structural snap (layer add/dup/del/reorder, visibility/opacity/blend changes):",
    "  // clones every layer's ImageData + full props so the change is reversible. Only",
    "  // called on genuine structure changes -- pen strokes stay on the fast path.",
    "  const structSnap=()=>{",
    "    const fr=frames[cur];",
    "    return { kind:'struct', frame:cur, active:fr.active,",
    "      layers: fr.layers.map(L=>({",
    "        id:L.id, name:L.name, visible:L.visible, opacity:L.opacity, blend:L.blend,",
    "        w:L.canvas.width, h:L.canvas.height,",
    "        data:L.canvas.getContext('2d').getImageData(0,0,L.canvas.width,L.canvas.height),",
    "      })),",
    "    };",
    "  };",
    "  function restoreSnap(s){",
    "    const fr=frames[s.frame]; if(!fr) return;",
    "    if(s.kind==='pixels'){",
    "      const L=fr.layers[Math.min(s.active|0, fr.layers.length-1)] || frameActive(fr);",
    "      L.canvas.getContext('2d').putImageData(s.data,0,0);",
    "      bumpFrame(fr); refreshFctx();",
    "    } else {",
    "      fr.layers = s.layers.map(sL=>{",
    "        const c=mkAt(sL.w, sL.h); c.getContext('2d').putImageData(sL.data,0,0);",
    "        return { id:sL.id, name:sL.name, visible:sL.visible, opacity:sL.opacity, blend:sL.blend, canvas:c };",
    "      });",
    "      fr.active = Math.min(s.active|0, fr.layers.length-1);",
    "      bumpFrame(fr); refreshFctx();",
    "    }",
    "  }"
  );
  const snapReplacement=block(
    "  const backgroundSnap=kind=>{const B=ensureProjectBackground(projects[pi],W,H);return {kind,frame:cur,id:B.id,visible:B.visible,opacity:B.opacity,blend:B.blend,w:B.canvas.width,h:B.canvas.height,data:B.canvas.getContext('2d').getImageData(0,0,B.canvas.width,B.canvas.height)};};",
    "  const snap=()=>{",
    "    if(backgroundEditing())return backgroundSnap('backgroundPixels');",
    "    const fr=frames[cur], L=frameActive(fr);",
    "    return { kind:'pixels', frame:cur, active:fr.active,",
    "             data:L.canvas.getContext('2d').getImageData(0,0,L.canvas.width,L.canvas.height) };",
    "  };",
    "  // Structural snap (layer add/dup/del/reorder, visibility/opacity/blend changes):",
    "  // clones every layer's ImageData + full props so the change is reversible. Only",
    "  // called on genuine structure changes -- pen strokes stay on the fast path.",
    "  const structSnap=()=>{",
    "    if(backgroundEditing())return backgroundSnap('backgroundStruct');",
    "    const fr=frames[cur];",
    "    return { kind:'struct', frame:cur, active:fr.active,",
    "      layers: fr.layers.map(L=>({",
    "        id:L.id, name:L.name, visible:L.visible, opacity:L.opacity, blend:L.blend,",
    "        w:L.canvas.width, h:L.canvas.height,",
    "        data:L.canvas.getContext('2d').getImageData(0,0,L.canvas.width,L.canvas.height),",
    "      })),",
    "    };",
    "  };",
    "  function restoreSnap(s){",
    "    const fr=frames[s.frame]; if(!fr) return;",
    "    if(s.kind==='backgroundPixels'||s.kind==='backgroundStruct'){",
    "      const c=mkAt(s.w,s.h);c.getContext('2d').putImageData(s.data,0,0);projects[pi].background={id:s.id||__lid++,name:'Background',visible:s.visible!==false,opacity:typeof s.opacity==='number'?s.opacity:1,blend:s.blend||'source-over',canvas:c,_v:(projects[pi].background&&projects[pi].background._v||0)+1};projects[pi].backgroundActive=true;projects[pi]._thumbSig='';refreshFctx();return;",
    "    }",
    "    if(s.kind==='pixels'){",
    "      const L=fr.layers[Math.min(s.active|0, fr.layers.length-1)] || frameActive(fr);",
    "      L.canvas.getContext('2d').putImageData(s.data,0,0);",
    "      bumpFrame(fr); refreshFctx();",
    "    } else {",
    "      fr.layers = s.layers.map(sL=>{",
    "        const c=mkAt(sL.w, sL.h); c.getContext('2d').putImageData(sL.data,0,0);",
    "        return { id:sL.id, name:sL.name, visible:sL.visible, opacity:sL.opacity, blend:sL.blend, canvas:c };",
    "      });",
    "      fr.active = Math.min(s.active|0, fr.layers.length-1);",
    "      bumpFrame(fr); refreshFctx();",
    "    }",
    "  }"
  );
  html=replaceOnce(html,snapNeedle,snapReplacement,'background-aware undo snapshots');
  html=replaceOnce(html,
    "  function symmetricSnap(kind){ return kind==='struct' ? structSnap() : snap(); }",
    "  function symmetricSnap(kind){if(kind==='backgroundPixels')return backgroundSnap('backgroundPixels');if(kind==='backgroundStruct')return backgroundSnap('backgroundStruct');return kind==='struct'?structSnap():snap();}",
    'background undo symmetry');

  html=replaceOnce(html,
    "  function render(){ ctx.clearRect(0,0,W,H); ctx.fillStyle=paper(); ctx.fillRect(0,0,W,H);",
    "  function render(){ ctx.clearRect(0,0,W,H); ctx.fillStyle=paper(); ctx.fillRect(0,0,W,H); drawProjectBackground(ctx,projects[pi],W,H);",
    'render static background');
  html=replaceOnce(html,
    "    ctx.fillStyle = paper();\n    ctx.fillRect(0, 0, splitPx, H);\n    ctx.drawImage(s, 0, 0);",
    "    ctx.fillStyle = paper();\n    ctx.fillRect(0, 0, splitPx, H);\n    drawProjectBackground(ctx,projects[pi],W,H);\n    ctx.drawImage(s, 0, 0);",
    'compare static background');
  html=replaceOnce(html,
    "    g.fillStyle = paper();\n    g.fillRect(0, 0, 1, 1);\n    g.drawImage(frameComposite(frames[cur]), -x, -y);",
    "    g.fillStyle = paper();\n    g.fillRect(0, 0, 1, 1);\n    const B=ensureProjectBackground(projects[pi],W,H);if(B&&B.visible!==false&&B.opacity>0){g.globalAlpha=B.opacity;g.globalCompositeOperation=B.blend||'source-over';g.drawImage(B.canvas,-x,-y);g.globalAlpha=1;g.globalCompositeOperation='source-over';}\n    g.drawImage(frameComposite(frames[cur]), -x, -y);",
    'eyedropper static background');

  html=replaceOnce(html,
    "  actKid('@export','PNG',()=>{const o=mk(),oc=o.getContext('2d');oc.fillStyle=paper();oc.fillRect(0,0,W,H);oc.drawImage(frameComposite(frames[cur]),0,0);",
    "  actKid('@export','PNG',()=>{const o=mk(),oc=o.getContext('2d');oc.fillStyle=paper();oc.fillRect(0,0,W,H);drawProjectBackground(oc,projects[pi],W,H);oc.drawImage(frameComposite(frames[cur]),0,0);",
    'PNG static background');
  html=replaceOnce(html,
    "  function drawComposite(idx){ ctx.clearRect(0,0,W,H); ctx.fillStyle=paper(); ctx.fillRect(0,0,W,H);\n    ctx.globalAlpha=1; ctx.drawImage(frameComposite(frames[idx%frames.length]),0,0); }",
    "  function drawComposite(idx){ ctx.clearRect(0,0,W,H); ctx.fillStyle=paper(); ctx.fillRect(0,0,W,H);drawProjectBackground(ctx,projects[pi],W,H);\n    ctx.globalAlpha=1; ctx.drawImage(frameComposite(frames[idx%frames.length]),0,0); }",
    'playback static background');
  html=replaceOnce(html,
    "    ctx.clearRect(0,0,W,H); ctx.fillStyle=paper(); ctx.fillRect(0,0,W,H);\n    const mb=blurAmt();",
    "    ctx.clearRect(0,0,W,H); ctx.fillStyle=paper(); ctx.fillRect(0,0,W,H);drawProjectBackground(ctx,projects[pi],W,H);\n    const mb=blurAmt();",
    'play loop static background');

  html=replaceOnce(html,
    "  function frameThumbData(fr){\n    const sig=(fr._v||0)+':'+paper()+':'+(fr.layers||[]).map(L=>`${L.id}:${L.visible!==false}:${L.opacity}:${L.blend}`).join('|');",
    "  function frameThumbData(fr){\n    const B=ensureProjectBackground(projects[pi],W,H);const sig=(fr._v||0)+':'+paper()+':bg:'+(B&&B._v||0)+':'+(B&&B.visible!==false?1:0)+':'+(B&&B.opacity)+':'+(B&&B.blend)+':'+(fr.layers||[]).map(L=>`${L.id}:${L.visible!==false}:${L.opacity}:${L.blend}`).join('|');",
    'frame thumbnail background signature');
  html=replaceOnce(html,
    "    g.fillStyle=paper(); g.fillRect(0,0,t.width,t.height);\n    try{ g.drawImage(frameComposite(fr),0,0,t.width,t.height); }catch(_){ }",
    "    g.fillStyle=paper(); g.fillRect(0,0,t.width,t.height);\n    try{drawProjectBackground(g,projects[pi],t.width,t.height);g.drawImage(frameComposite(fr),0,0,t.width,t.height);}catch(_){ }",
    'frame thumbnail static background');
  html=replaceOnce(html,
    "  function refreshCurrentThumb(){\n    const k=framesBranch && framesBranch._kids && framesBranch._kids.querySelector(`[data-frame=\"${cur}\"] .frameThumb`);",
    "  function refreshCurrentThumb(){\n    if(backgroundEditing()){refreshFrames();rebuildGallery();return;}\n    const k=framesBranch && framesBranch._kids && framesBranch._kids.querySelector(`[data-frame=\"${cur}\"] .frameThumb`);",
    'background thumbnail refresh');

  html=replaceOnce(html,
    "    const layerSig=fr.layers.map(L=>`${L.id}:${L.visible!==false?1:0}:${L.opacity}:${L.blend}`).join('|');\n    return `${P.w}x${P.h}:${P.paper}:${P.cur||0}:${fr._v||0}:${layerSig}`;",
    "    const layerSig=fr.layers.map(L=>`${L.id}:${L.visible!==false?1:0}:${L.opacity}:${L.blend}`).join('|');const B=ensureProjectBackground(P,P.w,P.h);\n    return `${P.w}x${P.h}:${P.paper}:${P.cur||0}:${fr._v||0}:bg:${B._v||0}:${B.visible!==false?1:0}:${B.opacity}:${B.blend}:${layerSig}`;",
    'gallery background signature');
  html=replaceOnce(html,
    "    tc.fillStyle=(P.paper||'#fff0f3'); tc.fillRect(0,0,t.width,t.height);\n    const fr=upgradeFrame(P.frames[P.cur||0], P.w, P.h);\n    tc.drawImage(frameComposite(fr), 0,0, t.width, t.height);",
    "    tc.fillStyle=(P.paper||'#fff0f3'); tc.fillRect(0,0,t.width,t.height);drawProjectBackground(tc,P,t.width,t.height);\n    const fr=upgradeFrame(P.frames[P.cur||0], P.w, P.h);\n    tc.drawImage(frameComposite(fr), 0,0, t.width, t.height);",
    'gallery thumbnail static background');

  html=replaceOnce(html,
    "    P.frames=[newFrame(P.w||W0,P.h||H0)]; P.holds=[1]; P.cur=0; P.undo=[]; P.redo=[];",
    "    P.frames=[newFrame(P.w||W0,P.h||H0)]; P.holds=[1]; P.cur=0; P.undo=[]; P.redo=[];P.background=newBackground(P.w||W0,P.h||H0);P.backgroundActive=false;",
    'clear project static background');

  const archiveCountNeedle=block(
    "    for(const P of projects){",
    "      const w=P.w||W0, h=P.h||H0;",
    "      const framesSrc=(P.frames&&P.frames.length?P.frames:[newFrame(w,h)]);",
    "      for(const fr0 of framesSrc) n += upgradeFrame(fr0,w,h).layers.length;",
    "    }"
  );
  html=replaceOnce(html,archiveCountNeedle,block(
    "    for(const P of projects){",
    "      const w=P.w||W0, h=P.h||H0;",
    "      const framesSrc=(P.frames&&P.frames.length?P.frames:[newFrame(w,h)]);",
    "      n+=1;for(const fr0 of framesSrc) n += upgradeFrame(fr0,w,h).layers.length;",
    "    }"
  ),'archive background count');
  html=replaceOnce(html,
    "    const framesSrc=(P.frames&&P.frames.length?P.frames:[newFrame(w,h)]);\n    const framesOut=[];",
    "    const framesSrc=(P.frames&&P.frames.length?P.frames:[newFrame(w,h)]);\n    const B=ensureProjectBackground(P,w,h);const background={visible:B.visible!==false,opacity:typeof B.opacity==='number'?B.opacity:1,blend:B.blend||'source-over',png:await canvasPngDataUrl(B.canvas)};if(onLayer)onLayer();\n    const framesOut=[];",
    'archive static background serialization');
  html=replaceOnce(html,
    "      fps:P.fps||12, paper:P.paper||DEFAULT_PAPER,\n      holds:framesSrc.map((_,i)=>Math.max(1,Math.round((P.holds&&P.holds[i])||1))),\n      frames:framesOut };",
    "      fps:P.fps||12, paper:P.paper||DEFAULT_PAPER,background,\n      holds:framesSrc.map((_,i)=>Math.max(1,Math.round((P.holds&&P.holds[i])||1))),\n      frames:framesOut };",
    'archive background field');
  html=replaceOnce(html,
    "    return { v:3, app:'InkFrame Studio', kind:'inkframe-web-archive', savedAt:Date.now(), active:pi,",
    "    return { v:4, app:'InkFrame Studio', kind:'inkframe-web-archive', savedAt:Date.now(), active:pi,",
    'archive version 4');
  html=replaceOnce(html,
    "    for(const P of list){\n      const srcFrames=Array.isArray(P.frames) && P.frames.length ? P.frames : [{layers:[]}];",
    "    for(const P of list){\n      if(P.background)n+=1;const srcFrames=Array.isArray(P.frames) && P.frames.length ? P.frames : [{layers:[]}];",
    'archive payload background count');
  html=replaceOnce(html,
    "      const srcFrames=(Array.isArray(P.frames) && P.frames.length ? P.frames : [{active:0,layers:[]}]).slice(0,MAX_FRAMES);\n      const framesOut=[];",
    "      const srcFrames=(Array.isArray(P.frames) && P.frames.length ? P.frames : [{active:0,layers:[]}]).slice(0,MAX_FRAMES);\n      const background=newBackground(w,h);if(P.background){background.canvas=await loadArchiveCanvas(P.background.png||P.background.dataUrl||P.background.data,w,h);background.visible=P.background.visible!==false;background.opacity=typeof P.background.opacity==='number'?P.background.opacity:1;background.blend=P.background.blend||'source-over';if(onLayer)onLayer();}\n      const framesOut=[];",
    'archive background restore');
  html=replaceOnce(html,
    "        undo:[], redo:[], w, h, fps:P.fps||12, name:P.name||'Canvas', paper:P.paper||DEFAULT_PAPER });",
    "        undo:[], redo:[], w, h, fps:P.fps||12, name:P.name||'Canvas', paper:P.paper||DEFAULT_PAPER,background,backgroundActive:false });",
    'restored project static background');

  html=replaceOnce(html,
    "    function flattenFrame(frame, width, height) {",
    "    function flattenFrame(P, frame, width, height) {",
    'GIF flatten background project argument');
  html=replaceOnce(html,
    "      g.fillStyle = paper();             // paper -- matches render() clearRect fill\n      g.fillRect(0, 0, width, height);",
    "      g.fillStyle = paper();             // paper -- matches render() clearRect fill\n      g.fillRect(0, 0, width, height);drawProjectBackground(g,P,width,height);",
    'GIF static background composition');
  for(const oldCall of [
    "flattenFrame(P.frames[frameIndex], width, height)",
  ]){
    while(html.includes(oldCall))html=html.replace(oldCall,"flattenFrame(P, P.frames[frameIndex], width, height)");
  }
  html=replaceOnce(html,
    "        g.fillStyle = paper(); g.fillRect(0,0,width,height);\n        const fr = upgradeFrame(P.frames[frameIndex], width, height);",
    "        g.fillStyle = paper(); g.fillRect(0,0,width,height);drawProjectBackground(g,P,width,height);\n        const fr = upgradeFrame(P.frames[frameIndex], width, height);",
    'video static background composition');

  html=replaceOnce(html,
    "    newLayer:      newLayer,\n    newFrame:      newFrame,",
    "    newLayer:      newLayer,\n    newBackground: newBackground,\n    newFrame:      newFrame,",
    'autosave static background factory');

  const layerHeaderNeedle="  function activeLayer(){ const fr=frames[cur]; return fr && fr.layers[fr.active]; }";
  html=replaceOnce(html,layerHeaderNeedle,block(
    "  function activeLayer(){if(backgroundEditing())return ensureProjectBackground(projects[pi],W,H);const fr=frames[cur];return fr&&fr.layers[fr.active];}",
    "  function setBackgroundEditing(on){const P=projects[pi];P.backgroundActive=!!on;ensureProjectBackground(P,W,H);refreshFctx();render();refreshLayers();window.dispatchEvent(new Event('inkframe:layers'));}",
    "  function requireFrameLayer(){if(backgroundEditing()){flash('Select a frame layer first');return false;}return true;}"
  ),'background layer selection helpers');
  for(const marker of [
    "  const kLayAdd=lAct('@layerAdd','Add',()=>{",
    "  const kLayDup=lAct('@layerDup','Dup',()=>{",
    "  const kLayDel=lAct('@layerDel','Del',()=>{",
    "  const kLayUp=lAct('@layerUp','Up',()=>{",
    "  const kLayDn=lAct('@layerDn','Down',()=>{",
    "  const kLayMerge=lAct('@layerDn','Merge',()=>{",
    "  const kLayFlat=lAct('@layers','Flat',()=>{",
  ])html=replaceOnce(html,marker,marker+"\n    if(!requireFrameLayer())return;",`background guard ${marker}`);
  html=replaceOnce(html,
    "  const kLayImp=lAct('@imp','Import',()=>{",
    "  const kLayImp=lAct('@imp','Import',()=>{\n    if(!requireFrameLayer())return;",
    'background import guard');
  html=replaceOnce(html,
    "  const layerOpDial=kidEl({cls:'dial',glyph:'100',sub:'L·Op',build(k){const r=document.createElement('div');r.className='ring';k.insertBefore(r,k.firstChild);}});",
    "  const kLayBg=lAct('@paper','BG',()=>setBackgroundEditing(!backgroundEditing()));\n  const layerOpDial=kidEl({cls:'dial',glyph:'100',sub:'L·Op',build(k){const r=document.createElement('div');r.className='ring';k.insertBefore(r,k.firstChild);}});",
    'background radial control');
  html=replaceOnce(html,
    "      k.addEventListener('click',e=>{ e.stopPropagation();\n        fr.active=i; refreshFctx(); render(); refreshLayers();",
    "      k.addEventListener('click',e=>{ e.stopPropagation();\n        projects[pi].backgroundActive=false;fr.active=i; refreshFctx(); render(); refreshLayers();",
    'frame layer stack exits background');
  html=replaceOnce(html,
    "    // Top layer first in the branch (matches Photoshop-style stack ordering).",
    "    const B=ensureProjectBackground(projects[pi],W,H);const bg=kidEl({glyph:'BG'});bg.style.width='38px';bg.style.height='38px';bg.style.margin='-19px 0 0 -19px';bg.title='Static background · shared across all frames';if(B.visible===false)bg.style.opacity='0.35';if(backgroundEditing())bg.classList.add('on');bg.addEventListener('click',e=>{e.stopPropagation();setBackgroundEditing(true);});wrap.appendChild(bg);\n    // Top layer first in the branch (matches Photoshop-style stack ordering).",
    'background stack entry');
  html=replaceOnce(html,
    "      const eyeG=kLayEye.querySelector('.glyph');",
    "      kLayBg.classList.toggle('on',backgroundEditing());const eyeG=kLayEye.querySelector('.glyph');",
    'background radial state');

  for(const marker of [
    'newBackground','ensureProjectBackground','drawProjectBackground','backgroundActive','backgroundPixels','backgroundStruct',
    "drawProjectBackground(ctx,projects[pi],W,H)","drawProjectBackground(g,P,width,height)",
    "v:4, app:'InkFrame Studio'",'newBackground: newBackground',"const kLayBg=lAct('@paper','BG'",
  ])if(!html.includes(marker))throw new Error(`Static background injection verification failed: ${marker}`);
  return html;
}
