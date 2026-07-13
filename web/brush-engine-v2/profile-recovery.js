// InkFrame Brush Engine V2 — local Brush Profile Lock and recent tuning recovery
'use strict';
(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const STORAGE_KEY='inkframe.brushEngine.profileRecovery.v1';
  const DEFAULT_LIMIT=24;
  const clone=value=>JSON.parse(JSON.stringify(value||{}));
  const normalize=value=>clone(ns.normalizeTuning?ns.normalizeTuning(value||{}):value||{});
  const functionalKey=value=>{const clean=normalize(value);delete clean.preset;const ordered={};for(const key of Object.keys(clean).sort())ordered[key]=clean[key];return JSON.stringify(ordered);};
  const same=(a,b)=>functionalKey(a)===functionalKey(b);
  const title=value=>String(value||'setting').replace(/(^|[-_ ])([a-z])/g,(_,a,b)=>`${a}${b.toUpperCase()}`);
  const trail=value=>value==='echo'?'Echo':value==='comet'?'Comet':'Off';
  const METRICS=Object.freeze([
    ['stabilizerStrength','Stabilizer',value=>`${Math.round(Number(value)||0)}%`],
    ['cornerStrength','Corners',value=>`${Math.round(Number(value)||0)}%`],
    ['ghostMode','Trail',trail],
    ['ghostIntensity','Trail intensity',value=>`${Math.round(Number(value)||0)}%`],
    ['ghostLengthMs','Trail length',value=>`${Math.round(Number(value)||0)} ms`],
    ['coverageMode','Coverage',title],
    ['radiusMode','Width guard',title],
    ['contactMode','Contact',title],
  ].map(Object.freeze));

  function changeSummary(beforeValue,afterValue){
    const before=normalize(beforeValue),after=normalize(afterValue),output=[];
    for(const [key,label,format] of METRICS){if(String(before[key])!==String(after[key]))output.push(`${label} ${format(before[key])} → ${format(after[key])}`);}
    if(!output.length&&!same(before,after))output.push('Advanced brush settings changed');
    return Object.freeze(output);
  }

  function createProfileHistory(options){
    const config=options||{},storage=config.storage||null,key=String(config.key||STORAGE_KEY),limit=Math.max(1,Math.min(64,Number(config.limit)||DEFAULT_LIMIT)),now=typeof config.now==='function'?config.now:()=>Date.now(),coalesceMs=Math.max(0,Number(config.coalesceMs)||650);let locked=null,entries=[],nextId=1,listeners=new Set();
    function read(){try{const raw=storage&&storage.getItem(key),data=raw?JSON.parse(raw):null;if(!data||typeof data!=='object')return;locked=data.locked&&typeof data.locked==='object'?normalize(data.locked):null;entries=(Array.isArray(data.entries)?data.entries:[]).filter(item=>item&&item.before&&item.after).slice(0,limit).map(item=>Object.freeze({id:Math.max(1,Number(item.id)||1),source:String(item.source||'Tuning change').slice(0,64),before:Object.freeze(normalize(item.before)),after:Object.freeze(normalize(item.after)),summary:changeSummary(item.before,item.after),createdAt:Number(item.createdAt)||0,updatedAt:Number(item.updatedAt)||Number(item.createdAt)||0}));nextId=Math.max(Number(data.nextId)||1,...entries.map(item=>item.id+1));}catch(_){locked=null;entries=[];nextId=1;}}
    function persist(){try{if(storage)storage.setItem(key,JSON.stringify({version:1,locked,entries,nextId}));}catch(_){}}
    function emit(){const state=snapshot();for(const listener of listeners){try{listener(state);}catch(_){}}return state;}
    function snapshot(){return Object.freeze({locked:locked?Object.freeze(normalize(locked)):null,entries:Object.freeze(entries.slice()),nextId,limit});}
    function capture(beforeValue,afterValue,source){const before=normalize(beforeValue),after=normalize(afterValue);if(same(before,after))return false;const stamp=Number(now())||0,label=String(source||'Tuning change').slice(0,64),latest=entries[0];if(latest&&latest.source===label&&stamp-latest.updatedAt>=0&&stamp-latest.updatedAt<=coalesceMs){const merged=Object.freeze({id:latest.id,source:label,before:latest.before,after:Object.freeze(after),summary:changeSummary(latest.before,after),createdAt:latest.createdAt,updatedAt:stamp});entries=[merged,...entries.slice(1)];}else{entries=[Object.freeze({id:nextId++,source:label,before:Object.freeze(before),after:Object.freeze(after),summary:changeSummary(before,after),createdAt:stamp,updatedAt:stamp}),...entries].slice(0,limit);}persist();emit();return true;}
    function lock(value){locked=normalize(value);persist();emit();return locked;}
    function unlock(){const had=!!locked;locked=null;persist();emit();return had;}
    function removeLatest(){if(!entries.length)return null;const entry=entries[0];entries=entries.slice(1);persist();emit();return entry;}
    function clear(){const had=entries.length>0;entries=[];persist();emit();return had;}
    function subscribe(listener){if(typeof listener!=='function')return()=>{};listeners.add(listener);return()=>listeners.delete(listener);}
    read();return Object.freeze({capture,lock,unlock,removeLatest,clear,snapshot,subscribe});
  }

  function install(){
    const report=root.InkFrameBrushCalibrationReport,preview=root.InkFrameBrushV2PreviewPad,replay=root.InkFrameBrushV2ReferenceReplay,adapter=root.InkFrameBrushV2Adapter;
    if(!root.document||!report||!report.installed||!report.details||!preview||!preview.card||!adapter)return false;
    if(root.InkFrameBrushProfileRecovery&&root.InkFrameBrushProfileRecovery.installed)return true;
    let storage=null;try{storage=root.localStorage||null;}catch(_){}
    const model=createProfileHistory({storage});
    const rawSet=adapter.setTuning.bind(adapter),rawPreset=adapter.setTuningPreset.bind(adapter);let suppress=false,selectedId=null;
    const sourceForPatch=patch=>{const keys=Object.keys(patch&&typeof patch==='object'?patch:{}).filter(key=>key!=='preset');return keys.length===1?`Adjust ${METRICS.find(item=>item[0]===keys[0])?.[1]||title(keys[0])}`:'Apply brush profile';};
    function afterMutation(before,source,ok){if(!ok)return false;const after=adapter.currentTuning();if(!suppress)model.capture(before,after,source);render();return true;}
    adapter.setTuning=function(patch){const before=adapter.currentTuning();return afterMutation(before,sourceForPatch(patch),rawSet(patch));};
    adapter.setTuningPreset=function(name){const before=adapter.currentTuning();return afterMutation(before,`Preset · ${title(name)}`,rawPreset(name));};
    function applySnapshot(tuning,source,record=true){if(adapter.isActive&&adapter.isActive())return false;const before=adapter.currentTuning();suppress=true;let ok=false;try{ok=rawSet(tuning);}finally{suppress=false;}if(ok&&record)model.capture(before,adapter.currentTuning(),source);if(ok&&root.InkFrameBrushV2LabUI&&root.InkFrameBrushV2LabUI.updateSummaries)root.InkFrameBrushV2LabUI.updateSummaries();render();return !!ok;}
    const presetStore=()=>root.InkFrameBrushV2PresetUI&&root.InkFrameBrushV2PresetUI.store;
    function saveTuning(name,tuning){const store=presetStore();return store&&store.save?store.save(String(name).slice(0,32),tuning):null;}
    function compareTuning(name,tuning){const preset=saveTuning(name,tuning);if(!preset||!preview.selectCompare||!preview.selectCompare(`saved:${preset.id}`))return false;preview.setCompareEnabled&&preview.setCompareEnabled(true);replay&&replay.replay&&replay.replay();return true;}

    const details=root.document.createElement('details');details.className='inkframe-v2-profile-recovery';details.innerHTML='<summary>Brush Profile Lock · Unlocked</summary><p class="inkframe-v2-profile-recovery-status"></p><div class="inkframe-v2-profile-recovery-primary"><button class="primary">Lock Current</button><button>Restore Locked</button><button>Compare Locked</button><button>Unlock</button></div><details class="inkframe-v2-profile-history"><summary>Recent Changes · 0</summary><div class="inkframe-v2-profile-history-list"></div><div class="inkframe-v2-profile-history-actions"><button>Restore Before</button><button>Compare After</button><button>Save After</button><button>Undo Last</button><button>Clear</button></div></details>';
    const style=root.document.createElement('style');style.textContent='.inkframe-v2-profile-recovery{margin-top:9px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px}.inkframe-v2-profile-recovery>summary,.inkframe-v2-profile-history>summary{cursor:pointer;font:760 10px/1.2 system-ui}.inkframe-v2-profile-recovery-status{font:650 9px/1.35 system-ui;opacity:.7}.inkframe-v2-profile-recovery-primary,.inkframe-v2-profile-history-actions{display:flex;flex-wrap:wrap;gap:6px}.inkframe-v2-profile-recovery button{min-height:38px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;padding:7px 9px;font:700 9px/1.1 system-ui}.inkframe-v2-profile-recovery button.primary{background:linear-gradient(145deg,#a6005c,#590051)}.inkframe-v2-profile-history{margin-top:9px}.inkframe-v2-profile-history-list{display:grid;gap:5px;margin:8px 0}.inkframe-v2-profile-history-item{width:100%;text-align:left}.inkframe-v2-profile-history-item.active{border-color:#ffc6e8;background:rgba(166,0,92,.35)}';root.document.head.appendChild(style);report.details.insertAdjacentElement('afterend',details);
    const summary=details.querySelector(':scope>summary'),status=details.querySelector('.inkframe-v2-profile-recovery-status'),primary=Array.from(details.querySelectorAll('.inkframe-v2-profile-recovery-primary button')),historyDetails=details.querySelector('.inkframe-v2-profile-history'),historySummary=historyDetails.querySelector('summary'),list=details.querySelector('.inkframe-v2-profile-history-list'),historyActions=Array.from(details.querySelectorAll('.inkframe-v2-profile-history-actions button'));
    const activeEntry=state=>state.entries.find(item=>item.id===selectedId)||state.entries[0]||null;
    function render(){const state=model.snapshot(),busy=!!(adapter.isActive&&adapter.isActive());if(!state.entries.some(item=>item.id===selectedId))selectedId=state.entries[0]?.id||null;summary.textContent=`Brush Profile Lock · ${state.locked?'Locked':'Unlocked'}`;historySummary.textContent=`Recent Changes · ${state.entries.length}`;primary[0].textContent=state.locked?'Update Lock':'Lock Current';primary.slice(1).forEach(button=>button.disabled=!state.locked||busy);primary[3].disabled=!state.locked||busy;const drift=state.locked?changeSummary(state.locked,adapter.currentTuning()):[];status.textContent=state.locked?`${Math.round(Number(state.locked.stabilizerStrength)||0)}% · ${trail(state.locked.ghostMode)} trail · ${drift.length?`${drift.length} setting${drift.length===1?'':'s'} changed`:'matches current brush'}`:'Lock a known-good brush, then experiment freely.';list.replaceChildren();for(const entry of state.entries){const button=root.document.createElement('button');button.type='button';button.className='inkframe-v2-profile-history-item';button.classList.toggle('active',entry.id===selectedId);button.textContent=`${entry.source} · ${entry.summary.slice(0,2).join(' · ')}`;button.addEventListener('click',()=>{selectedId=entry.id;render();});list.appendChild(button);}const selected=activeEntry(state);historyActions.slice(0,3).forEach(button=>button.disabled=!selected||busy);historyActions[3].disabled=!state.entries.length||busy;historyActions[4].disabled=!state.entries.length;return state;}
    primary[0].addEventListener('click',()=>model.lock(adapter.currentTuning()));
    primary[1].addEventListener('click',()=>{const locked=model.snapshot().locked;if(locked)applySnapshot(locked,'Restore locked profile',true);});
    primary[2].addEventListener('click',()=>{const locked=model.snapshot().locked;if(locked)compareTuning('Locked · Brush Profile',locked);});
    primary[3].addEventListener('click',()=>model.unlock());
    historyActions[0].addEventListener('click',()=>{const entry=activeEntry(model.snapshot());if(entry)applySnapshot(entry.before,`Restore before change ${entry.id}`,true);});
    historyActions[1].addEventListener('click',()=>{const entry=activeEntry(model.snapshot());if(entry)compareTuning(`Recent · Change ${entry.id}`,entry.after);});
    historyActions[2].addEventListener('click',()=>{const entry=activeEntry(model.snapshot());if(entry)saveTuning(`Recent · Change ${entry.id}`,entry.after);});
    historyActions[3].addEventListener('click',()=>{if(adapter.isActive&&adapter.isActive())return;const entry=model.removeLatest();if(entry)applySnapshot(entry.before,'Undo last tuning change',false);});
    historyActions[4].addEventListener('click',()=>model.clear());
    model.subscribe(render);render();
    root.InkFrameBrushProfileRecovery=Object.freeze({installed:true,details,model,render,lock:()=>model.lock(adapter.currentTuning()),restoreLocked:()=>{const locked=model.snapshot().locked;return !!locked&&applySnapshot(locked,'Restore locked profile',true);},undoLast:()=>{const entry=model.removeLatest();return !!entry&&applySnapshot(entry.before,'Undo last tuning change',false);},compareLocked:()=>{const locked=model.snapshot().locked;return !!locked&&compareTuning('Locked · Brush Profile',locked);},projectCanvasWrites:0,undoWrites:0});return true;
  }

  const api={PROFILE_RECOVERY_STORAGE_KEY:STORAGE_KEY,PROFILE_RECOVERY_LIMIT:DEFAULT_LIMIT,changeSummary,createProfileHistory,install};Object.assign(ns,api);root.InkFrameBrushProfileRecovery=api;if(root.document){const start=()=>{if(!install())root.setTimeout(start,16);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);