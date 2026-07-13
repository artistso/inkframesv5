// InkFrame Brush Engine V2 — deterministic non-destructive identity mixer
'use strict';
(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)));
  const clone=value=>JSON.parse(JSON.stringify(value||{}));
  const normalize=value=>clone(ns.normalizeTuning?ns.normalizeTuning(value||{}):value||{});
  const round=(value,places=4)=>{const scale=10**places;return Math.round((Number(value)||0)*scale)/scale;};
  const NUMERIC_FIELDS=Object.freeze(['stabilizerStrength','cornerStrength','ghostIntensity','ghostDurationMs','ghostWidthPercent','positionTimeConstantMs','pressureTimeConstantMs','spacingScale','minimumJump','speedLimitPxPerMs']);
  const DISCRETE_FIELDS=Object.freeze(['stabilizerMode','cornerMode','coverageMode','radiusMode','contactMode']);
  const identity=value=>value&&value.tuning?value:(ns.resolveBrushIdentity?ns.resolveBrushIdentity(value):null);
  const nearest=(a,b,t)=>t<.5?a:t>.5?b:[String(a),String(b)].sort()[0];
  function mixedGhostMode(a,b,t){
    if(t<=0)return a;if(t>=1)return b;if(a===b)return a;
    if(a==='off'&&b!=='off')return b;if(b==='off'&&a!=='off')return a;
    return nearest(a,b,t);
  }
  function mixBrushTunings(aValue,bValue,amount){
    const a=normalize(aValue),b=normalize(bValue),t=clamp(Number.isFinite(Number(amount))?Number(amount):.5,0,1);
    if(t<=0)return Object.freeze(a);if(t>=1)return Object.freeze(b);
    const output={preset:'custom'};
    for(const key of NUMERIC_FIELDS)output[key]=round((Number(a[key])||0)+((Number(b[key])||0)-(Number(a[key])||0))*t);
    for(const key of DISCRETE_FIELDS)output[key]=nearest(a[key],b[key],t);
    output.ghostMode=mixedGhostMode(a.ghostMode,b.ghostMode,t);
    return Object.freeze(normalize(output));
  }
  function mixBrushIdentities(aValue,bValue,percentValue){
    const a=identity(aValue),b=identity(bValue);if(!a||!b)return null;
    const percent=clamp(Number.isFinite(Number(percentValue))?Number(percentValue):50,0,100),aPercent=round(100-percent,1),bPercent=round(percent,1),shortA=a.name.split(/\s+/)[0],shortB=b.name.split(/\s+/)[0];
    return Object.freeze({a,b,percent,bWeight:percent/100,name:`${a.name} ${aPercent}% + ${b.name} ${bPercent}%`,presetName:`Mix ${round(percent,0)} · ${shortA}/${shortB}`,description:`${aPercent}% ${a.name} blended with ${bPercent}% ${b.name}. Numeric behavior changes continuously; trail and safety modes remain deterministic.`,tuning:mixBrushTunings(a.tuning,b.tuning,percent/100)});
  }
  function identityMixChips(value){const mix=value&&value.tuning?value:null;return mix&&ns.brushIdentityChips?ns.brushIdentityChips({tuning:mix.tuning}):Object.freeze([]);}

  function install(){
    const identities=root.InkFrameBrushProfileIdentities,preview=root.InkFrameBrushV2PreviewPad,replay=root.InkFrameBrushV2ReferenceReplay,recovery=root.InkFrameBrushProfileRecovery,adapter=root.InkFrameBrushV2Adapter,presetUi=root.InkFrameBrushV2PresetUI,store=presetUi&&presetUi.store;
    if(!root.document||!identities||!identities.installed||!identities.details||!preview||!preview.installed||!recovery||!recovery.installed||!adapter||!store)return false;
    if(root.InkFrameBrushIdentityMixer&&root.InkFrameBrushIdentityMixer.installed)return true;
    const available=Array.from(ns.listBrushIdentities?ns.listBrushIdentities():[]);if(available.length<2)return false;
    let aId=available[0].id,bId=available[1].id,percent=50;
    const details=root.document.createElement('details');details.className='inkframe-v2-identity-mixer';details.innerHTML='<summary>Identity Mixer · 50/50</summary><div class="inkframe-v2-identity-mixer-body"><div class="inkframe-v2-identity-mixer-selects"><label>A<select aria-label="Mixer identity A"></select></label><button type="button" class="inkframe-v2-identity-mixer-swap">Swap</button><label>B<select aria-label="Mixer identity B"></select></label></div><div class="inkframe-v2-identity-mixer-range"><span>A 50%</span><input type="range" min="0" max="100" step="1" value="50" aria-label="Identity B blend percent"><span>B 50%</span></div><strong class="inkframe-v2-identity-mixer-name"></strong><p class="inkframe-v2-identity-mixer-description"></p><div class="inkframe-v2-identity-mixer-chips"></div><div class="inkframe-v2-identity-mixer-actions"><button>Preview Mix</button><button class="primary">Apply Mix</button><button>Save + Pin</button><button>Apply + Lock</button></div></div>';
    const style=root.document.createElement('style');style.textContent='.inkframe-v2-identity-mixer{margin-top:9px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px}.inkframe-v2-identity-mixer>summary{cursor:pointer;font:760 10px/1.2 system-ui}.inkframe-v2-identity-mixer-body{display:grid;gap:8px;padding-top:8px}.inkframe-v2-identity-mixer-selects{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:6px;align-items:end}.inkframe-v2-identity-mixer-selects label{display:grid;gap:4px;font:700 8px/1 system-ui}.inkframe-v2-identity-mixer select,.inkframe-v2-identity-mixer-swap{min-height:40px;border:1px solid rgba(255,255,255,.16);border-radius:11px;background:#2b1325;color:#fff;padding:7px 9px;font:720 9px/1 system-ui}.inkframe-v2-identity-mixer-swap{background:rgba(255,255,255,.07)}.inkframe-v2-identity-mixer-range{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:7px;align-items:center;font:700 8px/1 system-ui}.inkframe-v2-identity-mixer-range input{width:100%}.inkframe-v2-identity-mixer-name{font:760 11px/1.2 system-ui}.inkframe-v2-identity-mixer-description{margin:0;font:620 9px/1.4 system-ui;opacity:.72}.inkframe-v2-identity-mixer-chips{display:flex;flex-wrap:wrap;gap:5px}.inkframe-v2-identity-mixer-chips span{border:1px solid rgba(255,255,255,.11);border-radius:999px;background:rgba(255,255,255,.05);padding:5px 7px;font:680 8px/1 system-ui}.inkframe-v2-identity-mixer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.inkframe-v2-identity-mixer-actions button{min-height:40px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;padding:7px 9px;font:700 9px/1.1 system-ui}.inkframe-v2-identity-mixer-actions button.primary{background:linear-gradient(145deg,#a6005c,#590051)}';root.document.head.appendChild(style);identities.details.insertAdjacentElement('afterend',details);
    const summary=details.querySelector(':scope>summary'),selects=Array.from(details.querySelectorAll('select')),swapButton=details.querySelector('.inkframe-v2-identity-mixer-swap'),range=details.querySelector('input[type="range"]'),rangeLabels=Array.from(details.querySelectorAll('.inkframe-v2-identity-mixer-range span')),name=details.querySelector('.inkframe-v2-identity-mixer-name'),description=details.querySelector('.inkframe-v2-identity-mixer-description'),chips=details.querySelector('.inkframe-v2-identity-mixer-chips'),actions=Array.from(details.querySelectorAll('.inkframe-v2-identity-mixer-actions button'));
    for(const select of selects)for(const item of available){const option=root.document.createElement('option');option.value=item.id;option.textContent=item.name;select.appendChild(option);}
    const current=()=>mixBrushIdentities(aId,bId,percent);
    function render(){const mix=current(),busy=!!(adapter.isActive&&adapter.isActive()),aPercent=round(100-percent,0),bPercent=round(percent,0);selects[0].value=aId;selects[1].value=bId;range.value=String(percent);rangeLabels[0].textContent=`A ${aPercent}%`;rangeLabels[1].textContent=`B ${bPercent}%`;summary.textContent=`Identity Mixer · ${aPercent}/${bPercent}`;name.textContent=mix.name;description.textContent=mix.description;chips.replaceChildren(...identityMixChips(mix).map(value=>{const chip=root.document.createElement('span');chip.textContent=value;return chip;}));actions.forEach(button=>button.disabled=busy);swapButton.disabled=busy;selects.forEach(select=>select.disabled=busy);range.disabled=busy;return mix;}
    function setA(id){if(!identity(id))return false;aId=String(id);render();return true;}
    function setB(id){if(!identity(id))return false;bId=String(id);render();return true;}
    function setPercent(value){percent=clamp(Number.isFinite(Number(value))?Number(value):50,0,100);render();return percent;}
    function swap(){const oldA=aId;aId=bId;bId=oldA;percent=100-percent;render();return current();}
    function previewMix(){if(adapter.isActive&&adapter.isActive())return false;const mix=current(),choice=preview.setTransientCompare&&preview.setTransientCompare(`Mix · ${mix.name}`,mix.tuning);if(!choice)return false;replay&&replay.replay&&replay.replay();return true;}
    function applyMix(){if(adapter.isActive&&adapter.isActive())return false;const mix=current(),ok=adapter.setTuning(mix.tuning);if(ok&&root.InkFrameBrushV2LabUI&&root.InkFrameBrushV2LabUI.updateSummaries)root.InkFrameBrushV2LabUI.updateSummaries();render();return !!ok;}
    function saveAndPin(){try{const preset=store.save(current().presetName,current().tuning,true);presetUi.render&&presetUi.render();return preset||null;}catch(error){if(typeof root.alert==='function')root.alert(String(error&&error.message||error));return null;}}
    function applyAndLock(){if(!applyMix())return false;recovery.lock();render();return true;}
    selects[0].addEventListener('change',()=>setA(selects[0].value));selects[1].addEventListener('change',()=>setB(selects[1].value));range.addEventListener('input',()=>setPercent(range.value));swapButton.addEventListener('click',swap);actions[0].addEventListener('click',previewMix);actions[1].addEventListener('click',applyMix);actions[2].addEventListener('click',saveAndPin);actions[3].addEventListener('click',applyAndLock);render();
    root.InkFrameBrushIdentityMixer=Object.freeze({installed:true,details,current,setA,setB,setPercent,swap,preview:previewMix,apply:applyMix,saveAndPin,applyAndLock,render,projectCanvasWrites:0,undoWrites:0});return true;
  }

  const api={IDENTITY_MIX_NUMERIC_FIELDS:NUMERIC_FIELDS,mixBrushTunings,mixBrushIdentities,identityMixChips,install};Object.assign(ns,api);root.InkFrameBrushIdentityMixer=api;if(root.document){const start=()=>{if(!install())root.setTimeout(start,16);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
