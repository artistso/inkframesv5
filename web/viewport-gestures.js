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

  function translatedViewport(state,startPoint,currentPoint){
    const input=state||{},start=startPoint||{x:0,y:0},current=currentPoint||start;
    return Object.freeze({
      scale:Math.max(1e-6,finite(input.scale,1)),
      panX:finite(input.panX)+finite(current.x)-finite(start.x),
      panY:finite(input.panY)+finite(current.y)-finite(start.y),
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
  let panButton=null;
  let hud=null;
  let installed=false;
  let frameRequest=0;
  let pendingViewport=null;
  let pendingHudPoint=null;
  const touches=new Map();
  const startPoints=new Map();
  let consumed=false;
  let moved=false;
  let cancelled=false;
  let historyEligible=true;
  let startedAt=0;
  let maxTouches=0;
  let pinch=null;
  let singlePan=null;
  let gestureKind='';
  let panMode=false;

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
  function canGesture(){return !!(env&&(!env.canGesture||env.canGesture()));}
  function percentOfFit(value){
    const input=value||state(),fit=Math.max(1e-6,finite(input&&input.fitScale,1));
    return Math.round(finite(input&&input.scale,fit)/fit*100);
  }
  function touchPair(){
    const values=[...touches.values()];
    return values.length>=2?[values[0],values[1]]:null;
  }
  function remainingTouch(){
    const first=touches.values().next();
    return first.done?null:first.value;
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
  function positionHud(anchor){
    if(!hud||!anchor)return;
    const margin=72;
    hud.style.left=`${clamp(finite(anchor.x),margin,Math.max(margin,finite(root.innerWidth,margin*2)-margin))}px`;
    hud.style.top=`${clamp(finite(anchor.y)-34,margin,Math.max(margin,finite(root.innerHeight,margin*2)-margin))}px`;
  }
  function showHud(kind,anchor,value){
    if(!hud)return;
    gestureKind=kind||gestureKind||'Zoom';
    hud.textContent=`${gestureKind} · ${percentOfFit(value)}%`;
    positionHud(anchor);
    hud.classList.add('show');
  }
  function hideHud(){if(hud)hud.classList.remove('show');}
  function syncUi(next,anchor){
    const value=next||state();if(!value)return false;
    const percent=percentOfFit(value);
    if(zoomReadout){
      zoomReadout.textContent=`${percent}%`;
      zoomReadout.title=`Canvas zoom · ${percent}% of fit`;
    }
    if(dock)dock.dataset.zoom=String(percent);
    if(hud&&hud.classList.contains('show')){
      hud.textContent=`${gestureKind||'Zoom'} · ${percent}%`;
      if(anchor)positionHud(anchor);
    }
    return true;
  }
  function applyPending(){
    frameRequest=0;
    if(!pendingViewport||!env||typeof env.setState!=='function')return null;
    const next=pendingViewport,anchor=pendingHudPoint;
    pendingViewport=null;pendingHudPoint=null;
    const applied=env.setState(next);syncUi(applied,anchor);return applied;
  }
  function queueViewport(next,anchor){
    pendingViewport=next;pendingHudPoint=anchor||pendingHudPoint;
    if(!frameRequest)frameRequest=requestFrame(applyPending);
  }
  function flushViewport(){
    if(frameRequest){cancelFrame(frameRequest);frameRequest=0;}
    return applyPending();
  }

  function beginGesture(event,kind,allowHistory){
    if(consumed)return true;
    if(!canGesture())return false;
    if(typeof env.cancelTouchStroke==='function')env.cancelTouchStroke();
    consumed=true;moved=false;cancelled=false;historyEligible=allowHistory!==false;
    gestureKind=kind||'Zoom';pinch=touches.size>=2?makePinch():null;
    singlePan=touches.size===1?Object.freeze({base:state(),point:point(event)}):null;
    if(root.document&&root.document.body)root.document.body.classList.add('inkframe-viewport-gesture');
    showHud(gestureKind,touches.size>=2&&pinch?pinch.centroid:point(event));
    consume(event);return true;
  }
  function resetGesture(){
    flushViewport();
    touches.clear();startPoints.clear();pinch=null;singlePan=null;
    consumed=false;moved=false;cancelled=false;historyEligible=true;maxTouches=0;startedAt=0;gestureKind='';
    hideHud();
    if(root.document&&root.document.body)root.document.body.classList.remove('inkframe-viewport-gesture');
  }
  function finishGesture(){
    flushViewport();
    if(cancelled){resetGesture();return;}
    const elapsed=now()-startedAt;
    if(historyEligible&&elapsed<430&&!moved){
      if(maxTouches===2&&env&&typeof env.undo==='function')env.undo();
      else if(maxTouches>=3&&env&&typeof env.redo==='function')env.redo();
    }else if(moved&&env&&typeof env.flash==='function'){
      env.flash(`Canvas ${percentOfFit()}%`);
    }
    resetGesture();
  }
  function abortGesture(){
    if(!touches.size&&!consumed)return false;
    cancelled=true;resetGesture();return true;
  }

  function setPanMode(enabled){
    const next=!!enabled;
    if(panMode===next)return panMode;
    if(consumed)abortGesture();
    panMode=next;
    if(panButton){
      panButton.setAttribute('aria-pressed',String(panMode));
      panButton.title=panMode?'Hand tool on · one-finger touch pans':'Hand tool off · touch draws';
    }
    if(root.document&&root.document.body)root.document.body.classList.toggle('inkframe-viewport-pan-mode',panMode);
    if(env&&typeof env.flash==='function')env.flash(panMode?'Hand tool · touch pans':'Brush touch restored');
    return panMode;
  }
  function togglePanMode(){return setPanMode(!panMode);}

  function onPointerDown(event){
    if(!event||event.pointerType!=='touch')return;
    if(touches.size===0){startedAt=now();maxTouches=0;moved=false;cancelled=false;historyEligible=true;startPoints.clear();}
    touches.set(event.pointerId,event);startPoints.set(event.pointerId,point(event));
    maxTouches=Math.max(maxTouches,touches.size);
    if(panMode&&touches.size===1){
      beginGesture(event,'Pan',false);
      return;
    }
    if(touches.size>=2){
      if(consumed){
        historyEligible=false;singlePan=null;pinch=makePinch();gestureKind='Zoom';
        if(pinch)showHud('Zoom',pinch.centroid);
        consume(event);
      }else if(beginGesture(event,'Zoom',true)){
        pinch=makePinch();consume(event);
      }
    }
  }
  function onPointerMove(event){
    if(!event||event.pointerType!=='touch'||!touches.has(event.pointerId))return;
    touches.set(event.pointerId,event);
    if(!consumed)return;
    consume(event);
    if(touches.size===1&&singlePan){
      const current=point(event);
      if(distance(singlePan.point,current)>3)moved=true;
      if(!moved)return;
      gestureKind='Pan';
      queueViewport(translatedViewport(singlePan.base,singlePan.point,current),current);
      return;
    }
    if(touches.size<2)return;
    if(!pinch)pinch=makePinch();
    const pair=touchPair();if(!pair||!pinch)return;
    const a=point(pair[0]),b=point(pair[1]);
    const currentDistance=Math.max(1,distance(a,b));
    const threshold=historyEligible?10:3;
    if(movementFromStart()>threshold||Math.abs(currentDistance/pinch.distance-1)>(historyEligible?0.015:0.008))moved=true;
    if(!moved)return;
    const center=midpoint(a,b);gestureKind='Zoom';
    queueViewport(anchoredViewport(pinch.base,pinch.centroid,center,pinch.distance,currentDistance),center);
  }
  function onPointerEnd(event){
    if(!event||event.pointerType!=='touch'||!touches.has(event.pointerId))return;
    if(event.type==='pointercancel')cancelled=true;
    if(consumed)consume(event);
    touches.delete(event.pointerId);
    startPoints.delete(event.pointerId);
    if(!consumed){
      if(touches.size===0){startedAt=0;maxTouches=0;moved=false;cancelled=false;historyEligible=true;startPoints.clear();}
      return;
    }
    if(touches.size>=2){flushViewport();pinch=makePinch();singlePan=null;return;}
    if(touches.size===1&&!historyEligible){
      flushViewport();
      const remaining=remainingTouch();
      pinch=null;gestureKind='Pan';
      singlePan=remaining?Object.freeze({base:state(),point:point(remaining)}):null;
      if(remaining)showHud('Pan',point(remaining));
      return;
    }
    pinch=null;singlePan=null;
    if(touches.size===0)finishGesture();
  }

  function zoomBy(factor,clientX,clientY){
    const value=state();if(!value||!canGesture())return false;
    const next=zoomAt(value,factor,clientX,clientY);
    const applied=env.setState(next);syncUi(applied);return true;
  }
  function fit(){if(!env||typeof env.fit!=='function'||!canGesture())return false;syncUi(env.fit());return true;}
  function center(){if(!env||typeof env.center!=='function'||!canGesture())return false;syncUi(env.center());return true;}

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
      #inkframe-viewport-dock button:focus-visible{outline:2px solid #fff0f3;outline-offset:2px}
      #inkframe-viewport-dock .inkframe-viewport-percent{min-width:64px;font-size:12px;letter-spacing:.04em;background:linear-gradient(145deg,rgba(187,0,55,.78),rgba(105,0,78,.82))}
      #inkframe-viewport-dock .inkframe-viewport-fit{font-size:10px;letter-spacing:.07em;text-transform:uppercase}
      #inkframe-viewport-dock .inkframe-viewport-pan[aria-pressed="true"]{background:linear-gradient(145deg,rgba(247,202,201,.30),rgba(187,0,55,.82));box-shadow:inset 0 0 0 1px rgba(255,240,243,.56),0 0 16px rgba(187,0,55,.32)}
      #inkframe-viewport-hud{position:fixed;z-index:27;min-width:92px;padding:8px 12px;border:1px solid rgba(255,240,243,.42);border-radius:999px;background:rgba(28,4,24,.86);color:#fff0f3;box-shadow:0 9px 24px rgba(12,0,10,.36),inset 0 1px 0 rgba(255,255,255,.14);font:800 12px/1 system-ui;letter-spacing:.04em;text-align:center;pointer-events:none;opacity:0;transform:translate(-50%,-100%) scale(.94);transition:opacity .12s ease,transform .12s ease;backdrop-filter:blur(14px) saturate(145%);-webkit-backdrop-filter:blur(14px) saturate(145%)}
      #inkframe-viewport-hud.show{opacity:1;transform:translate(-50%,-100%) scale(1)}
      body.inkframe-viewport-gesture #inkframe-viewport-dock{opacity:.56;pointer-events:none}
      body.inkframe-viewport-pan-mode canvas#c{cursor:grab}
      body.inkframe-viewport-pan-mode.inkframe-viewport-gesture canvas#c{cursor:grabbing}
      body.zen #inkframe-viewport-dock{top:max(10px,env(safe-area-inset-top));opacity:.72}
      @media(max-width:620px){#inkframe-viewport-dock{top:max(48px,calc(env(safe-area-inset-top) + 44px));gap:3px;padding:4px}#inkframe-viewport-dock button{min-width:36px;height:38px;padding:0 7px}#inkframe-viewport-dock .inkframe-viewport-percent{min-width:54px}}
    `;
    root.document.head.appendChild(style);
    dock=root.document.createElement('nav');dock.id='inkframe-viewport-dock';dock.setAttribute('aria-label','Canvas zoom and navigation controls');
    const minus=button('−','Zoom out',()=>zoomBy(1/1.16));
    zoomReadout=button('100%','Fit canvas',fit,'inkframe-viewport-percent');
    const plus=button('+','Zoom in',()=>zoomBy(1.16));
    const fitButton=button('Fit','Fit canvas to screen',fit,'inkframe-viewport-fit');
    const centerButton=button('⌖','Center canvas',center);
    panButton=button('✋','Hand tool off · touch draws',togglePanMode,'inkframe-viewport-pan');
    panButton.setAttribute('aria-pressed','false');
    dock.append(minus,zoomReadout,plus,fitButton,centerButton,panButton);
    hud=root.document.createElement('output');hud.id='inkframe-viewport-hud';hud.setAttribute('aria-live','polite');hud.setAttribute('aria-atomic','true');
    root.document.body.append(dock,hud);syncUi();
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
    root.addEventListener('blur',abortGesture);
    if(root.document)root.document.addEventListener('visibilitychange',()=>{if(root.document.hidden)abortGesture();});
    stage.addEventListener('wheel',event=>{
      if(consumed||!canGesture())return;event.preventDefault();
      zoomBy(Math.exp(-finite(event.deltaY)*0.0015),event.clientX,event.clientY);
    },{passive:false});
    root.addEventListener('keydown',event=>{
      const target=event.target;
      if(target&&(/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)||target.isContentEditable))return;
      if(!(event.ctrlKey||event.metaKey)){
        if((event.key==='h'||event.key==='H')&&!event.repeat){event.preventDefault();togglePanMode();}
        return;
      }
      if(event.key==='0'){event.preventDefault();fit();}
      else if(event.key==='='||event.key==='+'){event.preventDefault();zoomBy(1.16);}
      else if(event.key==='-'){event.preventDefault();zoomBy(1/1.16);}
    });
    root.addEventListener('resize',()=>{const value=state();if(value)syncUi(env.setState(value));});
    root.addEventListener('inkframe:viewportchange',event=>syncUi(event&&event.detail));
    return true;
  }

  const api=Object.freeze({
    clamp,midpoint,distance,anchoredViewport,translatedViewport,zoomAt,install,zoomBy,fit,center,
    setPanMode,togglePanMode,abortGesture,get panMode(){return panMode;},get installed(){return installed;}
  });
  root.InkFrameViewportGestures=api;
  if(root.document){
    const start=()=>{if(!install())root.setTimeout(start,16);};
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
