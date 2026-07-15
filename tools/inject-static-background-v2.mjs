// Project-wide static background postprocessor for already-generated Android HTML.
// Runs after Canvas Shape, Onion Studio, Feedback, and tablet UI injection.

function replacePattern(source, pattern, replacement, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`Static background pattern ${matches.length ? 'not unique' : 'missing'}: ${label}`);
  return source.replace(pattern, replacement);
}

export function injectStaticBackground(html) {
  const helpers = `  function newBackground(w,h){const B=newLayer(w,h,'Background');B._v=0;return B;}
  function ensureProjectBackground(P,w,h){
    if(!P)return null;w=w||P.w||W;h=h||P.h||H;
    if(!P.background)P.background=newBackground(w,h);
    const B=P.background;if(!B.canvas)B.canvas=mkAt(w,h);
    if(B.canvas.width!==w||B.canvas.height!==h){const c=mkAt(w,h);c.getContext('2d').drawImage(B.canvas,0,0);B.canvas=c;B._v=(B._v||0)+1;}
    if(typeof B.visible!=='boolean')B.visible=true;if(typeof B.opacity!=='number')B.opacity=1;if(!B.blend)B.blend='source-over';return B;
  }
  function backgroundEditing(){const P=projects&&projects[pi];return !!(P&&P.backgroundActive);}
  function drawProjectBackground(g,P,w,h){
    const B=ensureProjectBackground(P,w,h);if(!B||B.visible===false||B.opacity<=0)return;
    g.save();if(P&&P.canvasShape==='circle'){g.beginPath();g.ellipse(w/2,h/2,w/2,h/2,0,0,Math.PI*2);g.clip();}
    g.globalAlpha=B.opacity;g.globalCompositeOperation=B.blend||'source-over';g.drawImage(B.canvas,0,0,w,h);g.restore();g.globalAlpha=1;g.globalCompositeOperation='source-over';
  }
`;
  html = replacePattern(html,/  function newFrame\(w,h\)\{/,helpers+'  function newFrame(w,h){','background helpers');
  html = replacePattern(html,/  function frameActive\(fr\)\{ return fr\.layers\[fr\.active\] \|\| fr\.layers\[0\]; \}/,
    "  function frameActive(fr){if(backgroundEditing()&&fr===frames[cur])return ensureProjectBackground(projects[pi],W,H);return fr.layers[fr.active]||fr.layers[0];}",'background paint target');
  html = replacePattern(html,/  function bumpFrame\(fr\)\{ if\(fr\) fr\._v\+\+; \}/,
    "  function bumpFrame(fr){if(backgroundEditing()&&fr===frames[cur]){const B=ensureProjectBackground(projects[pi],W,H);B._v=(B._v||0)+1;projects[pi]._thumbSig='';return;}if(fr)fr._v++;}",'background versioning');

  html = replacePattern(html,/name:'Canvas', paper:DEFAULT_PAPER, canvasShape:'square' \}; \}/,
    "name:'Canvas', paper:DEFAULT_PAPER, canvasShape:'square', background:newBackground(w,h), backgroundActive:false }; }",'new project background');
  html = replacePattern(html,/fps:t\.fps\|\|12, name:t\.name\|\|'Canvas', paper:t\.paper\|\|DEFAULT_PAPER, canvasShape:'square' \};/,
    "fps:t.fps||12, name:t.name||'Canvas', paper:t.paper||DEFAULT_PAPER, canvasShape:'square', background:newBackground(w,h), backgroundActive:false };",'template background');
  html = replacePattern(html,/    const holdsCopy=framesCopy\.map\(\(_,i\)=>Math\.max\(1,Math\.round\(\(P\.holds&&P\.holds\[i\]\)\|\|1\)\)\);/,
    `$&\n    const srcBg=ensureProjectBackground(P,srcW,srcH),background=newBackground(w,h);if(srcBg){const bg=background.canvas.getContext('2d');if(scale)bg.drawImage(srcBg.canvas,0,0,w,h);else bg.drawImage(srcBg.canvas,0,0);background.visible=srcBg.visible!==false;background.opacity=typeof srcBg.opacity==='number'?srcBg.opacity:1;background.blend=srcBg.blend||'source-over';background._v=srcBg._v||0;}`,'clone background pixels');
  html = replacePattern(html,/      canvasShape:P\.canvasShape==='circle'\?'circle':'square' \};/,
    "      canvasShape:P.canvasShape==='circle'?'circle':'square', background, backgroundActive:false };",'clone background field');

  html = replacePattern(html,/    if\(P\.canvasShape!=='circle'\) P\.canvasShape='square';\n    refreshFctx\(\);/,
    "    if(P.canvasShape!=='circle') P.canvasShape='square';\n    ensureProjectBackground(P,P.w,P.h);P.backgroundActive=false;\n    refreshFctx();",'project switch migration');
  html = replacePattern(html,/    if\(P\.canvasShape!=='circle'\) P\.canvasShape='square';\n    refreshFctx\(\); applyPaperBg\(\);/,
    "    if(P.canvasShape!=='circle') P.canvasShape='square';\n    ensureProjectBackground(P,P.w,P.h);P.backgroundActive=false;\n    refreshFctx(); applyPaperBg();",'direct project bind migration');

  const snapshots = `  const backgroundSnap=kind=>{const B=ensureProjectBackground(projects[pi],W,H);return{kind,frame:cur,id:B.id,visible:B.visible,opacity:B.opacity,blend:B.blend,w:B.canvas.width,h:B.canvas.height,data:B.canvas.getContext('2d').getImageData(0,0,B.canvas.width,B.canvas.height)};};
  const snap=()=>{if(backgroundEditing())return backgroundSnap('backgroundPixels');const fr=frames[cur],L=frameActive(fr);return{kind:'pixels',frame:cur,active:fr.active,data:L.canvas.getContext('2d').getImageData(0,0,L.canvas.width,L.canvas.height)};};
  const structSnap=()=>{if(backgroundEditing())return backgroundSnap('backgroundStruct');const fr=frames[cur];return{kind:'struct',frame:cur,active:fr.active,layers:fr.layers.map(L=>({id:L.id,name:L.name,visible:L.visible,opacity:L.opacity,blend:L.blend,w:L.canvas.width,h:L.canvas.height,data:L.canvas.getContext('2d').getImageData(0,0,L.canvas.width,L.canvas.height)}))};};
  function restoreSnap(s){const fr=frames[s.frame];if(!fr)return;if(s.kind==='backgroundPixels'||s.kind==='backgroundStruct'){const c=mkAt(s.w,s.h);c.getContext('2d').putImageData(s.data,0,0);projects[pi].background={id:s.id||__lid++,name:'Background',visible:s.visible!==false,opacity:typeof s.opacity==='number'?s.opacity:1,blend:s.blend||'source-over',canvas:c,_v:(projects[pi].background&&projects[pi].background._v||0)+1};projects[pi].backgroundActive=true;projects[pi]._thumbSig='';refreshFctx();return;}if(s.kind==='pixels'){const L=fr.layers[Math.min(s.active|0,fr.layers.length-1)]||frameActive(fr);L.canvas.getContext('2d').putImageData(s.data,0,0);bumpFrame(fr);refreshFctx();}else{fr.layers=s.layers.map(sL=>{const c=mkAt(sL.w,sL.h);c.getContext('2d').putImageData(sL.data,0,0);return{id:sL.id,name:sL.name,visible:sL.visible,opacity:sL.opacity,blend:sL.blend,canvas:c};});fr.active=Math.min(s.active|0,fr.layers.length-1);bumpFrame(fr);refreshFctx();}}
`;
  html = replacePattern(html,/  const snap=\(\)=>\{[\s\S]*?\n  \}\n  \/\/ NOTE:/,snapshots+'  // NOTE:','background snapshots');
  html = replacePattern(html,/  function symmetricSnap\(kind\)\{ return kind==='struct' \? structSnap\(\) : snap\(\); \}/,
    "  function symmetricSnap(kind){if(kind==='backgroundPixels')return backgroundSnap('backgroundPixels');if(kind==='backgroundStruct')return backgroundSnap('backgroundStruct');return kind==='struct'?structSnap():snap();}",'background undo symmetry');

  html = replacePattern(html,/function render\(\)\{ ctx\.clearRect\(0,0,W,H\); ctx\.fillStyle=paper\(\); ctx\.fillRect\(0,0,W,H\);/,
    "$& drawProjectBackground(ctx,projects[pi],W,H);",'live background render');
  html = replacePattern(html,/ctx\.fillRect\(0, 0, splitPx, H\);\n    ctx\.drawImage\(s, 0, 0\);/,
    "ctx.fillRect(0, 0, splitPx, H);\n    drawProjectBackground(ctx,projects[pi],W,H);\n    ctx.drawImage(s, 0, 0);",'compare background render');
  html = replacePattern(html,/g\.fillRect\(0, 0, 1, 1\);\n    g\.drawImage\(frameComposite\(frames\[cur\][^\n]*\), -x, -y\);/,
    "g.fillRect(0, 0, 1, 1);\n    const staticBg=ensureProjectBackground(projects[pi],W,H);if(staticBg&&staticBg.visible!==false&&staticBg.opacity>0){g.globalAlpha=staticBg.opacity;g.globalCompositeOperation=staticBg.blend||'source-over';g.drawImage(staticBg.canvas,-x,-y);g.globalAlpha=1;g.globalCompositeOperation='source-over';}\n    g.drawImage(frameComposite(frames[cur]), -x, -y);",'eyedropper background');

  html = replacePattern(html,/oc\.drawImage\(frameComposite\(frames\[cur\][^\n]*\),0,0\);/,
    "drawProjectBackground(oc,projects[pi],W,H);$&",'PNG background');
  html = replacePattern(html,/function drawComposite\(idx\)\{ ctx\.clearRect\(0,0,W,H\); ctx\.fillStyle=paper\(\); ctx\.fillRect\(0,0,W,H\);/,
    "$&drawProjectBackground(ctx,projects[pi],W,H);",'playback background');
  html = replacePattern(html,/ctx\.clearRect\(0,0,W,H\); ctx\.fillStyle=paper\(\); ctx\.fillRect\(0,0,W,H\);\n    const mb=blurAmt\(\);/,
    "ctx.clearRect(0,0,W,H); ctx.fillStyle=paper(); ctx.fillRect(0,0,W,H);drawProjectBackground(ctx,projects[pi],W,H);\n    const mb=blurAmt();",'play loop background');

  html = replacePattern(html,/  function frameThumbData\(fr\)\{\n    const sig=([^;]+);/,
    "  function frameThumbData(fr){\n    const staticBg=ensureProjectBackground(projects[pi],W,H);const sig=$1+':bg:'+(staticBg._v||0)+':'+(staticBg.visible!==false?1:0)+':'+staticBg.opacity+':'+staticBg.blend;",'frame thumbnail signature');
  html = replacePattern(html,/    try\{ g\.drawImage\(frameComposite\(fr[^\n]*\),0,0,t\.width,t\.height\); \}catch\(_\)\{ \}/,
    "    try{drawProjectBackground(g,projects[pi],t.width,t.height);g.drawImage(frameComposite(fr),0,0,t.width,t.height);}catch(_){ }",'frame thumbnail background');
  html = replacePattern(html,/  function refreshCurrentThumb\(\)\{\n/,
    "$&    if(backgroundEditing()){refreshFrames();rebuildGallery();return;}\n",'all thumbnails refresh after background');
  html = replacePattern(html,/    return `\$\{P\.w\}x\$\{P\.h\}:\$\{P\.paper\}:\$\{P\.canvasShape\|\|'square'\}:\$\{P\.cur\|\|0\}:\$\{fr\._v\|\|0\}:\$\{layerSig\}`;/,
    "    const staticBg=ensureProjectBackground(P,P.w,P.h);return `${P.w}x${P.h}:${P.paper}:${P.canvasShape||'square'}:${P.cur||0}:${fr._v||0}:bg:${staticBg._v||0}:${staticBg.visible!==false?1:0}:${staticBg.opacity}:${staticBg.blend}:${layerSig}`;",'gallery thumbnail signature');
  html = replacePattern(html,/    tc\.drawImage\(frameComposite\(fr[^\n]*\), 0,0, t\.width, t\.height\);/,
    "    drawProjectBackground(tc,P,t.width,t.height);$&",'gallery thumbnail background');

  html = replacePattern(html,/P\.frames=\[newFrame\(P\.w\|\|W0,P\.h\|\|H0\)\]; P\.holds=\[1\]; P\.cur=0; P\.undo=\[\]; P\.redo=\[\];/,
    "$&P.background=newBackground(P.w||W0,P.h||H0);P.backgroundActive=false;",'clear project background');

  html = replacePattern(html,/for\(const fr0 of framesSrc\) n \+= upgradeFrame\(fr0,w,h\)\.layers\.length;/,
    "n+=1;$&",'archive layer count includes background');
  html = replacePattern(html,/    const framesSrc=\(P\.frames&&P\.frames\.length\?P\.frames:\[newFrame\(w,h\)\]\);\n    const framesOut=\[\];/,
    "    const framesSrc=(P.frames&&P.frames.length?P.frames:[newFrame(w,h)]);\n    const staticBg=ensureProjectBackground(P,w,h);const background={visible:staticBg.visible!==false,opacity:typeof staticBg.opacity==='number'?staticBg.opacity:1,blend:staticBg.blend||'source-over',png:await canvasPngDataUrl(staticBg.canvas)};if(onLayer)onLayer();\n    const framesOut=[];",'archive background serialize');
  html = replacePattern(html,/paper:P\.paper\|\|DEFAULT_PAPER, canvasShape:P\.canvasShape==='circle'\?'circle':'square',/,
    "$& background,",'archive background field');
  html = replacePattern(html,/return \{ v:3, app:'InkFrame Studio'/,"return { v:4, app:'InkFrame Studio'",'archive version 4');
  html = replacePattern(html,/for\(const P of list\)\{\n      const srcFrames=/,
    "for(const P of list){\n      if(P.background)n+=1;const srcFrames=",'archive payload count');
  html = replacePattern(html,/      const srcFrames=\(Array\.isArray\(P\.frames\)[\s\S]*?\n      const framesOut=\[\];/,
    match=>match.replace('\n      const framesOut=[];',"\n      const background=newBackground(w,h);if(P.background){background.canvas=await loadArchiveCanvas(P.background.png||P.background.dataUrl||P.background.data,w,h);background.visible=P.background.visible!==false;background.opacity=typeof P.background.opacity==='number'?P.background.opacity:1;background.blend=P.background.blend||'source-over';if(onLayer)onLayer();}\n      const framesOut=[];"),'archive background restore');
  html = replacePattern(html,/canvasShape:P\.canvasShape==='circle'\?'circle':'square' \}\);/,
    "canvasShape:P.canvasShape==='circle'?'circle':'square', background, backgroundActive:false });",'restored background field');

  html = replacePattern(html,/function flattenFrame\(frame, width, height\)/,"function flattenFrame(P, frame, width, height)",'GIF project argument');
  html = replacePattern(html,/      const fr = upgradeFrame\(frame, width, height\);/,
    "      drawProjectBackground(g,P,width,height);\n      const fr = upgradeFrame(frame, width, height);",'GIF background');
  html = html.replaceAll('flattenFrame(P.frames[frameIndex], width, height)','flattenFrame(P, P.frames[frameIndex], width, height)');
  html = replacePattern(html,/        const fr = upgradeFrame\(P\.frames\[frameIndex\], width, height\);/,
    "        drawProjectBackground(g,P,width,height);\n        const fr = upgradeFrame(P.frames[frameIndex], width, height);",'video background');
  html = replacePattern(html,/    newLayer:\s+newLayer,\n    newFrame:/,
    "    newLayer:      newLayer,\n    newBackground: newBackground,\n    newFrame:",'autosave background factory');

  html = replacePattern(html,/  function activeLayer\(\)\{ const fr=frames\[cur\]; return fr && fr\.layers\[fr\.active\]; \}/,
    "  function activeLayer(){if(backgroundEditing())return ensureProjectBackground(projects[pi],W,H);const fr=frames[cur];return fr&&fr.layers[fr.active];}\n  function setBackgroundEditing(on){const P=projects[pi];P.backgroundActive=!!on;ensureProjectBackground(P,W,H);refreshFctx();render();refreshLayers();window.dispatchEvent(new Event('inkframe:layers'));}\n  function requireFrameLayer(){if(backgroundEditing()){flash('Select a frame layer first');return false;}return true;}",'layer background target');
  for(const name of ['kLayAdd','kLayDup','kLayDel','kLayUp','kLayDn','kLayMerge','kLayFlat']){
    html = replacePattern(html,new RegExp(`  const ${name}=lAct\\([^\\n]+=>\\{`),m=>m+'\n    if(!requireFrameLayer())return;',`${name} background guard`);
  }
  html = replacePattern(html,/  const kLayImp=lAct\('@imp','Import',\(\)=>\{/,
    "$&\n    if(!requireFrameLayer())return;",'import background guard');
  html = replacePattern(html,/  const layerOpDial=kidEl/,
    "  const kLayBg=lAct('@paper','BG',()=>setBackgroundEditing(!backgroundEditing()));\n  const layerOpDial=kidEl",'BG radial option');
  html = replacePattern(html,/        fr\.active=i; refreshFctx\(\); render\(\); refreshLayers\(\);/,
    "        projects[pi].backgroundActive=false;fr.active=i; refreshFctx(); render(); refreshLayers();",'frame layer exits BG');
  html = replacePattern(html,/    \/\/ Top layer first in the branch/,
    "    const staticBg=ensureProjectBackground(projects[pi],W,H);const bg=kidEl({glyph:'BG'});bg.style.width='38px';bg.style.height='38px';bg.style.margin='-19px 0 0 -19px';bg.title='Static background · shared across all frames';if(staticBg.visible===false)bg.style.opacity='0.35';if(backgroundEditing())bg.classList.add('on');bg.addEventListener('click',e=>{e.stopPropagation();setBackgroundEditing(true);});wrap.appendChild(bg);\n    // Top layer first in the branch",'BG stack option');
  html = replacePattern(html,/      const eyeG=kLayEye\.querySelector\('\.glyph'\);/,
    "      kLayBg.classList.toggle('on',backgroundEditing());const eyeG=kLayEye.querySelector('.glyph');",'BG radial state');

  for(const marker of ['newBackground','ensureProjectBackground','drawProjectBackground','backgroundPixels','backgroundStruct',"return { v:4, app:'InkFrame Studio'","const kLayBg=lAct('@paper','BG'",'newBackground: newBackground']){
    if(!html.includes(marker))throw new Error(`Static background verification failed: ${marker}`);
  }
  return html;
}
