// InkFrame — stable tablet canvas pan and pinch navigation
'use strict';

(function(root){
  const DEFAULTS=Object.freeze({
    touchDrawDelayMs:140,
    minZoom:0.35,
    maxZoom:8,
    minVisiblePx:72,
  });
  const forwardedEvents=new WeakSet();
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value,min)));
  const point=value=>Object.freeze({x:finite(value&&value.x),y:finite(value&&value.y)});
  const midpoint=(a,b)=>Object.freeze({x:(finite(a&&a.x)+finite(b&&b.x))/2,y:(finite(a&&a.y)+finite(b&&b.y))/2});
  const span=(a,b)=>Math.hypot(finite(b&&b.x)-finite(a&&a.x),finite(b&&b.y)-finite(a&&a.y));

  /**
   * Pure incremental pan/zoom math. Finger angle is intentionally ignored so normal
   * pinch asymmetry cannot rotate or wobble the artwork.
   */
  function nextTransform(current,previous,currentPointers,bounds){
    const state={zoom:Math.max(1e-6,finite(current&&current.zoom,1)),x:finite(current&&current.x),y:finite(current&&current.y)};
    const prevA=point(previous&&previous[0]),prevB=point(previous&&previous[1]);
    const curA=point(currentPointers&&currentPointers[0]),curB=point(currentPointers&&currentPointers[1]);
    const prevCenter=midpoint(prevA,prevB),curCenter=midpoint(curA,curB);
    const oldSpan=span(prevA,prevB),newSpan=span(curA,curB);
    const rawFactor=oldSpan>=0.5&&Number.isFinite(newSpan)?newSpan/oldSpan:1;
    const factor=Number.isFinite(rawFactor)&&rawFactor>0?rawFactor:1;
    const minZoom=Math.max(0.05,finite(bounds&&bounds.minZoom,DEFAULTS.minZoom));
    const maxZoom=Math.max(minZoom,finite(bounds&&bounds.maxZoom,DEFAULTS.maxZoom));
    const zoom=clamp(state.zoom*factor,minZoom,maxZoom);

    const baseLeft=finite(bounds&&bounds.baseLeft);
    const baseTop=finite(bounds&&bounds.baseTop);
    const localX=(prevCenter.x-baseLeft-state.x)/state.zoom;
    const localY=(prevCenter.y-baseTop-state.y)/state.zoom;
    let x=curCenter.x-baseLeft-zoom*localX;
    let y=curCenter.y-baseTop-zoom*localY;

    const width=Math.max(1,finite(bounds&&bounds.baseWidth,1))*zoom;
    const height=Math.max(1,finite(bounds&&bounds.baseHeight,1))*zoom;
    const viewportWidth=Math.max(1,finite(bounds&&bounds.viewportWidth,width));
    const viewportHeight=Math.max(1,finite(bounds&&bounds.viewportHeight,height));
    const visible=Math.max(24,finite(bounds&&bounds.minVisiblePx,DEFAULTS.minVisiblePx));
    x=clamp(x,visible-baseLeft-width,viewportWidth-visible-baseLeft);
    y=clamp(y,visible-baseTop-height,viewportHeight-visible-baseTop);
    return Object.freeze({zoom,x,y});
  }

  function pointerSnapshot(event){
    return Object.freeze({
      pointerId:finite(event&&event.pointerId,-1),
      pointerType:String(event&&event.pointerType||'touch'),
      clientX:finite(event&&event.clientX),clientY:finite(event&&event.clientY),
      pressure:finite(event&&event.pressure,event&&event.type==='pointerup'?0:0.5),
      width:finite(event&&event.width,1),height:finite(event&&event.height,1),
      tiltX:finite(event&&event.tiltX),tiltY:finite(event&&event.tiltY),twist:finite(event&&event.twist),
      altitudeAngle:event&&event.altitudeAngle,azimuthAngle:event&&event.azimuthAngle,
      button:finite(event&&event.button,event&&event.type==='pointerdown'?0:-1),
      buttons:finite(event&&event.buttons,event&&event.type==='pointerup'?0:1),
      timeStamp:finite(event&&event.timeStamp,root.performance&&root.performance.now?root.performance.now():Date.now()),
      isPrimary:event&&event.isPrimary!==false,
    });
  }

  function defineEventValue(event,key,value){
    try{Object.defineProperty(event,key,{configurable:true,value});}catch(_){try{event[key]=value;}catch(__){}}
  }

  function syntheticPointerEvent(type,snapshot,buttons){
    const init={
      bubbles:true,cancelable:true,composed:true,
      pointerId:snapshot.pointerId,pointerType:snapshot.pointerType,
      clientX:snapshot.clientX,clientY:snapshot.clientY,
      pressure:type==='pointerup'||type==='pointercancel'?0:snapshot.pressure,
      width:snapshot.width,height:snapshot.height,
      tiltX:snapshot.tiltX,tiltY:snapshot.tiltY,twist:snapshot.twist,
      altitudeAngle:snapshot.altitudeAngle,azimuthAngle:snapshot.azimuthAngle,
      button:type==='pointerdown'?0:-1,
      buttons:buttons==null?(type==='pointerup'||type==='pointercancel'?0:1):buttons,
      isPrimary:snapshot.isPrimary,
    };
    let event=null;
    try{event=new root.PointerEvent(type,init);}catch(_){
      event=new root.Event(type,{bubbles:true,cancelable:true,composed:true});
      for(const [key,value] of Object.entries(init))defineEventValue(event,key,value);
    }
    defineEventValue(event,'getCoalescedEvents',()=>[]);
    forwardedEvents.add(event);
    return event;
  }

  function stop(event){
    try{event.preventDefault();}catch(_){}
    try{event.stopImmediatePropagation();}catch(_){try{event.stopPropagation();}catch(__){}}
  }

  function createController(options={}){
    const host=options.root||root;
    const document=options.document||host.document;
    const canvas=options.canvas||(document&&document.getElementById&&document.getElementById('c'));
    const frameGlass=options.frameGlass||(document&&document.getElementById&&document.getElementById('frameGlass'));
    if(!canvas||!frameGlass||!host.addEventListener)return null;

    const settings=Object.freeze({...DEFAULTS,...(options.settings||{})});
    const touches=new Map();
    let transform={zoom:1,x:0,y:0};
    let pending=null;
    let navigation=null;
    let forwardedId=null;
    let suppressUntilAllUp=false;
    let destroyed=false;

    frameGlass.style.transformOrigin='0 0';
    frameGlass.style.willChange='transform';

    function applyTransform(){
      const z=finite(transform.zoom,1),x=finite(transform.x),y=finite(transform.y);
      frameGlass.style.transform=`matrix(${z},0,0,${z},${x},${y})`;
      frameGlass.dataset.canvasZoom=String(z);
    }

    function bounds(){
      const rect=frameGlass.getBoundingClientRect();
      const z=Math.max(1e-6,transform.zoom);
      return {
        baseLeft:finite(rect.left)-transform.x,
        baseTop:finite(rect.top)-transform.y,
        baseWidth:Math.max(1,finite(frameGlass.offsetWidth,finite(rect.width,1)/z)),
        baseHeight:Math.max(1,finite(frameGlass.offsetHeight,finite(rect.height,1)/z)),
        viewportWidth:Math.max(1,finite(host.innerWidth,document&&document.documentElement&&document.documentElement.clientWidth||1)),
        viewportHeight:Math.max(1,finite(host.innerHeight,document&&document.documentElement&&document.documentElement.clientHeight||1)),
        minZoom:settings.minZoom,maxZoom:settings.maxZoom,minVisiblePx:settings.minVisiblePx,
      };
    }

    function dispatch(type,snapshot,buttons){
      const event=syntheticPointerEvent(type,snapshot,buttons);
      canvas.dispatchEvent(event);
      return event;
    }

    function clearPending(){
      if(!pending)return;
      if(pending.timer)host.clearTimeout(pending.timer);
      pending=null;
    }

    function forwardPending(){
      if(!pending)return false;
      const value=pending;
      clearPending();
      forwardedId=value.down.pointerId;
      dispatch('pointerdown',value.down,1);
      const moved=Math.hypot(value.latest.clientX-value.down.clientX,value.latest.clientY-value.down.clientY)>0.5;
      if(moved)dispatch('pointermove',value.latest,1);
      return true;
    }

    function cancelForwardedTouch(pointerId){
      const factory=host.InkFrameCanvasNavigationEnvironment;
      const env=typeof factory==='function'?factory():null;
      if(!env||typeof env.cancelTouchStroke!=='function')return false;
      try{return env.cancelTouchStroke(pointerId)!==false;}catch(_){return false;}
    }

    function navigationIds(){return Array.from(touches.keys()).slice(0,2);}
    function beginNavigation(){
      clearPending();
      const ids=navigationIds();
      if(ids.length<2)return false;
      navigation={ids,previous:ids.map(id=>point(touches.get(id)))};
      suppressUntilAllUp=false;
      return true;
    }

    function rebindNavigation(){
      const ids=navigationIds();
      if(ids.length<2){navigation=null;suppressUntilAllUp=touches.size>0;return false;}
      navigation={ids,previous:ids.map(id=>point(touches.get(id)))};
      return true;
    }

    function updateNavigation(){
      if(!navigation||navigation.ids.some(id=>!touches.has(id))){if(!rebindNavigation())return;}
      const current=navigation.ids.map(id=>point(touches.get(id)));
      transform=nextTransform(transform,navigation.previous,current,bounds());
      navigation.previous=current;
      applyTransform();
    }

    function capture(pointerId){
      try{canvas.setPointerCapture&&canvas.setPointerCapture(pointerId);}catch(_){}
    }
    function release(pointerId){
      try{canvas.releasePointerCapture&&canvas.releasePointerCapture(pointerId);}catch(_){}
    }

    function onPointerDown(event){
      if(destroyed||forwardedEvents.has(event)||event.pointerType!=='touch')return;
      const value=pointerSnapshot(event);
      touches.set(value.pointerId,{x:value.clientX,y:value.clientY,snapshot:value});
      capture(value.pointerId);

      if(suppressUntilAllUp||navigation){
        stop(event);
        if(navigation&&navigation.ids.length<2)rebindNavigation();
        return;
      }

      if(forwardedId!=null){
        stop(event);
        if(cancelForwardedTouch(forwardedId)){
          forwardedId=null;
          beginNavigation();
        }else{
          suppressUntilAllUp=true;
        }
        return;
      }

      if(touches.size===1){
        stop(event);
        pending={down:value,latest:value,timer:host.setTimeout(()=>forwardPending(),settings.touchDrawDelayMs)};
        return;
      }

      stop(event);
      beginNavigation();
    }

    function onPointerMove(event){
      if(destroyed||forwardedEvents.has(event)||event.pointerType!=='touch')return;
      const value=pointerSnapshot(event);
      if(touches.has(value.pointerId))touches.set(value.pointerId,{x:value.clientX,y:value.clientY,snapshot:value});

      if(navigation){stop(event);updateNavigation();return;}
      if(suppressUntilAllUp){stop(event);return;}
      if(pending&&pending.down.pointerId===value.pointerId){stop(event);pending.latest=value;return;}
      if(forwardedId===value.pointerId)return;
    }

    function onPointerEnd(event){
      if(destroyed||forwardedEvents.has(event)||event.pointerType!=='touch')return;
      const value=pointerSnapshot(event),id=value.pointerId;

      if(navigation||suppressUntilAllUp){
        stop(event);touches.delete(id);release(id);
        if(navigation&&navigation.ids.includes(id))rebindNavigation();
        if(!touches.size){navigation=null;suppressUntilAllUp=false;}
        return;
      }

      if(pending&&pending.down.pointerId===id){
        stop(event);
        if(event.type==='pointerup'){
          forwardPending();
          dispatch('pointerup',value,0);
        }else clearPending();
        touches.delete(id);release(id);forwardedId=null;
        return;
      }

      if(forwardedId===id){
        touches.delete(id);release(id);
        host.setTimeout(()=>{if(forwardedId===id)forwardedId=null;},0);
        return;
      }

      touches.delete(id);release(id);
    }

    function reset(){transform={zoom:1,x:0,y:0};applyTransform();return snapshot();}
    function snapshot(){return Object.freeze({zoom:transform.zoom,x:transform.x,y:transform.y,navigating:!!navigation,pending:!!pending,touches:touches.size});}
    function destroy(){
      if(destroyed)return;destroyed=true;clearPending();
      canvas.removeEventListener('pointerdown',onPointerDown,true);
      host.removeEventListener('pointermove',onPointerMove,true);
      host.removeEventListener('pointerup',onPointerEnd,true);
      host.removeEventListener('pointercancel',onPointerEnd,true);
      host.removeEventListener('InkFrameCanvasNavigationReset',reset);
    }

    canvas.addEventListener('pointerdown',onPointerDown,{capture:true,passive:false});
    host.addEventListener('pointermove',onPointerMove,{capture:true,passive:false});
    host.addEventListener('pointerup',onPointerEnd,{capture:true,passive:false});
    host.addEventListener('pointercancel',onPointerEnd,{capture:true,passive:false});
    host.addEventListener('InkFrameCanvasNavigationReset',reset);
    applyTransform();
    return Object.freeze({reset,snapshot,destroy,get transform(){return snapshot();}});
  }

  let controller=null;
  function install(options={}){
    if(controller)return controller;
    controller=createController(options);
    return controller;
  }
  function start(){if(!install())root.setTimeout(start,16);}

  const api=Object.freeze({DEFAULTS,midpoint,span,nextTransform,pointerSnapshot,createController,install,reset:()=>controller&&controller.reset(),snapshot:()=>controller&&controller.snapshot(),get installed(){return !!controller;}});
  root.InkFrameCanvasNavigation=api;
  if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
