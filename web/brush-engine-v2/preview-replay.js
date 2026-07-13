// InkFrame Brush Engine V2 — bounded reference-stroke replay for Brush Preview
'use strict';

(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const MAX_REFERENCE_SAMPLES=4096;
  const AUTO_REPLAY_KEY='inkframe.brushLab.referenceReplay.auto.v1';
  let installed=false;

  function freezeSample(value){
    const sample=value&&typeof value==='object'?value:{};
    return Object.freeze({
      x:Number(sample.x)||0,
      y:Number(sample.y)||0,
      pressure:Math.max(0,Math.min(1,Number(sample.pressure)||0)),
      tiltX:Number(sample.tiltX)||0,
      tiltY:Number(sample.tiltY)||0,
      twist:Number(sample.twist)||0,
      altitudeAngle:Number.isFinite(Number(sample.altitudeAngle))?Number(sample.altitudeAngle):Math.PI/2,
      azimuthAngle:Number(sample.azimuthAngle)||0,
      width:Math.max(0,Number(sample.width)||0),
      height:Math.max(0,Number(sample.height)||0),
      timeStamp:Number.isFinite(Number(sample.timeStamp))?Number(sample.timeStamp):0,
      pointerId:Number(sample.pointerId)||0,
      pointerType:String(sample.pointerType||'pen'),
      buttons:Number(sample.buttons)||0,
    });
  }

  function createReferenceStrokeRecorder(options){
    const config=options||{};
    const maxSamples=Math.max(3,Math.min(16384,Math.floor(Number(config.maxSamples)||MAX_REFERENCE_SAMPLES)));
    let pending=null;
    let latest=null;
    let sequence=0;
    let rejected=0;

    function start(sample){
      pending={events:[Object.freeze({phase:'begin',sample:freezeSample(sample)})],overflow:false};
      return true;
    }

    function append(phase,sample){
      if(!pending)return false;
      if(pending.events.length>=maxSamples){pending.overflow=true;return false;}
      pending.events.push(Object.freeze({phase,sample:freezeSample(sample)}));
      return true;
    }

    function move(sample){return append('move',sample);}

    function finish(sample){
      if(!pending)return null;
      append('end',sample);
      const source=pending;
      pending=null;
      if(source.overflow||source.events.length<2){rejected++;return null;}
      const events=Object.freeze(source.events.slice());
      const first=events[0].sample;
      const last=events[events.length-1].sample;
      latest=Object.freeze({
        schema:1,
        id:++sequence,
        sampleCount:events.length,
        durationMs:Math.max(0,(Number(last.timeStamp)||0)-(Number(first.timeStamp)||0)),
        events,
      });
      return latest;
    }

    function cancel(){if(!pending)return false;pending=null;rejected++;return true;}
    function clear(){pending=null;latest=null;return true;}
    function snapshot(){return latest;}
    function stats(){return Object.freeze({active:!!pending,available:!!latest,rejected,maxSamples,sampleCount:latest?latest.sampleCount:0});}

    return Object.freeze({start,move,finish,cancel,clear,snapshot,stats});
  }

  function replayReferenceStroke(reference,target){
    if(!reference||!Array.isArray(reference.events)||!target)return Object.freeze({events:0,a:0,b:0});
    let events=0;
    let a=0;
    let b=0;
    for(const entry of reference.events){
      if(!entry||!entry.sample)continue;
      const method=entry.phase==='begin'?'begin':entry.phase==='end'?'end':'move';
      if(typeof target[method]!=='function')continue;
      const result=target[method](entry.sample);
      events++;
      if(result&&typeof result==='object'){
        a+=Number(result.a)||0;
        b+=Number(result.b)||0;
      }else a+=Number(result)||0;
    }
    return Object.freeze({events,a,b});
  }

  function normalizeTuning(value){return ns.normalizeTuning?ns.normalizeTuning(value||{}):Object.assign({},value||{});}

  function tuningDifferenceSummary(aValue,bValue,limitValue){
    const a=normalizeTuning(aValue);
    const b=normalizeTuning(bValue);
    const limit=Math.max(1,Math.min(8,Math.floor(Number(limitValue)||4)));
    const output=[];
    const add=(key,label,value)=>{if(output.length<limit)output.push(Object.freeze({key,label,value:String(value)}));};
    const delta=(left,right)=>Math.round((Number(right)||0)-(Number(left)||0));
    const signed=value=>`${value>0?'+':''}${value}%`;

    if(a.stabilizerMode!==b.stabilizerMode)add('stabilizer','Stabilizer',`${a.stabilizerMode||'adaptive'} → ${b.stabilizerMode||'adaptive'}`);
    else{const value=delta(a.stabilizerStrength,b.stabilizerStrength);if(value)add('stabilizer','Stabilizer',signed(value));}

    if(a.cornerMode!==b.cornerMode)add('corners','Corners',`${a.cornerMode||'smooth'} → ${b.cornerMode||'smooth'}`);
    else{const value=delta(a.cornerStrength,b.cornerStrength);if(value)add('corners','Corners',signed(value));}

    if(a.ghostMode!==b.ghostMode)add('trail','Trail',`${a.ghostMode||'off'} → ${b.ghostMode||'off'}`);
    else if(a.ghostMode&&a.ghostMode!=='off'){
      const value=delta(a.ghostIntensity,b.ghostIntensity);if(value)add('trail','Trail intensity',signed(value));
    }

    if(a.coverageMode!==b.coverageMode)add('coverage','Coverage',`${a.coverageMode||'dabs'} → ${b.coverageMode||'dabs'}`);
    if(a.radiusMode!==b.radiusMode)add('width','Width',`${a.radiusMode||'raw'} → ${b.radiusMode||'raw'}`);
    if(a.contactMode!==b.contactMode)add('contact','Contact',`${a.contactMode||'raw'} → ${b.contactMode||'raw'}`);

    if(!output.length)add('same','Settings','No differences');
    return Object.freeze(output);
  }

  function readAutoReplay(){try{return root.localStorage?root.localStorage.getItem(AUTO_REPLAY_KEY)!=='false':true;}catch(_){return true;}}
  function writeAutoReplay(value){try{if(root.localStorage)root.localStorage.setItem(AUTO_REPLAY_KEY,value?'true':'false');}catch(_){}return !!value;}

  function resolveReplaySource(){
    let env=null;
    try{if(typeof root.InkFrameBrushV2Environment==='function')env=root.InkFrameBrushV2Environment();}catch(_){}
    const brushId=env&&(env.brushId==='ink'||env.brushId==='eraser')?env.brushId:'ink';
    return {
      brushId,
      color:String(env&&env.color||'#f7d9e4'),
      profile:Object.assign({},env&&env.profile||{size:14,minSize:0.08,opacity:1,spacing:0.055,hardness:0.92,response:0}),
    };
  }

  function install(){
    if(installed||!root.document)return installed;
    const preview=root.InkFrameBrushV2PreviewPad;
    const adapter=root.InkFrameBrushV2Adapter;
    if(!preview||!preview.installed||!preview.canvas||!preview.card||!adapter||typeof preview.createPreviewSession!=='function')return false;

    const card=preview.card;
    const controls=card.querySelector('.inkframe-v2-preview-compare-controls');
    const compareSelect=controls&&controls.querySelector('select');
    const canvases=Array.from(card.querySelectorAll('.inkframe-v2-preview-canvas'));
    if(!controls||!compareSelect||!canvases.length)return false;

    const style=root.document.createElement('style');
    style.textContent=`
      .inkframe-v2-reference-bar{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:7px;align-items:center;margin:-2px 0 10px}
      .inkframe-v2-reference-bar button{min-height:38px;border:1px solid rgba(255,255,255,.15);border-radius:11px;background:rgba(255,255,255,.065);color:#fff;padding:7px 10px;font:720 10px/1 system-ui,sans-serif}
      .inkframe-v2-reference-bar button.active{background:linear-gradient(145deg,#bb0037,#69004e);border-color:#ffd0dc}
      .inkframe-v2-reference-status{min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:650 10px/1.2 system-ui,sans-serif;opacity:.67}
      .inkframe-v2-reference-diff{display:flex;flex-wrap:wrap;gap:6px;margin:-2px 0 10px}
      .inkframe-v2-reference-chip{display:inline-flex;align-items:center;gap:5px;min-height:27px;padding:5px 8px;border:1px solid rgba(255,255,255,.11);border-radius:999px;background:rgba(255,255,255,.045);font:680 9px/1 system-ui,sans-serif}
      .inkframe-v2-reference-chip b{font-weight:780}.inkframe-v2-reference-chip span{opacity:.7}
      @media(max-width:760px){.inkframe-v2-reference-bar{grid-template-columns:repeat(2,auto);}.inkframe-v2-reference-status{grid-column:1/3;text-align:left}}
    `;
    root.document.head.appendChild(style);

    const bar=root.document.createElement('div');bar.className='inkframe-v2-reference-bar';
    const replayButton=root.document.createElement('button');replayButton.type='button';replayButton.textContent='Replay Last';replayButton.disabled=true;
    const autoButton=root.document.createElement('button');autoButton.type='button';
    const referenceStatus=root.document.createElement('span');referenceStatus.className='inkframe-v2-reference-status';
    bar.append(replayButton,autoButton,referenceStatus);
    const diff=root.document.createElement('div');diff.className='inkframe-v2-reference-diff';
    controls.insertAdjacentElement('afterend',bar);bar.insertAdjacentElement('afterend',diff);

    const recorder=createReferenceStrokeRecorder();
    let autoReplay=readAutoReplay();
    let capture=null;
    let replayTimer=0;
    let replaying=false;
    let replayCount=0;
    let lastReplay=null;
    let lastTuningSignature='';

    function tuningSignature(value){return ns.tuningPresetSignature?ns.tuningPresetSignature(value):JSON.stringify(normalizeTuning(value));}

    function updateReferenceStatus(message){
      const reference=recorder.snapshot();
      replayButton.disabled=!reference;
      autoButton.textContent=autoReplay?'Auto Replay On':'Auto Replay Off';
      autoButton.classList.toggle('active',autoReplay);
      autoButton.setAttribute('aria-pressed',String(autoReplay));
      if(message)referenceStatus.textContent=message;
      else if(reference)referenceStatus.textContent=`Reference · ${reference.sampleCount} samples · ${Math.round(reference.durationMs)} ms`;
      else referenceStatus.textContent='Draw once to capture a reference stroke';
    }

    function renderDiff(){
      diff.replaceChildren();
      const stats=preview.stats?preview.stats():{};
      if(!stats.compareEnabled){diff.hidden=true;return;}
      diff.hidden=false;
      const choice=preview.compareChoice?preview.compareChoice():null;
      const items=tuningDifferenceSummary(adapter.currentTuning(),choice&&choice.tuning,4);
      for(const item of items){
        const chip=root.document.createElement('span');chip.className='inkframe-v2-reference-chip';chip.dataset.diffKey=item.key;
        const label=root.document.createElement('b');label.textContent=item.label;
        const value=root.document.createElement('span');value.textContent=item.value;
        chip.append(label,value);diff.appendChild(chip);
      }
    }

    function clearSurface(canvas){
      const context=canvas.getContext('2d');
      if(ns.resetRoundCoverage)ns.resetRoundCoverage(context);
      context.clearRect(0,0,canvas.width,canvas.height);
      const manager=ns.ghostTrailManagerFor&&ns.ghostTrailManagerFor(canvas);if(manager)manager.clear();
      const pane=canvas.closest&&canvas.closest('.inkframe-v2-preview-pane');
      const hint=pane&&pane.querySelector('.inkframe-v2-preview-hint');if(hint)hint.style.display='none';
      return context;
    }

    function replay(){
      const reference=recorder.snapshot();
      if(!reference||replaying)return false;
      const previewStats=preview.stats?preview.stats():{};
      if(previewStats.active)return false;
      replaying=true;
      try{
        preview.clear();
        const source=resolveReplaySource();
        const tuningA=adapter.currentTuning();
        const choice=preview.compareChoice?preview.compareChoice():null;
        const contextA=clearSurface(preview.canvas);
        let target;
        if(previewStats.compareEnabled&&choice&&preview.compareCanvas&&ns.createPairedPreviewSession){
          const contextB=clearSurface(preview.compareCanvas);
          target=ns.createPairedPreviewSession({
            createSession:preview.createPreviewSession,
            a:{canvas:preview.canvas,context:contextA,tuning:tuningA,source},
            b:{canvas:preview.compareCanvas,context:contextB,tuning:choice.tuning,source},
          });
        }else target=preview.createPreviewSession({canvas:preview.canvas,context:contextA,tuning:tuningA,source});
        lastReplay=replayReferenceStroke(reference,target);
        replayCount++;
        updateReferenceStatus(`Replayed · A ${lastReplay.a} dabs${lastReplay.b?` · B ${lastReplay.b} dabs`:''}`);
        renderDiff();
        return true;
      }finally{replaying=false;}
    }

    function scheduleReplay(){
      if(!autoReplay||!recorder.snapshot())return false;
      root.clearTimeout(replayTimer);
      replayTimer=root.setTimeout(replay,110);
      return true;
    }

    function beginCapture(event,canvas){
      if(!event||capture)return;
      const transform=preview.previewTransform(canvas.getBoundingClientRect(),canvas.width,canvas.height);
      const pointerId=event.pointerId;
      const normalizer=ns.createInputBatchNormalizer?ns.createInputBatchNormalizer({pointerId,pointerType:event.pointerType||'pen'}):null;
      if(normalizer&&normalizer.seed)normalizer.seed(event);
      capture={pointerId,canvas,transform,normalizer};
      recorder.start(preview.previewSampleFromEvent(event,transform));
    }

    function moveCapture(event){
      if(!capture||!event||event.pointerId!==capture.pointerId)return;
      let values=[event];
      if(capture.normalizer){try{values=capture.normalizer.normalize(event);}catch(_){values=[event];}}
      for(const value of values)recorder.move(preview.previewSampleFromEvent(value,capture.transform));
    }

    function endCapture(event){
      if(!capture||!event||event.pointerId!==capture.pointerId)return;
      if(event.type==='pointercancel')recorder.cancel();
      else recorder.finish(preview.previewSampleFromEvent(event,capture.transform));
      capture=null;
      updateReferenceStatus();
    }

    for(const canvas of canvases){
      canvas.addEventListener('pointerdown',event=>beginCapture(event,canvas),true);
      canvas.addEventListener('pointermove',moveCapture,true);
      canvas.addEventListener('pointerup',endCapture,true);
      canvas.addEventListener('pointercancel',endCapture,true);
      canvas.addEventListener('lostpointercapture',()=>{if(capture&&capture.canvas===canvas){recorder.cancel();capture=null;updateReferenceStatus('Reference cancelled');}},true);
    }

    replayButton.addEventListener('click',replay);
    autoButton.addEventListener('click',()=>{autoReplay=writeAutoReplay(!autoReplay);updateReferenceStatus();if(autoReplay)scheduleReplay();});
    compareSelect.addEventListener('change',()=>{root.setTimeout(()=>{renderDiff();scheduleReplay();},0);});
    controls.addEventListener('click',event=>{if(event.target===replayButton||event.target===autoButton)return;root.setTimeout(()=>{renderDiff();scheduleReplay();},0);});

    const lab=root.document.getElementById('inkframe-v2-tuning');
    function detectTuningChange(event){
      if(bar.contains(event.target)||diff.contains(event.target))return;
      root.setTimeout(()=>{
        const next=tuningSignature(adapter.currentTuning());
        renderDiff();
        if(next!==lastTuningSignature){lastTuningSignature=next;scheduleReplay();}
      },0);
    }
    if(lab){lab.addEventListener('input',detectTuningChange,true);lab.addEventListener('change',detectTuningChange,true);lab.addEventListener('click',detectTuningChange,true);}
    try{const store=root.InkFrameBrushV2PresetUI&&root.InkFrameBrushV2PresetUI.store;if(store&&store.subscribe)store.subscribe(()=>root.setTimeout(()=>{renderDiff();scheduleReplay();},0));}catch(_){}
    if(root.addEventListener)root.addEventListener('blur',()=>{if(capture){recorder.cancel();capture=null;updateReferenceStatus('Reference cancelled');}});
    root.document.addEventListener('visibilitychange',()=>{if(root.document.hidden&&capture){recorder.cancel();capture=null;updateReferenceStatus('Reference cancelled');}});

    lastTuningSignature=tuningSignature(adapter.currentTuning());
    updateReferenceStatus();renderDiff();installed=true;

    const runtime=Object.freeze({
      installed:true,
      recorder,
      replay,
      scheduleReplay,
      renderDiff,
      tuningDifferenceSummary,
      stats:()=>Object.freeze({autoReplay,replayCount,replaying,reference:recorder.stats(),lastReplay,projectCanvasWrites:0,undoWrites:0}),
    });
    root.InkFrameBrushV2ReferenceReplay=runtime;
    return true;
  }

  const api={MAX_REFERENCE_SAMPLES,AUTO_REPLAY_KEY,freezeReferenceSample:freezeSample,createReferenceStrokeRecorder,replayReferenceStroke,tuningDifferenceSummary,install,get installed(){return installed;}};
  Object.assign(ns,api);
  root.InkFrameBrushV2ReferenceReplay=api;
  if(root.document){const start=()=>{if(!install())root.setTimeout(start,0);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
