// InkFrame Brush Engine V2 — isolated non-destructive Brush Lab preview pad
'use strict';

(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)));
  let installed=false;

  function previewTransform(rect,width,height){
    const source=rect||{};
    const cssWidth=Math.max(1,Number(source.width)||Number(width)||1);
    const cssHeight=Math.max(1,Number(source.height)||Number(height)||1);
    return Object.freeze({
      left:Number(source.left)||0,
      top:Number(source.top)||0,
      scaleX:Math.max(1,Number(width)||1)/cssWidth,
      scaleY:Math.max(1,Number(height)||1)/cssHeight,
    });
  }

  function previewSampleFromEvent(event,transform){
    const value=event||{};
    const map=transform||previewTransform(null,1,1);
    const pointerType=String(value.pointerType||'pen');
    let pressure=Number(value.pressure);
    if(!Number.isFinite(pressure))pressure=pointerType==='mouse'?(value.buttons?0.5:0):0.35;
    return Object.freeze({
      x:(Number(value.clientX)-map.left)*map.scaleX,
      y:(Number(value.clientY)-map.top)*map.scaleY,
      pressure:clamp(pressure,0,1),
      tiltX:clamp(Number(value.tiltX)||0,-90,90),
      tiltY:clamp(Number(value.tiltY)||0,-90,90),
      twist:Number(value.twist)||0,
      altitudeAngle:Number.isFinite(Number(value.altitudeAngle))?Number(value.altitudeAngle):Math.PI/2,
      azimuthAngle:Number(value.azimuthAngle)||0,
      width:Math.max(0,Number(value.width)||0),
      height:Math.max(0,Number(value.height)||0),
      timeStamp:Number.isFinite(Number(value.timeStamp))?Number(value.timeStamp):Date.now(),
      pointerId:Number(value.pointerId)||0,
      pointerType,
      buttons:Number(value.buttons)||0,
    });
  }

  function resolvePreviewSource(){
    let env=null;
    try{if(typeof root.InkFrameBrushV2Environment==='function')env=root.InkFrameBrushV2Environment();}catch(_){}
    const brushId=env&&(env.brushId==='ink'||env.brushId==='eraser')?env.brushId:'ink';
    return {
      brushId,
      color:String(env&&env.color||'#f7d9e4'),
      profile:Object.assign({},env&&env.profile||{size:14,minSize:0.08,opacity:1,spacing:0.055,hardness:0.92,response:0}),
    };
  }

  function createPreviewSession(options){
    const config=options||{};
    const canvas=config.canvas;
    const context=config.context;
    const tuning=ns.normalizeTuning?ns.normalizeTuning(config.tuning||{}):Object.assign({},config.tuning||{});
    const source=config.source||resolvePreviewSource();
    const brushId=source.brushId==='eraser'?'eraser':'ink';
    const profile=ns.applyTuningToProfile?ns.applyTuningToProfile(source.profile,tuning):Object.assign({},source.profile);
    const engine=ns.createBrushEngine({
      width:Math.max(1,Number(canvas&&canvas.width)||720),
      height:Math.max(1,Number(canvas&&canvas.height)||240),
      brushId,
      profile,
      filter:ns.tuningFilterOptions?ns.tuningFilterOptions(tuning):{},
      validator:ns.tuningValidatorOptions?ns.tuningValidatorOptions(tuning):{},
    });
    const ghost=ns.createGhostTrailSession
      ? ns.createGhostTrailSession(canvas,ns.tuningGhostOptions?ns.tuningGhostOptions(tuning):{mode:'off'},{color:source.color,brushId})
      : {push:()=>0,end:()=>false,clear:()=>{}};
    let paintedDabs=0;
    let ended=false;

    function paint(dabs){
      const list=Array.from(dabs||[]);
      for(const dab of list){if(ns.paintRoundDab)ns.paintRoundDab(context,dab,source.color);paintedDabs++;}
      ghost.push(list);
      return list.length;
    }
    function begin(sample){if(ended)throw new Error('preview session ended');return paint(engine.begin(sample));}
    function move(sample){if(ended)return 0;return paint(engine.move(sample));}
    function end(sample){
      if(ended)return 0;
      const count=paint(engine.end(sample));ended=true;ghost.end();return count;
    }
    function abort(){
      if(ended)return false;
      ended=true;try{engine.reset();}catch(_){}ghost.clear();ghost.end();return true;
    }
    return Object.freeze({begin,move,end,abort,stats:()=>Object.freeze({paintedDabs,ended,brushId,tuning,engine:engine.stats?engine.stats():null}),brushId,color:source.color,profile,tuning});
  }

  function install(){
    if(installed||!root.document||!ns.createBrushEngine||!ns.paintRoundDab)return installed;
    const adapter=root.InkFrameBrushV2Adapter;
    const lab=root.document.getElementById('inkframe-v2-tuning');
    const stabilizer=lab&&lab.querySelector('[data-lab-section="stabilizer"] .inkframe-v2-lab-primary');
    if(!adapter||!stabilizer)return false;

    const style=root.document.createElement('style');
    style.textContent=`
      .inkframe-v2-preview-card{margin:0 0 16px;padding:13px;border:1px solid rgba(255,255,255,.12);border-radius:15px;background:rgba(255,255,255,.035)}
      .inkframe-v2-preview-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .inkframe-v2-preview-head strong{font-size:13px;letter-spacing:.025em}
      .inkframe-v2-preview-status{font:650 10px/1 system-ui,sans-serif;opacity:.66;max-width:64%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .inkframe-v2-preview-compare-controls{display:grid;grid-template-columns:auto minmax(150px,1fr) auto auto;gap:7px;margin-bottom:10px}
      .inkframe-v2-preview-compare-controls button,.inkframe-v2-preview-compare-controls select{min-height:40px;border:1px solid rgba(255,255,255,.16);border-radius:11px;background:rgba(255,255,255,.07);color:#fff;padding:7px 10px;font:720 10px/1 system-ui,sans-serif}
      .inkframe-v2-preview-compare-controls select{background:#2b1325;min-width:0}
      .inkframe-v2-preview-compare-controls button.active{background:linear-gradient(145deg,#bb0037,#69004e);border-color:#ffd0dc}
      .inkframe-v2-preview-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
      .inkframe-v2-preview-grid.compare{grid-template-columns:repeat(2,minmax(0,1fr))}
      .inkframe-v2-preview-pane[hidden]{display:none}
      .inkframe-v2-preview-pane-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 3px 6px;font:720 10px/1.2 system-ui,sans-serif}
      .inkframe-v2-preview-pane-head span:last-child{opacity:.62;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .inkframe-v2-preview-stage{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:14px;background-color:#241520;background-image:linear-gradient(45deg,rgba(255,255,255,.045) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,255,255,.045) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(255,255,255,.045) 75%),linear-gradient(-45deg,transparent 75%,rgba(255,255,255,.045) 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0;touch-action:none}
      .inkframe-v2-preview-canvas{display:block;width:100%;height:190px;touch-action:none;cursor:crosshair}
      .inkframe-v2-preview-hint{position:absolute;inset:auto 12px 10px;pointer-events:none;text-align:center;color:rgba(255,255,255,.46);font:650 10px/1.2 system-ui,sans-serif;letter-spacing:.02em}
      .inkframe-v2-preview-actions{display:flex;justify-content:flex-end;margin-top:8px}
      .inkframe-v2-preview-actions button{min-height:40px;border:1px solid rgba(255,255,255,.16);border-radius:11px;background:rgba(255,255,255,.07);color:#fff;padding:7px 12px;font:720 10px/1 system-ui,sans-serif}
      @media(max-width:760px){.inkframe-v2-preview-grid.compare{grid-template-columns:minmax(0,1fr)}.inkframe-v2-preview-canvas{height:150px}.inkframe-v2-preview-status{max-width:52%}.inkframe-v2-preview-compare-controls{grid-template-columns:repeat(2,minmax(0,1fr))}.inkframe-v2-preview-compare-controls select{grid-column:1/3}}
    `;
    root.document.head.appendChild(style);

    const card=root.document.createElement('section');card.className='inkframe-v2-preview-card';
    const head=root.document.createElement('div');head.className='inkframe-v2-preview-head';
    const title=root.document.createElement('strong');title.textContent='Brush Preview';
    const status=root.document.createElement('span');status.className='inkframe-v2-preview-status';
    head.append(title,status);

    const controls=root.document.createElement('div');controls.className='inkframe-v2-preview-compare-controls';
    const compareButton=root.document.createElement('button');compareButton.type='button';compareButton.textContent='Compare Off';compareButton.setAttribute('aria-pressed','false');
    const compareSelect=root.document.createElement('select');compareSelect.setAttribute('aria-label','Comparison preset');
    const swapButton=root.document.createElement('button');swapButton.type='button';swapButton.textContent='Swap A/B';
    const applyButton=root.document.createElement('button');applyButton.type='button';applyButton.textContent='Apply B';
    controls.append(compareButton,compareSelect,swapButton,applyButton);

    function makePane(side,labelText){
      const pane=root.document.createElement('div');pane.className='inkframe-v2-preview-pane';pane.dataset.previewSide=side;
      const paneHead=root.document.createElement('div');paneHead.className='inkframe-v2-preview-pane-head';
      const sideLabel=root.document.createElement('span');sideLabel.textContent=side;
      const detail=root.document.createElement('span');detail.textContent=labelText;
      paneHead.append(sideLabel,detail);
      const stage=root.document.createElement('div');stage.className='inkframe-v2-preview-stage';
      const canvas=root.document.createElement('canvas');canvas.className='inkframe-v2-preview-canvas';canvas.width=720;canvas.height=240;canvas.setAttribute('aria-label',side==='A'?'Current brush preview':'Comparison brush preview');
      const hint=root.document.createElement('div');hint.className='inkframe-v2-preview-hint';hint.textContent=side==='A'?'Draw here with the S Pen · artwork stays untouched':'Same input is rendered here with comparison settings';
      stage.append(canvas,hint);pane.append(paneHead,stage);
      return {pane,detail,canvas,hint};
    }

    const grid=root.document.createElement('div');grid.className='inkframe-v2-preview-grid';
    const left=makePane('A','Current settings');
    const right=makePane('B','Studio · Balanced');right.pane.hidden=true;
    grid.append(left.pane,right.pane);
    const actions=root.document.createElement('div');actions.className='inkframe-v2-preview-actions';
    const clearButton=root.document.createElement('button');clearButton.type='button';clearButton.textContent='Clear Preview';actions.appendChild(clearButton);
    card.append(head,controls,grid,actions);
    const presets=stabilizer.querySelector('.inkframe-v2-user-presets');
    if(presets)presets.insertAdjacentElement('afterend',card);else stabilizer.prepend(card);

    const leftContext=left.canvas.getContext('2d');
    const rightContext=right.canvas.getContext('2d');
    if(!leftContext||!rightContext){card.remove();return false;}
    installed=true;

    let active=null;
    let paired=false;
    let transform=null;
    let normalizer=null;
    let pointerId=null;
    let activeInputCanvas=null;
    let compareEnabled=false;
    let selectedCompareId='studio:balanced';
    let transientChoice=null;
    let strokes=0;
    let dabsA=0;
    let dabsB=0;

    function presetLibrary(){
      try{const store=root.InkFrameBrushV2PresetUI&&root.InkFrameBrushV2PresetUI.store;return store&&store.snapshot?store.snapshot():{presets:[],pinned:[]};}
      catch(_){return {presets:[],pinned:[]};}
    }

    function availableChoices(){
      const values=ns.compareChoices?Array.from(ns.compareChoices(presetLibrary())):[];
      if(transientChoice)values.unshift(ns.resolveCompareChoice?ns.resolveCompareChoice('transient',presetLibrary(),transientChoice):transientChoice);
      return values.filter(Boolean);
    }

    function currentCompareChoice(){
      return ns.resolveCompareChoice?ns.resolveCompareChoice(selectedCompareId,presetLibrary(),transientChoice):null;
    }

    function renderCompareSelect(){
      const choices=availableChoices();
      if(!choices.some(choice=>choice.id===selectedCompareId))selectedCompareId=choices[0]?choices[0].id:'studio:balanced';
      compareSelect.replaceChildren();
      for(const choice of choices){const option=root.document.createElement('option');option.value=choice.id;option.textContent=choice.label;compareSelect.appendChild(option);}
      compareSelect.value=selectedCompareId;
    }

    function tuningLabel(tuning,source){
      const strength=Math.round(Number(tuning&&tuning.stabilizerStrength)||0);
      const trail=tuning&&tuning.ghostMode==='echo'?'Echo':tuning&&tuning.ghostMode==='comet'?'Comet':'Trail off';
      return `${source.brushId==='eraser'?'Eraser':'Ink'} · ${strength}% · ${trail}`;
    }

    function refreshStatus(){
      const source=resolvePreviewSource();
      const current=adapter.currentTuning();
      const choice=currentCompareChoice();
      const aLabel=tuningLabel(current,source);
      left.detail.textContent=aLabel;
      right.detail.textContent=choice?choice.label:'No comparison';
      status.textContent=compareEnabled&&choice?`A ${aLabel} · B ${choice.label}`:aLabel;
      compareButton.textContent=compareEnabled?'Compare On':'Compare Off';
      compareButton.classList.toggle('active',compareEnabled);
      compareButton.setAttribute('aria-pressed',String(compareEnabled));
      swapButton.disabled=!compareEnabled||!choice;
      applyButton.disabled=!choice;
    }

    function clearSurface(canvas,context,hint){
      if(ns.resetRoundCoverage)ns.resetRoundCoverage(context);
      context.clearRect(0,0,canvas.width,canvas.height);
      const manager=ns.ghostTrailManagerFor&&ns.ghostTrailManagerFor(canvas);if(manager)manager.clear();
      hint.style.display='';
    }

    function releaseActive(clearGhost){
      if(active){active.abort();active=null;}
      paired=false;normalizer=null;transform=null;pointerId=null;activeInputCanvas=null;
      if(clearGhost){
        const leftManager=ns.ghostTrailManagerFor&&ns.ghostTrailManagerFor(left.canvas);if(leftManager)leftManager.clear();
        const rightManager=ns.ghostTrailManagerFor&&ns.ghostTrailManagerFor(right.canvas);if(rightManager)rightManager.clear();
      }
    }

    function clear(){
      releaseActive(true);
      clearSurface(left.canvas,leftContext,left.hint);
      clearSurface(right.canvas,rightContext,right.hint);
      strokes=0;dabsA=0;dabsB=0;refreshStatus();return true;
    }

    function addCounts(result){
      if(paired&&result&&typeof result==='object'){dabsA+=Number(result.a)||0;dabsB+=Number(result.b)||0;}
      else dabsA+=Number(result)||0;
    }

    function eventSamples(event){
      if(!normalizer)return [event];
      try{const values=normalizer.normalize(event);return values.length?values:[];}catch(_){return [event];}
    }

    function begin(event,inputCanvas){
      if(active||!event)return false;
      if(typeof event.preventDefault==='function')event.preventDefault();
      activeInputCanvas=inputCanvas||left.canvas;
      const rect=activeInputCanvas.getBoundingClientRect();transform=previewTransform(rect,activeInputCanvas.width,activeInputCanvas.height);
      const source=resolvePreviewSource();
      const tuningA=adapter.currentTuning();
      const choice=currentCompareChoice();
      paired=!!(compareEnabled&&choice&&ns.createPairedPreviewSession);
      active=paired
        ? ns.createPairedPreviewSession({
            createSession:createPreviewSession,
            a:{canvas:left.canvas,context:leftContext,tuning:tuningA,source},
            b:{canvas:right.canvas,context:rightContext,tuning:choice.tuning,source},
          })
        : createPreviewSession({canvas:left.canvas,context:leftContext,tuning:tuningA,source});
      pointerId=event.pointerId;
      normalizer=ns.createInputBatchNormalizer?ns.createInputBatchNormalizer({pointerId,pointerType:event.pointerType||'pen'}):null;
      if(normalizer&&normalizer.seed)normalizer.seed(event);
      strokes++;addCounts(active.begin(previewSampleFromEvent(event,transform)));
      try{activeInputCanvas.setPointerCapture(pointerId);}catch(_){}
      left.hint.style.display='none';if(paired)right.hint.style.display='none';refreshStatus();return true;
    }

    function move(event){
      if(!active||!event||event.pointerId!==pointerId)return false;
      if(typeof event.preventDefault==='function')event.preventDefault();
      for(const value of eventSamples(event))addCounts(active.move(previewSampleFromEvent(value,transform)));
      return true;
    }

    function end(event){
      if(!active||!event||event.pointerId!==pointerId)return false;
      if(typeof event.preventDefault==='function')event.preventDefault();
      addCounts(active.end(previewSampleFromEvent(event,transform)));
      active=null;paired=false;normalizer=null;transform=null;pointerId=null;activeInputCanvas=null;refreshStatus();return true;
    }

    function setCompareEnabled(value){
      releaseActive(false);
      compareEnabled=!!value;
      grid.classList.toggle('compare',compareEnabled);
      right.pane.hidden=!compareEnabled;
      clear();
      return compareEnabled;
    }

    function selectCompare(id){
      const choices=availableChoices();
      if(!choices.some(choice=>choice.id===String(id)))return false;
      selectedCompareId=String(id);compareSelect.value=selectedCompareId;clear();return true;
    }

    function setTransientCompare(label,tuning){
      if(adapter.isActive&&adapter.isActive())return false;
      releaseActive(false);
      transientChoice={label:String(label||'Temporary comparison').slice(0,96),tuning:ns.normalizeTuning?ns.normalizeTuning(tuning||{}):Object.assign({},tuning||{})};
      selectedCompareId='transient';renderCompareSelect();setCompareEnabled(true);return currentCompareChoice();
    }

    function applyCompare(){
      releaseActive(false);
      const choice=currentCompareChoice();
      if(!choice||adapter.isActive&&adapter.isActive())return false;
      const applied=adapter.setTuning(choice.tuning);
      if(applied){clear();if(root.InkFrameBrushV2LabUI&&root.InkFrameBrushV2LabUI.updateSummaries)root.InkFrameBrushV2LabUI.updateSummaries();}
      return !!applied;
    }

    function swapCompare(){
      releaseActive(false);
      const choice=currentCompareChoice();
      if(!choice||adapter.isActive&&adapter.isActive())return false;
      const previous=adapter.currentTuning();
      const applied=adapter.setTuning(choice.tuning);
      if(!applied)return false;
      transientChoice={label:'Previous A',tuning:previous};selectedCompareId='transient';renderCompareSelect();clear();
      if(root.InkFrameBrushV2LabUI&&root.InkFrameBrushV2LabUI.updateSummaries)root.InkFrameBrushV2LabUI.updateSummaries();
      return true;
    }

    function attachCanvas(canvas){
      canvas.addEventListener('pointerdown',event=>begin(event,canvas));
      canvas.addEventListener('pointermove',move);
      canvas.addEventListener('pointerup',end);
      canvas.addEventListener('pointercancel',end);
      canvas.addEventListener('lostpointercapture',()=>releaseActive(false));
    }

    attachCanvas(left.canvas);attachCanvas(right.canvas);
    compareButton.addEventListener('click',()=>setCompareEnabled(!compareEnabled));
    compareSelect.addEventListener('change',()=>selectCompare(compareSelect.value));
    swapButton.addEventListener('click',swapCompare);
    applyButton.addEventListener('click',applyCompare);
    clearButton.addEventListener('click',clear);
    lab.addEventListener('input',()=>root.setTimeout(refreshStatus,0),true);
    lab.addEventListener('change',()=>root.setTimeout(refreshStatus,0),true);
    lab.addEventListener('click',()=>root.setTimeout(refreshStatus,0),true);
    if(root.addEventListener)root.addEventListener('blur',()=>releaseActive(false));
    root.document.addEventListener('visibilitychange',()=>{if(root.document.hidden)releaseActive(false);});
    try{const store=root.InkFrameBrushV2PresetUI&&root.InkFrameBrushV2PresetUI.store;if(store&&store.subscribe)store.subscribe(()=>{renderCompareSelect();refreshStatus();});}catch(_){}
    renderCompareSelect();refreshStatus();

    const runtimeApi={
      installed:true,
      canvas:left.canvas,
      compareCanvas:right.canvas,
      card,
      clear,
      begin:event=>begin(event,left.canvas),
      move,
      end,
      refreshStatus,
      previewTransform,
      previewSampleFromEvent,
      createPreviewSession,
      setCompareEnabled,
      selectCompare,
      setTransientCompare,
      applyCompare,
      swapCompare,
      compareChoice:currentCompareChoice,
      stats:()=>Object.freeze({strokes,dabs:dabsA,dabsA,dabsB,active:!!active,compareEnabled,selectedCompareId,projectCanvasWrites:0,undoWrites:0}),
    };
    root.InkFrameBrushV2PreviewPad=runtimeApi;
    return true;
  }

  const api={previewTransform,previewSampleFromEvent,resolvePreviewSource,createPreviewSession,install,get installed(){return installed;}};
  Object.assign(ns,{createPreviewSession});
  root.InkFrameBrushV2PreviewPad=api;
  if(root.document){const start=()=>{if(!install())root.setTimeout(start,0);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
