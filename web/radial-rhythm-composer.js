// InkFrame — named custom exposure rhythm composer and bounded app library
'use strict';
(function(root){
  const STORAGE_KEY='inkframe.radial.customRhythms.v1';
  const SCHEMA=1,MAX_RHYTHMS=24,MAX_PINNED=4,MAX_NAME=32,MAX_ID=48,MAX_STEPS=12;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clampHold=value=>Math.max(1,Math.min(8,Math.round(finite(value,1))));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const cleanName=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,MAX_NAME);
  const cleanId=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,MAX_ID);
  const normalizeSequence=value=>Object.freeze((Array.isArray(value)?value:[]).slice(0,MAX_STEPS).map(clampHold).length?(Array.isArray(value)?value:[]).slice(0,MAX_STEPS).map(clampHold):[1]);

  function uniqueText(base,seen,maxLength,separator,normalizer){
    const normalize=normalizer||String;let candidate=String(base||'').slice(0,maxLength);
    if(!seen.has(normalize(candidate)))return candidate;
    for(let suffix=2;suffix<10000;suffix++){
      const tail=`${separator}${suffix}`;candidate=`${String(base||'').slice(0,Math.max(1,maxLength-tail.length))}${tail}`;
      if(!seen.has(normalize(candidate)))return candidate;
    }
    throw new Error('Unable to create a unique rhythm identifier');
  }
  const uniqueId=(base,seen)=>uniqueText(base,seen,MAX_ID,'-',String);
  const uniqueName=(base,seen)=>uniqueText(base,seen,MAX_NAME,' ',value=>String(value).toLowerCase());

  function minimalPeriod(values,maxSteps=MAX_STEPS){
    const source=(Array.isArray(values)?values:[]).map(clampHold);if(!source.length)return Object.freeze([1]);
    const limit=Math.max(1,Math.min(MAX_STEPS,Math.floor(finite(maxSteps,MAX_STEPS)),source.length));
    for(let size=1;size<=limit;size++){
      let matches=true;for(let i=0;i<source.length;i++){if(source[i]!==source[i%size]){matches=false;break;}}
      if(matches)return Object.freeze(source.slice(0,size));
    }
    return Object.freeze(source.slice(0,limit));
  }

  function sanitizeRhythm(value,index,now){
    const input=value&&typeof value==='object'?value:{};
    const createdAt=Number.isFinite(Number(input.createdAt))?Number(input.createdAt):now;
    return {
      id:cleanId(input.id)||`rhythm-${index+1}`,
      name:cleanName(input.name)||`Rhythm ${index+1}`,
      values:Array.from(normalizeSequence(input.values)),
      createdAt,
      updatedAt:Number.isFinite(Number(input.updatedAt))?Number(input.updatedAt):createdAt,
    };
  }

  function sanitizeLibrary(value,nowValue){
    const now=Number.isFinite(Number(nowValue))?Number(nowValue):Date.now(),input=value&&typeof value==='object'?value:{};
    const source=Array.isArray(input.rhythms)?input.rhythms:[],rhythms=[],seenIds=new Set(),seenNames=new Set();
    for(let index=0;index<source.length&&rhythms.length<MAX_RHYTHMS;index++){
      const item=sanitizeRhythm(source[index],index,now);
      item.id=uniqueId(item.id,seenIds);item.name=uniqueName(item.name,seenNames);
      seenIds.add(item.id);seenNames.add(item.name.toLowerCase());rhythms.push(item);
    }
    const validIds=new Set(rhythms.map(item=>item.id)),pinned=[];
    for(const raw of Array.isArray(input.pinned)?input.pinned:[]){
      const id=cleanId(raw);if(validIds.has(id)&&!pinned.includes(id)&&pinned.length<MAX_PINNED)pinned.push(id);
    }
    return {schema:SCHEMA,rhythms,pinned};
  }

  function createCustomRhythmStore(storage,options){
    const opts=options||{},now=typeof opts.now==='function'?opts.now:()=>Date.now();let sequence=0;
    const makeId=typeof opts.makeId==='function'?opts.makeId:()=>`rhythm-${now()}-${++sequence}`;
    let state=sanitizeLibrary({},now());const listeners=new Set();
    try{const raw=storage&&storage.getItem(STORAGE_KEY);if(raw)state=sanitizeLibrary(JSON.parse(raw),now());}catch(_){}
    const persist=()=>{try{if(storage)storage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){} };
    const snapshot=()=>clone(state),emit=()=>{for(const listener of listeners){try{listener(snapshot());}catch(_){}}};
    const commit=next=>{state=sanitizeLibrary(next,now());persist();emit();return snapshot();};
    const find=id=>state.rhythms.find(item=>item.id===cleanId(id))||null;

    function save(name,values,pin){
      const safeName=cleanName(name);if(!safeName)throw new Error('Rhythm name is required');
      const normalized=Array.from(normalizeSequence(values)),timestamp=now();
      const existing=state.rhythms.find(item=>item.name.toLowerCase()===safeName.toLowerCase());let id,rhythms;
      if(existing){id=existing.id;rhythms=state.rhythms.map(item=>item.id===id?Object.assign({},item,{name:safeName,values:normalized,updatedAt:timestamp}):item);}
      else{
        if(state.rhythms.length>=MAX_RHYTHMS)throw new Error(`Maximum ${MAX_RHYTHMS} rhythms reached`);
        id=uniqueId(cleanId(makeId())||`rhythm-${timestamp}`,new Set(state.rhythms.map(item=>item.id)));
        rhythms=state.rhythms.concat({id,name:safeName,values:normalized,createdAt:timestamp,updatedAt:timestamp});
      }
      const pinned=state.pinned.slice();if(pin&&!pinned.includes(id)){if(pinned.length>=MAX_PINNED)pinned.shift();pinned.push(id);}
      commit({schema:SCHEMA,rhythms,pinned});return clone(find(id));
    }
    function remove(id){const key=cleanId(id);if(!find(key))return false;commit({schema:SCHEMA,rhythms:state.rhythms.filter(item=>item.id!==key),pinned:state.pinned.filter(item=>item!==key)});return true;}
    function rename(id,name){
      const key=cleanId(id),safeName=cleanName(name);if(!safeName||!find(key))return false;
      if(state.rhythms.some(item=>item.id!==key&&item.name.toLowerCase()===safeName.toLowerCase()))return false;
      commit({schema:SCHEMA,rhythms:state.rhythms.map(item=>item.id===key?Object.assign({},item,{name:safeName,updatedAt:now()}):item),pinned:state.pinned});return true;
    }
    function togglePin(id){
      const key=cleanId(id);if(!find(key))return false;let pinned=state.pinned.slice();
      if(pinned.includes(key))pinned=pinned.filter(item=>item!==key);else{if(pinned.length>=MAX_PINNED)pinned.shift();pinned.push(key);}
      commit({schema:SCHEMA,rhythms:state.rhythms,pinned});return pinned.includes(key);
    }
    function replaceLibrary(value){return commit(value);}
    function importJson(text){return replaceLibrary(JSON.parse(String(text||'')));}
    function exportJson(){return JSON.stringify(snapshot(),null,2);}
    function subscribe(listener){if(typeof listener!=='function')return()=>{};listeners.add(listener);return()=>listeners.delete(listener);}
    return {snapshot,find:id=>{const item=find(id);return item?clone(item):null;},save,remove,rename,togglePin,replaceLibrary,importJson,exportJson,subscribe};
  }

  const library=createCustomRhythmStore(root.localStorage||null);
  const projectViews=new WeakMap(),fallbackView={open:false,name:'',values:[1,2],selectedStep:0,preview:false,loadedId:null};
  function viewFor(env){
    const project=env&&env.project;if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);if(!view){view={open:false,name:'',values:[1,2],selectedStep:0,preview:false,loadedId:null};projectViews.set(project,view);}return view;
    }
    return fallbackView;
  }
  function viewSnapshot(project){
    const view=project&&projectViews.get(project)||fallbackView;
    return Object.freeze({open:!!view.open,name:view.name,values:Object.freeze(view.values.slice()),selectedStep:view.selectedStep,preview:!!view.preview,loadedId:view.loadedId||null});
  }

  let styleInstalled=false,lastBoard=null,lastEnvironment=null,lastPlan=null,rendering=false,refreshQueued=false;
  function canEdit(env){
    if(env&&typeof env.canEditTiming==='function')return env.canEditTiming()!==false;
    return !(env&&typeof env.canNavigate==='function')||env.canNavigate()!==false;
  }
  function scheduleRefresh(){
    if(refreshQueued)return;refreshQueued=true;const run=()=>{refreshQueued=false;if(lastBoard&&lastEnvironment)render(lastBoard,lastEnvironment);};
    if(root&&typeof root.setTimeout==='function')root.setTimeout(run,0);else run();
  }
  library.subscribe(scheduleRefresh);

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeComposerStyle='true';
    style.textContent=`
.inkframe-custom-rhythm-toggle[aria-pressed="true"],.inkframe-custom-rhythm-pin{background:linear-gradient(160deg,rgba(87,0,92,.92),rgba(187,0,55,.88))!important;border-color:rgba(255,208,220,.72)!important}
.inkframe-rhythm-composer{position:absolute;left:50%;top:-326px;transform:translateX(-50%);z-index:12;width:min(94vw,780px);max-height:170px;overflow:auto;padding:8px;border-radius:18px;background:rgba(13,2,13,.90);border:1px solid rgba(247,202,201,.34);box-shadow:0 12px 34px rgba(0,0,0,.52),inset 0 1px 0 rgba(255,255,255,.14);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.inkframe-composer-head,.inkframe-composer-tools,.inkframe-composer-steps,.inkframe-composer-library{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.inkframe-composer-head{margin-bottom:7px}.inkframe-composer-name{flex:1 1 180px;min-height:34px;border:1px solid rgba(247,202,201,.34);border-radius:11px;background:rgba(255,255,255,.075);color:#fff;padding:7px 10px;font:750 11px/1 var(--font-ui)}
.inkframe-rhythm-composer button{min-height:32px;padding:6px 9px;border-radius:999px;border:1px solid rgba(247,202,201,.30);background:rgba(255,240,243,.07);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.04em;text-transform:uppercase;touch-action:manipulation}
.inkframe-composer-steps{padding:6px 0}.inkframe-composer-step{min-width:36px!important;font-size:11px!important}.inkframe-composer-step[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim);box-shadow:0 0 12px rgba(187,0,55,.55)}
.inkframe-composer-tools{padding-bottom:7px;border-bottom:1px solid rgba(247,202,201,.16)}
.inkframe-composer-library{padding-top:7px;align-items:stretch}.inkframe-composer-card{display:flex;align-items:center;gap:4px;padding:4px;border:1px solid rgba(247,202,201,.18);border-radius:12px;background:rgba(255,255,255,.035)}
.inkframe-composer-card strong{padding:0 5px;color:var(--blush);font:800 9px/1.2 var(--font-ui);white-space:nowrap}.inkframe-composer-card small{opacity:.64;font:700 8px/1 var(--font-ui);white-space:nowrap}
.inkframe-composer-preview-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:3}.inkframe-composer-preview-arc{fill:none;stroke:#ffe7f0;stroke-width:7;stroke-linecap:round;stroke-dasharray:8 4;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 9px rgba(255,255,255,.8)) drop-shadow(0 0 13px rgba(87,0,92,.9))}
@media(pointer:coarse){.inkframe-rhythm-composer{max-height:205px}.inkframe-rhythm-composer button{min-height:38px}.inkframe-composer-name{min-height:40px}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }

  function draftDefinition(view){
    const patterns=root.InkFrameRadialPatterns;
    const raw={id:`custom:${view.loadedId||'draft'}`,label:cleanName(view.name)||'Custom Rhythm',values:view.values};
    return patterns&&typeof patterns.normalizeDefinition==='function'?patterns.normalizeDefinition(raw):raw;
  }
  function resolveScope(){const patterns=root.InkFrameRadialPatterns;return patterns&&lastEnvironment?patterns.resolveTargetIndices(lastEnvironment):{kind:'none',label:'No frames',indices:[]};}
  function captureScope(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const scope=resolveScope();if(!scope.indices.length)return false;
    const view=viewFor(lastEnvironment),values=scope.indices.map(index=>typeof lastEnvironment.holdAt==='function'?lastEnvironment.holdAt(index):1);
    view.values=Array.from(minimalPeriod(values));view.selectedStep=Math.min(view.selectedStep,view.values.length-1);view.preview=false;scheduleRefresh();return true;
  }
  function applyDraft(){
    const patterns=root.InkFrameRadialPatterns,view=viewFor(lastEnvironment);if(!patterns||!canEdit(lastEnvironment))return false;
    const applied=patterns.applyDefinition(draftDefinition(view));if(applied){view.preview=false;scheduleRefresh();}return applied;
  }
  function loadRhythm(id){
    const item=library.find(id);if(!item||!lastEnvironment)return false;const view=viewFor(lastEnvironment);
    view.loadedId=item.id;view.name=item.name;view.values=item.values.slice();view.selectedStep=0;view.preview=false;scheduleRefresh();return true;
  }
  function saveDraft(pin){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;const view=viewFor(lastEnvironment),snapshot=library.snapshot();
    const name=cleanName(view.name)||`Rhythm ${snapshot.rhythms.length+1}`;
    try{const item=library.save(name,view.values,!!pin);view.loadedId=item.id;view.name=item.name;return item;}catch(_){return false;}
  }
  function applyRhythm(id){
    const item=library.find(id),patterns=root.InkFrameRadialPatterns;if(!item||!patterns||!canEdit(lastEnvironment))return false;
    return patterns.applyDefinition({id:`custom:${item.id}`,label:item.name,values:item.values});
  }

  function createPreview(document,board,plan,env,view){
    const patterns=root.InkFrameRadialPatterns,timing=root.InkFrameRadialTiming,definition=draftDefinition(view);
    if(!patterns||!timing||!definition||typeof timing.holdArcPath!=='function')return;
    const scope=patterns.resolveTargetIndices(env),assignments=patterns.assignmentsForPattern(definition,scope.indices,env.holdAt);if(!assignments.length)return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('inkframe-composer-preview-svg');svg.setAttribute('viewBox',`0 0 ${plan.metrics.width} ${plan.metrics.height}`);svg.setAttribute('aria-hidden','true');
    for(const entry of assignments){const slot=plan.slots[entry.index];if(!slot)continue;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.classList.add('inkframe-composer-preview-arc');path.dataset.frame=String(entry.index);path.dataset.hold=String(entry.after);path.setAttribute('d',timing.holdArcPath(plan,slot,entry.after));svg.appendChild(path);}
    board.appendChild(svg);
  }
  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className||'';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(canEdit(lastEnvironment))handler();});return button;
  }
  function adjustStep(view,delta){view.values[view.selectedStep]=clampHold(view.values[view.selectedStep]+delta);view.preview=false;scheduleRefresh();}
  function addStep(view){if(view.values.length>=MAX_STEPS)return;view.values.splice(view.selectedStep+1,0,view.values[view.selectedStep]);view.selectedStep++;view.preview=false;scheduleRefresh();}
  function removeStep(view){if(view.values.length<=1)return;view.values.splice(view.selectedStep,1);view.selectedStep=Math.min(view.selectedStep,view.values.length-1);view.preview=false;scheduleRefresh();}

  function createComposer(document,board,view){
    const panel=document.createElement('div');panel.className='inkframe-rhythm-composer';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Custom exposure rhythm composer');
    const head=document.createElement('div');head.className='inkframe-composer-head';
    const input=document.createElement('input');input.className='inkframe-composer-name';input.type='text';input.maxLength=MAX_NAME;input.placeholder='Rhythm name';input.value=view.name;input.setAttribute('aria-label','Custom rhythm name');input.addEventListener('input',()=>{view.name=cleanName(input.value);});head.appendChild(input);
    head.appendChild(makeButton(document,'Save','inkframe-composer-save',()=>{saveDraft(false);scheduleRefresh();}));
    head.appendChild(makeButton(document,'Save + Pin','inkframe-composer-save-pin',()=>{saveDraft(true);scheduleRefresh();}));
    head.appendChild(makeButton(document,'Close','inkframe-composer-close',()=>{view.open=false;view.preview=false;scheduleRefresh();}));panel.appendChild(head);
    const steps=document.createElement('div');steps.className='inkframe-composer-steps';steps.setAttribute('role','listbox');steps.setAttribute('aria-label','Custom hold sequence');
    view.values.forEach((value,index)=>{const button=makeButton(document,String(value),'inkframe-composer-step',()=>{view.selectedStep=index;scheduleRefresh();});button.dataset.step=String(index);button.setAttribute('aria-label',`Step ${index+1} · hold ${value}`);button.setAttribute('aria-pressed',index===view.selectedStep?'true':'false');steps.appendChild(button);});panel.appendChild(steps);
    const tools=document.createElement('div');tools.className='inkframe-composer-tools';
    tools.appendChild(makeButton(document,'−','inkframe-composer-minus',()=>adjustStep(view,-1)));
    tools.appendChild(makeButton(document,'+','inkframe-composer-plus',()=>adjustStep(view,1)));
    tools.appendChild(makeButton(document,'Add','inkframe-composer-add',()=>addStep(view)));
    tools.appendChild(makeButton(document,'Remove','inkframe-composer-remove',()=>removeStep(view)));
    tools.appendChild(makeButton(document,'Capture','inkframe-composer-capture',captureScope));
    const preview=makeButton(document,'Preview','inkframe-composer-preview',()=>{view.preview=!view.preview;scheduleRefresh();});preview.setAttribute('aria-pressed',view.preview?'true':'false');tools.appendChild(preview);
    tools.appendChild(makeButton(document,'Apply','inkframe-composer-apply',applyDraft));panel.appendChild(tools);
    const list=document.createElement('div');list.className='inkframe-composer-library';list.setAttribute('aria-label','Saved custom rhythms');const snapshot=library.snapshot();
    for(const item of snapshot.rhythms){
      const card=document.createElement('div');card.className='inkframe-composer-card';card.dataset.rhythmId=item.id;
      const label=document.createElement('strong');label.textContent=item.name;card.appendChild(label);const values=document.createElement('small');values.textContent=item.values.join('·');card.appendChild(values);
      card.appendChild(makeButton(document,'Load','inkframe-composer-load',()=>loadRhythm(item.id)));
      card.appendChild(makeButton(document,'Apply','inkframe-composer-library-apply',()=>applyRhythm(item.id)));
      const pin=makeButton(document,snapshot.pinned.includes(item.id)?'Unpin':'Pin','inkframe-composer-pin',()=>{library.togglePin(item.id);});pin.setAttribute('aria-pressed',snapshot.pinned.includes(item.id)?'true':'false');card.appendChild(pin);
      card.appendChild(makeButton(document,'Delete','inkframe-composer-delete',()=>{library.remove(item.id);if(view.loadedId===item.id){view.loadedId=null;}scheduleRefresh();}));list.appendChild(card);
    }
    panel.appendChild(list);board.appendChild(panel);
  }

  function installBoard(board){
    if(!board||board._inkframeComposerInstalled)return;board._inkframeComposerInstalled=true;
    board.addEventListener('keydown',event=>{
      if(!lastEnvironment||!canEdit(lastEnvironment)||event.target&&event.target.tagName==='INPUT')return;
      const patterns=root.InkFrameRadialPatterns,patternView=patterns&&patterns.viewSnapshot?patterns.viewSnapshot(lastEnvironment.project):{open:false};
      if(!patternView.open)return;const view=viewFor(lastEnvironment);let handled=true;
      if(event.key.toLowerCase()==='c'){view.open=!view.open;if(!view.open)view.preview=false;}
      else if(view.open&&event.key==='ArrowLeft')view.selectedStep=Math.max(0,view.selectedStep-1);
      else if(view.open&&event.key==='ArrowRight')view.selectedStep=Math.min(view.values.length-1,view.selectedStep+1);
      else if(view.open&&event.key==='ArrowUp')view.values[view.selectedStep]=clampHold(view.values[view.selectedStep]+1);
      else if(view.open&&event.key==='ArrowDown')view.values[view.selectedStep]=clampHold(view.values[view.selectedStep]-1);
      else if(view.open&&event.key==='Enter'){applyDraft();return;}
      else handled=false;
      if(handled){event.preventDefault();event.stopImmediatePropagation();view.preview=false;scheduleRefresh();}
    },true);
    if(typeof root.MutationObserver==='function'){
      const observer=new root.MutationObserver(()=>{
        if(rendering||refreshQueued||!lastBoard||board!==lastBoard)return;
        const patterns=root.InkFrameRadialPatterns,open=patterns&&patterns.viewSnapshot?patterns.viewSnapshot(lastEnvironment&&lastEnvironment.project).open:false;
        const shelf=board.querySelector('.inkframe-rhythm-shelf'),missing=open&&shelf&&!shelf.querySelector('.inkframe-custom-rhythm-toggle');
        const stale=!open&&(board.querySelector('.inkframe-rhythm-composer')||board.querySelector('.inkframe-composer-preview-svg'));
        if(missing||stale)scheduleRefresh();
      });
      observer.observe(board,{childList:true,subtree:true});board._inkframeComposerObserver=observer;
    }
  }

  function render(board,environment){
    const radial=root.InkFrameRadialTimeline,patterns=root.InkFrameRadialPatterns,plan=radial&&radial.lastLayout,document=board&&board.ownerDocument;
    if(!board||!document||!plan||!patterns)return false;
    lastBoard=board;lastEnvironment=environment||{};lastPlan=plan;installStyle(document);installBoard(board);rendering=true;
    try{
      for(const node of board.querySelectorAll('.inkframe-rhythm-composer,.inkframe-composer-preview-svg,.inkframe-custom-rhythm-toggle,.inkframe-custom-rhythm-pin'))node.remove();
      const patternView=patterns.viewSnapshot(lastEnvironment.project),view=viewFor(lastEnvironment),shelf=board.querySelector('.inkframe-rhythm-shelf');
      if(!patternView.open||!shelf){view.open=false;view.preview=false;return true;}
      const snapshot=library.snapshot();
      for(const id of snapshot.pinned){const item=snapshot.rhythms.find(value=>value.id===id);if(!item)continue;const button=makeButton(document,item.name,'inkframe-custom-rhythm-pin',()=>applyRhythm(item.id));button.dataset.rhythmId=item.id;button.title=`Apply ${item.name} · ${item.values.join(', ')}`;shelf.appendChild(button);}
      const toggle=makeButton(document,'Custom','inkframe-custom-rhythm-toggle',()=>{view.open=!view.open;if(!view.open)view.preview=false;scheduleRefresh();});toggle.setAttribute('aria-pressed',view.open?'true':'false');toggle.title='Build and save a custom exposure rhythm';shelf.appendChild(toggle);
      if(view.open)createComposer(document,board,view);if(view.open&&view.preview)createPreview(document,board,plan,lastEnvironment,view);return true;
    }finally{rendering=false;}
  }

  function installIntoRadial(){
    const radial=root.InkFrameRadialTimeline;if(!radial||radial.__radialComposerPatched)return false;
    const originalRender=radial.render;radial.render=function(board,environment){const result=originalRender.call(radial,board,environment);if(result)render(board,environment);return result;};
    radial.__radialComposerPatched=true;return true;
  }

  const api={
    STORAGE_KEY,SCHEMA,MAX_RHYTHMS,MAX_PINNED,MAX_NAME,MAX_ID,MAX_STEPS,
    cleanName,cleanId,normalizeSequence,minimalPeriod,sanitizeLibrary,createCustomRhythmStore,library,
    captureScope,applyDraft,applyRhythm,loadRhythm,saveDraft,render,viewSnapshot,installIntoRadial,
    projectCanvasWrites:0,artworkUndoWrites:0,timelineTimingWrites:true,projectSchemaWrites:0,appLibraryWrites:true,
  };
  root.InkFrameRadialComposer=api;installIntoRadial();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
