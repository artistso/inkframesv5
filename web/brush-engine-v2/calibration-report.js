// InkFrame Brush Engine V2 — compact before/after calibration report
'use strict';
(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const normalize=value=>ns.normalizeTuning?ns.normalizeTuning(value||{}):Object.assign({},value||{});
  const title=value=>String(value||'').replace(/^Suggested · /,'');
  const labelMode=value=>value==='echo'?'Echo':value==='comet'?'Comet':'Off';
  const labelCase=value=>String(value||'—').replace(/(^|[-_ ])([a-z])/g,(_,a,b)=>`${a}${b.toUpperCase()}`);

  const METRICS=Object.freeze([
    Object.freeze({key:'stabilizerStrength',label:'Stabilizer',format:value=>`${Math.round(Number(value)||0)}%`,delta:(a,b)=>`${Number(b)>=Number(a)?'+':''}${Math.round((Number(b)||0)-(Number(a)||0))}%`}),
    Object.freeze({key:'cornerStrength',label:'Corners',format:value=>`${Math.round(Number(value)||0)}%`,delta:(a,b)=>`${Number(b)>=Number(a)?'+':''}${Math.round((Number(b)||0)-(Number(a)||0))}%`}),
    Object.freeze({key:'ghostMode',label:'Trail',format:labelMode}),
    Object.freeze({key:'ghostIntensity',label:'Trail intensity',format:value=>`${Math.round(Number(value)||0)}%`,delta:(a,b)=>`${Number(b)>=Number(a)?'+':''}${Math.round((Number(b)||0)-(Number(a)||0))}%`}),
    Object.freeze({key:'ghostLengthMs',label:'Trail length',format:value=>`${Math.round(Number(value)||0)} ms`,delta:(a,b)=>`${Number(b)>=Number(a)?'+':''}${Math.round((Number(b)||0)-(Number(a)||0))} ms`}),
    Object.freeze({key:'coverageMode',label:'Coverage',format:labelCase}),
    Object.freeze({key:'radiusMode',label:'Width guard',format:labelCase}),
    Object.freeze({key:'contactMode',label:'Contact',format:labelCase}),
  ]);

  function profile(id,label,value){
    const valid=!!(value&&value.valid!==false&&(value.tuning||id==='current'));
    const tuning=normalize(value&&value.tuning||value||{});
    return Object.freeze({id,label:String(label),valid,tuning,confidence:valid&&Number.isFinite(Number(value&&value.confidence))?Number(value.confidence):null});
  }

  function createCalibrationReport(currentValue,quickValue,sessionValue){
    const profiles=Object.freeze({
      current:profile('current','Current brush',currentValue),
      quick:profile('quick',quickValue&&quickValue.valid?`Quick · ${title(quickValue.label)}`:'Quick Coach incomplete',quickValue),
      session:profile('session',sessionValue&&sessionValue.valid?'Full Coach Session':'Full Session incomplete',sessionValue),
    });
    const rows=Object.freeze(METRICS.map(metric=>Object.freeze({
      key:metric.key,
      label:metric.label,
      current:profiles.current.valid?metric.format(profiles.current.tuning[metric.key]):'—',
      quick:profiles.quick.valid?metric.format(profiles.quick.tuning[metric.key]):'—',
      session:profiles.session.valid?metric.format(profiles.session.tuning[metric.key]):'—',
    })));
    return Object.freeze({profiles,rows,ready:1+Number(profiles.quick.valid)+Number(profiles.session.valid)});
  }

  function differenceRows(baseValue,targetValue){
    const base=normalize(baseValue&&baseValue.tuning||baseValue||{}),target=normalize(targetValue&&targetValue.tuning||targetValue||{});
    return Object.freeze(METRICS.filter(metric=>String(base[metric.key])!==String(target[metric.key])).map(metric=>Object.freeze({
      key:metric.key,label:metric.label,from:metric.format(base[metric.key]),to:metric.format(target[metric.key]),delta:metric.delta?metric.delta(base[metric.key],target[metric.key]):null,
    })));
  }

  function install(){
    const coach=root.InkFrameBrushCoach,session=root.InkFrameBrushCoachSession,preview=root.InkFrameBrushV2PreviewPad,replay=root.InkFrameBrushV2ReferenceReplay,adapter=root.InkFrameBrushV2Adapter;
    if(!root.document||!coach||!coach.installed||!coach.panel||!session||!session.installed||!preview||!preview.card||!adapter)return false;
    if(root.InkFrameBrushCalibrationReport&&root.InkFrameBrushCalibrationReport.installed)return true;

    const details=root.document.createElement('details');details.className='inkframe-v2-calibration-report';details.innerHTML='<summary>Calibration Report · 1/3 ready</summary><div class="inkframe-v2-calibration-profiles"></div><div class="inkframe-v2-calibration-target"><span>Target</span><button data-target="quick">Quick</button><button data-target="session">Session</button></div><div class="inkframe-v2-calibration-diff"></div><div class="inkframe-v2-calibration-actions"><button class="primary">Compare</button><button>Apply</button><button>Save</button></div>';
    const style=root.document.createElement('style');style.textContent='.inkframe-v2-calibration-report{margin-top:9px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px}.inkframe-v2-calibration-report summary{cursor:pointer;font:760 10px/1.2 system-ui}.inkframe-v2-calibration-profiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:9px}.inkframe-v2-calibration-profile{padding:8px;border:1px solid rgba(255,255,255,.11);border-radius:10px;background:rgba(255,255,255,.035)}.inkframe-v2-calibration-profile strong{display:block;font:750 9px/1.25 system-ui}.inkframe-v2-calibration-profile span{display:block;margin-top:4px;font:650 8px/1.3 system-ui;opacity:.68}.inkframe-v2-calibration-target,.inkframe-v2-calibration-actions,.inkframe-v2-calibration-diff{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.inkframe-v2-calibration-target span{font:720 9px/38px system-ui;opacity:.7}.inkframe-v2-calibration-target button,.inkframe-v2-calibration-actions button{min-height:38px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;padding:7px 10px;font:700 9px/1.1 system-ui}.inkframe-v2-calibration-target button.active{border-color:#ffc6e8;background:rgba(166,0,92,.4)}.inkframe-v2-calibration-actions .primary{background:linear-gradient(145deg,#a6005c,#590051)}.inkframe-v2-calibration-chip{padding:6px 8px;border:1px solid rgba(255,255,255,.11);border-radius:999px;font:650 8px/1 system-ui}@media(max-width:760px){.inkframe-v2-calibration-profiles{grid-template-columns:1fr}}';root.document.head.appendChild(style);coach.panel.appendChild(details);

    const summary=details.querySelector('summary'),profilesNode=details.querySelector('.inkframe-v2-calibration-profiles'),diffNode=details.querySelector('.inkframe-v2-calibration-diff'),targetButtons=Array.from(details.querySelectorAll('.inkframe-v2-calibration-target button')),actions=Array.from(details.querySelectorAll('.inkframe-v2-calibration-actions button'));let selected='quick',last=null;
    const store=()=>root.InkFrameBrushV2PresetUI&&root.InkFrameBrushV2PresetUI.store;
    const quick=()=>coach.current&&coach.current();
    const full=()=>session.model&&session.model.suggestion();
    const target=()=>last&&last.profiles[selected];

    function render(){
      last=createCalibrationReport(adapter.currentTuning(),quick(),full());summary.textContent=`Calibration Report · ${last.ready}/3 ready`;profilesNode.replaceChildren();
      for(const item of Object.values(last.profiles)){const card=root.document.createElement('div');card.className='inkframe-v2-calibration-profile';const strength=item.valid?`${Math.round(Number(item.tuning.stabilizerStrength)||0)}% stabilizer`:'Not ready';const trail=item.valid?` · ${labelMode(item.tuning.ghostMode)} trail`:'';card.innerHTML=`<strong></strong><span></span>`;card.querySelector('strong').textContent=item.label;card.querySelector('span').textContent=`${strength}${trail}`;profilesNode.appendChild(card);}
      if(selected==='session'&&!last.profiles.session.valid)selected=last.profiles.quick.valid?'quick':'session';if(selected==='quick'&&!last.profiles.quick.valid&&last.profiles.session.valid)selected='session';
      targetButtons.forEach(button=>{const item=last.profiles[button.dataset.target];button.disabled=!item.valid;button.classList.toggle('active',button.dataset.target===selected);});
      diffNode.replaceChildren();const chosen=target();const differences=chosen&&chosen.valid?differenceRows(last.profiles.current,chosen):[];for(const item of differences.slice(0,6)){const chip=root.document.createElement('span');chip.className='inkframe-v2-calibration-chip';chip.textContent=item.delta?`${item.label} ${item.delta}`:`${item.label}: ${item.from} → ${item.to}`;diffNode.appendChild(chip);}actions.forEach(button=>button.disabled=!(chosen&&chosen.valid));return last;
    }
    function save(){const chosen=target(),targetStore=store();if(!chosen||!chosen.valid||!targetStore)return null;return targetStore.save(selected==='session'?'Calibration · Full Session':'Calibration · Quick Coach',chosen.tuning);}
    function compare(){const preset=save();if(!preset||!preview.selectCompare||!preview.selectCompare(`saved:${preset.id}`))return false;preview.setCompareEnabled&&preview.setCompareEnabled(true);replay&&replay.replay&&replay.replay();return true;}
    function apply(){const chosen=target();if(!chosen||!chosen.valid)return false;const ok=adapter.setTuning(chosen.tuning);if(ok&&root.InkFrameBrushV2LabUI&&root.InkFrameBrushV2LabUI.updateSummaries)root.InkFrameBrushV2LabUI.updateSummaries();render();return !!ok;}
    targetButtons.forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.target;render();}));actions[0].addEventListener('click',compare);actions[1].addEventListener('click',apply);actions[2].addEventListener('click',save);preview.card.addEventListener('pointerup',()=>root.setTimeout(render,0),true);preview.card.addEventListener('pointercancel',()=>root.setTimeout(render,0),true);coach.panel.addEventListener('click',()=>root.setTimeout(render,0),true);render();
    root.InkFrameBrushCalibrationReport=Object.freeze({installed:true,details,render,compare,apply,save,select:value=>{if(value!=='quick'&&value!=='session')return false;selected=value;render();return true;},current:()=>last,differenceRows,createCalibrationReport,projectCanvasWrites:0,undoWrites:0});return true;
  }

  const api={CALIBRATION_METRICS:METRICS,createCalibrationReport,differenceRows,install};Object.assign(ns,api);root.InkFrameBrushCalibrationReport=api;if(root.document){const start=()=>{if(!install())root.setTimeout(start,16);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
