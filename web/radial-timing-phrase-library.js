// InkFrame — persistent editable timing phrase arrangements
'use strict';
(function(root){
  const STORAGE_KEY='inkframe.radialTiming.phraseLibrary.v1';
  const SCHEMA=1,MAX_PHRASES=16,MAX_SEGMENTS=8,MAX_NAME=32,MAX_ID=48;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const cleanName=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,MAX_NAME);
  const cleanId=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,MAX_ID);
  const clampRepeat=value=>Math.max(1,Math.min(4,Math.round(finite(value,1))));
  const cleanSignature=value=>String(value||'').replace(/[^0-9,]/g,'').slice(0,480);

  function uniqueText(base,seen,maximum,separator,normalizer){
    const normalize=normalizer||String;let candidate=String(base||'').slice(0,maximum);
    if(!seen.has(normalize(candidate)))return candidate;
    for(let suffix=2;suffix<10000;suffix++){
      const tail=`${separator}${suffix}`;candidate=`${String(base||'').slice(0,Math.max(1,maximum-tail.length))}${tail}`;
      if(!seen.has(normalize(candidate)))return candidate;
    }
    throw new Error('Unable to create a unique phrase arrangement identity');
  }
  const uniqueId=(base,seen)=>uniqueText(base,seen,MAX_ID,'-',String);
  const uniqueName=(base,seen)=>uniqueText(base,seen,MAX_NAME,' ',value=>String(value).toLowerCase());

  function normalizeStoredSegment(value){
    const input=value&&typeof value==='object'?value:{};
    return Object.freeze({
      recipeId:cleanId(input.recipeId),recipeName:cleanName(input.recipeName)||'Recipe',
      recipeSignature:cleanSignature(input.recipeSignature),repeat:clampRepeat(input.repeat),
    });
  }
  function sanitizeStoredSegments(value){
    const result=[];
    for(const input of Array.isArray(value)?value:[]){
      if(result.length>=MAX_SEGMENTS)break;const segment=normalizeStoredSegment(input);if(segment.recipeId)result.push(segment);
    }
    return Object.freeze(result);
  }
  function sanitizeRecord(value,index,now){
    const input=value&&typeof value==='object'?value:{},segments=sanitizeStoredSegments(input.segments);
    const createdAt=Number.isFinite(Number(input.createdAt))?Number(input.createdAt):now;
    const updatedAt=Number.isFinite(Number(input.updatedAt))?Number(input.updatedAt):createdAt;
    return {id:cleanId(input.id)||`phrase-${index+1}`,name:cleanName(input.name)||`Phrase ${index+1}`,createdAt,updatedAt,segments:Array.from(segments,segment=>({...segment}))};
  }
  function sanitizeLibrary(value,nowValue){
    const now=Number.isFinite(Number(nowValue))?Number(nowValue):Date.now(),input=value&&typeof value==='object'?value:{},source=Array.isArray(input.phrases)?input.phrases:[];
    const seenIds=new Set(),seenNames=new Set(),phrases=[];
    for(let index=0;index<source.length&&phrases.length<MAX_PHRASES;index++){
      const record=sanitizeRecord(source[index],index,now);if(!record.segments.length)continue;
      record.id=uniqueId(record.id,seenIds);record.name=uniqueName(record.name,seenNames);seenIds.add(record.id);seenNames.add(record.name.toLowerCase());phrases.push(record);
    }
    return {schema:SCHEMA,phrases};
  }
  function recipeSignature(recipe){
    const recipes=root.InkFrameRadialRecipes;
    if(recipes&&typeof recipes.valuesSignature==='function')return recipes.valuesSignature(recipe&&recipe.values);
    return Array.from(recipe&&Array.isArray(recipe.values)?recipe.values:[]).join(',');
  }
  function snapshotSegments(segments,library){
    const phrases=root.InkFrameRadialPhrases,recipes=Array.isArray(library)?library:[];
    const safe=phrases&&typeof phrases.sanitizeSegments==='function'?phrases.sanitizeSegments(segments,recipes):[];
    return Object.freeze(Array.from(safe,segment=>{
      const recipe=recipes.find(item=>item&&item.id===segment.recipeId);
      return Object.freeze({recipeId:segment.recipeId,recipeName:cleanName(recipe&&recipe.name)||'Recipe',recipeSignature:recipeSignature(recipe),repeat:clampRepeat(segment.repeat)});
    }));
  }
  function resolveRecord(record,library){
    const input=record&&typeof record==='object'?record:{},recipes=Array.isArray(library)?library:[],segments=[],missing=[],changed=[],renamed=[];
    for(const segment of sanitizeStoredSegments(input.segments)){
      const recipe=recipes.find(item=>item&&item.id===segment.recipeId);
      if(!recipe){missing.push(segment.recipeId);continue;}
      if(segment.recipeSignature&&segment.recipeSignature!==recipeSignature(recipe))changed.push(segment.recipeId);
      if(segment.recipeName&&segment.recipeName!==cleanName(recipe.name))renamed.push(segment.recipeId);
      segments.push(Object.freeze({recipeId:segment.recipeId,repeat:segment.repeat}));
    }
    return Object.freeze({
      id:cleanId(input.id),name:cleanName(input.name),segments:Object.freeze(segments),
      missing:Object.freeze(missing),changed:Object.freeze(changed),renamed:Object.freeze(renamed),
      loadable:segments.length>0&&missing.length===0,
    });
  }

  function createPhraseLibraryStore(storage,options){
    const opts=options||{},now=typeof opts.now==='function'?opts.now:()=>Date.now();let sequence=0;
    const makeId=typeof opts.makeId==='function'?opts.makeId:()=>`phrase-${now()}-${++sequence}`;
    let state=sanitizeLibrary({},now());const listeners=new Set();
    try{const raw=storage&&storage.getItem(STORAGE_KEY);if(raw)state=sanitizeLibrary(JSON.parse(raw),now());}catch(_){}
    const persist=()=>{try{if(storage)storage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){}};
    const snapshot=()=>clone(state),emit=()=>{for(const listener of listeners){try{listener(snapshot());}catch(_){}}};
    const commit=next=>{state=sanitizeLibrary(next,now());persist();emit();return snapshot();};
    const find=id=>state.phrases.find(item=>item.id===cleanId(id))||null;
    function save(name,segments,recipeLibrary){
      const safeName=cleanName(name),snapshotValue=snapshotSegments(segments,recipeLibrary);if(!safeName)throw new Error('Phrase arrangement name is required');if(!snapshotValue.length)throw new Error('Phrase arrangement segments are required');
      const timestamp=now(),existing=state.phrases.find(item=>item.name.toLowerCase()===safeName.toLowerCase());let id,phrases;
      if(existing){id=existing.id;phrases=state.phrases.map(item=>item.id===id?Object.assign({},item,{name:safeName,updatedAt:timestamp,segments:Array.from(snapshotValue,segment=>({...segment}))}):item);}
      else{
        if(state.phrases.length>=MAX_PHRASES)throw new Error(`Maximum ${MAX_PHRASES} phrase arrangements reached`);
        const usedIds=new Set(state.phrases.map(item=>item.id));id=uniqueId(cleanId(makeId())||`phrase-${timestamp}`,usedIds);
        phrases=state.phrases.concat({id,name:safeName,createdAt:timestamp,updatedAt:timestamp,segments:Array.from(snapshotValue,segment=>({...segment}))});
      }
      commit({schema:SCHEMA,phrases});return clone(find(id));
    }
    function duplicate(id,name){
      const source=find(id);if(!source)return null;if(state.phrases.length>=MAX_PHRASES)throw new Error(`Maximum ${MAX_PHRASES} phrase arrangements reached`);
      const usedIds=new Set(state.phrases.map(item=>item.id)),usedNames=new Set(state.phrases.map(item=>item.name.toLowerCase())),timestamp=now();
      const nextName=uniqueName(cleanName(name)||`${source.name} Copy`,usedNames),nextId=uniqueId(cleanId(makeId())||`phrase-${timestamp}`,usedIds);
      commit({schema:SCHEMA,phrases:state.phrases.concat({id:nextId,name:nextName,createdAt:timestamp,updatedAt:timestamp,segments:clone(source.segments)})});return clone(find(nextId));
    }
    function rename(id,name){
      const key=cleanId(id),safeName=cleanName(name);if(!safeName||!find(key))return false;
      if(state.phrases.some(item=>item.id!==key&&item.name.toLowerCase()===safeName.toLowerCase()))return false;
      commit({schema:SCHEMA,phrases:state.phrases.map(item=>item.id===key?Object.assign({},item,{name:safeName,updatedAt:now()}):item)});return true;
    }
    function remove(id){const key=cleanId(id);if(!find(key))return false;commit({schema:SCHEMA,phrases:state.phrases.filter(item=>item.id!==key)});return true;}
    function replaceLibrary(value){return commit(value);}
    function importJson(text){return replaceLibrary(JSON.parse(String(text||'')));}
    function exportJson(){return JSON.stringify(snapshot(),null,2);}
    function subscribe(listener){if(typeof listener!=='function')return()=>{};listeners.add(listener);return()=>listeners.delete(listener);}
    return {snapshot,find:id=>{const item=find(id);return item?clone(item):null;},save,duplicate,rename,remove,replaceLibrary,importJson,exportJson,subscribe};
  }

  const storage=(()=>{try{return root.localStorage||null;}catch(_){return null;}})();
  const store=createPhraseLibraryStore(storage);
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
    const library=store.snapshot().phrases;if(!library.some(item=>item.id===view.selectedId))view.selectedId=library[0]&&library[0].id||null;
    return view.selectedId?store.find(view.selectedId):null;
  }
  function viewSnapshot(project){
    const existing=project&&projectViews.get(project),view=existing||(project?{open:false,selectedId:null,name:''}:fallbackView),record=view.selectedId?store.find(view.selectedId):null,resolved=record?resolveRecord(record,recipeLibrary()):null;
    return Object.freeze({open:!!view.open,selectedId:view.selectedId||null,name:String(view.name||''),phraseCount:store.snapshot().phrases.length,missingCount:resolved?resolved.missing.length:0,changedCount:resolved?resolved.changed.length:0,loadable:!!(resolved&&resolved.loadable)});
  }
  function recipeLibrary(){
    const recipes=root.InkFrameRadialRecipes;return recipes&&recipes.store&&typeof recipes.store.snapshot==='function'?recipes.store.snapshot().recipes:[];
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
    if(!lastEnvironment||!canEdit(lastEnvironment))return null;const phrases=root.InkFrameRadialPhrases;if(!phrases||typeof phrases.arrangementSnapshot!=='function')return null;
    const view=viewFor(lastEnvironment),arrangement=phrases.arrangementSnapshot(lastEnvironment.project),library=recipeLibrary();if(!arrangement.segments.length)return null;
    const fallback=phrases.phraseName(arrangement.segments,library),saved=store.save(cleanName(name)||cleanName(arrangement.name)||fallback,arrangement.segments,library);
    view.selectedId=saved.id;view.name=saved.name;scheduleRefresh(false);return saved;
  }
  function loadSelected(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const phrases=root.InkFrameRadialPhrases,view=viewFor(lastEnvironment),record=currentRecord(view);if(!phrases||!record)return false;
    const resolved=resolveRecord(record,recipeLibrary());if(!resolved.loadable||typeof phrases.loadArrangement!=='function')return false;
    const loaded=phrases.loadArrangement({name:record.name,segments:resolved.segments,selectedRecipeId:resolved.segments[0]&&resolved.segments[0].recipeId});if(loaded){view.name=record.name;scheduleRefresh(true);}return loaded;
  }
  function duplicateSelected(name){
    if(!lastEnvironment||!canEdit(lastEnvironment))return null;const view=viewFor(lastEnvironment),record=currentRecord(view);if(!record)return null;
    const saved=store.duplicate(record.id,cleanName(name));view.selectedId=saved.id;view.name=saved.name;scheduleRefresh(false);return saved;
  }
  function renameSelected(name){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const view=viewFor(lastEnvironment),record=currentRecord(view),safeName=cleanName(name);if(!record||!store.rename(record.id,safeName))return false;
    view.name=safeName;scheduleRefresh(false);return true;
  }
  function removeSelected(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const view=viewFor(lastEnvironment),record=currentRecord(view);if(!record||!store.remove(record.id))return false;
    const library=store.snapshot().phrases;view.selectedId=library[0]&&library[0].id||null;view.name=library[0]&&library[0].name||'';scheduleRefresh(false);return true;
  }

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;const style=document.createElement('style');style.dataset.inkframePhraseLibraryStyle='true';
    style.textContent=`
.inkframe-phrase-library-toggle[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent))!important;border-color:var(--rim)!important}
.inkframe-phrase-library-shelf{position:absolute;left:50%;top:-518px;transform:translateX(-50%);z-index:20;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;max-width:min(97vw,980px);padding:7px;border-radius:18px;background:rgba(10,0,10,.93);border:1px solid rgba(164,221,255,.43);box-shadow:0 18px 42px rgba(10,0,10,.65),inset 0 1px 0 rgba(255,255,255,.20);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.inkframe-phrase-library-shelf button,.inkframe-phrase-library-shelf input{min-height:31px;padding:6px 9px;border-radius:999px;border:1px solid rgba(164,221,255,.34);background:rgba(239,249,255,.08);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.035em}.inkframe-phrase-library-shelf button{text-transform:uppercase;touch-action:manipulation}.inkframe-phrase-library-shelf button[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}.inkframe-phrase-library-shelf button:disabled{opacity:.32}
.inkframe-phrase-library-status{min-width:190px;color:#a4ddff;font:800 9px/1.2 var(--font-ui);text-align:center;white-space:nowrap}.inkframe-phrase-library-list{display:flex;gap:4px;max-width:390px;overflow-x:auto;scrollbar-width:thin}.inkframe-phrase-library-name{width:150px}
@media (pointer:coarse){.inkframe-phrase-library-shelf button,.inkframe-phrase-library-shelf input{min-height:39px;padding:7px 11px}.inkframe-phrase-library-list{max-width:470px}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }
  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className||'';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(canEdit(lastEnvironment))handler();});return button;
  }
  function createShelf(document,board,environment,view){
    const library=store.snapshot().phrases,record=currentRecord(view),resolved=record?resolveRecord(record,recipeLibrary()):null,shelf=document.createElement('div');shelf.className='inkframe-phrase-library-shelf';shelf.setAttribute('role','toolbar');shelf.setAttribute('aria-label','Saved timing phrase arrangements');
    const status=document.createElement('span');status.className='inkframe-phrase-library-status';
    status.textContent=!record?`${library.length}/${MAX_PHRASES} saved · No arrangement`:resolved.missing.length?`${library.length}/${MAX_PHRASES} saved · ${resolved.missing.length} missing source${resolved.missing.length===1?'':'s'}`:resolved.changed.length?`${library.length}/${MAX_PHRASES} saved · ${resolved.changed.length} source${resolved.changed.length===1?'':'s'} changed`:`${library.length}/${MAX_PHRASES} saved · Ready`;
    shelf.appendChild(status);
    const list=document.createElement('div');list.className='inkframe-phrase-library-list';list.setAttribute('role','listbox');list.setAttribute('aria-label','Saved phrase arrangements');
    for(const item of library){const button=makeButton(document,item.name,'inkframe-phrase-library-item',()=>{view.selectedId=item.id;view.name=item.name;scheduleRefresh(false);});button.dataset.phraseArrangement=item.id;button.setAttribute('role','option');button.setAttribute('aria-selected',view.selectedId===item.id?'true':'false');button.setAttribute('aria-pressed',view.selectedId===item.id?'true':'false');list.appendChild(button);}shelf.appendChild(list);
    const input=document.createElement('input');input.className='inkframe-phrase-library-name';input.type='text';input.maxLength=MAX_NAME;input.placeholder='Arrangement name';input.value=view.name||record&&record.name||'';input.setAttribute('aria-label','Phrase arrangement name');input.addEventListener('input',()=>{view.name=input.value;});shelf.appendChild(input);
    const save=makeButton(document,'Save Current','inkframe-phrase-library-save',()=>saveCurrent(input.value));save.disabled=store.snapshot().phrases.length>=MAX_PHRASES&&!record;shelf.appendChild(save);
    const load=makeButton(document,'Load','inkframe-phrase-library-load',loadSelected);load.disabled=!(resolved&&resolved.loadable);shelf.appendChild(load);
    const rename=makeButton(document,'Rename','inkframe-phrase-library-rename',()=>renameSelected(input.value));rename.disabled=!record;shelf.appendChild(rename);
    const duplicate=makeButton(document,'Duplicate','inkframe-phrase-library-duplicate',()=>duplicateSelected(input.value));duplicate.disabled=!record||library.length>=MAX_PHRASES;shelf.appendChild(duplicate);
    const remove=makeButton(document,'Delete','inkframe-phrase-library-delete',removeSelected);remove.disabled=!record;shelf.appendChild(remove);board.appendChild(shelf);
  }
  function installBoard(board){
    if(!board||board._inkframePhraseLibraryInstalled)return;board._inkframePhraseLibraryInstalled=true;
    if(typeof root.MutationObserver==='function'){
      const observer=new root.MutationObserver(()=>{if(rendering||refreshQueued||!lastBoard||board!==lastBoard)return;const phraseShelf=board.querySelector('.inkframe-phrase-shelf'),missing=phraseShelf&&!phraseShelf.querySelector('.inkframe-phrase-library-toggle'),stale=!phraseShelf&&board.querySelector('.inkframe-phrase-library-shelf');if(missing||stale)scheduleRefresh(false);});
      observer.observe(board,{childList:true,subtree:true});board._inkframePhraseLibraryObserver=observer;
    }
  }
  function render(board,environment){
    const radial=root.InkFrameRadialTimeline,phrases=root.InkFrameRadialPhrases,document=board&&board.ownerDocument;if(!board||!document||!radial||!phrases)return false;
    lastBoard=board;lastEnvironment=environment||{};installStyle(document);installBoard(board);rendering=true;
    try{
      for(const node of board.querySelectorAll('.inkframe-phrase-library-shelf,.inkframe-phrase-library-toggle'))node.remove();
      const phraseShelf=board.querySelector('.inkframe-phrase-shelf'),view=viewFor(lastEnvironment);if(!phraseShelf){view.open=false;return true;}
      const record=currentRecord(view);if(record&&!view.name)view.name=record.name;
      const toggle=makeButton(document,'Library','inkframe-phrase-library-toggle',()=>{view.open=!view.open;scheduleRefresh(false);});toggle.setAttribute('aria-pressed',view.open?'true':'false');toggle.title='Save and reopen editable timing phrase arrangements';phraseShelf.appendChild(toggle);
      if(view.open)createShelf(document,board,lastEnvironment,view);return true;
    }finally{rendering=false;}
  }
  function installIntoRadial(){
    const radial=root.InkFrameRadialTimeline;if(!radial||radial.__radialPhraseLibraryPatched)return false;const originalRender=radial.render;
    radial.render=function(board,environment){const result=originalRender.call(radial,board,environment);if(result)render(board,environment);return result;};radial.__radialPhraseLibraryPatched=true;return true;
  }

  const api={
    STORAGE_KEY,SCHEMA,MAX_PHRASES,MAX_SEGMENTS,cleanName,cleanId,normalizeStoredSegment,sanitizeStoredSegments,sanitizeLibrary,recipeSignature,snapshotSegments,resolveRecord,
    createPhraseLibraryStore,store,saveCurrent,loadSelected,duplicateSelected,renameSelected,removeSelected,render,viewSnapshot,installIntoRadial,
    projectCanvasWrites:0,artworkUndoWrites:0,timelineTimingWrites:0,projectSchemaWrites:0,deviceLibraryWrites:true,sourceRecipeWrites:0,randomWrites:0,transientPhraseWrites:true,
  };
  root.InkFrameRadialPhraseLibrary=api;installIntoRadial();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
