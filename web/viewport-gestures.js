// InkFrame — tablet viewport gestures and compact zoom controls
'use strict';

(function(root){
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value,min)));
  const point=value=>({x:finite(value&&value.clientX),y:finite(value&&value.clientY)});
  const midpoint=(a,b)=>({x:(finite(a&&a.x)+finite(b&&b.x))/2,y:(finite(a&&a.y)+finite(b&&b.y))/2});
  const distance=(a,b)=>Math.hypot(finite(a&&a.x)-finite(b&&b.x),finite(a&&a.y)-finite(b&&b.y));

  function anchoredViewport(state,startCentroid,currentCentroid,startDistance,currentDistance){
    const input=state||{};
    const baseScale=Math.max(1e-6,finite(input.scale,1));
    const minScale=Math.max(1e-6,finite(input.minScale,baseScale*0.35));
    const maxScale=Math.max(minScale,finite(input.maxScale,baseScale*2.2));
    const ratio=Math.max(1e-6,finite(currentDistance,startDistance))/Math.max(1e-6,finite(startDistance,1));
    const scale=clamp(baseScale*ratio,minScale,maxScale);
    const centerX=finite(input.centerX,finite(input.viewportWidth)/2);
    const centerY=finite(input.centerY,finite(input.viewportHeight)/2);
    const panX=finite(input.panX);
    const panY=finite(input.panY);
    const start=startCentroid||{x:centerX,y:centerY};
    const current=currentCentroid||start;
    const anchorX=(finite(start.x)-centerX-panX)/baseScale;
    const anchorY=(finite(start.y)-centerY-panY)/baseScale;
    return Object.freeze({
      scale,
      panX:finite(current.x)-centerX-anchorX*scale,
      panY:finite(current.y)-centerY-anchorY*scale,
    });
  }

  function zoomAt(state,factor,clientX,clientY){
    const input=state||{};
    const center={x:finite(clientX,finite(input.centerX)),y:finite(clientY,finite(input.centerY))};
    return anchoredViewport(input,center,center,1,Math.max(0.01,finite(factor,1)));
  }

  let env=null;
  let stage=null;
  let dock=null;
  let zoomReadout=null;
  let installed=false;
  let frameRequest=0;
  let pendingViewport=null;
  const touches=new Map();
  const startPoints=new Map();
  let consumed=false;
  let moved=false;
  let startedAt=0;
  let maxTouches=0;
  let pinch=null;

  const now=()=>root.performance&&typeof root.performance.now==='function'?root.performance.now():Date.now();
  const requestFrame=callback=>typeof root.requestAnimationFrame==='function'
    ? root.requestAnimationFrame(callback)
    : root.setTimeout(()=>callback(now()),16);
  const cancelFrame=id=>{
    if(!id)return;
    if(typeof root.cancelAnimationFrame==='function')root.cancelAnimationFrame(id);
    else if(root.clearTimeout)root.clearTimeout(id);
  };

  function state(){return env&&typeof env.getState==='function'?env.getState():null;}
  function touchPair(){
    const values=[...touches.values()];
    return values.length>=2?[values[0],values[1]]:null;
  }
  function makePinch(){
    const pair=touchPair(),base=state();
    if(!pair||!base)return null;
    const a=point(pair[0]),b=point(pair[1]);
    return Object.freeze({base,centroid:midpoint(a,b),distance:Math.max(1,distance(a,b))});
  }
  function movementFromStart(){
    let maximum=0;
    for(const [id,event] of touches){
      const start=startPoints.get(id);if(!start)continue;
      maximum=Math.max(maximum,distance(start,point(event)));
    }
    return maximum;
  }
  function consume(event){
    try{event.preventDefault&&event.preventDefault();}catch(_){}
    try{event.stopImmediatePropagation&&event.stopImmediatePropagation();}catch(_){}
    try{event.stopPropagation&&event.stopPropagation();}catch(_){}
  }
  function syncUi(next){
    if(!zoomReadout)return false;
    const value=next||state();if(!value)return false;
    const fit=Math.max(1e-6,finite(value.fitScale,1));
    const percent=Math.round(finite(value.scale,fit)/fit*100);
    zoomReadout.textContent=`${percent}%`;
    zoomReadout.title=`Canvas zoom · ${percent}% of fit`;
    if(dock)dock.dataset.zoom=String(percent);
    return true;
  }
  function applyPending(){
    frameRequest=0;
    if(!pendingViewport||!env||typeof env.setState!=='function')return null;
    const next=pendingViewport;pendingViewport=null;
    const applied=env.setState(next);syncUi(applied);return applied;
  }
  function queueViewport(next){
    pendingViewport=next;
    if(!frameRequest)frameRequest=requestFrame(applyPending);
  }
  function flushViewport(){
    if(frameRequest){cancelFrame(frameRequest);frameRequest=0;}
    return applyPending();
  }

  function beginGesture(event){
    if(consumed)return true;
    if(!env||typeof env.canGesture!=='function'||!env.canGesture())return false;
    if(typeof env.cancelTouchStroke==='function')env.cancelTouchStroke();
    consumed=true;moved=false;pinch=makePinch();
    if(root.document&&root.document.body)root.document.body.classList.add('inkframe-viewport-gesture');
    consume(event);return true;
  }
  function resetGesture(){
    flushViewport();
    touches.clear();startPoints.clear();pinch=null;consumed=false;moved=false;maxTouches=0;startedAt=0;
    if(root.document&&root.document.body)root.document.body.classList.remove('inkframe-viewport-gesture');
  }
  function finishGesture(){
    flushViewport();
    const elapsed=now()-startedAt;
    if(elapsed<430&&!moved){
      if(maxTouches===2&&env&&typeof env.undo==='function')env.undo();
      else if(maxTouches>=3&&env&&typeof env.redo==='function')env.redo();
    }else if(env&&typeof env.flash==='function'){
      const value=state();const fit=Math.max(1e-6,finite(value&&value.fitScale,1));
      env.flash(`Canvas ${Math.round(finite(value&&value.scale,fit)/fit*100)}%`);
    }
    resetGesture();
  }

  function onPointerDown(event){
    if(!event||event.pointerType!=='touch')return;
    if(touches.size===0){startedAt=now();maxTouches=0;moved=false;startPoints.clear();}
    touches.set(event.pointerId,event);startPoints.set(event.pointerId,point(event));
    maxTouches=Math.max(maxTouches,touches.size);
    if(touches.size>=2){
      if(beginGesture(event)){pinch=makePinch();consume(event);}
    }
  }
  function onPointerMove(event){
    if(!event||event.pointerType!=='touch'||!touches.has(event.pointerId))return;
    touches.set(event.pointerId,event);
    if(!consumed)return;
    consume(event);
    if(touches.size<2)return;
    if(!pinch)pinch=makePinch();
    const pair=touchPair();if(!pair||!pinch)return;
    const a=point(pair[0]),b=point(pair[1]);
    const currentDistance=Math.max(1,distance(a,b));
    if(movementFromStart()>10||Math.abs(currentDistance/pinch.distance-1)>0.015)moved=true;
    if(!moved)return;
    queueViewport(anchoredViewport(pinch.base,pinch.centroid,midpoint(a,b),pinch.distance,currentDistance));
  }
  function onPointerEnd(event){
    if(!event||event.pointerType!=='touch'||!touches.has(event.pointerId))return;
    if(consumed)consume(event);
    touches.delete(event.pointerId);
    if(!consumed){
      startPoints.delete(event.pointerId);
      if(touches.size===0){startedAt=0;maxTouches=0;moved=false;startPoints.clear();}
      return;
    }
    if(touches.size>=2){pinch=makePinch();return;}
    pinch=null;
    if(touches.size===0)finishGesture();
  }

  function zoomBy(factor,clientX,clientY){
    const value=state();if(!value)return false;
    const next=zoomAt(value,factor,clientX,clientY);
    const applied=env.setState(next);syncUi(applied);return true;
  }
  function fit(){if(!env||typeof env.fit!=='function')return false;syncUi(env.fit());return true;}
  function center(){if(!env||typeof env.center!=='function')return false;syncUi(env.center());return true;}

  function button(label,title,handler,className){
    const value=root.document.createElement('button');value.type='button';value.textContent=label;value.title=title;
    value.setAttribute('aria-label',title);if(className)value.className=className;
    value.addEventListener('click',handler);return value;
  }
  function installUi(){
    const style=root.document.createElement('style');style.dataset.inkframeViewportStyle='true';
    style.textContent=`
      #inkframe-viewport-dock{position:fixed;left:50%;top:max(54px,calc(env(safe-area-inset-top) + 48px));z-index:26;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:5px;border:1px solid rgba(255,240,243,.34);border-radius:16px;background:rgba(28,4,24,.78);box-shadow:0 10px 28px rgba(12,0,10,.34),inset 0 1px 0 rgba(255,255,255,.13);backdrop-filter:blur(16px) saturate(145%);-webkit-backdrop-filter:blur(16px) saturate(145%);touch-action:manipulation}
      #inkframe-viewport-dock button{min-width:42px;height:40px;padding:0 10px;border:0;border-radius:11px;background:rgba(255,255,255,.07);color:#fff0f3;font:800 15px/1 system-ui;touch-action:manipulation}
      #inkframe-viewport-dock button:active{transform:scale(.95);background:rgba(247,202,201,.18)}
      #inkframe-viewport-dock .inkframe-viewport-percent{min-width:64px;font-size:12px;letter-spacing:.04em;background:linear-gradient(145deg,rgba(187,0,55,.78),rgba(105,0,78,.82))}
      #inkframe-viewport-dock .inkframe-viewport-fit{font-size:10px;letter-spacing:.07em;text-transform:uppercase}
      body.inkframe-viewport-gesture #inkframe-viewport-dock{opacity:.56;pointer-events:none}
      body.zen #inkframe-viewport-dock{top:max(10px,env(safe-area-inset-top));opacity:.72}
      @media(max-width:620px){#inkframe-viewport-dock{top:max(48px,calc(env(safe-area-inset-top) + 44px))}#inkframe-viewport-dock button{min-width:38px;height:38px;padding:0 8px}#inkframe-viewport-dock .inkframe-viewport-percent{min-width:56px}}
    `;
    root.document.head.appendChild(style);
    dock=root.document.createElement('nav');dock.id='inkframe-viewport-dock';dock.setAttribute('aria-label','Canvas zoom controls');
    const minus=button('−','Zoom out',()=>zoomBy(1/1.16));
    zoomReadout=button('100%','Fit canvas',fit,'inkframe-viewport-percent');
    const plus=button('+','Zoom in',()=>zoomBy(1.16));
    const fitButton=button('Fit','Fit canvas to screen',fit,'inkframe-viewport-fit');
    const centerButton=button('⌖','Center canvas',center);
    dock.append(minus,zoomReadout,plus,fitButton,centerButton);root.document.body.appendChild(dock);syncUi();
  }

  function install(){
    if(installed)return true;
    const factory=root.InkFrameViewportEnvironment;
    env=typeof factory==='function'?factory():null;
    if(!env||!env.stage||typeof env.getState!=='function'||typeof env.setState!=='function')return false;
    stage=env.stage;installed=true;installUi();
    stage.addEventListener('pointerdown',onPointerDown,{capture:true,passive:false});
    root.addEventListener('pointermove',onPointerMove,{capture:true,passive:false});
    root.addEventListener('pointerup',onPointerEnd,{capture:true,passive:false});
    root.addEventListener('pointercancel',onPointerEnd,{capture:true,passive:false});
    stage.addEventListener('wheel',event=>{
      if(consumed||!env.canGesture())return;event.preventDefault();
      zoomBy(Math.exp(-finite(event.deltaY)*0.0015),event.clientX,event.clientY);
    },{passive:false});
    root.addEventListener('keydown',event=>{
      if(!(event.ctrlKey||event.metaKey))return;
      if(event.key==='0'){event.preventDefault();fit();}
      else if(event.key==='='||event.key==='+'){event.preventDefault();zoomBy(1.16);}
      else if(event.key==='-'){event.preventDefault();zoomBy(1/1.16);}
    });
    root.addEventListener('resize',()=>{const value=state();if(value)syncUi(env.setState(value));});
    root.addEventListener('inkframe:viewportchange',event=>syncUi(event&&event.detail));
    return true;
  }

  const api=Object.freeze({clamp,midpoint,distance,anchoredViewport,zoomAt,install,zoomBy,fit,center,get installed(){return installed;}});
  root.InkFrameViewportGestures=api;
  if(root.document){
    const start=()=>{if(!install())root.setTimeout(start,16);};
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
