// InkFrame Brush Engine V2 — protected brush profile and bounded tuning history
'use strict';
(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const STORAGE_KEY='inkframe.brushEngine.profileHistory.v1';
  const MAX_HISTORY=20;
  const normalize=value=>ns.normalizeTuning?ns.normalizeTuning(value||{}):Object.freeze({...value});
  const behavior=value=>{const copy={...normalize(value)};delete copy.preset;return copy;};
  const fingerprint=value=>JSON.stringify(behavior(value));
  const freezeEntry=entry=>Object.freeze({id:String(entry.id),at:Number(entry.at)||0,label:String(entry.label||'Brush change'),tuning:normalize(entry.tuning)});

  const METRICS=Object.freeze([
    ['stabilizerStrength','Stabilizer',(a,b)=>`${Number(b)>=Number(a)?'+':''}${Math.round(Number(b)-Number(a))}%`],
    ['cornerStrength','Corners',(a,b)=>`${Number(b)>=Number(a)?'+':''}${Math.round(Number(b)-Number(a))}%`],
    ['ghostMode','Trail',(a,b)=>`${a||'off'} → ${b||'off'}`],
    ['ghostIntensity','Trail intensity',(a,b)=>`${Number(b)>=Number(a)?'+':''}${Math.round(Number(b)-Number(a))}%`],
    ['ghostDurationMs','Trail length',(a,b)=>`${Number(b)>=Number(a)?'+':''}${Math.round(Number(b)-Number(a))} ms`],
    ['coverageMode','Coverage',(a,b)=>`${a} → ${b}`],
    ['radiusMode','Width guard',(a,b)=>`${a} → ${b}`],
    ['contactMode','Contact',(a,b)=>`${a} → ${b}`],
  ]);

  function describeTuningChange(fromValue,toValue){
    const from=normalize(fromValue),to=normalize(toValue);
    return Object.freeze(METRICS.filter(([key])=>String(from[key])!==String(to[key])).map(([key,label,format])=>Object.freeze({key,label,text:`${label} ${format(from[key],to[key])}`})));
  }

  function createBrushProfileHistory(options){
    const config=options||{},limit=Math.max(2,Math.min(50,Number(config.limit)||MAX_HISTORY)),now=typeof config.now==='function'?config.now:Date.now;
    let revision=0,cursor=0,locked=config.locked?normalize(config.locked):null;
    let entries=(Array.isArray(config.entries)?config.entries:[]).map((entry,index)=>freezeEntry({id:entry.id||`stored-${index}`,at:entry.at,label:entry.label,tuning:entry.tuning||entry}));
    const initial=normalize(config.initial||{});
    if(!entries.length||fingerprint(entries[entries.length-1].tuning)!==fingerprint(initial))entries.push(freezeEntry({id:`entry-${++revision}`,at:now(),label:'Current brush',tuning:initial}));
    entries=entries.slice(-limit);cursor=entries.length-1;
    const current=()=>entries[cursor];
    function record(value,label){const tuning=normalize(value);if(fingerprint(current().tuning)===fingerprint(tuning))return false;entries=entries.slice(0,cursor+1);entries.push(freezeEntry({id:`entry-${now()}-${++revision}`,at:now(),label:label||'Brush change',tuning}));if(entries.length>limit)entries=entries.slice(entries.length-limit);cursor=entries.length-1;return true;}
    function undo(){if(cursor<=0)return null;cursor--;return current().tuning;}
    function redo(){if(cursor>=entries.length-1)return null;cursor++;return current().tuning;}
    function go(index){const value=Math.trunc(Number(index));if(value<0||value>=entries.length)return null;cursor=value;return current().tuning;}
    function lock(value){locked=normalize(value||current().tuning);return locked;}
    function unlock(){const had=!!locked;locked=null;return had;}
    function restoreLocked(){return locked;}
    function snapshot(){return Object.freeze({cursor,count:entries.length,canUndo:cursor>0,canRedo:cursor<entries.length-1,locked,entries:Object.freeze(entries.slice()),current:current()});}
    function serialize(){return {version:1,locked,entries:entries.map(entry=>({id:entry.id,at:entry.at,label:entry.label,tuning:entry.tuning}))};}
    return Object.freeze({record,undo,redo,go,lock,unlock,restoreLocked,snapshot,serialize});
  }

  function install(){
    const adapter=root.InkFrameBrushV2Adapter,preview=root.InkFrameBrushV2PreviewPad,replay=root.InkFrameBrushV2ReferenceReplay,report=root.InkFrameBrushCalibrationReport;
    if(!root.document||!adapter||!preview||!preview.card||!report||!report.installed)return false;
    if(root.InkFrameBrushProfileHistory&&root.InkFrameBrushProfileHistory.installed)return true;
    const storage=(()=>{try{return root.localStorage||null;}catch(_){return null;}})();let persisted={};try{persisted=JSON.parse(storage&&storage.getItem(STORAGE_KEY)||'{}');}catch(_){}
    const model=createBrushProfileHistory({initial:adapter.currentTuning(),entries:persisted.entries,locked:persisted.locked});let applying=false,selectedIndex=model.snapshot().cursor;
    const persist=()=>{try{if(storage)storage.setItem(STORAGE_KEY,JSON.stringify(model.serialize()));}catch(_){}};
    const applyExact=tuning=>{if(!tuning||adapter.isActive&&adapter.isActive())return false;const preset=String(tuning.preset||'');let ok=false;if(['direct','balanced','smooth'].includes(preset)&&ns.presetValue&&fingerprint(ns.presetValue(preset))===fingerprint(tuning))ok=adapter.setTuningPreset(preset);else ok=adapter.setTuning(tuning);return !!ok;};

    const details=root.document.createElement('details');details.className='inkframe-v2-profile-history';details.innerHTML='<summary>Brush Profile · Unlocked</summary><div class="inkframe-v2-profile-lock-status"></div><div class="inkframe-v2-profile-actions lock"><button class="primary">Lock Current</button><button>Restore Locked</button><button>Unlock</button></div><div class="inkframe-v2-profile-actions history"><button>Undo Tuning</button><button>Redo Tuning</button></div><label class="inkframe-v2-profile-select"><span>Recent state</span><select></select></label><div class="inkframe-v2-profile-diff"></div><div class="inkframe-v2-profile-actions selected"><button class="primary">Compare in B</button><button>Restore Selected</button><button>Save as Preset</button></div>';
    const style=root.document.createElement('style');style.textContent='.inkframe-v2-profile-history{margin-top:9px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px}.inkframe-v2-profile-history summary{cursor:pointer;font:760 10px/1.2 system-ui}.inkframe-v2-profile-lock-status{margin-top:8px;font:650 9px/1.35 system-ui;opacity:.72}.inkframe-v2-profile-actions,.inkframe-v2-profile-diff{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.inkframe-v2-profile-actions button,.inkframe-v2-profile-select select{min-height:38px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;padding:7px 10px;font:700 9px/1.1 system-ui}.inkframe-v2-profile-actions .primary{background:linear-gradient(145deg,#a6005c,#590051)}.inkframe-v2-profile-select{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;margin-top:8px;font:700 9px/1 system-ui}.inkframe-v2-profile-chip{padding:6px 8px;border:1px solid rgba(255,255,255,.11);border-radius:999px;font:650 8px/1 system-ui}';root.document.head.appendChild(style);report.details.insertAdjacentElement('afterend',details);
    const summary=details.querySelector('summary'),status=details.querySelector('.inkframe-v2-profile-lock-status'),select=details.querySelector('select'),diff=details.querySelector('.inkframe-v2-profile-diff'),lockButtons=Array.from(details.querySelectorAll('.lock button')),historyButtons=Array.from(details.querySelectorAll('.history button')),selectedButtons=Array.from(details.querySelectorAll('.selected button'));
    const presetStore=()=>root.InkFrameBrushV2PresetUI&&root.InkFrameBrushV2PresetUI.store;
    function selectedEntry(){return model.snapshot().entries[selectedIndex]||model.snapshot().current;}
    function render(){const state=model.snapshot();if(selectedIndex>=state.count)selectedIndex=state.cursor;summary.textContent=`Brush Profile · ${state.locked?'Locked':'Unlocked'} · ${state.count} recent`;status.textContent=state.locked?`Protected at ${Math.round(state.locked.stabilizerStrength)}% · ${state.locked.ghostMode==='echo'?'Echo':state.locked.ghostMode==='comet'?'Comet':'Trail off'}`:'Lock the current brush before experimenting.';lockButtons[0].textContent=state.locked?'Update Lock':'Lock Current';lockButtons[1].disabled=!state.locked;lockButtons[2].disabled=!state.locked;historyButtons[0].disabled=!state.canUndo;historyButtons[1].disabled=!state.canRedo;select.replaceChildren();state.entries.forEach((entry,index)=>{const option=root.document.createElement('option');option.value=String(index);option.textContent=`${index===state.cursor?'Current · ':''}${entry.label}`;select.appendChild(option);});select.value=String(selectedIndex);diff.replaceChildren();for(const item of describeTuningChange(state.current.tuning,selectedEntry().tuning).slice(0,6)){const chip=root.document.createElement('span');chip.className='inkframe-v2-profile-chip';chip.textContent=item.text;diff.appendChild(chip);}return state;}
    function moveTo(tuning){if(!tuning)return false;applying=true;const ok=applyExact(tuning);root.setTimeout(()=>{applying=false;render();},0);persist();return ok;}
    function observe(){if(applying||adapter.isActive&&adapter.isActive())return false;const before=model.snapshot().current.tuning,current=adapter.currentTuning();const changes=describeTuningChange(before,current);if(!changes.length)return false;const label=changes.slice(0,2).map(item=>item.text).join(' · ');const added=model.record(current,label);if(added){selectedIndex=model.snapshot().cursor;persist();render();}return added;}
    lockButtons[0].addEventListener('click',()=>{model.lock(adapter.currentTuning());persist();render();});lockButtons[1].addEventListener('click',()=>moveTo(model.restoreLocked()));lockButtons[2].addEventListener('click',()=>{model.unlock();persist();render();});historyButtons[0].addEventListener('click',()=>{const tuning=model.undo();selectedIndex=model.snapshot().cursor;moveTo(tuning);});historyButtons[1].addEventListener('click',()=>{const tuning=model.redo();selectedIndex=model.snapshot().cursor;moveTo(tuning);});select.addEventListener('change',()=>{selectedIndex=Math.trunc(Number(select.value));render();});selectedButtons[0].addEventListener('click',()=>{const store=presetStore(),entry=selectedEntry();if(!store||!entry)return;const preset=store.save('History · Compared State',entry.tuning);if(preset&&preview.selectCompare&&preview.selectCompare(`saved:${preset.id}`)){preview.setCompareEnabled&&preview.setCompareEnabled(true);replay&&replay.replay&&replay.replay();}});selectedButtons[1].addEventListener('click',()=>{const tuning=model.go(selectedIndex);moveTo(tuning);});selectedButtons[2].addEventListener('click',()=>{const store=presetStore(),entry=selectedEntry();if(store&&entry)store.save(`Recovered · ${new Date(entry.at||Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`.slice(0,32),entry.tuning);});
    const interval=root.setInterval(observe,180);render();persist();
    root.InkFrameBrushProfileHistory=Object.freeze({installed:true,details,model,render,observe,projectCanvasWrites:0,undoWrites:0,destroy:()=>root.clearInterval(interval)});return true;
  }

  const api={PROFILE_HISTORY_STORAGE_KEY:STORAGE_KEY,MAX_PROFILE_HISTORY:MAX_HISTORY,tuningFingerprint:fingerprint,describeTuningChange,createBrushProfileHistory,install};Object.assign(ns,api);root.InkFrameBrushProfileHistory=api;if(root.document){const start=()=>{if(!install())root.setTimeout(start,16);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
