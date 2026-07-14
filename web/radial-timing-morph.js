// InkFrame — deterministic timing-recipe morph lab
'use strict';
(function(root){
  const MAX_ALIGNED_VALUES=120;
  const SNAP_POINTS=Object.freeze([0,25,50,75,100]);
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clampHold=value=>Math.max(1,Math.min(8,Math.round(finite(value,1))));
  const clampMix=value=>Math.max(0,Math.min(100,Math.round(finite(value,50))));
  const normalizeValues=values=>{
    const recipes=root.InkFrameRadialRecipes;
    return Object.freeze(Array.from(recipes&&typeof recipes.normalizeValues==='function'?recipes.normalizeValues(values):(Array.isArray(values)?values:[]).map(clampHold)));
  };
  const canonicalValues=values=>{
    const recipes=root.InkFrameRadialRecipes,normalized=normalizeValues(values);
    return Object.freeze(Array.from(recipes&&typeof recipes.minimalPeriod==='function'?recipes.minimalPeriod(normalized):normalized));
  };
  const signature=values=>Array.from(normalizeValues(values)).join(',');

  function greatestCommonDivisor(a,b){
    let left=Math.max(1,Math.floor(Math.abs(finite(a,1)))),right=Math.max(1,Math.floor(Math.abs(finite(b,1))));
    while(right){const next=left%right;left=right;right=next;}return left;
  }
  function alignmentLength(aLength,bLength,maximum){
    const left=Math.max(1,Math.floor(finite(aLength,1))),right=Math.max(1,Math.floor(finite(bLength,1))),limit=Math.max(1,Math.floor(finite(maximum,MAX_ALIGNED_VALUES)));
    return Math.min(limit,(left/greatestCommonDivisor(left,right))*right);
  }
  function expandValues(values,length){
    const source=Array.from(normalizeValues(values)),size=Math.max(0,Math.floor(finite(length,0)));if(!source.length||!size)return Object.freeze([]);
    return Object.freeze(Array.from({length:size},(_,index)=>source[index%source.length]));
  }
  function blendValues(aValues,bValues,mixValue){
    const sourceA=canonicalValues(aValues),sourceB=canonicalValues(bValues);if(!sourceA.length||!sourceB.length)return Object.freeze([]);
    const mix=clampMix(mixValue),length=alignmentLength(sourceA.length,sourceB.length,MAX_ALIGNED_VALUES),expandedA=expandValues(sourceA,length),expandedB=expandValues(sourceB,length),ratio=mix/100;
    const blended=expandedA.map((value,index)=>clampHold(value+(expandedB[index]-value)*ratio));return canonicalValues(blended);
  }
  function blendName(sourceA,sourceB,mixValue){
    const left=String(sourceA&&sourceA.name||'A'),right=String(sourceB&&sourceB.name||'B'),mix=clampMix(mixValue),maximum=32,separator=' ↔ ',tail=` · ${mix}%`;
    const available=Math.max(2,maximum-separator.length-tail.length),leftBudget=Math.max(1,Math.ceil(available/2)),rightBudget=Math.max(1,available-leftBudget);
    return `${left.slice(0,leftBudget)}${separator}${right.slice(0,rightBudget)}${tail}`.slice(0,maximum);
  }
  function createBlend(sourceA,sourceB,mixValue){
    if(!sourceA||!sourceB)return null;const mix=clampMix(mixValue),values=blendValues(sourceA.values,sourceB.values,mix);if(!values.length)return null;
    return Object.freeze({
      id:`morph:${sourceA.id}:${sourceB.id}:${mix}`,label:blendName(sourceA,sourceB,mix),mix,
      sourceAId:sourceA.id,sourceBId:sourceB.id,alignmentLength:alignmentLength(sourceA.values.length,sourceB.values.length,MAX_ALIGNED_VALUES),
      values,signature:signature(values),
    });
  }

  const projectViews=new WeakMap();
  const fallbackView={open:false,sourceAId:null,sourceBId:null,mix:50,preview:false};
  function viewFor(environment){
    const project=environment&&environment.project;
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);if(!view){view={open:false,sourceAId:null,sourceBId:null,mix:50,preview:false};projectViews.set(project,view);}return view;
    }
    return fallbackView;
  }
  function recipeLibrary(){
    const recipes=root.InkFrameRadialRecipes;return recipes&&recipes.store&&typeof recipes.store.snapshot==='function'?recipes.store.snapshot().recipes:[];
  }
  function ensureState(environment,view){
    const recipes=root.InkFrameRadialRecipes,library=recipeLibrary(),find=id=>library.find(item=>item.id===id)||null;
    const selectedId=recipes&&typeof recipes.viewSnapshot==='function'?recipes.viewSnapshot(environment&&environment.project).selectedId:null;
    if(!find(view.sourceAId))view.sourceAId=find(selectedId)?.id||library[0]?.id||null;
    if(!find(view.sourceBId))view.sourceBId=library.find(item=>item.id!==view.sourceAId)?.id||library[0]?.id||null;
    view.mix=clampMix(view.mix);const sourceA=find(view.sourceAId),sourceB=find(view.sourceBId),blend=createBlend(sourceA,sourceB,view.mix);
    if(!blend)view.preview=false;return {library,sourceA,sourceB,blend};
  }
  function viewSnapshot(project){
    const view=project&&projectViews.get(project)||fallbackView;
    return Object.freeze({open:!!view.open,sourceAId:view.sourceAId||null,sourceBId:view.sourceBId||null,mix:clampMix(view.mix),preview:!!view.preview,recipeCount:recipeLibrary().length});
  }
  function canEdit(environment){
    if(environment&&typeof environment.canEditTiming==='function')return environment.canEditTiming()!==false;
    return !(environment&&typeof environment.canNavigate==='function')||environment.canNavigate()!==false;
  }

  let lastBoard=null,lastEnvironment=null,lastPlan=null,styleInstalled=false,rendering=false,refreshQueued=false;
  function scheduleRefresh(full){
    if(refreshQueued)return;refreshQueued=true;
    const run=()=>{refreshQueued=false;if(!lastBoard||!lastEnvironment)return;if(full&&root.InkFrameRadialTimeline&&typeof root.InkFrameRadialTimeline.render==='function')root.InkFrameRadialTimeline.render(lastBoard,lastEnvironment);else render(lastBoard,lastEnvironment);};
    if(root&&typeof root.setTimeout==='function')root.setTimeout(run,0);else run();
  }
  function assignmentsForBlend(environment,blend){
    const patterns=root.InkFrameRadialPatterns;if(!patterns||!blend)return Object.freeze([]);
    const scope=patterns.resolveTargetIndices(environment),pattern=Object.freeze({id:blend.id,label:blend.label,values:blend.values});
    return patterns.assignmentsForPattern(pattern,scope.indices,environment.holdAt);
  }
  function applyBlend(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;
    const patterns=root.InkFrameRadialPatterns,view=viewFor(lastEnvironment),state=ensureState(lastEnvironment,view);if(!patterns||!state.blend||typeof patterns.commitAssignments!=='function')return false;
    const scope=patterns.resolveTargetIndices(lastEnvironment),assignments=assignmentsForBlend(lastEnvironment,state.blend);
    return patterns.commitAssignments({id:state.blend.id,label:state.blend.label,scope:scope.kind},assignments);
  }
  function saveBlend(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return null;
    const recipes=root.InkFrameRadialRecipes,view=viewFor(lastEnvironment),state=ensureState(lastEnvironment,view);if(!recipes||!state.blend)return null;
    const saved=recipes.store.save(state.blend.label,state.blend.values);scheduleRefresh(true);return saved;
  }
  function setMix(value){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const view=viewFor(lastEnvironment);view.mix=clampMix(value);scheduleRefresh(false);return view.mix;
  }
  function swapSources(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const view=viewFor(lastEnvironment),previous=view.sourceAId;view.sourceAId=view.sourceBId;view.sourceBId=previous;view.mix=100-clampMix(view.mix);scheduleRefresh(false);return true;
  }

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;const style=document.createElement('style');style.dataset.inkframeMorphStyle='true';
    style.textContent=`
.inkframe-morph-toggle[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent))!important;border-color:var(--rim)!important}
.inkframe-morph-shelf{position:absolute;left:50%;top:-372px;transform:translateX(-50%);z-index:16;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;max-width:min(96vw,960px);padding:7px;border-radius:18px;background:rgba(10,0,10,.89);border:1px solid rgba(184,255,245,.40);box-shadow:0 14px 34px rgba(10,0,10,.58),inset 0 1px 0 rgba(255,255,255,.18);backdrop-filter:blur(13px);-webkit-backdrop-filter:blur(13px)}
.inkframe-morph-shelf button,.inkframe-morph-shelf select,.inkframe-morph-shelf input{min-height:31px;padding:6px 9px;border-radius:999px;border:1px solid rgba(184,255,245,.32);background:rgba(240,255,253,.07);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.035em}.inkframe-morph-shelf button{text-transform:uppercase;touch-action:manipulation}.inkframe-morph-shelf button[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}.inkframe-morph-shelf button:disabled{opacity:.32}
.inkframe-morph-source{max-width:154px}.inkframe-morph-range{width:150px;accent-color:var(--accent)}.inkframe-morph-output{min-width:42px;color:#b8fff5;font:900 10px/1 var(--font-ui);text-align:center}.inkframe-morph-status{min-width:190px;color:#b8fff5;font:800 9px/1.2 var(--font-ui);text-align:center;white-space:nowrap}
.inkframe-morph-preview-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:5}.inkframe-morph-preview-arc{fill:none;stroke:#b8fff5;stroke-width:7.4;stroke-linecap:round;stroke-dasharray:12 4 3 4;vector-effect:non-scaling-stroke;opacity:.95;filter:drop-shadow(0 0 8px rgba(184,255,245,.98)) drop-shadow(0 0 15px rgba(187,0,55,.78))}
@media (pointer:coarse){.inkframe-morph-shelf button,.inkframe-morph-shelf select,.inkframe-morph-shelf input{min-height:39px;padding:7px 11px}.inkframe-morph-range{width:180px}}
@media (prefers-reduced-motion:reduce){.inkframe-morph-preview-arc{filter:none}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }
  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className||'';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(canEdit(lastEnvironment))handler();});return button;
  }
  function makeSourceSelect(document,label,library,value,onChange){
    const select=document.createElement('select');select.className='inkframe-morph-source';select.setAttribute('aria-label',label);
    for(const recipe of library){const option=document.createElement('option');option.value=recipe.id;option.textContent=recipe.name;option.selected=recipe.id===value;select.appendChild(option);}
    select.addEventListener('change',event=>{event.stopPropagation();if(!canEdit(lastEnvironment)){scheduleRefresh(false);return;}onChange(select.value);scheduleRefresh(false);});return select;
  }
  function createPreview(document,board,plan,environment,blend){
    const timing=root.InkFrameRadialTiming,assignments=assignmentsForBlend(environment,blend);if(!timing||!assignments.length)return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('inkframe-morph-preview-svg');svg.setAttribute('viewBox',`0 0 ${plan.metrics.width} ${plan.metrics.height}`);svg.setAttribute('aria-hidden','true');
    for(const entry of assignments){const slot=plan.slots[entry.index];if(!slot)continue;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.classList.add('inkframe-morph-preview-arc');path.dataset.frame=String(entry.index);path.dataset.hold=String(entry.after);path.setAttribute('d',timing.holdArcPath(plan,slot,entry.after));svg.appendChild(path);}board.appendChild(svg);
  }
  function createShelf(document,board,environment,view,state){
    const patterns=root.InkFrameRadialPatterns,scope=patterns.resolveTargetIndices(environment),shelf=document.createElement('div');shelf.className='inkframe-morph-shelf';shelf.setAttribute('role','toolbar');shelf.setAttribute('aria-label','Timing recipe morph lab');
    const status=document.createElement('span');status.className='inkframe-morph-status';status.textContent=state.blend?`${100-state.blend.mix}% A · ${state.blend.mix}% B · ${scope.label} · ${state.blend.values.join('·')}`:'Save two recipes to create a morph';shelf.appendChild(status);
    shelf.appendChild(makeSourceSelect(document,'Morph source A',state.library,view.sourceAId,value=>{view.sourceAId=value;}));
    shelf.appendChild(makeButton(document,'Swap','inkframe-morph-swap',swapSources));
    shelf.appendChild(makeSourceSelect(document,'Morph source B',state.library,view.sourceBId,value=>{view.sourceBId=value;}));
    const range=document.createElement('input');range.className='inkframe-morph-range';range.type='range';range.min='0';range.max='100';range.step='1';range.value=String(view.mix);range.setAttribute('aria-label','Recipe B mix percentage');range.addEventListener('input',event=>{event.stopPropagation();if(!canEdit(lastEnvironment)){scheduleRefresh(false);return;}view.mix=clampMix(range.value);scheduleRefresh(false);});shelf.appendChild(range);
    const output=document.createElement('output');output.className='inkframe-morph-output';output.textContent=`${clampMix(view.mix)}%`;shelf.appendChild(output);
    for(const point of SNAP_POINTS){const snap=makeButton(document,String(point),'inkframe-morph-snap',()=>setMix(point));snap.dataset.mix=String(point);snap.setAttribute('aria-pressed',clampMix(view.mix)===point?'true':'false');shelf.appendChild(snap);}
    const preview=makeButton(document,'Preview','inkframe-morph-preview',()=>{view.preview=!view.preview;scheduleRefresh(false);});preview.setAttribute('aria-pressed',view.preview?'true':'false');preview.disabled=!state.blend;shelf.appendChild(preview);
    const apply=makeButton(document,'Apply Blend','inkframe-morph-apply',applyBlend);apply.disabled=!state.blend;shelf.appendChild(apply);
    const save=makeButton(document,'Save Blend','inkframe-morph-save',saveBlend);save.disabled=!state.blend;shelf.appendChild(save);board.appendChild(shelf);
  }
  function installBoard(board){
    if(!board||board._inkframeMorphInstalled)return;board._inkframeMorphInstalled=true;
    board.addEventListener('keydown',event=>{
      if(!lastEnvironment||!canEdit(lastEnvironment))return;const tag=event.target&&event.target.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
      const view=viewFor(lastEnvironment);if(!view.open)return;let handled=true,key=event.key.toLowerCase();
      if(key==='n')view.mix=clampMix(view.mix-5);else if(key==='m')view.mix=clampMix(view.mix+5);else if(key==='w'){const previous=view.sourceAId;view.sourceAId=view.sourceBId;view.sourceBId=previous;view.mix=100-clampMix(view.mix);}
      else if(key==='p')view.preview=!view.preview;else if(key==='g')applyBlend();else if(key==='d')saveBlend();else handled=false;
      if(handled){event.preventDefault();event.stopImmediatePropagation();scheduleRefresh(false);}
    },true);
    if(typeof root.MutationObserver==='function'){
      const observer=new root.MutationObserver(()=>{
        if(rendering||refreshQueued||!lastBoard||board!==lastBoard)return;const recipeShelf=board.querySelector('.inkframe-recipe-shelf');
        const missing=recipeShelf&&!recipeShelf.querySelector('.inkframe-morph-toggle'),stale=!recipeShelf&&(board.querySelector('.inkframe-morph-shelf')||board.querySelector('.inkframe-morph-preview-svg'));
        if(missing||stale)scheduleRefresh(false);
      });observer.observe(board,{childList:true,subtree:true});board._inkframeMorphObserver=observer;
    }
  }
  function render(board,environment){
    const radial=root.InkFrameRadialTimeline,recipes=root.InkFrameRadialRecipes,patterns=root.InkFrameRadialPatterns,plan=radial&&radial.lastLayout,document=board&&board.ownerDocument;
    if(!board||!document||!plan||!recipes||!patterns)return false;lastBoard=board;lastEnvironment=environment||{};lastPlan=plan;installStyle(document);installBoard(board);rendering=true;
    try{
      for(const node of board.querySelectorAll('.inkframe-morph-shelf,.inkframe-morph-preview-svg,.inkframe-morph-toggle'))node.remove();
      const recipeShelf=board.querySelector('.inkframe-recipe-shelf'),view=viewFor(lastEnvironment);if(!recipeShelf){view.open=false;view.preview=false;return true;}
      const state=ensureState(lastEnvironment,view),toggle=makeButton(document,'Morph','inkframe-morph-toggle',()=>{view.open=!view.open;scheduleRefresh(false);});toggle.setAttribute('aria-pressed',view.open?'true':'false');toggle.title='Blend two saved timing recipes';recipeShelf.appendChild(toggle);
      if(view.open)createShelf(document,board,lastEnvironment,view,state);if(view.open&&view.preview&&state.blend)createPreview(document,board,plan,lastEnvironment,state.blend);return true;
    }finally{rendering=false;}
  }
  function installIntoRadial(){
    const radial=root.InkFrameRadialTimeline;if(!radial||radial.__radialMorphPatched)return false;const originalRender=radial.render;
    radial.render=function(board,environment){const result=originalRender.call(radial,board,environment);if(result)render(board,environment);return result;};radial.__radialMorphPatched=true;return true;
  }

  const api={
    MAX_ALIGNED_VALUES,SNAP_POINTS,clampMix,normalizeValues,canonicalValues,signature,greatestCommonDivisor,alignmentLength,expandValues,blendValues,blendName,createBlend,
    recipeLibrary,assignmentsForBlend,applyBlend,saveBlend,setMix,swapSources,render,viewSnapshot,installIntoRadial,
    projectCanvasWrites:0,artworkUndoWrites:0,timelineTimingWrites:true,projectSchemaWrites:0,deviceLibraryWrites:true,sourceRecipeWrites:0,randomWrites:0,
  };
  root.InkFrameRadialMorph=api;installIntoRadial();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
