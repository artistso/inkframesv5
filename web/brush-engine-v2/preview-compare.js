// InkFrame Brush Engine V2 — deterministic A/B preview comparison model
'use strict';

(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const STUDIO_PRESETS=Object.freeze(['direct','balanced','smooth']);

  function normalizeLibrary(value){
    const input=value&&typeof value==='object'?value:{};
    return {presets:Array.isArray(input.presets)?input.presets.slice():[],pinned:Array.isArray(input.pinned)?input.pinned.slice():[]};
  }
  function studioChoice(name){
    const key=String(name||'').toLowerCase();if(!STUDIO_PRESETS.includes(key))return null;
    const tuning=ns.presetValue?ns.presetValue(key):{preset:key};
    return Object.freeze({id:`studio:${key}`,kind:'studio',key,label:`Studio · ${key[0].toUpperCase()}${key.slice(1)}`,tuning:ns.normalizeTuning?ns.normalizeTuning(tuning):Object.assign({},tuning)});
  }
  function savedChoice(preset){
    if(!preset||!preset.id)return null;
    const tuning=ns.normalizeTuning?ns.normalizeTuning(preset.tuning||{}):Object.assign({},preset.tuning||{});
    return Object.freeze({id:`saved:${preset.id}`,kind:'saved',key:String(preset.id),label:`Saved · ${String(preset.name||'Preset')}`,tuning});
  }
  function compareChoices(library){
    const state=normalizeLibrary(library),output=STUDIO_PRESETS.map(studioChoice).filter(Boolean);
    for(const preset of state.presets){const choice=savedChoice(preset);if(choice)output.push(choice);}return Object.freeze(output);
  }
  function resolveCompareChoice(id,library,transient){
    const key=String(id||'');
    if(key==='transient'&&transient){const tuning=ns.normalizeTuning?ns.normalizeTuning(transient.tuning||transient):Object.assign({},transient.tuning||transient);return Object.freeze({id:'transient',kind:'transient',key:'transient',label:String(transient.label||'Previous A'),tuning});}
    if(key.startsWith('studio:'))return studioChoice(key.slice(7))||studioChoice('balanced');
    if(key.startsWith('saved:')){const wanted=key.slice(6),state=normalizeLibrary(library);return savedChoice(state.presets.find(item=>String(item.id)===wanted))||studioChoice('balanced');}
    return studioChoice('balanced');
  }
  function createPairedPreviewSession(options){
    const config=options||{},factory=config.createSession||ns.createPreviewSession;if(typeof factory!=='function')throw new Error('preview session factory unavailable');
    const a=factory(config.a||{}),b=factory(config.b||{});let inputSamples=0,ended=false;
    function feed(method,sample){if(ended)return Object.freeze({a:0,b:0});inputSamples++;const aCount=typeof a[method]==='function'?a[method](sample):0,bCount=typeof b[method]==='function'?b[method](sample):0;if(method==='end')ended=true;return Object.freeze({a:Number(aCount)||0,b:Number(bCount)||0});}
    function abort(){if(ended)return false;ended=true;const left=typeof a.abort==='function'?a.abort():false,right=typeof b.abort==='function'?b.abort():false;return !!(left||right);}
    return Object.freeze({begin:sample=>feed('begin',sample),move:sample=>feed('move',sample),end:sample=>feed('end',sample),abort,stats:()=>Object.freeze({inputSamples,ended,a:a.stats?a.stats():null,b:b.stats?b.stats():null}),a,b});
  }
  function loadProfileIdentities(){
    if(!root.document||root.InkFrameBrushProfileIdentities)return false;
    if(root.document.querySelector('script[data-inkframe-profile-identities]'))return true;
    const script=root.document.createElement('script');script.src='brush-engine-v2/profile-identities.js';script.async=false;script.dataset.inkframeProfileIdentities='true';root.document.head.appendChild(script);return true;
  }
  function loadProfileRecoveryObserver(){
    if(!root.document)return false;
    if(root.InkFrameBrushProfileRecoveryObserver){root.setTimeout(loadProfileIdentities,0);return true;}
    const existing=root.document.querySelector('script[data-inkframe-profile-recovery-observer]');if(existing){existing.addEventListener&&existing.addEventListener('load',()=>root.setTimeout(loadProfileIdentities,0),{once:true});return true;}
    const script=root.document.createElement('script');script.src='brush-engine-v2/profile-recovery-observer.js';script.async=false;script.dataset.inkframeProfileRecoveryObserver='true';script.addEventListener('load',()=>root.setTimeout(loadProfileIdentities,0),{once:true});root.document.head.appendChild(script);return true;
  }
  function loadProfileRecovery(){
    if(!root.document)return false;
    if(root.InkFrameBrushProfileRecovery){root.setTimeout(loadProfileRecoveryObserver,0);return true;}
    const existing=root.document.querySelector('script[data-inkframe-profile-recovery]');if(existing)return true;
    const script=root.document.createElement('script');script.src='brush-engine-v2/profile-recovery.js';script.async=false;script.dataset.inkframeProfileRecovery='true';script.addEventListener('load',()=>root.setTimeout(loadProfileRecoveryObserver,0),{once:true});root.document.head.appendChild(script);return true;
  }
  function loadCalibrationReport(){
    if(!root.document)return false;
    if(root.InkFrameBrushCalibrationReport){root.setTimeout(loadProfileRecovery,0);return true;}
    const existing=root.document.querySelector('script[data-inkframe-calibration-report]');if(existing)return true;
    const script=root.document.createElement('script');script.src='brush-engine-v2/calibration-report.js';script.async=false;script.dataset.inkframeCalibrationReport='true';script.addEventListener('load',()=>root.setTimeout(loadProfileRecovery,0),{once:true});root.document.head.appendChild(script);return true;
  }
  function loadCoachSession(){
    if(!root.document)return false;
    if(root.InkFrameBrushCoachSession){root.setTimeout(loadCalibrationReport,0);return true;}
    const existing=root.document.querySelector('script[data-inkframe-coach-session]');if(existing)return true;
    const script=root.document.createElement('script');script.src='brush-engine-v2/coach-session.js';script.async=false;script.dataset.inkframeCoachSession='true';script.addEventListener('load',()=>root.setTimeout(loadCalibrationReport,0),{once:true});root.document.head.appendChild(script);return true;
  }
  function loadBrushCoach(){
    if(!root.document)return false;
    if(root.InkFrameBrushCoach){root.setTimeout(loadCoachSession,0);return true;}
    const existing=root.document.querySelector('script[data-inkframe-brush-coach]');if(existing)return true;
    const script=root.document.createElement('script');script.src='brush-engine-v2/brush-coach.js';script.async=false;script.dataset.inkframeBrushCoach='true';script.addEventListener('load',()=>root.setTimeout(loadCoachSession,0),{once:true});root.document.head.appendChild(script);return true;
  }
  function loadReferenceReplay(){
    if(!root.document)return false;
    if(root.InkFrameBrushV2ReferenceReplay){root.setTimeout(loadBrushCoach,0);return true;}
    const existing=root.document.querySelector('script[data-inkframe-reference-replay]');if(existing)return true;
    const script=root.document.createElement('script');script.src='brush-engine-v2/preview-replay.js';script.async=false;script.dataset.inkframeReferenceReplay='true';script.addEventListener('load',()=>root.setTimeout(loadBrushCoach,0),{once:true});root.document.head.appendChild(script);return true;
  }
  const api={STUDIO_COMPARE_PRESETS:STUDIO_PRESETS,normalizeCompareLibrary:normalizeLibrary,studioCompareChoice:studioChoice,savedCompareChoice:savedChoice,compareChoices,resolveCompareChoice,createPairedPreviewSession,loadReferenceReplay,loadBrushCoach,loadCoachSession,loadCalibrationReport,loadProfileRecovery,loadProfileRecoveryObserver,loadProfileIdentities};
  Object.assign(ns,api);if(root.document)root.setTimeout(loadReferenceReplay,0);if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
