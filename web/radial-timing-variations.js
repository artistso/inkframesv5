// InkFrame — deterministic timing-recipe variation lab
'use strict';
(function(root){
  const MAX_PHASE_VARIANTS=12;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clampHold=value=>Math.max(1,Math.min(8,Math.round(finite(value,1))));
  const normalizeValues=values=>{
    const recipes=root.InkFrameRadialRecipes;
    return Object.freeze(Array.from(recipes&&typeof recipes.normalizeValues==='function'?recipes.normalizeValues(values):(Array.isArray(values)?values:[]).map(clampHold)));
  };
  const canonicalValues=values=>{
    const recipes=root.InkFrameRadialRecipes,normalized=normalizeValues(values);
    return Object.freeze(Array.from(recipes&&typeof recipes.minimalPeriod==='function'?recipes.minimalPeriod(normalized):normalized));
  };
  const signature=values=>Array.from(normalizeValues(values)).join(',');
  const rotate=(values,phase)=>{
    const recipes=root.InkFrameRadialRecipes;
    if(recipes&&typeof recipes.rotateValues==='function')return Object.freeze(Array.from(recipes.rotateValues(values,phase)));
    const source=Array.from(normalizeValues(values));if(!source.length)return Object.freeze([]);
    const offset=((Math.floor(finite(phase,0))%source.length)+source.length)%source.length;
    return Object.freeze(source.map((_,index)=>source[(index+offset)%source.length]));
  };

  function reverseValues(values){return Object.freeze(Array.from(normalizeValues(values)).reverse());}
  function palindromeValues(values){
    const source=Array.from(normalizeValues(values));if(source.length<2)return Object.freeze(source);
    const reflected=source.slice(0,-1).reverse();return Object.freeze(source.concat(reflected).slice(0,120));
  }
  function pulseValues(values){
    const source=Array.from(normalizeValues(values));
    if(source.length===1)return Object.freeze([Math.min(8,source[0]+1),Math.max(1,source[0]-1)]);
    return Object.freeze(source.map((value,index)=>index%2===0?Math.min(8,value+1):Math.max(1,value-1)));
  }
  function compressValues(values){return Object.freeze(Array.from(normalizeValues(values),value=>Math.max(1,value-1)));}
  function expandValues(values){return Object.freeze(Array.from(normalizeValues(values),value=>Math.min(8,value+1)));}

  function generateVariations(values){
    const source=canonicalValues(values);if(!source.length)return Object.freeze([]);
    const result=[],seen=new Set();
    const add=(id,label,kind,nextValues,meta)=>{
      const normalized=canonicalValues(nextValues),key=signature(normalized);if(!normalized.length||seen.has(key))return false;
      seen.add(key);result.push(Object.freeze(Object.assign({id,label,kind,values:normalized,signature:key},meta||{})));return true;
    };
    for(let phase=0;phase<source.length&&phase<MAX_PHASE_VARIANTS;phase++){
      add(`phase-${phase}`,phase===0?'Original':`Phase ${phase+1}`,'phase',rotate(source,phase),{phase});
    }
    add('reverse','Reverse','reverse',reverseValues(source));
    add('palindrome','Palindrome','palindrome',palindromeValues(source));
    add('pulse','Pulse','pulse',pulseValues(source));
    add('compress','Compress','compress',compressValues(source));
    add('expand','Expand','expand',expandValues(source));
    return Object.freeze(result);
  }

  function variationName(recipe,variation){
    const base=recipe&&recipe.name?String(recipe.name):'Recipe',label=variation&&variation.label?String(variation.label):'Variation';
    return `${base} · ${label}`.slice(0,32);
  }
  function baseRecipe(environment){
    const recipes=root.InkFrameRadialRecipes;if(!recipes||!environment)return null;
    const snapshot=recipes.viewSnapshot(environment.project),id=snapshot&&snapshot.selectedId;return id?recipes.store.find(id):null;
  }

  const projectViews=new WeakMap();
  const fallbackView={open:false,baseId:null,selectedVariationId:null,preview:false};
  function viewFor(environment){
    const project=environment&&environment.project;
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);if(!view){view={open:false,baseId:null,selectedVariationId:null,preview:false};projectViews.set(project,view);}return view;
    }
    return fallbackView;
  }
  function ensureSelection(environment,view){
    const recipe=baseRecipe(environment),variations=recipe?generateVariations(recipe.values):Object.freeze([]);
    if(!recipe){view.baseId=null;view.selectedVariationId=null;view.preview=false;return {recipe:null,variations,selected:null};}
    if(view.baseId!==recipe.id){view.baseId=recipe.id;view.selectedVariationId=variations[0]&&variations[0].id||null;view.preview=false;}
    let selected=variations.find(item=>item.id===view.selectedVariationId)||variations[0]||null;
    if(selected)view.selectedVariationId=selected.id;else view.selectedVariationId=null;
    return {recipe,variations,selected};
  }
  function viewSnapshot(project){
    const view=project&&projectViews.get(project)||fallbackView;
    return Object.freeze({open:!!view.open,baseId:view.baseId||null,selectedVariationId:view.selectedVariationId||null,preview:!!view.preview});
  }
  function canEdit(environment){
    if(environment&&typeof environment.canEditTiming==='function')return environment.canEditTiming()!==false;
    return !(environment&&typeof environment.canNavigate==='function')||environment.canNavigate()!==false;
  }

  let lastBoard=null,lastEnvironment=null,lastPlan=null,styleInstalled=false,rendering=false,refreshQueued=false;
  function scheduleRefresh(full){
    if(refreshQueued)return;refreshQueued=true;
    const run=()=>{
      refreshQueued=false;if(!lastBoard||!lastEnvironment)return;
      if(full&&root.InkFrameRadialTimeline&&typeof root.InkFrameRadialTimeline.render==='function')root.InkFrameRadialTimeline.render(lastBoard,lastEnvironment);
      else render(lastBoard,lastEnvironment);
    };
    if(root&&typeof root.setTimeout==='function')root.setTimeout(run,0);else run();
  }
  function assignmentsForVariation(environment,variation){
    const patterns=root.InkFrameRadialPatterns;if(!patterns||!variation)return Object.freeze([]);
    const scope=patterns.resolveTargetIndices(environment),pattern=Object.freeze({id:`variation:${variation.id}`,label:variation.label,values:variation.values});
    return patterns.assignmentsForPattern(pattern,scope.indices,environment.holdAt);
  }
  function applySelected(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;
    const patterns=root.InkFrameRadialPatterns,view=viewFor(lastEnvironment),state=ensureSelection(lastEnvironment,view);
    if(!patterns||!state.recipe||!state.selected||typeof patterns.commitAssignments!=='function')return false;
    const scope=patterns.resolveTargetIndices(lastEnvironment),assignments=assignmentsForVariation(lastEnvironment,state.selected);
    return patterns.commitAssignments({id:`variation:${state.recipe.id}:${state.selected.id}`,label:variationName(state.recipe,state.selected),scope:scope.kind},assignments);
  }
  function saveSelected(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return null;
    const recipes=root.InkFrameRadialRecipes,view=viewFor(lastEnvironment),state=ensureSelection(lastEnvironment,view);
    if(!recipes||!state.recipe||!state.selected)return null;
    const saved=recipes.store.save(variationName(state.recipe,state.selected),state.selected.values);scheduleRefresh(true);return saved;
  }

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;const style=document.createElement('style');style.dataset.inkframeVariationStyle='true';
    style.textContent=`
.inkframe-variation-toggle[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent))!important;border-color:var(--rim)!important}
.inkframe-variation-shelf{position:absolute;left:50%;top:-300px;transform:translateX(-50%);z-index:14;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;max-width:min(95vw,900px);padding:7px;border-radius:18px;background:rgba(10,0,10,.86);border:1px solid rgba(247,202,201,.36);box-shadow:0 12px 30px rgba(10,0,10,.55),inset 0 1px 0 rgba(255,255,255,.17);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.inkframe-variation-shelf button{min-height:31px;padding:6px 9px;border-radius:999px;border:1px solid rgba(247,202,201,.30);background:rgba(255,240,243,.07);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.035em;text-transform:uppercase;touch-action:manipulation}
.inkframe-variation-shelf button[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}.inkframe-variation-shelf button:disabled{opacity:.32}
.inkframe-variation-list{display:flex;gap:4px;max-width:500px;overflow-x:auto;scrollbar-width:thin}.inkframe-variation-status{min-width:165px;color:var(--blush);font:800 9px/1.2 var(--font-ui);text-align:center;white-space:nowrap}
.inkframe-variation-preview-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:4}.inkframe-variation-preview-arc{fill:none;stroke:#fff0a8;stroke-width:7.2;stroke-linecap:round;stroke-dasharray:10 4 2 4;vector-effect:non-scaling-stroke;opacity:.94;filter:drop-shadow(0 0 8px rgba(255,240,168,.96)) drop-shadow(0 0 14px rgba(187,0,55,.82))}
@media (pointer:coarse){.inkframe-variation-shelf button{min-height:39px;padding:7px 11px}}
@media (prefers-reduced-motion:reduce){.inkframe-variation-preview-arc{filter:none}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }
  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className||'';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(canEdit(lastEnvironment))handler();});return button;
  }
  function createPreview(document,board,plan,environment,variation){
    const timing=root.InkFrameRadialTiming,assignments=assignmentsForVariation(environment,variation);if(!timing||!assignments.length)return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('inkframe-variation-preview-svg');svg.setAttribute('viewBox',`0 0 ${plan.metrics.width} ${plan.metrics.height}`);svg.setAttribute('aria-hidden','true');
    for(const entry of assignments){const slot=plan.slots[entry.index];if(!slot)continue;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.classList.add('inkframe-variation-preview-arc');path.dataset.frame=String(entry.index);path.dataset.hold=String(entry.after);path.setAttribute('d',timing.holdArcPath(plan,slot,entry.after));svg.appendChild(path);}
    board.appendChild(svg);
  }
  function createShelf(document,board,environment,view,state){
    const patterns=root.InkFrameRadialPatterns,scope=patterns.resolveTargetIndices(environment),shelf=document.createElement('div');
    shelf.className='inkframe-variation-shelf';shelf.setAttribute('role','toolbar');shelf.setAttribute('aria-label','Timing recipe variations');
    const status=document.createElement('span');status.className='inkframe-variation-status';status.textContent=state.recipe&&state.selected?`${state.recipe.name} · ${state.selected.label} · ${scope.label}`:'Select a saved recipe';shelf.appendChild(status);
    const list=document.createElement('div');list.className='inkframe-variation-list';list.setAttribute('role','listbox');list.setAttribute('aria-label','Generated timing variations');
    for(const variation of state.variations){
      const button=makeButton(document,variation.label,'inkframe-variation-item',()=>{view.selectedVariationId=variation.id;scheduleRefresh(false);});button.dataset.variation=variation.id;button.dataset.kind=variation.kind;
      const active=state.selected&&state.selected.id===variation.id;button.setAttribute('role','option');button.setAttribute('aria-selected',active?'true':'false');button.setAttribute('aria-pressed',active?'true':'false');list.appendChild(button);
    }
    shelf.appendChild(list);
    const preview=makeButton(document,'Preview','inkframe-variation-preview',()=>{view.preview=!view.preview;scheduleRefresh(false);});preview.setAttribute('aria-pressed',view.preview?'true':'false');preview.disabled=!state.selected;shelf.appendChild(preview);
    const apply=makeButton(document,'Apply','inkframe-variation-apply',applySelected);apply.disabled=!state.selected;shelf.appendChild(apply);
    const save=makeButton(document,'Save Copy','inkframe-variation-save',saveSelected);save.disabled=!state.selected;shelf.appendChild(save);
    board.appendChild(shelf);
  }
  function cycleSelection(environment,view,delta){
    const state=ensureSelection(environment,view);if(!state.variations.length)return false;
    const index=Math.max(0,state.variations.findIndex(item=>item.id===view.selectedVariationId)),next=(index+delta+state.variations.length)%state.variations.length;
    view.selectedVariationId=state.variations[next].id;return true;
  }
  function installBoard(board){
    if(!board||board._inkframeVariationsInstalled)return;board._inkframeVariationsInstalled=true;
    board.addEventListener('keydown',event=>{
      if(!lastEnvironment||!canEdit(lastEnvironment))return;
      const tag=event.target&&event.target.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
      const view=viewFor(lastEnvironment);if(!view.open)return;let handled=true;
      if(event.key.toLowerCase()==='j')cycleSelection(lastEnvironment,view,-1);
      else if(event.key.toLowerCase()==='k')cycleSelection(lastEnvironment,view,1);
      else if(event.key.toLowerCase()==='b')view.preview=!view.preview;
      else if(event.key.toLowerCase()==='a')applySelected();
      else if(event.key.toLowerCase()==='s')saveSelected();
      else handled=false;
      if(handled){event.preventDefault();event.stopImmediatePropagation();scheduleRefresh(false);}
    },true);
    if(typeof root.MutationObserver==='function'){
      const observer=new root.MutationObserver(()=>{
        if(rendering||refreshQueued||!lastBoard||board!==lastBoard)return;const recipeShelf=board.querySelector('.inkframe-recipe-shelf');
        const missing=recipeShelf&&!recipeShelf.querySelector('.inkframe-variation-toggle'),stale=!recipeShelf&&(board.querySelector('.inkframe-variation-shelf')||board.querySelector('.inkframe-variation-preview-svg'));
        if(missing||stale)scheduleRefresh(false);
      });observer.observe(board,{childList:true,subtree:true});board._inkframeVariationsObserver=observer;
    }
  }
  function render(board,environment){
    const radial=root.InkFrameRadialTimeline,recipes=root.InkFrameRadialRecipes,patterns=root.InkFrameRadialPatterns,plan=radial&&radial.lastLayout,document=board&&board.ownerDocument;
    if(!board||!document||!plan||!recipes||!patterns)return false;lastBoard=board;lastEnvironment=environment||{};lastPlan=plan;installStyle(document);installBoard(board);rendering=true;
    try{
      for(const node of board.querySelectorAll('.inkframe-variation-shelf,.inkframe-variation-preview-svg,.inkframe-variation-toggle'))node.remove();
      const recipeShelf=board.querySelector('.inkframe-recipe-shelf'),view=viewFor(lastEnvironment);if(!recipeShelf){view.open=false;view.preview=false;return true;}
      const state=ensureSelection(lastEnvironment,view),toggle=makeButton(document,'Variations','inkframe-variation-toggle',()=>{view.open=!view.open;scheduleRefresh(false);});
      toggle.setAttribute('aria-pressed',view.open?'true':'false');toggle.title='Generate deterministic timing-recipe siblings';recipeShelf.appendChild(toggle);
      if(view.open)createShelf(document,board,lastEnvironment,view,state);if(view.open&&view.preview&&state.selected)createPreview(document,board,plan,lastEnvironment,state.selected);return true;
    }finally{rendering=false;}
  }
  function installIntoRadial(){
    const radial=root.InkFrameRadialTimeline;if(!radial||radial.__radialVariationsPatched)return false;const originalRender=radial.render;
    radial.render=function(board,environment){const result=originalRender.call(radial,board,environment);if(result)render(board,environment);return result;};radial.__radialVariationsPatched=true;return true;
  }

  const api={
    MAX_PHASE_VARIANTS,normalizeValues,canonicalValues,signature,rotate,reverseValues,palindromeValues,pulseValues,compressValues,expandValues,
    generateVariations,variationName,baseRecipe,assignmentsForVariation,applySelected,saveSelected,render,viewSnapshot,installIntoRadial,
    projectCanvasWrites:0,artworkUndoWrites:0,timelineTimingWrites:true,projectSchemaWrites:0,deviceLibraryWrites:true,randomWrites:0,
  };
  root.InkFrameRadialVariations=api;installIntoRadial();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
