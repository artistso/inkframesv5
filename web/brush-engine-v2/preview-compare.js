// InkFrame Brush Engine V2 — deterministic A/B preview comparison model
'use strict';

(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const STUDIO_PRESETS=Object.freeze(['direct','balanced','smooth']);

  function normalizeLibrary(value){
    const input=value&&typeof value==='object'?value:{};
    return {
      presets:Array.isArray(input.presets)?input.presets.slice():[],
      pinned:Array.isArray(input.pinned)?input.pinned.slice():[],
    };
  }

  function studioChoice(name){
    const key=String(name||'').toLowerCase();
    if(!STUDIO_PRESETS.includes(key))return null;
    const tuning=ns.presetValue?ns.presetValue(key):{preset:key};
    return Object.freeze({id:`studio:${key}`,kind:'studio',key,label:`Studio · ${key[0].toUpperCase()}${key.slice(1)}`,tuning:ns.normalizeTuning?ns.normalizeTuning(tuning):Object.assign({},tuning)});
  }

  function savedChoice(preset){
    if(!preset||!preset.id)return null;
    const tuning=ns.normalizeTuning?ns.normalizeTuning(preset.tuning||{}):Object.assign({},preset.tuning||{});
    return Object.freeze({id:`saved:${preset.id}`,kind:'saved',key:String(preset.id),label:`Saved · ${String(preset.name||'Preset')}`,tuning});
  }

  function compareChoices(library){
    const state=normalizeLibrary(library);
    const output=STUDIO_PRESETS.map(studioChoice).filter(Boolean);
    for(const preset of state.presets){const choice=savedChoice(preset);if(choice)output.push(choice);}
    return Object.freeze(output);
  }

  function resolveCompareChoice(id,library,transient){
    const key=String(id||'');
    if(key==='transient'&&transient){
      const tuning=ns.normalizeTuning?ns.normalizeTuning(transient.tuning||transient):Object.assign({},transient.tuning||transient);
      return Object.freeze({id:'transient',kind:'transient',key:'transient',label:String(transient.label||'Previous A'),tuning});
    }
    if(key.startsWith('studio:'))return studioChoice(key.slice(7));
    if(key.startsWith('saved:')){
      const wanted=key.slice(6);const state=normalizeLibrary(library);
      return savedChoice(state.presets.find(item=>String(item.id)===wanted));
    }
    return studioChoice('balanced');
  }

  function createPairedPreviewSession(options){
    const config=options||{};
    const factory=config.createSession||ns.createPreviewSession;
    if(typeof factory!=='function')throw new Error('preview session factory unavailable');
    const a=factory(config.a||{});
    const b=factory(config.b||{});
    let inputSamples=0;
    let ended=false;

    function feed(method,sample){
      if(ended&&method!=='end')return Object.freeze({a:0,b:0});
      inputSamples++;
      const aCount=typeof a[method]==='function'?a[method](sample):0;
      const bCount=typeof b[method]==='function'?b[method](sample):0;
      if(method==='end')ended=true;
      return Object.freeze({a:Number(aCount)||0,b:Number(bCount)||0});
    }

    function abort(){
      if(ended)return false;
      ended=true;
      const left=typeof a.abort==='function'?a.abort():false;
      const right=typeof b.abort==='function'?b.abort():false;
      return !!(left||right);
    }

    return Object.freeze({
      begin:sample=>feed('begin',sample),
      move:sample=>feed('move',sample),
      end:sample=>feed('end',sample),
      abort,
      stats:()=>Object.freeze({inputSamples,ended,a:a.stats?a.stats():null,b:b.stats?b.stats():null}),
      a,b,
    });
  }

  const api={STUDIO_COMPARE_PRESETS:STUDIO_PRESETS,normalizeCompareLibrary:normalizeLibrary,studioCompareChoice:studioChoice,savedCompareChoice:savedChoice,compareChoices,resolveCompareChoice,createPairedPreviewSession};
  Object.assign(ns,api);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
