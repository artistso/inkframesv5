// InkFrame — reusable radial timing recipes
'use strict';
(function(root){
  const STORAGE_KEY='inkframe.radialTiming.recipes.v1';
  const SCHEMA=1,MAX_RECIPES=24,MAX_NAME=32,MAX_ID=48,MAX_VALUES=120;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clampHold=value=>Math.max(1,Math.min(8,Math.round(finite(value,1))));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const cleanName=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,MAX_NAME);
  const cleanId=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,MAX_ID);
  const normalizeValues=value=>Object.freeze((Array.isArray(value)?value:[]).slice(0,MAX_VALUES).map(clampHold));

  function uniqueText(base,seen,maxLength,separator,normalizer){
    const normalize=normalizer||String;let candidate=String(base||'').slice(0,maxLength);
    if(!seen.has(normalize(candidate)))return candidate;
    for(let suffix=2;suffix<10000;suffix++){
      const tail=`${separator}${suffix}`;candidate=`${String(base||'').slice(0,Math.max(1,maxLength-tail.length))}${tail}`;
      if(!seen.has(normalize(candidate)))return candidate;
    }
    throw new Error('Unable to create a unique timing recipe identifier');
  }
  const uniqueId=(base,seen)=>uniqueText(base,seen,MAX_ID,'-',String);
  const uniqueName=(base,seen)=>uniqueText(base,seen,MAX_NAME,' ',value=>String(value).toLowerCase());

  function minimalPeriod(values){
    const source=Array.from(normalizeValues(values));if(!source.length)return Object.freeze([]);
    for(let size=1;size<=source.length;size++){
      if(source.length%size)continue;let matches=true;
      for(let index=size;index<source.length;index++)if(source[index]!==source[index%size]){matches=false;break;}
      if(matches)return Object.freeze(source.slice(0,size));
    }
    return Object.freeze(source);
  }
  function rotateValues(values,phase){
    const source=Array.from(normalizeValues(values));if(!source.length)return Object.freeze([]);
    const offset=((Math.floor(finite(phase,0))%source.length)+source.length)%source.length;
    return Object.freeze(source.map((_,index)=>source[(index+offset)%source.length]));
  }
  function transformValues(values,phase,reverse){
    let result=Array.from(rotateValues(values,phase));if(reverse)result.reverse();return Object.freeze(result);
  }
  function valuesSignature(values){return Array.from(normalizeValues(values)).join(',');}

  function sanitizeRecipe(value,index,now){
    const input=value&&typeof value==='object'?value:{},values=minimalPeriod(input.values);
    const createdAt=Number.isFinite(Number(input.createdAt))?Number(input.createdAt):now;
    const updatedAt=Number.isFinite(Number(input.updatedAt))?Number(input.updatedAt):createdAt;
    return {id:cleanId(input.id)||`recipe-${index+1}`,name:cleanName(input.name)||`Recipe ${index+1}`,createdAt,updatedAt,values:Array.from(values.length?values:[1])};
  }
  function sanitizeLibrary(value,nowValue){
    const now=Number.isFinite(Number(nowValue))?Number(nowValue):Date.now(),input=value&&typeof value==='object'?value:{},source=Array.isArray(input.recipes)?input.recipes:[];
    const seenIds=new Set(),seenNames=new Set(),recipes=[];
    for(let index=0;index<source.length&&recipes.length<MAX_RECIPES;index++){
      const recipe=sanitizeRecipe(source[index],index,now);recipe.id=uniqueId(recipe.id,seenIds);recipe.name=uniqueName(recipe.name,seenNames);
      seenIds.add(recipe.id);seenNames.add(recipe.name.toLowerCase());recipes.push(recipe);
    }
    return {schema:SCHEMA,recipes};
  }
  function createRecipeStore(storage,options){
    const opts=options||{},now=typeof opts.now==='function'?opts.now:()=>Date.now();let sequence=0;
    const makeId=typeof opts.makeId==='function'?opts.makeId:()=>`recipe-${now()}-${++sequence}`;
    let state=sanitizeLibrary({},now());const listeners=new Set();
    try{const raw=storage&&storage.getItem(STORAGE_KEY);if(raw)state=sanitizeLibrary(JSON.parse(raw),now());}catch(_){}
    const persist=()=>{try{if(storage)storage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){}};
    const snapshot=()=>clone(state),emit=()=>{for(const listener of listeners){try{listener(snapshot());}catch(_){}}};
    const commit=next=>{state=sanitizeLibrary(next,now());persist();emit();return snapshot();};
    const find=id=>state.recipes.find(item=>item.id===cleanId(id))||null;
    function save(name,values){
      const safeName=cleanName(name),core=minimalPeriod(values);if(!safeName)throw new Error('Recipe name is required');if(!core.length)throw new Error('Recipe values are required');
      const timestamp=now(),existing=state.recipes.find(item=>item.name.toLowerCase()===safeName.toLowerCase());let id,recipes;
      if(existing){id=existing.id;recipes=state.recipes.map(item=>item.id===id?Object.assign({},item,{name:safeName,updatedAt:timestamp,values:Array.from(core)}):item);}
      else{
        if(state.recipes.length>=MAX_RECIPES)throw new Error(`Maximum ${MAX_RECIPES} recipes reached`);
        const usedIds=new Set(state.recipes.map(item=>item.id));id=uniqueId(cleanId(makeId())||`recipe-${timestamp}`,usedIds);
        recipes=state.recipes.concat({id,name:safeName,createdAt:timestamp,updatedAt:timestamp,values:Array.from(core)});
      }
      commit({schema:SCHEMA,recipes});return clone(find(id));
    }
    function remove(id){const key=cleanId(id);if(!find(key))return false;commit({schema:SCHEMA,recipes:state.recipes.filter(item=>item.id!==key)});return true;}
    function rename(id,name){
      const key=cleanId(id),safeName=cleanName(name);if(!safeName||!find(key))return false;
      if(state.recipes.some(item=>item.id!==key&&item.name.toLowerCase()===safeName.toLowerCase()))return false;
      commit({schema:SCHEMA,recipes:state.recipes.map(item=>item.id===key?Object.assign({},item,{name:safeName,updatedAt:now()}):item)});return true;
    }
    function replaceLibrary(value){return commit(value);}
    function importJson(text){return replaceLibrary(JSON.parse(String(text||'')));}
    function exportJson(){return JSON.stringify(snapshot(),null,2);}
    function subscribe(listener){if(typeof listener!=='function')return()=>{};listeners.add(listener);return()=>listeners.delete(listener);}
    return {snapshot,find:id=>{const item=find(id);return item?clone(item):null;},save,remove,rename,replaceLibrary,importJson,exportJson,subscribe};
  }

  const storage=(()=>{try{return root.localStorage||null;}catch(_){return null;}})();
  const store=createRecipeStore(storage);
  const projectViews=new WeakMap();
  const fallbackView={open:false,selectedId:null,preview:false,phase:0,reverse:false,name:''};
  function viewFor(env){
    const project=env&&env.project;if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);if(!view){view={open:false,selectedId:null,preview:false,phase:0,reverse:false,name:''};projectViews.set(project,view);}return view;
    }
    return fallbackView;
  }
  function viewSnapshot(project){
    const view=project&&projectViews.get(project)||fallbackView;
    return Object.freeze({open:!!view.open,selectedId:view.selectedId||null,preview:!!view.preview,phase:Math.floor(finite(view.phase,0)),reverse:!!view.reverse,name:String(view.name||''),recipeCount:store.snapshot().recipes.length});
  }
  function selectedRecipe(view){return view&&view.selectedId?store.find(view.selectedId):null;}
  function canEdit(env){
    if(env&&typeof env.canEditTiming==='function')return env.canEditTiming()!==false;
    return !(env&&typeof env.canNavigate==='function')||env.canNavigate()!==false;
  }
  function scopeValues(env){
    const patterns=root.InkFrameRadialPatterns;if(!patterns||typeof patterns.resolveTargetIndices!=='function')return Object.freeze({scope:null,values:Object.freeze([])});
    const scope=patterns.resolveTargetIndices(env),values=scope.indices.map(index=>clampHold(typeof env.holdAt==='function'?env.holdAt(index):1));
    return Object.freeze({scope,values:Object.freeze(values)});
  }
  function recipePattern(recipe,view){
    if(!recipe)return null;return Object.freeze({id:`recipe:${recipe.id}`,label:recipe.name,values:transformValues(recipe.values,view&&view.phase,view&&view.reverse)});
  }

  let lastBoard=null,lastEnvironment=null,lastPlan=null,styleInstalled=false,rendering=false,refreshQueued=false;
  function scheduleRefresh(){
    if(refreshQueued)return;refreshQueued=true;const run=()=>{refreshQueued=false;if(lastBoard&&lastEnvironment)render(lastBoard,lastEnvironment);};
    if(root&&typeof root.setTimeout==='function')root.setTimeout(run,0);else run();
  }
  function captureRecipe(name){
    if(!lastEnvironment||!canEdit(lastEnvironment))return null;const captured=scopeValues(lastEnvironment),view=viewFor(lastEnvironment);
    if(!captured.values.length)return null;const fallback=`Recipe ${store.snapshot().recipes.length+1}`,saved=store.save(cleanName(name)||fallback,captured.values);
    view.selectedId=saved.id;view.name=saved.name;view.phase=0;view.reverse=false;scheduleRefresh();return saved;
  }
  function assignmentsForSelected(env,view){
    const patterns=root.InkFrameRadialPatterns,recipe=selectedRecipe(view);if(!patterns||!recipe)return Object.freeze([]);
    const scope=patterns.resolveTargetIndices(env),pattern=recipePattern(recipe,view);return patterns.assignmentsForPattern(pattern,scope.indices,env.holdAt);
  }
  function applySelected(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const patterns=root.InkFrameRadialPatterns,view=viewFor(lastEnvironment),recipe=selectedRecipe(view);
    if(!patterns||!recipe||typeof patterns.commitAssignments!=='function')return false;
    const scope=patterns.resolveTargetIndices(lastEnvironment),assignments=patterns.assignmentsForPattern(recipePattern(recipe,view),scope.indices,lastEnvironment.holdAt);
    return patterns.commitAssignments({id:`recipe:${recipe.id}`,label:recipe.name,scope:scope.kind},assignments);
  }
  function removeSelected(){
    const view=viewFor(lastEnvironment);if(!view.selectedId||!store.remove(view.selectedId))return false;
    const recipes=store.snapshot().recipes;view.selectedId=recipes.length?recipes[0].id:null;view.preview=false;view.phase=0;view.reverse=false;scheduleRefresh();return true;
  }

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;const style=document.createElement('style');style.dataset.inkframeRecipeStyle='true';
    style.textContent=`
.inkframe-recipe-toggle[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent))!important;border-color:var(--rim)!important}
.inkframe-recipe-shelf{position:absolute;left:50%;top:-228px;transform:translateX(-50%);z-index:12;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;max-width:min(94vw,820px);padding:7px;border-radius:18px;background:rgba(10,0,10,.82);border:1px solid rgba(247,202,201,.34);box-shadow:0 10px 28px rgba(10,0,10,.5),inset 0 1px 0 rgba(255,255,255,.16);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.inkframe-recipe-shelf button,.inkframe-recipe-shelf input{min-height:31px;padding:6px 9px;border-radius:999px;border:1px solid rgba(247,202,201,.30);background:rgba(255,240,243,.07);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.035em}
.inkframe-recipe-shelf button{text-transform:uppercase;touch-action:manipulation}.inkframe-recipe-shelf button[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}
.inkframe-recipe-shelf button:disabled{opacity:.32}.inkframe-recipe-name{width:126px}.inkframe-recipe-list{display:flex;gap:4px;max-width:330px;overflow-x:auto;scrollbar-width:thin}.inkframe-recipe-status{min-width:138px;color:var(--blush);font:800 9px/1.2 var(--font-ui);text-align:center;white-space:nowrap}
.inkframe-recipe-preview-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:3}.inkframe-recipe-preview-arc{fill:none;stroke:#ffd7e2;stroke-width:7;stroke-linecap:round;stroke-dasharray:8 4;vector-effect:non-scaling-stroke;opacity:.94;filter:drop-shadow(0 0 8px rgba(255,215,226,.95)) drop-shadow(0 0 14px rgba(187,0,55,.85))}
@media (pointer:coarse){.inkframe-recipe-shelf button,.inkframe-recipe-shelf input{min-height:39px;padding:7px 11px}.inkframe-recipe-name{width:145px}}
@media (prefers-reduced-motion:reduce){.inkframe-recipe-preview-arc{filter:none}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }
  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className||'';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(canEdit(lastEnvironment))handler();});return button;
  }
  function createPreview(document,board,plan,env,view){
    const timing=root.InkFrameRadialTiming,assignments=assignmentsForSelected(env,view);if(!view.preview||!timing||!assignments.length)return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('inkframe-recipe-preview-svg');svg.setAttribute('viewBox',`0 0 ${plan.metrics.width} ${plan.metrics.height}`);svg.setAttribute('aria-hidden','true');
    for(const entry of assignments){const slot=plan.slots[entry.index];if(!slot)continue;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.classList.add('inkframe-recipe-preview-arc');path.dataset.frame=String(entry.index);path.dataset.hold=String(entry.after);path.setAttribute('d',timing.holdArcPath(plan,slot,entry.after));svg.appendChild(path);}
    board.appendChild(svg);
  }
  function createShelf(document,board,env,view){
    const patterns=root.InkFrameRadialPatterns,scope=patterns.resolveTargetIndices(env),recipes=store.snapshot().recipes,selected=selectedRecipe(view);
    const shelf=document.createElement('div');shelf.className='inkframe-recipe-shelf';shelf.setAttribute('role','toolbar');shelf.setAttribute('aria-label','Custom timing recipes');
    const status=document.createElement('span');status.className='inkframe-recipe-status';status.textContent=`${scope.label} · ${selected?selected.values.join('·'):'No recipe'}`;shelf.appendChild(status);
    const input=document.createElement('input');input.className='inkframe-recipe-name';input.type='text';input.maxLength=MAX_NAME;input.placeholder='Recipe name';input.value=view.name||'';input.setAttribute('aria-label','Timing recipe name');input.addEventListener('input',()=>{view.name=input.value;});shelf.appendChild(input);
    shelf.appendChild(makeButton(document,'Capture','inkframe-recipe-capture',()=>captureRecipe(input.value)));
    const list=document.createElement('div');list.className='inkframe-recipe-list';list.setAttribute('role','listbox');list.setAttribute('aria-label','Saved timing recipes');
    for(const recipe of recipes){const button=makeButton(document,recipe.name,'inkframe-recipe-item',()=>{view.selectedId=recipe.id;view.name=recipe.name;view.phase=0;view.reverse=false;scheduleRefresh();});button.dataset.recipe=recipe.id;button.setAttribute('role','option');button.setAttribute('aria-selected',view.selectedId===recipe.id?'true':'false');button.setAttribute('aria-pressed',view.selectedId===recipe.id?'true':'false');list.appendChild(button);}shelf.appendChild(list);
    const length=selected&&selected.values.length||1;
    shelf.appendChild(makeButton(document,'Phase −','inkframe-recipe-phase-down',()=>{view.phase=(view.phase-1+length)%length;scheduleRefresh();}));
    shelf.appendChild(makeButton(document,'Phase +','inkframe-recipe-phase-up',()=>{view.phase=(view.phase+1)%length;scheduleRefresh();}));
    const reverse=makeButton(document,'Reverse','inkframe-recipe-reverse',()=>{view.reverse=!view.reverse;scheduleRefresh();});reverse.setAttribute('aria-pressed',view.reverse?'true':'false');shelf.appendChild(reverse);
    const preview=makeButton(document,'Preview','inkframe-recipe-preview',()=>{view.preview=!view.preview;scheduleRefresh();});preview.setAttribute('aria-pressed',view.preview?'true':'false');shelf.appendChild(preview);
    const apply=makeButton(document,'Apply','inkframe-recipe-apply',applySelected);apply.disabled=!selected;shelf.appendChild(apply);
    const remove=makeButton(document,'Delete','inkframe-recipe-delete',removeSelected);remove.disabled=!selected;shelf.appendChild(remove);
    board.appendChild(shelf);
  }
  function installBoard(board){
    if(!board||board._inkframeRecipesInstalled)return;board._inkframeRecipesInstalled=true;
    board.addEventListener('keydown',event=>{
      if(!lastEnvironment||!canEdit(lastEnvironment))return;const view=viewFor(lastEnvironment);if(!view.open)return;let handled=true;
      if(event.key==='PageUp'){const recipe=selectedRecipe(view),length=recipe&&recipe.values.length||1;view.phase=(view.phase-1+length)%length;}
      else if(event.key==='PageDown'){const recipe=selectedRecipe(view),length=recipe&&recipe.values.length||1;view.phase=(view.phase+1)%length;}
      else if(event.key.toLowerCase()==='v')view.preview=!view.preview;
      else if(event.key.toLowerCase()==='x')view.reverse=!view.reverse;
      else if(event.key==='Enter')applySelected();
      else handled=false;
      if(handled){event.preventDefault();event.stopImmediatePropagation();scheduleRefresh();}
    },true);
    if(typeof root.MutationObserver==='function'){
      const observer=new root.MutationObserver(()=>{
        if(rendering||refreshQueued||!lastBoard||board!==lastBoard)return;const rhythm=board.querySelector('.inkframe-rhythm-shelf');
        const missing=rhythm&&!rhythm.querySelector('.inkframe-recipe-toggle'),stale=!rhythm&&(board.querySelector('.inkframe-recipe-shelf')||board.querySelector('.inkframe-recipe-preview-svg'));
        if(missing||stale)scheduleRefresh();
      });observer.observe(board,{childList:true,subtree:true});board._inkframeRecipesObserver=observer;
    }
  }
  function render(board,environment){
    const radial=root.InkFrameRadialTimeline,patterns=root.InkFrameRadialPatterns,plan=radial&&radial.lastLayout,document=board&&board.ownerDocument;
    if(!board||!document||!plan||!patterns)return false;lastBoard=board;lastEnvironment=environment||{};lastPlan=plan;installStyle(document);installBoard(board);rendering=true;
    try{
      for(const node of board.querySelectorAll('.inkframe-recipe-shelf,.inkframe-recipe-preview-svg,.inkframe-recipe-toggle'))node.remove();
      const rhythm=board.querySelector('.inkframe-rhythm-shelf'),view=viewFor(lastEnvironment);if(!rhythm){view.open=false;view.preview=false;return true;}
      const toggle=makeButton(document,'Recipes','inkframe-recipe-toggle',()=>{view.open=!view.open;scheduleRefresh();});toggle.setAttribute('aria-pressed',view.open?'true':'false');toggle.title='Capture and reuse custom exposure rhythms';rhythm.appendChild(toggle);
      if(view.open)createShelf(document,board,lastEnvironment,view);if(view.open&&view.preview&&selectedRecipe(view))createPreview(document,board,plan,lastEnvironment,view);return true;
    }finally{rendering=false;}
  }
  function installIntoRadial(){
    const radial=root.InkFrameRadialTimeline;if(!radial||radial.__radialRecipesPatched)return false;const originalRender=radial.render;
    radial.render=function(board,environment){const result=originalRender.call(radial,board,environment);if(result)render(board,environment);return result;};radial.__radialRecipesPatched=true;return true;
  }

  const api={
    STORAGE_KEY,SCHEMA,MAX_RECIPES,MAX_VALUES,cleanName,cleanId,normalizeValues,minimalPeriod,rotateValues,transformValues,valuesSignature,
    sanitizeLibrary,createRecipeStore,store,scopeValues,recipePattern,captureRecipe,applySelected,removeSelected,render,viewSnapshot,installIntoRadial,
    projectCanvasWrites:0,artworkUndoWrites:0,timelineTimingWrites:true,projectSchemaWrites:0,deviceLibraryWrites:true,
  };
  root.InkFrameRadialRecipes=api;installIntoRadial();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
