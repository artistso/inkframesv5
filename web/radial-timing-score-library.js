// InkFrame — persistent editable timing score structures
'use strict';
(function(root){
  const STORAGE_KEY='inkframe.radialTiming.scoreLibrary.v1';
  const SCHEMA=1,MAX_SCORES=12,MAX_SECTIONS=8,MAX_NAME=32,MAX_ID=48;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const cleanName=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,MAX_NAME);
  const cleanId=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,MAX_ID);
  const clampRepeat=value=>Math.max(1,Math.min(4,Math.round(finite(value,1))));
  const cleanSignature=value=>String(value||'').replace(/[^a-zA-Z0-9_:\-,|x]/g,'').slice(0,960);

  function uniqueText(base,seen,maximum,separator,normalizer){
    const normalize=normalizer||String;let candidate=String(base||'').slice(0,maximum);
    if(!seen.has(normalize(candidate)))return candidate;
    for(let suffix=2;suffix<10000;suffix++){
      const tail=`${separator}${suffix}`;candidate=`${String(base||'').slice(0,Math.max(1,maximum-tail.length))}${tail}`;
      if(!seen.has(normalize(candidate)))return candidate;
    }
    throw new Error('Unable to create a unique timing score identity');
  }
  const uniqueId=(base,seen)=>uniqueText(base,seen,MAX_ID,'-',String);
  const uniqueName=(base,seen)=>uniqueText(base,seen,MAX_NAME,' ',value=>String(value).toLowerCase());

  function arrangementSignature(record){
    const segments=record&&Array.isArray(record.segments)?record.segments:[];
    return segments.slice(0,8).map(segment=>{
      const recipeId=cleanId(segment&&segment.recipeId),signature=String(segment&&segment.recipeSignature||'').replace(/[^0-9,]/g,'').slice(0,480),repeat=clampRepeat(segment&&segment.repeat);
      return `${recipeId}:${signature}x${repeat}`;
    }).filter(Boolean).join('|');
  }
  function normalizeStoredSection(value){
    const input=value&&typeof value==='object'?value:{};
    return Object.freeze({
      arrangementId:cleanId(input.arrangementId),arrangementName:cleanName(input.arrangementName)||'Phrase',
      arrangementSignature:cleanSignature(input.arrangementSignature),repeat:clampRepeat(input.repeat),
    });
  }
  function sanitizeStoredSections(value){
    const result=[];
    for(const input of Array.isArray(value)?value:[]){
      if(result.length>=MAX_SECTIONS)break;
      const section=normalizeStoredSection(input);
      if(section.arrangementId)result.push(section);
    }
    return Object.freeze(result);
  }
  function sanitizeRecord(value,index,now){
    const input=value&&typeof value==='object'?value:{},sections=sanitizeStoredSections(input.sections);
    const createdAt=Number.isFinite(Number(input.createdAt))?Number(input.createdAt):now;
    const updatedAt=Number.isFinite(Number(input.updatedAt))?Number(input.updatedAt):createdAt;
    return {id:cleanId(input.id)||`score-${index+1}`,name:cleanName(input.name)||`Score ${index+1}`,createdAt,updatedAt,sections:Array.from(sections,section=>({...section}))};
  }
  function sanitizeLibrary(value,nowValue){
    const now=Number.isFinite(Number(nowValue))?Number(nowValue):Date.now(),input=value&&typeof value==='object'?value:{},source=Array.isArray(input.scores)?input.scores:[];
    const seenIds=new Set(),seenNames=new Set(),scores=[];
    for(let index=0;index<source.length&&scores.length<MAX_SCORES;index++){
      const record=sanitizeRecord(source[index],index,now);
      if(!record.sections.length)continue;
      record.id=uniqueId(record.id,seenIds);record.name=uniqueName(record.name,seenNames);seenIds.add(record.id);seenNames.add(record.name.toLowerCase());scores.push(record);
    }
    return {schema:SCHEMA,scores};
  }
  function snapshotSections(sections,arrangements){
    const score=root.InkFrameRadialScore,library=Array.isArray(arrangements)?arrangements:[];
    const safe=score&&typeof score.sanitizeSections==='function'?score.sanitizeSections(sections):[];
    return Object.freeze(Array.from(safe,section=>{
      const arrangement=library.find(item=>item&&item.id===section.arrangementId);
      return Object.freeze({
        arrangementId:section.arrangementId,arrangementName:cleanName(arrangement&&arrangement.name)||'Phrase',
        arrangementSignature:arrangementSignature(arrangement),repeat:clampRepeat(section.repeat),
      });
    }).filter(section=>library.some(item=>item&&item.id===section.arrangementId)));
  }
  function resolveRecord(record,arrangements,recipes){
    const score=root.InkFrameRadialScore,input=record&&typeof record==='object'?record:{},phraseRecords=Array.isArray(arrangements)?arrangements:[],recipeRecords=Array.isArray(recipes)?recipes:[];
    const sections=[],missingArrangements=[],changedArrangements=[],renamedArrangements=[],missingSources=[],changedSources=[],renamedSources=[];
    for(const stored of sanitizeStoredSections(input.sections)){
      const arrangement=phraseRecords.find(item=>item&&item.id===stored.arrangementId);
      if(!arrangement){missingArrangements.push(stored.arrangementId);continue;}
      if(stored.arrangementSignature&&stored.arrangementSignature!==arrangementSignature(arrangement))changedArrangements.push(stored.arrangementId);
      if(stored.arrangementName&&stored.arrangementName!==cleanName(arrangement.name))renamedArrangements.push(stored.arrangementId);
      const resolved=score&&typeof score.resolveArrangement==='function'?score.resolveArrangement(arrangement,recipeRecords):null;
      if(!resolved||!resolved.loadable){
        for(const id of resolved&&resolved.missing||[])if(!missingSources.includes(id))missingSources.push(id);
      }
      for(const id of resolved&&resolved.changed||[])if(!changedSources.includes(id))changedSources.push(id);
      for(const id of resolved&&resolved.renamed||[])if(!renamedSources.includes(id))renamedSources.push(id);
      sections.push(Object.freeze({arrangementId:stored.arrangementId,repeat:stored.repeat}));
    }
    return Object.freeze({
      id:cleanId(input.id),name:cleanName(input.name),sections:Object.freeze(sections),
      missingArrangements:Object.freeze(missingArrangements),changedArrangements:Object.freeze(changedArrangements),renamedArrangements:Object.freeze(renamedArrangements),
      missingSources:Object.freeze(missingSources),changedSources:Object.freeze(changedSources),renamedSources:Object.freeze(renamedSources),
      loadable:sections.length>0&&missingArrangements.length===0&&missingSources.length===0,
    });
  }

  function createScoreLibraryStore(storage,options){
    const opts=options||{},now=typeof opts.now==='function'?opts.now:()=>Date.now();let sequence=0;
    const makeId=typeof opts.makeId==='function'?opts.makeId:()=>`score-${now()}-${++sequence}`;
    let state=sanitizeLibrary({},now());const listeners=new Set();
    try{const raw=storage&&storage.getItem(STORAGE_KEY);if(raw)state=sanitizeLibrary(JSON.parse(raw),now());}catch(_){}
    const persist=()=>{try{if(storage)storage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){}};
    const snapshot=()=>clone(state),emit=()=>{for(const listener of listeners){try{listener(snapshot());}catch(_){}}};
    const commit=next=>{state=sanitizeLibrary(next,now());persist();emit();return snapshot();};
    const find=id=>state.scores.find(item=>item.id===cleanId(id))||null;
    function save(name,sections,arrangementLibrary){
      const safeName=cleanName(name),snapshotValue=snapshotSections(sections,arrangementLibrary);
      if(!safeName)throw new Error('Timing score structure name is required');
      if(!snapshotValue.length)throw new Error('Timing score structure sections are required');
      const timestamp=now(),existing=state.scores.find(item=>item.name.toLowerCase()===safeName.toLowerCase());let id,scores;
      if(existing){
        id=existing.id;scores=state.scores.map(item=>item.id===id?Object.assign({},item,{name:safeName,updatedAt:timestamp,sections:Array.from(snapshotValue,section=>({...section}))}):item);
      }else{
        if(state.scores.length>=MAX_SCORES)throw new Error(`Maximum ${MAX_SCORES} timing score structures reached`);
        const usedIds=new Set(state.scores.map(item=>item.id));id=uniqueId(cleanId(makeId())||`score-${timestamp}`,usedIds);
        scores=state.scores.concat({id,name:safeName,createdAt:timestamp,updatedAt:timestamp,sections:Array.from(snapshotValue,section=>({...section}))});
      }
      commit({schema:SCHEMA,scores});return clone(find(id));
    }
    function duplicate(id,name){
      const source=find(id);if(!source)return null;
      if(state.scores.length>=MAX_SCORES)throw new Error(`Maximum ${MAX_SCORES} timing score structures reached`);
      const usedIds=new Set(state.scores.map(item=>item.id)),usedNames=new Set(state.scores.map(item=>item.name.toLowerCase())),timestamp=now();
      const nextName=uniqueName(cleanName(name)||`${source.name} Copy`,usedNames),nextId=uniqueId(cleanId(makeId())||`score-${timestamp}`,usedIds);
      commit({schema:SCHEMA,scores:state.scores.concat({id:nextId,name:nextName,createdAt:timestamp,updatedAt:timestamp,sections:clone(source.sections)})});return clone(find(nextId));
    }
    function rename(id,name){
      const key=cleanId(id),safeName=cleanName(name);if(!safeName||!find(key))return false;
      if(state.scores.some(item=>item.id!==key&&item.name.toLowerCase()===safeName.toLowerCase()))return false;
      commit({schema:SCHEMA,scores:state.scores.map(item=>item.id===key?Object.assign({},item,{name:safeName,updatedAt:now()}):item)});return true;
    }
    function remove(id){const key=cleanId(id);if(!find(key))return false;commit({schema:SCHEMA,scores:state.scores.filter(item=>item.id!==key)});return true;}
    function replaceLibrary(value){return commit(value);}
    function importJson(text){return replaceLibrary(JSON.parse(String(text||'')));}
    function exportJson(){return JSON.stringify(snapshot(),null,2);}
    function subscribe(listener){if(typeof listener!=='function')return()=>{};listeners.add(listener);return()=>listeners.delete(listener);}
    return {snapshot,find:id=>{const item=find(id);return item?clone(item):null;},save,duplicate,rename,remove,replaceLibrary,importJson,exportJson,subscribe};
  }

  const storage=(()=>{try{return root.localStorage||null;}catch(_){return null;}})();
  const store=createScoreLibraryStore(storage);
  const projectViews=new WeakMap();
  const fallbackView={open:false,selectedId:null,name:''};
  function viewFor(environment){
    const project=environment&&environment.project;
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);if(!view){view={open:false,selectedId:null,name:''};projectViews.set(project,view);}return view;
    }
    return fallbackView;
  }
  function currentRecord(view){
    const library=store.snapshot().scores;if(!library.some(item=>item.id===view.selectedId))view.selectedId=library[0]&&library[0].id||null;
    return view.selectedId?store.find(view.selectedId):null;
  }
  function arrangementLibrary(){
    const library=root.InkFrameRadialPhraseLibrary;return library&&library.store&&typeof library.store.snapshot==='function'?library.store.snapshot().phrases:[];
  }
  function recipeLibrary(){
    const recipes=root.InkFrameRadialRecipes;return recipes&&recipes.store&&typeof recipes.store.snapshot==='function'?recipes.store.snapshot().recipes:[];
  }
  function viewSnapshot(project){
    const existing=project&&projectViews.get(project),view=existing||(project?{open:false,selectedId:null,name:''}:fallbackView),record=view.selectedId?store.find(view.selectedId):null,resolved=record?resolveRecord(record,arrangementLibrary(),recipeLibrary()):null;
    return Object.freeze({
      open:!!view.open,selectedId:view.selectedId||null,name:String(view.name||''),scoreCount:store.snapshot().scores.length,
      missingArrangementCount:resolved?resolved.missingArrangements.length:0,changedArrangementCount:resolved?resolved.changedArrangements.length:0,
      missingSourceCount:resolved?resolved.missingSources.length:0,changedSourceCount:resolved?resolved.changedSources.length:0,loadable:!!(resolved&&resolved.loadable),
    });
  }
  function canEdit(environment){
    if(environment&&typeof environment.canEditTiming==='function')return environment.canEditTiming()!==false;
    return !(environment&&typeof environment.canNavigate==='function')||environment.canNavigate()!==false;
  }

  let lastBoard=null,lastEnvironment=null,styleInstalled=false,rendering=false,refreshQueued=false;
  function scheduleRefresh(full){
    if(refreshQueued)return;refreshQueued=true;
    const run=()=>{refreshQueued=false;if(!lastBoard||!lastEnvironment)return;if(full&&root.InkFrameRadialTimeline&&typeof root.InkFrameRadialTimeline.render==='function')root.InkFrameRadialTimeline.render(lastBoard,lastEnvironment);else render(lastBoard,lastEnvironment);};
    if(root&&typeof root.setTimeout==='function')root.setTimeout(run,0);else run();
  }
  function saveCurrent(name){
    if(!lastEnvironment||!canEdit(lastEnvironment))return null;
    const score=root.InkFrameRadialScore;if(!score||typeof score.structureSnapshot!=='function')return null;
    const view=viewFor(lastEnvironment),structure=score.structureSnapshot(lastEnvironment.project),arrangements=arrangementLibrary();if(!structure.sections.length)return null;
    const fallback=score.scoreName(structure.sections,arrangements),saved=store.save(cleanName(name)||cleanName(structure.name)||fallback,structure.sections,arrangements);
    view.selectedId=saved.id;view.name=saved.name;scheduleRefresh(false);return saved;
  }
  function loadSelected(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;
    const score=root.InkFrameRadialScore,view=viewFor(lastEnvironment),record=currentRecord(view);if(!score||!record)return false;
    const resolved=resolveRecord(record,arrangementLibrary(),recipeLibrary());if(!resolved.loadable||typeof score.loadStructure!=='function')return false;
    const loaded=score.loadStructure({name:record.name,sections:resolved.sections,selectedArrangementId:resolved.sections[0]&&resolved.sections[0].arrangementId});
    if(loaded){view.name=record.name;scheduleRefresh(true);}return loaded;
  }
  function duplicateSelected(name){
    if(!lastEnvironment||!canEdit(lastEnvironment))return null;
    const view=viewFor(lastEnvironment),record=currentRecord(view);if(!record)return null;
    const saved=store.duplicate(record.id,cleanName(name));view.selectedId=saved.id;view.name=saved.name;scheduleRefresh(false);return saved;
  }
  function renameSelected(name){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;
    const view=viewFor(lastEnvironment),record=currentRecord(view),safeName=cleanName(name);if(!record||!store.rename(record.id,safeName))return false;
    view.name=safeName;scheduleRefresh(false);return true;
  }
  function removeSelected(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;
    const view=viewFor(lastEnvironment),record=currentRecord(view);if(!record||!store.remove(record.id))return false;
    const library=store.snapshot().scores;view.selectedId=library[0]&&library[0].id||null;view.name=library[0]&&library[0].name||'';scheduleRefresh(false);return true;
  }

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeScoreLibraryStyle='true';
    style.textContent=`
.inkframe-score-library-toggle[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent))!important;border-color:var(--rim)!important}
.inkframe-score-library-shelf{position:absolute;left:50%;top:-662px;transform:translateX(-50%);z-index:24;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;max-width:min(98vw,1000px);padding:7px;border-radius:18px;background:rgba(10,0,10,.95);border:1px solid rgba(255,220,142,.46);box-shadow:0 22px 50px rgba(10,0,10,.69),inset 0 1px 0 rgba(255,255,255,.20);backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px)}
.inkframe-score-library-shelf button,.inkframe-score-library-shelf input{min-height:31px;padding:6px 9px;border-radius:999px;border:1px solid rgba(255,220,142,.34);background:rgba(255,250,238,.08);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.035em}.inkframe-score-library-shelf button{text-transform:uppercase;touch-action:manipulation}.inkframe-score-library-shelf button[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}.inkframe-score-library-shelf button:disabled{opacity:.32}
.inkframe-score-library-status{min-width:220px;color:#ffdc8e;font:800 9px/1.2 var(--font-ui);text-align:center;white-space:nowrap}.inkframe-score-library-list{display:flex;gap:4px;max-width:410px;overflow-x:auto;scrollbar-width:thin}.inkframe-score-library-name{width:150px}
@media (pointer:coarse){.inkframe-score-library-shelf button,.inkframe-score-library-shelf input{min-height:39px;padding:7px 11px}.inkframe-score-library-list{max-width:490px}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }
  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className||'';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(canEdit(lastEnvironment))handler();});return button;
  }
  function statusText(library,resolved){
    if(!resolved)return `${library.length}/${MAX_SCORES} saved · No score`;
    if(resolved.missingArrangements.length)return `${library.length}/${MAX_SCORES} saved · ${resolved.missingArrangements.length} missing phrase${resolved.missingArrangements.length===1?'':'s'}`;
    if(resolved.missingSources.length)return `${library.length}/${MAX_SCORES} saved · ${resolved.missingSources.length} missing source${resolved.missingSources.length===1?'':'s'}`;
    const changed=resolved.changedArrangements.length+resolved.changedSources.length;
    if(changed)return `${library.length}/${MAX_SCORES} saved · ${changed} changed dependenc${changed===1?'y':'ies'}`;
    return `${library.length}/${MAX_SCORES} saved · Ready`;
  }
  function createShelf(document,board,environment,view){
    const library=store.snapshot().scores,record=currentRecord(view),resolved=record?resolveRecord(record,arrangementLibrary(),recipeLibrary()):null,shelf=document.createElement('div');
    shelf.className='inkframe-score-library-shelf';shelf.setAttribute('role','toolbar');shelf.setAttribute('aria-label','Saved timing score structures');
    const status=document.createElement('span');status.className='inkframe-score-library-status';status.textContent=statusText(library,resolved);shelf.appendChild(status);
    const list=document.createElement('div');list.className='inkframe-score-library-list';list.setAttribute('role','listbox');list.setAttribute('aria-label','Saved timing score structures');
    for(const item of library){
      const button=makeButton(document,item.name,'inkframe-score-library-item',()=>{view.selectedId=item.id;view.name=item.name;scheduleRefresh(false);});button.dataset.scoreStructure=item.id;button.setAttribute('role','option');button.setAttribute('aria-selected',view.selectedId===item.id?'true':'false');button.setAttribute('aria-pressed',view.selectedId===item.id?'true':'false');list.appendChild(button);
    }
    shelf.appendChild(list);
    const input=document.createElement('input');input.className='inkframe-score-library-name';input.type='text';input.maxLength=MAX_NAME;input.placeholder='Score structure name';input.value=view.name||record&&record.name||'';input.setAttribute('aria-label','Timing score structure name');input.addEventListener('input',()=>{view.name=input.value;});shelf.appendChild(input);
    const score=root.InkFrameRadialScore,current=score&&typeof score.structureSnapshot==='function'?score.structureSnapshot(environment&&environment.project):null;
    const selectedExisting=record&&String(record.name||'').toLowerCase()===cleanName(input.value).toLowerCase();
    const save=makeButton(document,'Save Current','inkframe-score-library-save',()=>saveCurrent(input.value));save.disabled=!(current&&current.sections.length)||(library.length>=MAX_SCORES&&!selectedExisting);shelf.appendChild(save);
    const load=makeButton(document,'Load','inkframe-score-library-load',loadSelected);load.disabled=!(resolved&&resolved.loadable);shelf.appendChild(load);
    const rename=makeButton(document,'Rename','inkframe-score-library-rename',()=>renameSelected(input.value));rename.disabled=!record;shelf.appendChild(rename);
    const duplicate=makeButton(document,'Duplicate','inkframe-score-library-duplicate',()=>duplicateSelected(input.value));duplicate.disabled=!record||library.length>=MAX_SCORES;shelf.appendChild(duplicate);
    const remove=makeButton(document,'Delete','inkframe-score-library-delete',removeSelected);remove.disabled=!record;shelf.appendChild(remove);board.appendChild(shelf);
  }
  function installBoard(board){
    if(!board||board._inkframeScoreLibraryInstalled)return;board._inkframeScoreLibraryInstalled=true;
    if(typeof root.MutationObserver==='function'){
      const observer=new root.MutationObserver(()=>{
        if(rendering||refreshQueued||!lastBoard||board!==lastBoard)return;
        const scoreShelf=board.querySelector('.inkframe-score-shelf'),missing=scoreShelf&&!scoreShelf.querySelector('.inkframe-score-library-toggle'),stale=!scoreShelf&&board.querySelector('.inkframe-score-library-shelf');
        if(missing||stale)scheduleRefresh(false);
      });
      observer.observe(board,{childList:true,subtree:true});board._inkframeScoreLibraryObserver=observer;
    }
  }
  function render(board,environment){
    const radial=root.InkFrameRadialTimeline,score=root.InkFrameRadialScore,document=board&&board.ownerDocument;
    if(!board||!document||!radial||!score)return false;
    lastBoard=board;lastEnvironment=environment||{};installStyle(document);installBoard(board);rendering=true;
    try{
      for(const node of board.querySelectorAll('.inkframe-score-library-shelf,.inkframe-score-library-toggle'))node.remove();
      const scoreShelf=board.querySelector('.inkframe-score-shelf'),view=viewFor(lastEnvironment);
      if(!scoreShelf){view.open=false;return true;}
      const record=currentRecord(view);if(record&&!view.name)view.name=record.name;
      const toggle=makeButton(document,'Library','inkframe-score-library-toggle',()=>{view.open=!view.open;scheduleRefresh(false);});toggle.setAttribute('aria-pressed',view.open?'true':'false');toggle.title='Save and reopen editable timing score structures';scoreShelf.appendChild(toggle);
      if(view.open)createShelf(document,board,lastEnvironment,view);return true;
    }finally{rendering=false;}
  }
  function installIntoRadial(){
    const radial=root.InkFrameRadialTimeline;if(!radial||radial.__radialScoreLibraryPatched)return false;
    const originalRender=radial.render;radial.render=function(board,environment){const result=originalRender.call(radial,board,environment);if(result)render(board,environment);return result;};radial.__radialScoreLibraryPatched=true;return true;
  }

  const api={
    STORAGE_KEY,SCHEMA,MAX_SCORES,MAX_SECTIONS,cleanName,cleanId,arrangementSignature,normalizeStoredSection,sanitizeStoredSections,sanitizeLibrary,snapshotSections,resolveRecord,
    createScoreLibraryStore,store,saveCurrent,loadSelected,duplicateSelected,renameSelected,removeSelected,statusText,render,viewSnapshot,installIntoRadial,
    projectCanvasWrites:0,artworkUndoWrites:0,timelineTimingWrites:0,projectSchemaWrites:0,deviceLibraryWrites:true,sourceScoreWrites:0,sourceArrangementWrites:0,sourceRecipeWrites:0,randomWrites:0,transientScoreWrites:true,
  };
  root.InkFrameRadialScoreLibrary=api;installIntoRadial();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
