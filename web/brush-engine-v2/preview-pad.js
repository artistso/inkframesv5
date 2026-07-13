// InkFrame Brush Engine V2 — isolated non-destructive Brush Lab preview pad
'use strict';

(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)));
  let installed=false;
  let publicApi=null;

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
    if(!Number.isFinite(pressure)||pressure<=0)pressure=pointerType==='mouse'?(value.buttons?0.5:0):0.35;
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
    installed=true;

    const style=root.document.createElement('style');
    style.textContent=`
      .inkframe-v2-preview-card{margin:0 0 16px;padding:13px;border:1px solid rgba(255,255,255,.12);border-radius:15px;background:rgba(255,255,255,.035)}
      .inkframe-v2-preview-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .inkframe-v2-preview-head strong{font-size:13px;letter-spacing:.025em}
      .inkframe-v2-preview-status{font:650 10px/1 system-ui,sans-serif;opacity:.66;max-width:64%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .inkframe-v2-preview-stage{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:14px;background-color:#241520;background-image:linear-gradient(45deg,rgba(255,255,255,.045) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,255,255,.045) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(255,255,255,.045) 75%),linear-gradient(-45deg,transparent 75%,rgba(255,255,255,.045) 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0;touch-action:none}
      .inkframe-v2-preview-canvas{display:block;width:100%;height:190px;touch-action:none;cursor:crosshair}
      .inkframe-v2-preview-hint{position:absolute;inset:auto 12px 10px;pointer-events:none;text-align:center;color:rgba(255,255,255,.46);font:650 10px/1.2 system-ui,sans-serif;letter-spacing:.02em}
      .inkframe-v2-preview-actions{display:flex;justify-content:flex-end;margin-top:8px}
      .inkframe-v2-preview-actions button{min-height:40px;border:1px solid rgba(255,255,255,.16);border-radius:11px;background:rgba(255,255,255,.07);color:#fff;padding:7px 12px;font:720 10px/1 system-ui,sans-serif}
      @media(max-width:760px){.inkframe-v2-preview-canvas{height:150px}.inkframe-v2-preview-status{max-width:52%}}
    `;
    root.document.head.appendChild(style);

    const card=root.document.createElement('section');card.className='inkframe-v2-preview-card';
    const head=root.document.createElement('div');head.className='inkframe-v2-preview-head';
    const title=root.document.createElement('strong');title.textContent='Preview Pad';
    const status=root.document.createElement('span');status.className='inkframe-v2-preview-status';
    head.append(title,status);
    const stage=root.document.createElement('div');stage.className='inkframe-v2-preview-stage';
    const canvas=root.document.createElement('canvas');canvas.className='inkframe-v2-preview-canvas';canvas.width=720;canvas.height=240;canvas.setAttribute('aria-label','Non-destructive brush preview pad');
    const hint=root.document.createElement('div');hint.className='inkframe-v2-preview-hint';hint.textContent='Draw here with the S Pen · artwork and undo history stay untouched';
    stage.append(canvas,hint);
    const actions=root.document.createElement('div');actions.className='inkframe-v2-preview-actions';
    const clearButton=root.document.createElement('button');clearButton.type='button';clearButton.textContent='Clear Preview';actions.appendChild(clearButton);
    card.append(head,stage,actions);
    const presets=stabilizer.querySelector('.inkframe-v2-user-presets');
    if(presets)presets.insertAdjacentElement('afterend',card);else stabilizer.prepend(card);

    const context=canvas.getContext('2d');
    let active=null;
    let transform=null;
    let normalizer=null;
    let lastEvent=null;
    let strokes=0;
    let dabs=0;

    function currentLabel(){
      const tuning=adapter.currentTuning();
      const source=resolvePreviewSource();
      const strength=Math.round(Number(tuning.stabilizerStrength)||0);
      const trail=tuning.ghostMode==='echo'?'Echo':tuning.ghostMode==='comet'?'Comet':'Trail off';
      return `${source.brushId==='eraser'?'Eraser':'Ink'} · ${strength}% · ${trail}`;
    }
    function refreshStatus(){status.textContent=currentLabel();}
    function clear(){
      if(active){active.abort();active=null;}
      if(ns.resetRoundCoverage)ns.resetRoundCoverage(context);
      if(context)context.clearRect(0,0,canvas.width,canvas.height);
      const manager=ns.ghostTrailManagerFor&&ns.ghostTrailManagerFor(canvas);if(manager)manager.clear();
      strokes=0;dabs=0;refreshStatus();return true;
    }
    function eventSamples(event){
      if(!normalizer)return [event];
      try{const values=normalizer.normalize(event);return values.length?values:[];}catch(_){return [event];}
    }
    function begin(event){
      if(active||!event)return false;
      event.preventDefault();
      const rect=canvas.getBoundingClientRect();transform=previewTransform(rect,canvas.width,canvas.height);
      const tuning=adapter.currentTuning();
      active=createPreviewSession({canvas,context,tuning,source:resolvePreviewSource()});
      normalizer=ns.createInputBatchNormalizer?ns.createInputBatchNormalizer({pointerId:event.pointerId,pointerType:event.pointerType||'pen'}):null;
      if(normalizer&&normalizer.seed)normalizer.seed(event);
      lastEvent=event;strokes++;
      dabs+=active.begin(previewSampleFromEvent(event,transform));
      try{canvas.setPointerCapture(event.pointerId);}catch(_){}
      hint.style.display='none';refreshStatus();return true;
    }
    function move(event){
      if(!active||!event||lastEvent&&event.pointerId!==lastEvent.pointerId)return false;
      event.preventDefault();lastEvent=event;
      for(const value of eventSamples(event))dabs+=active.move(previewSampleFromEvent(value,transform));
      return true;
    }
    function end(event){
      if(!active||!event||lastEvent&&event.pointerId!==lastEvent.pointerId)return false;
      event.preventDefault();lastEvent=event;
      dabs+=active.end(previewSampleFromEvent(event,transform));active=null;normalizer=null;transform=null;refreshStatus();return true;
    }

    canvas.addEventListener('pointerdown',begin);
    canvas.addEventListener('pointermove',move);
    canvas.addEventListener('pointerup',end);
    canvas.addEventListener('pointercancel',end);
    clearButton.addEventListener('click',clear);
    lab.addEventListener('input',()=>root.setTimeout(refreshStatus,0),true);
    lab.addEventListener('change',()=>root.setTimeout(refreshStatus,0),true);
    lab.addEventListener('click',()=>root.setTimeout(refreshStatus,0),true);
    refreshStatus();

    publicApi={installed:true,canvas,card,clear,begin,move,end,refreshStatus,stats:()=>Object.freeze({strokes,dabs,active:!!active,projectCanvasWrites:0,undoWrites:0})};
    root.InkFrameBrushV2PreviewPad=publicApi;
    return true;
  }

  const api={previewTransform,previewSampleFromEvent,resolvePreviewSource,createPreviewSession,install,get installed(){return installed;}};
  root.InkFrameBrushV2PreviewPad=api;
  if(root.document){const start=()=>{if(!install())root.setTimeout(start,0);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
