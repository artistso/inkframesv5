// InkFrame Brush Engine V2 — compatibility observer for legacy Brush Lab controls
'use strict';
(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const normalize=value=>{const copy=JSON.parse(JSON.stringify(ns.normalizeTuning?ns.normalizeTuning(value||{}):value||{}));delete copy.preset;const ordered={};for(const key of Object.keys(copy).sort())ordered[key]=copy[key];return JSON.stringify(ordered);};
  function install(){
    const recovery=root.InkFrameBrushProfileRecovery,adapter=root.InkFrameBrushV2Adapter,lab=root.document&&root.document.getElementById('inkframe-v2-tuning');
    if(!root.document||!recovery||!recovery.installed||!recovery.model||!adapter||!lab)return false;
    if(root.InkFrameBrushProfileRecoveryObserver&&root.InkFrameBrushProfileRecoveryObserver.installed)return true;
    let observed=adapter.currentTuning();
    recovery.model.subscribe(()=>{observed=adapter.currentTuning();});
    function capture(source){const after=adapter.currentTuning(),before=observed;if(normalize(before)!==normalize(after))recovery.model.capture(before,after,source);observed=after;recovery.render&&recovery.render();}
    function schedule(event){const row=event.target&&event.target.closest&&event.target.closest('.inkframe-v2-tune-row'),label=row&&row.querySelector('span')&&row.querySelector('span').textContent,source=label?`Adjust ${label}`:'Brush control change';root.setTimeout(()=>capture(source),0);}
    lab.addEventListener('input',schedule,true);lab.addEventListener('change',schedule,true);
    root.InkFrameBrushProfileRecoveryObserver=Object.freeze({installed:true,capture,projectCanvasWrites:0,undoWrites:0});return true;
  }
  const api={install};Object.assign(ns,{installProfileRecoveryObserver:install});root.InkFrameBrushProfileRecoveryObserver=api;if(root.document){const start=()=>{if(!install())root.setTimeout(start,16);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);