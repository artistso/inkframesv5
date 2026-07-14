// InkFrame — deterministic score composer for saved timing phrase arrangements
'use strict';
(function(root){
  const MAX_SECTIONS=8,MAX_REPEAT=4,MAX_VALUES=120,MAX_NAME=32;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clampRepeat=value=>Math.max(1,Math.min(MAX_REPEAT,Math.round(finite(value,1))));
  const cleanName=value=>{
    const recipes=root.InkFrameRadialRecipes;
    return recipes&&typeof recipes.cleanName==='function'?recipes.cleanName(value):String(value||'').replace(/\s+/g,' ').trim().slice(0,MAX_NAME);
  };
  const canonicalValues=values=>{
    const recipes=root.InkFrameRadialRecipes,source=Array.isArray(values)?values:[];
    return Object.freeze(Array.from(recipes&&typeof recipes.minimalPeriod==='function'?recipes.minimalPeriod(source):source));
  };
  const normalizeSection=value=>Object.freeze({arrangementId:String(value&&value.arrangementId||''),repeat:clampRepeat(value&&value.repeat)});

  function sanitizeSections(value){
    const result=[];
    for(const input of Array.isArray(value)?value:[]){
      if(result.length>=MAX_SECTIONS)break;const section=normalizeSection(input);if(section.arrangementId)result.push(section);
    }
    return Object.freeze(result);
  }
  function scoreName(sections,arrangements){
    const library=Array.isArray(arrangements)?arrangements:[],parts=[];
    for(const section of sanitizeSections(sections)){
      const record=library.find(item=>item&&item.id===section.arrangementId),label=cleanName(record&&record.name)||'Missing Phrase';
      parts.push(`${label}${section.repeat>1?` ×${section.repeat}`:''}`);
    }
    const full=parts.join(' ⇒ ')||'Timing Score';if(full.length<=MAX_NAME)return full;
    const tail=parts.length>1?` ⇒ +${parts.length-1}`:'';
    return `${parts[0]||'Timing Score'}`.slice(0,Math.max(1,MAX_NAME-tail.length))+tail;
  }
  function resolveArrangement(record,recipes){
    const phraseLibrary=root.InkFrameRadialPhraseLibrary,phrases=root.InkFrameRadialPhrases;
    if(!record||!phraseLibrary||!phrases)return Object.freeze({loadable:false,phrase:null,missing:Object.freeze([]),changed:Object.freeze([]),renamed:Object.freeze([])});
    const resolved=phraseLibrary.resolveRecord(record,recipes),phrase=resolved.loadable?phrases.createPhrase(resolved.segments,recipes):null;
    return Object.freeze({loadable:!!(resolved.loadable&&phrase),phrase,missing:resolved.missing,changed:resolved.changed,renamed:resolved.renamed});
  }
  function createScore(sections,arrangements,recipes,maximum){
    const safe=sanitizeSections(sections);if(!safe.length)return null;
    const phraseRecords=Array.isArray(arrangements)?arrangements:[],recipeRecords=Array.isArray(recipes)?recipes:[],limit=Math.max(1,Math.min(MAX_VALUES,Math.floor(finite(maximum,MAX_VALUES))));
    const missingArrangements=[],missingSources=[],changedSources=[],resolvedSections=[];let rawLength=0;
    for(const section of safe){
      const record=phraseRecords.find(item=>item&&item.id===section.arrangementId);
      if(!record){missingArrangements.push(section.arrangementId);continue;}
      const resolved=resolveArrangement(record,recipeRecords);
      for(const id of resolved.missing)if(!missingSources.includes(id))missingSources.push(id);
      for(const id of resolved.changed)if(!changedSources.includes(id))changedSources.push(id);
      if(!resolved.loadable||!resolved.phrase)continue;
      rawLength+=resolved.phrase.values.length*section.repeat;
      resolvedSections.push({section,record,phrase:resolved.phrase});
    }
    const valid=missingArrangements.length===0&&missingSources.length===0&&resolvedSections.length===safe.length;
    const result=[];
    if(valid){
      for(const item of resolvedSections){
        for(let cycle=0;cycle<item.section.repeat&&result.length<limit;cycle++){
          for(const value of item.phrase.values){if(result.length>=limit)break;result.push(value);}
        }
        if(result.length>=limit)break;
      }
    }
    const values=valid?canonicalValues(result):Object.freeze([]),key=safe.map(section=>`${section.arrangementId}x${section.repeat}`).join('+');
    return Object.freeze({
      id:`score:${key}`,label:scoreName(safe,phraseRecords),sections:Object.freeze(safe.map(section=>Object.freeze({...section}))),
      values,valid,rawLength,truncated:valid&&rawLength>limit,signature:Array.from(values).join(','),
      missingArrangements:Object.freeze(missingArrangements),missingSources:Object.freeze(missingSources),changedSources:Object.freeze(changedSources),
    });
  }

  const projectViews=new WeakMap();
  const fallbackView={open:false,selectedArrangementId:null,sections:[],preview:false,name:''};
  function viewFor(environment){
    const project=environment&&environment.project;
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);if(!view){view={open:false,selectedArrangementId:null,sections:[],preview:false,name:''};projectViews.set(project,view);}return view;
    }
    return fallbackView;
  }
  function arrangementLibrary(){
    const library=root.InkFrameRadialPhraseLibrary;return library&&library.store&&typeof library.store.snapshot==='function'?library.store.snapshot().phrases:[];
  }
  function recipeLibrary(){
    const recipes=root.InkFrameRadialRecipes;return recipes&&recipes.store&&typeof recipes.store.snapshot==='function'?recipes.store.snapshot().recipes:[];
  }
  function ensureState(environment,view){
    const arrangements=arrangementLibrary();if(!arrangements.some(item=>item.id===view.selectedArrangementId))view.selectedArrangementId=arrangements[0]&&arrangements[0].id||null;
    view.sections=Array.from(sanitizeSections(view.sections),section=>({...section}));
    const score=createScore(view.sections,arrangements,recipeLibrary(),MAX_VALUES);if(!score||!score.valid)view.preview=false;return {arrangements,score};
  }
  function viewSnapshot(project){
    const existing=project&&projectViews.get(project),view=existing||(project?{open:false,selectedArrangementId:null,sections:[],preview:false,name:''}:fallbackView),score=createScore(view.sections,arrangementLibrary(),recipeLibrary(),MAX_VALUES);
    return Object.freeze({
      open:!!view.open,selectedArrangementId:view.selectedArrangementId||null,sections:Object.freeze((view.sections||[]).map(section=>Object.freeze({...normalizeSection(section)}))),
      preview:!!view.preview,name:String(view.name||''),arrangementCount:arrangementLibrary().length,scoreLength:score&&score.values.length||0,
      valid:!!(score&&score.valid),truncated:!!(score&&score.truncated),unresolvedCount:score?score.missingArrangements.length+score.missingSources.length:0,changedCount:score?score.changedSources.length:0,
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
  function mutateSections(mutator){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const view=viewFor(lastEnvironment),state=ensureState(lastEnvironment,view),next=view.sections.map(section=>({...section}));
    const result=mutator(next,state);if(result===false)return false;view.sections=Array.from(sanitizeSections(next),section=>({...section}));scheduleRefresh(false);return true;
  }
  function addSelected(){
    return mutateSections((sections,state)=>{const view=viewFor(lastEnvironment);if(!view.selectedArrangementId||sections.length>=MAX_SECTIONS||!state.arrangements.some(item=>item.id===view.selectedArrangementId))return false;sections.push({arrangementId:view.selectedArrangementId,repeat:1});});
  }
  function setSectionRepeat(index,value){
    return mutateSections(sections=>{const target=Math.floor(finite(index,-1));if(!sections[target])return false;sections[target].repeat=clampRepeat(value);});
  }
  function moveSection(index,delta){
    return mutateSections(sections=>{const from=Math.floor(finite(index,-1)),to=Math.max(0,Math.min(sections.length-1,from+Math.floor(finite(delta,0))));if(!sections[from]||from===to)return false;const [section]=sections.splice(from,1);sections.splice(to,0,section);});
  }
  function duplicateSection(index){
    return mutateSections(sections=>{const target=Math.floor(finite(index,-1));if(!sections[target]||sections.length>=MAX_SECTIONS)return false;sections.splice(target+1,0,{...sections[target]});});
  }
  function removeSection(index){
    return mutateSections(sections=>{const target=Math.floor(finite(index,-1));if(!sections[target])return false;sections.splice(target,1);});
  }
  function clearSections(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const view=viewFor(lastEnvironment);if(!view.sections.length)return false;view.sections=[];view.preview=false;scheduleRefresh(false);return true;
  }
  function assignmentsForScore(environment,score){
    const patterns=root.InkFrameRadialPatterns;if(!patterns||!score||!score.valid)return Object.freeze([]);
    const scope=patterns.resolveTargetIndices(environment),pattern=Object.freeze({id:score.id,label:score.label,values:score.values});
    return patterns.assignmentsForPattern(pattern,scope.indices,environment.holdAt);
  }
  function applyScore(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const patterns=root.InkFrameRadialPatterns,view=viewFor(lastEnvironment),state=ensureState(lastEnvironment,view);
    if(!patterns||!state.score||!state.score.valid||typeof patterns.commitAssignments!=='function')return false;
    const scope=patterns.resolveTargetIndices(lastEnvironment),assignments=assignmentsForScore(lastEnvironment,state.score);
    return patterns.commitAssignments({id:state.score.id,label:state.score.label,scope:scope.kind},assignments);
  }
  function saveScore(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return null;const recipes=root.InkFrameRadialRecipes,view=viewFor(lastEnvironment),state=ensureState(lastEnvironment,view);
    if(!recipes||!state.score||!state.score.valid)return null;const saved=recipes.store.save(cleanName(view.name)||state.score.label,state.score.values);view.name=saved.name;scheduleRefresh(true);return saved;
  }

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;const style=document.createElement('style');style.dataset.inkframeScoreStyle='true';
    style.textContent=`
.inkframe-score-toggle[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent))!important;border-color:var(--rim)!important}
.inkframe-score-shelf{position:absolute;left:50%;top:-590px;transform:translateX(-50%);z-index:22;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;max-width:min(98vw,1080px);padding:7px;border-radius:18px;background:rgba(10,0,10,.94);border:1px solid rgba(156,255,208,.44);box-shadow:0 20px 46px rgba(10,0,10,.67),inset 0 1px 0 rgba(255,255,255,.20);backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px)}
.inkframe-score-shelf button,.inkframe-score-shelf select,.inkframe-score-shelf input{min-height:31px;padding:6px 9px;border-radius:999px;border:1px solid rgba(156,255,208,.34);background:rgba(239,255,247,.08);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.035em}.inkframe-score-shelf button{text-transform:uppercase;touch-action:manipulation}.inkframe-score-shelf button[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}.inkframe-score-shelf button:disabled{opacity:.32}
.inkframe-score-status{min-width:210px;color:#9cffd0;font:800 9px/1.2 var(--font-ui);text-align:center;white-space:nowrap}.inkframe-score-source{max-width:170px}.inkframe-score-name{width:140px}.inkframe-score-list{display:flex;gap:5px;max-width:600px;overflow-x:auto;scrollbar-width:thin;padding:1px}.inkframe-score-section{display:flex;align-items:center;gap:3px;padding:3px;border-radius:999px;border:1px solid rgba(156,255,208,.24);background:rgba(156,255,208,.06);white-space:nowrap}.inkframe-score-section-name{max-width:125px;overflow:hidden;text-overflow:ellipsis;color:#e8fff4;font:800 9px/1 var(--font-ui)}.inkframe-score-section button{min-width:28px;padding:5px 7px}.inkframe-score-preview-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:7}.inkframe-score-preview-arc{fill:none;stroke:#9cffd0;stroke-width:8;stroke-linecap:round;stroke-dasharray:18 4 3 4;vector-effect:non-scaling-stroke;opacity:.97;filter:drop-shadow(0 0 8px rgba(156,255,208,.98)) drop-shadow(0 0 16px rgba(187,0,55,.72))}
@media (pointer:coarse){.inkframe-score-shelf button,.inkframe-score-shelf select,.inkframe-score-shelf input{min-height:39px;padding:7px 11px}.inkframe-score-list{max-width:700px}.inkframe-score-section button{min-width:36px}}
@media (prefers-reduced-motion:reduce){.inkframe-score-preview-arc{filter:none}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }
  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className||'';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(canEdit(lastEnvironment))handler();});return button;
  }
  function createPreview(document,board,plan,environment,score){
    const timing=root.InkFrameRadialTiming,assignments=assignmentsForScore(environment,score);if(!timing||!assignments.length)return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('inkframe-score-preview-svg');svg.setAttribute('viewBox',`0 0 ${plan.metrics.width} ${plan.metrics.height}`);svg.setAttribute('aria-hidden','true');
    for(const entry of assignments){const slot=plan.slots[entry.index];if(!slot)continue;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.classList.add('inkframe-score-preview-arc');path.dataset.frame=String(entry.index);path.dataset.hold=String(entry.after);path.setAttribute('d',timing.holdArcPath(plan,slot,entry.after));svg.appendChild(path);}board.appendChild(svg);
  }
  function createShelf(document,board,environment,view,state){
    const patterns=root.InkFrameRadialPatterns,scope=patterns.resolveTargetIndices(environment),score=state.score,shelf=document.createElement('div');shelf.className='inkframe-score-shelf';shelf.setAttribute('role','toolbar');shelf.setAttribute('aria-label','Timing score composer');
    const status=document.createElement('span');status.className='inkframe-score-status';
    status.textContent=!score?'Add saved phrase arrangements to build a score':!score.valid?`${score.sections.length} sections · ${score.missingArrangements.length+score.missingSources.length} unresolved`: `${score.sections.length} sections · ${score.values.length} steps${score.truncated?' · capped':''}${score.changedSources.length?` · ${score.changedSources.length} changed source${score.changedSources.length===1?'':'s'}`:''} · ${scope.label}`;shelf.appendChild(status);
    const select=document.createElement('select');select.className='inkframe-score-source';select.setAttribute('aria-label','Phrase arrangement to add to score');
    for(const record of state.arrangements){const option=document.createElement('option');option.value=record.id;option.textContent=record.name;option.selected=record.id===view.selectedArrangementId;select.appendChild(option);}select.addEventListener('change',event=>{event.stopPropagation();if(!canEdit(lastEnvironment)){scheduleRefresh(false);return;}view.selectedArrangementId=select.value;scheduleRefresh(false);});shelf.appendChild(select);
    const add=makeButton(document,'Add','inkframe-score-add',addSelected);add.disabled=!view.selectedArrangementId||view.sections.length>=MAX_SECTIONS;shelf.appendChild(add);
    const list=document.createElement('div');list.className='inkframe-score-list';list.setAttribute('role','list');list.setAttribute('aria-label','Score sections');
    score&&score.sections.forEach((section,index)=>{const record=state.arrangements.find(item=>item.id===section.arrangementId),resolution=record?resolveArrangement(record,recipeLibrary()):null,group=document.createElement('div');group.className='inkframe-score-section';group.setAttribute('role','listitem');group.dataset.section=String(index);
      const name=document.createElement('span');name.className='inkframe-score-section-name';name.textContent=`${index+1} · ${record&&record.name||'Missing arrangement'}${resolution&&!resolution.loadable?' ⚠':''}`;group.appendChild(name);
      const left=makeButton(document,'←','inkframe-score-left',()=>moveSection(index,-1));left.disabled=index===0;group.appendChild(left);
      const repeat=makeButton(document,`×${section.repeat}`,'inkframe-score-repeat',()=>setSectionRepeat(index,section.repeat%MAX_REPEAT+1));repeat.title='Cycle score-section repeat count from one to four';group.appendChild(repeat);
      const right=makeButton(document,'→','inkframe-score-right',()=>moveSection(index,1));right.disabled=index===score.sections.length-1;group.appendChild(right);
      const duplicate=makeButton(document,'Dup','inkframe-score-duplicate',()=>duplicateSection(index));duplicate.disabled=score.sections.length>=MAX_SECTIONS;group.appendChild(duplicate);
      group.appendChild(makeButton(document,'×','inkframe-score-remove',()=>removeSection(index)));list.appendChild(group);
    });shelf.appendChild(list);
    const input=document.createElement('input');input.className='inkframe-score-name';input.type='text';input.maxLength=MAX_NAME;input.placeholder=score&&score.label||'Score name';input.value=view.name||'';input.setAttribute('aria-label','Timing score name');input.addEventListener('input',()=>{view.name=input.value;});shelf.appendChild(input);
    const preview=makeButton(document,'Preview','inkframe-score-preview',()=>{view.preview=!view.preview;scheduleRefresh(false);});preview.setAttribute('aria-pressed',view.preview?'true':'false');preview.disabled=!(score&&score.valid);shelf.appendChild(preview);
    const apply=makeButton(document,'Apply Score','inkframe-score-apply',applyScore);apply.disabled=!(score&&score.valid);shelf.appendChild(apply);
    const save=makeButton(document,'Save Score','inkframe-score-save',saveScore);save.disabled=!(score&&score.valid);shelf.appendChild(save);
    const clear=makeButton(document,'Clear','inkframe-score-clear',clearSections);clear.disabled=!view.sections.length;shelf.appendChild(clear);board.appendChild(shelf);
  }
  function installBoard(board){
    if(!board||board._inkframeScoreInstalled)return;board._inkframeScoreInstalled=true;
    if(typeof root.MutationObserver==='function'){
      const observer=new root.MutationObserver(()=>{if(rendering||refreshQueued||!lastBoard||board!==lastBoard)return;const phraseShelf=board.querySelector('.inkframe-phrase-shelf'),missing=phraseShelf&&!phraseShelf.querySelector('.inkframe-score-toggle'),stale=!phraseShelf&&(board.querySelector('.inkframe-score-shelf')||board.querySelector('.inkframe-score-preview-svg'));if(missing||stale)scheduleRefresh(false);});
      observer.observe(board,{childList:true,subtree:true});board._inkframeScoreObserver=observer;
    }
  }
  function render(board,environment){
    const radial=root.InkFrameRadialTimeline,phrases=root.InkFrameRadialPhrases,phraseLibrary=root.InkFrameRadialPhraseLibrary,patterns=root.InkFrameRadialPatterns,plan=radial&&radial.lastLayout,document=board&&board.ownerDocument;
    if(!board||!document||!plan||!phrases||!phraseLibrary||!patterns)return false;lastBoard=board;lastEnvironment=environment||{};lastPlan=plan;installStyle(document);installBoard(board);rendering=true;
    try{
      for(const node of board.querySelectorAll('.inkframe-score-shelf,.inkframe-score-preview-svg,.inkframe-score-toggle'))node.remove();
      const phraseShelf=board.querySelector('.inkframe-phrase-shelf'),view=viewFor(lastEnvironment);if(!phraseShelf){view.open=false;view.preview=false;return true;}
      const state=ensureState(lastEnvironment,view),toggle=makeButton(document,'Score','inkframe-score-toggle',()=>{view.open=!view.open;scheduleRefresh(false);});toggle.setAttribute('aria-pressed',view.open?'true':'false');toggle.title='Arrange saved timing phrases into a complete score';phraseShelf.appendChild(toggle);
      if(view.open)createShelf(document,board,lastEnvironment,view,state);if(view.open&&view.preview&&state.score&&state.score.valid)createPreview(document,board,plan,lastEnvironment,state.score);return true;
    }finally{rendering=false;}
  }
  function installIntoRadial(){
    const radial=root.InkFrameRadialTimeline;if(!radial||radial.__radialScorePatched)return false;const originalRender=radial.render;
    radial.render=function(board,environment){const result=originalRender.call(radial,board,environment);if(result)render(board,environment);return result;};radial.__radialScorePatched=true;return true;
  }

  const api={
    MAX_SECTIONS,MAX_REPEAT,MAX_VALUES,clampRepeat,normalizeSection,sanitizeSections,scoreName,resolveArrangement,createScore,
    arrangementLibrary,recipeLibrary,assignmentsForScore,addSelected,setSectionRepeat,moveSection,duplicateSection,removeSection,clearSections,applyScore,saveScore,render,viewSnapshot,installIntoRadial,
    projectCanvasWrites:0,artworkUndoWrites:0,timelineTimingWrites:true,projectSchemaWrites:0,deviceLibraryWrites:true,sourceArrangementWrites:0,sourceRecipeWrites:0,randomWrites:0,
  };
  root.InkFrameRadialScore=api;installIntoRadial();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
