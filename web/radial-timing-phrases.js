// InkFrame — deterministic multi-recipe timing phrase composer
'use strict';
(function(root){
  const MAX_SEGMENTS=8,MAX_REPEAT=4,MAX_VALUES=120;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clampRepeat=value=>Math.max(1,Math.min(MAX_REPEAT,Math.round(finite(value,1))));
  const normalizeValues=values=>{
    const recipes=root.InkFrameRadialRecipes;
    return Object.freeze(Array.from(recipes&&typeof recipes.normalizeValues==='function'?recipes.normalizeValues(values):(Array.isArray(values)?values:[])));
  };
  const canonicalValues=values=>{
    const recipes=root.InkFrameRadialRecipes,normalized=normalizeValues(values);
    return Object.freeze(Array.from(recipes&&typeof recipes.minimalPeriod==='function'?recipes.minimalPeriod(normalized):normalized));
  };
  const signature=values=>Array.from(normalizeValues(values)).join(',');
  const normalizeSegment=value=>Object.freeze({recipeId:String(value&&value.recipeId||''),repeat:clampRepeat(value&&value.repeat)});

  function sanitizeSegments(segments,library){
    const recipes=Array.isArray(library)?library:[],ids=new Set(recipes.map(item=>String(item&&item.id||''))),result=[];
    for(const input of Array.isArray(segments)?segments:[]){
      if(result.length>=MAX_SEGMENTS)break;const segment=normalizeSegment(input);
      if(segment.recipeId&&ids.has(segment.recipeId))result.push(segment);
    }
    return Object.freeze(result);
  }
  function compileSegments(segments,library,maximum){
    const recipes=Array.isArray(library)?library:[],limit=Math.max(1,Math.min(MAX_VALUES,Math.floor(finite(maximum,MAX_VALUES)))),safe=sanitizeSegments(segments,recipes),result=[];
    for(const segment of safe){
      const recipe=recipes.find(item=>item&&item.id===segment.recipeId),values=recipe?canonicalValues(recipe.values):Object.freeze([]);
      for(let cycle=0;cycle<segment.repeat&&result.length<limit;cycle++){
        for(const value of values){if(result.length>=limit)break;result.push(value);}
      }
      if(result.length>=limit)break;
    }
    return canonicalValues(result);
  }
  function phraseName(segments,library){
    const recipes=Array.isArray(library)?library:[],safe=sanitizeSegments(segments,recipes),parts=[];
    for(const segment of safe){
      const recipe=recipes.find(item=>item&&item.id===segment.recipeId);if(!recipe)continue;
      parts.push(`${String(recipe.name||'Recipe')}${segment.repeat>1?` ×${segment.repeat}`:''}`);
    }
    const full=parts.join(' → ')||'Timing Phrase',maximum=32;
    if(full.length<=maximum)return full;
    const tail=parts.length>1?` → +${parts.length-1}`:'';
    return `${parts[0]||'Timing Phrase'}`.slice(0,Math.max(1,maximum-tail.length))+tail;
  }
  function createPhrase(segments,library){
    const recipes=Array.isArray(library)?library:[],safe=sanitizeSegments(segments,recipes),rawLength=safe.reduce((sum,segment)=>{
      const recipe=recipes.find(item=>item&&item.id===segment.recipeId),values=recipe?canonicalValues(recipe.values):[];return sum+values.length*segment.repeat;
    },0),values=compileSegments(safe,recipes,MAX_VALUES);
    if(!safe.length||!values.length)return null;
    const key=safe.map(segment=>`${segment.recipeId}x${segment.repeat}`).join('+');
    return Object.freeze({
      id:`phrase:${key}`,label:phraseName(safe,recipes),segments:Object.freeze(safe.map(segment=>Object.freeze({...segment}))),
      values,signature:signature(values),rawLength,truncated:rawLength>MAX_VALUES,
    });
  }

  const projectViews=new WeakMap();
  const fallbackView={open:false,selectedRecipeId:null,segments:[],preview:false,name:''};
  function viewFor(environment){
    const project=environment&&environment.project;
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);if(!view){view={open:false,selectedRecipeId:null,segments:[],preview:false,name:''};projectViews.set(project,view);}return view;
    }
    return fallbackView;
  }
  function recipeLibrary(){
    const recipes=root.InkFrameRadialRecipes;return recipes&&recipes.store&&typeof recipes.store.snapshot==='function'?recipes.store.snapshot().recipes:[];
  }
  function ensureState(environment,view){
    const recipes=root.InkFrameRadialRecipes,library=recipeLibrary(),selectedId=recipes&&typeof recipes.viewSnapshot==='function'?recipes.viewSnapshot(environment&&environment.project).selectedId:null;
    if(!library.some(item=>item.id===view.selectedRecipeId))view.selectedRecipeId=library.some(item=>item.id===selectedId)?selectedId:(library[0]&&library[0].id||null);
    view.segments=Array.from(sanitizeSegments(view.segments,library),segment=>({...segment}));
    const phrase=createPhrase(view.segments,library);if(!phrase)view.preview=false;return {library,phrase};
  }
  function viewSnapshot(project){
    const view=project&&projectViews.get(project)||fallbackView,library=recipeLibrary(),phrase=createPhrase(view.segments,library);
    return Object.freeze({
      open:!!view.open,selectedRecipeId:view.selectedRecipeId||null,segments:Object.freeze((view.segments||[]).map(segment=>Object.freeze({...normalizeSegment(segment)}))),
      preview:!!view.preview,name:String(view.name||''),recipeCount:library.length,phraseLength:phrase&&phrase.values.length||0,truncated:!!(phrase&&phrase.truncated),
    });
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
  function mutateSegments(mutator){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const view=viewFor(lastEnvironment),state=ensureState(lastEnvironment,view),next=state.phrase?state.phrase.segments.map(segment=>({...segment})):view.segments.map(segment=>({...segment}));
    const result=mutator(next,state);if(result===false)return false;view.segments=Array.from(sanitizeSegments(next,state.library),segment=>({...segment}));scheduleRefresh(false);return true;
  }
  function addSelected(){
    return mutateSegments((segments,state)=>{const view=viewFor(lastEnvironment);if(!view.selectedRecipeId||segments.length>=MAX_SEGMENTS||!state.library.some(item=>item.id===view.selectedRecipeId))return false;segments.push({recipeId:view.selectedRecipeId,repeat:1});});
  }
  function setSegmentRepeat(index,value){
    return mutateSegments(segments=>{const target=Math.floor(finite(index,-1));if(!segments[target])return false;segments[target].repeat=clampRepeat(value);});
  }
  function moveSegment(index,delta){
    return mutateSegments(segments=>{const from=Math.floor(finite(index,-1)),to=Math.max(0,Math.min(segments.length-1,from+Math.floor(finite(delta,0))));if(!segments[from]||from===to)return false;const [segment]=segments.splice(from,1);segments.splice(to,0,segment);});
  }
  function duplicateSegment(index){
    return mutateSegments(segments=>{const target=Math.floor(finite(index,-1));if(!segments[target]||segments.length>=MAX_SEGMENTS)return false;segments.splice(target+1,0,{...segments[target]});});
  }
  function removeSegment(index){
    return mutateSegments(segments=>{const target=Math.floor(finite(index,-1));if(!segments[target])return false;segments.splice(target,1);});
  }
  function clearSegments(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const view=viewFor(lastEnvironment);if(!view.segments.length)return false;view.segments=[];view.preview=false;scheduleRefresh(false);return true;
  }
  function assignmentsForPhrase(environment,phrase){
    const patterns=root.InkFrameRadialPatterns;if(!patterns||!phrase)return Object.freeze([]);
    const scope=patterns.resolveTargetIndices(environment),pattern=Object.freeze({id:phrase.id,label:phrase.label,values:phrase.values});
    return patterns.assignmentsForPattern(pattern,scope.indices,environment.holdAt);
  }
  function applyPhrase(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const patterns=root.InkFrameRadialPatterns,view=viewFor(lastEnvironment),state=ensureState(lastEnvironment,view);
    if(!patterns||!state.phrase||typeof patterns.commitAssignments!=='function')return false;
    const scope=patterns.resolveTargetIndices(lastEnvironment),assignments=assignmentsForPhrase(lastEnvironment,state.phrase);
    return patterns.commitAssignments({id:state.phrase.id,label:state.phrase.label,scope:scope.kind},assignments);
  }
  function savePhrase(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return null;const recipes=root.InkFrameRadialRecipes,view=viewFor(lastEnvironment),state=ensureState(lastEnvironment,view);if(!recipes||!state.phrase)return null;
    const name=recipes.cleanName&&recipes.cleanName(view.name)||state.phrase.label,saved=recipes.store.save(name,state.phrase.values);view.name=saved.name;scheduleRefresh(true);return saved;
  }

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;const style=document.createElement('style');style.dataset.inkframePhraseStyle='true';
    style.textContent=`
.inkframe-phrase-toggle[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent))!important;border-color:var(--rim)!important}
.inkframe-phrase-shelf{position:absolute;left:50%;top:-446px;transform:translateX(-50%);z-index:18;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;max-width:min(97vw,1040px);padding:7px;border-radius:18px;background:rgba(10,0,10,.91);border:1px solid rgba(211,190,255,.42);box-shadow:0 16px 38px rgba(10,0,10,.62),inset 0 1px 0 rgba(255,255,255,.19);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.inkframe-phrase-shelf button,.inkframe-phrase-shelf select,.inkframe-phrase-shelf input{min-height:31px;padding:6px 9px;border-radius:999px;border:1px solid rgba(211,190,255,.34);background:rgba(246,241,255,.08);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.035em}.inkframe-phrase-shelf button{text-transform:uppercase;touch-action:manipulation}.inkframe-phrase-shelf button[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}.inkframe-phrase-shelf button:disabled{opacity:.32}
.inkframe-phrase-status{min-width:190px;color:#d3beff;font:800 9px/1.2 var(--font-ui);text-align:center;white-space:nowrap}.inkframe-phrase-source{max-width:150px}.inkframe-phrase-name{width:136px}.inkframe-phrase-list{display:flex;gap:5px;max-width:560px;overflow-x:auto;scrollbar-width:thin;padding:1px}.inkframe-phrase-segment{display:flex;align-items:center;gap:3px;padding:3px;border-radius:999px;border:1px solid rgba(211,190,255,.24);background:rgba(211,190,255,.06);white-space:nowrap}.inkframe-phrase-segment-name{max-width:110px;overflow:hidden;text-overflow:ellipsis;color:#eee4ff;font:800 9px/1 var(--font-ui)}.inkframe-phrase-segment button{min-width:28px;padding:5px 7px}.inkframe-phrase-preview-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:6}.inkframe-phrase-preview-arc{fill:none;stroke:#d3beff;stroke-width:7.6;stroke-linecap:round;stroke-dasharray:14 4 2 4;vector-effect:non-scaling-stroke;opacity:.96;filter:drop-shadow(0 0 8px rgba(211,190,255,.98)) drop-shadow(0 0 15px rgba(187,0,55,.76))}
@media (pointer:coarse){.inkframe-phrase-shelf button,.inkframe-phrase-shelf select,.inkframe-phrase-shelf input{min-height:39px;padding:7px 11px}.inkframe-phrase-list{max-width:660px}.inkframe-phrase-segment button{min-width:36px}}
@media (prefers-reduced-motion:reduce){.inkframe-phrase-preview-arc{filter:none}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }
  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className||'';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(canEdit(lastEnvironment))handler();});return button;
  }
  function createPreview(document,board,plan,environment,phrase){
    const timing=root.InkFrameRadialTiming,assignments=assignmentsForPhrase(environment,phrase);if(!timing||!assignments.length)return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('inkframe-phrase-preview-svg');svg.setAttribute('viewBox',`0 0 ${plan.metrics.width} ${plan.metrics.height}`);svg.setAttribute('aria-hidden','true');
    for(const entry of assignments){const slot=plan.slots[entry.index];if(!slot)continue;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.classList.add('inkframe-phrase-preview-arc');path.dataset.frame=String(entry.index);path.dataset.hold=String(entry.after);path.setAttribute('d',timing.holdArcPath(plan,slot,entry.after));svg.appendChild(path);}board.appendChild(svg);
  }
  function createShelf(document,board,environment,view,state){
    const patterns=root.InkFrameRadialPatterns,scope=patterns.resolveTargetIndices(environment),shelf=document.createElement('div');shelf.className='inkframe-phrase-shelf';shelf.setAttribute('role','toolbar');shelf.setAttribute('aria-label','Timing phrase composer');
    const status=document.createElement('span');status.className='inkframe-phrase-status';status.textContent=state.phrase?`${state.phrase.segments.length} segments · ${state.phrase.values.length} steps${state.phrase.truncated?' · capped':''} · ${scope.label}`:'Add saved recipes to build a phrase';shelf.appendChild(status);
    const select=document.createElement('select');select.className='inkframe-phrase-source';select.setAttribute('aria-label','Recipe to add to phrase');
    for(const recipe of state.library){const option=document.createElement('option');option.value=recipe.id;option.textContent=recipe.name;option.selected=recipe.id===view.selectedRecipeId;select.appendChild(option);}select.addEventListener('change',event=>{event.stopPropagation();if(!canEdit(lastEnvironment)){scheduleRefresh(false);return;}view.selectedRecipeId=select.value;scheduleRefresh(false);});shelf.appendChild(select);
    const add=makeButton(document,'Add','inkframe-phrase-add',addSelected);add.disabled=!view.selectedRecipeId||view.segments.length>=MAX_SEGMENTS;shelf.appendChild(add);
    const list=document.createElement('div');list.className='inkframe-phrase-list';list.setAttribute('role','list');list.setAttribute('aria-label','Phrase segments');
    state.phrase&&state.phrase.segments.forEach((segment,index)=>{const recipe=state.library.find(item=>item.id===segment.recipeId),group=document.createElement('div');group.className='inkframe-phrase-segment';group.setAttribute('role','listitem');group.dataset.segment=String(index);
      const name=document.createElement('span');name.className='inkframe-phrase-segment-name';name.textContent=`${index+1} · ${recipe&&recipe.name||'Recipe'}`;group.appendChild(name);
      const left=makeButton(document,'←','inkframe-phrase-left',()=>moveSegment(index,-1));left.disabled=index===0;group.appendChild(left);
      const repeat=makeButton(document,`×${segment.repeat}`,'inkframe-phrase-repeat',()=>setSegmentRepeat(index,segment.repeat%MAX_REPEAT+1));repeat.title='Cycle segment repeat count from one to four';group.appendChild(repeat);
      const right=makeButton(document,'→','inkframe-phrase-right',()=>moveSegment(index,1));right.disabled=index===state.phrase.segments.length-1;group.appendChild(right);
      const duplicate=makeButton(document,'Dup','inkframe-phrase-duplicate',()=>duplicateSegment(index));duplicate.disabled=state.phrase.segments.length>=MAX_SEGMENTS;group.appendChild(duplicate);
      group.appendChild(makeButton(document,'×','inkframe-phrase-remove',()=>removeSegment(index)));list.appendChild(group);
    });shelf.appendChild(list);
    const input=document.createElement('input');input.className='inkframe-phrase-name';input.type='text';input.maxLength=32;input.placeholder=state.phrase&&state.phrase.label||'Phrase name';input.value=view.name||'';input.setAttribute('aria-label','Timing phrase name');input.addEventListener('input',()=>{view.name=input.value;});shelf.appendChild(input);
    const preview=makeButton(document,'Preview','inkframe-phrase-preview',()=>{view.preview=!view.preview;scheduleRefresh(false);});preview.setAttribute('aria-pressed',view.preview?'true':'false');preview.disabled=!state.phrase;shelf.appendChild(preview);
    const apply=makeButton(document,'Apply Phrase','inkframe-phrase-apply',applyPhrase);apply.disabled=!state.phrase;shelf.appendChild(apply);
    const save=makeButton(document,'Save Phrase','inkframe-phrase-save',savePhrase);save.disabled=!state.phrase;shelf.appendChild(save);
    const clear=makeButton(document,'Clear','inkframe-phrase-clear',clearSegments);clear.disabled=!view.segments.length;shelf.appendChild(clear);board.appendChild(shelf);
  }
  function installBoard(board){
    if(!board||board._inkframePhrasesInstalled)return;board._inkframePhrasesInstalled=true;
    if(typeof root.MutationObserver==='function'){
      const observer=new root.MutationObserver(()=>{if(rendering||refreshQueued||!lastBoard||board!==lastBoard)return;const recipeShelf=board.querySelector('.inkframe-recipe-shelf'),missing=recipeShelf&&!recipeShelf.querySelector('.inkframe-phrase-toggle'),stale=!recipeShelf&&(board.querySelector('.inkframe-phrase-shelf')||board.querySelector('.inkframe-phrase-preview-svg'));if(missing||stale)scheduleRefresh(false);});
      observer.observe(board,{childList:true,subtree:true});board._inkframePhrasesObserver=observer;
    }
  }
  function render(board,environment){
    const radial=root.InkFrameRadialTimeline,recipes=root.InkFrameRadialRecipes,patterns=root.InkFrameRadialPatterns,plan=radial&&radial.lastLayout,document=board&&board.ownerDocument;
    if(!board||!document||!plan||!recipes||!patterns)return false;lastBoard=board;lastEnvironment=environment||{};lastPlan=plan;installStyle(document);installBoard(board);rendering=true;
    try{
      for(const node of board.querySelectorAll('.inkframe-phrase-shelf,.inkframe-phrase-preview-svg,.inkframe-phrase-toggle'))node.remove();
      const recipeShelf=board.querySelector('.inkframe-recipe-shelf'),view=viewFor(lastEnvironment);if(!recipeShelf){view.open=false;view.preview=false;return true;}
      const state=ensureState(lastEnvironment,view),toggle=makeButton(document,'Phrase','inkframe-phrase-toggle',()=>{view.open=!view.open;scheduleRefresh(false);});toggle.setAttribute('aria-pressed',view.open?'true':'false');toggle.title='Compose an ordered phrase from saved timing recipes';recipeShelf.appendChild(toggle);
      if(view.open)createShelf(document,board,lastEnvironment,view,state);if(view.open&&view.preview&&state.phrase)createPreview(document,board,plan,lastEnvironment,state.phrase);return true;
    }finally{rendering=false;}
  }
  function installIntoRadial(){
    const radial=root.InkFrameRadialTimeline;if(!radial||radial.__radialPhrasesPatched)return false;const originalRender=radial.render;
    radial.render=function(board,environment){const result=originalRender.call(radial,board,environment);if(result)render(board,environment);return result;};radial.__radialPhrasesPatched=true;return true;
  }

  const api={
    MAX_SEGMENTS,MAX_REPEAT,MAX_VALUES,clampRepeat,normalizeValues,canonicalValues,signature,normalizeSegment,sanitizeSegments,compileSegments,phraseName,createPhrase,
    recipeLibrary,assignmentsForPhrase,addSelected,setSegmentRepeat,moveSegment,duplicateSegment,removeSegment,clearSegments,applyPhrase,savePhrase,render,viewSnapshot,installIntoRadial,
    projectCanvasWrites:0,artworkUndoWrites:0,timelineTimingWrites:true,projectSchemaWrites:0,deviceLibraryWrites:true,sourceRecipeWrites:0,randomWrites:0,
  };
  root.InkFrameRadialPhrases=api;installIntoRadial();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
