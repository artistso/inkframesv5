// InkFrame — geometry-only canvas navigator for zoomed artist workflows
'use strict';

(function(root){
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value,min)));
  let env=null;
  let gestures=null;
  let navigator=null;
  let viewportRect=null;
  let installed=false;
  let pointerOwner=null;

  function geometry(value){
    const state=value||{};
    const canvasWidth=Math.max(1,finite(state.canvasWidth,1));
    const canvasHeight=Math.max(1,finite(state.canvasHeight,1));
    const viewportWidth=Math.max(1,finite(state.viewportWidth,finite(root.innerWidth,1)));
    const viewportHeight=Math.max(1,finite(state.viewportHeight,finite(root.innerHeight,1)));
    const centerX=finite(state.centerX,viewportWidth/2);
    const centerY=finite(state.centerY,viewportHeight/2);
    const scale=Math.max(1e-6,finite(state.scale,1));
    const canvasLeft=centerX+finite(state.panX)-canvasWidth*scale/2;
    const canvasTop=centerY+finite(state.panY)-canvasHeight*scale/2;
    const left=clamp(-canvasLeft/scale,0,canvasWidth);
    const top=clamp(-canvasTop/scale,0,canvasHeight);
    const right=clamp((viewportWidth-canvasLeft)/scale,0,canvasWidth);
    const bottom=clamp((viewportHeight-canvasTop)/scale,0,canvasHeight);
    const visibleWidth=Math.max(0,right-left);
    const visibleHeight=Math.max(0,bottom-top);
    return Object.freeze({
      canvasWidth,canvasHeight,viewportWidth,viewportHeight,scale,
      left,top,right,bottom,visibleWidth,visibleHeight,
      widthFraction:visibleWidth/canvasWidth,
      heightFraction:visibleHeight/canvasHeight,
      fullVisible:visibleWidth>=canvasWidth*.985&&visibleHeight>=canvasHeight*.985,
    });
  }

  function blocked(){
    if(gestures&&typeof gestures.blockingSurfaceOpen==='function'&&gestures.blockingSurfaceOpen())return true;
    return !!(root.document&&root.document.body&&root.document.body.classList.contains('zen'));
  }

  function canNavigate(){
    if(!env||typeof env.getState!=='function'||typeof env.setState!=='function'||blocked())return false;
    return !(typeof env.canGesture==='function'&&!env.canGesture());
  }

  function shape(){
    const body=root.document&&root.document.body;
    return body&&body.dataset&&body.dataset.canvasShape==='circle'?'circle':'square';
  }

  function render(value){
    if(!navigator||!viewportRect)return false;
    const state=value||(env&&typeof env.getState==='function'?env.getState():null);
    if(!state){navigator.hidden=true;pointerOwner=null;return false;}
    const next=geometry(state);
    const hidden=blocked()||next.fullVisible;
    navigator.hidden=hidden;
    navigator.dataset.shape=shape();
    navigator.classList.toggle('circle',navigator.dataset.shape==='circle');
    if(hidden){pointerOwner=null;return false;}

    const maxWidth=150,maxHeight=104;
    const ratio=next.canvasWidth/next.canvasHeight;
    let width=Math.min(maxWidth,maxHeight*ratio);
    let height=width/ratio;
    if(height>maxHeight){height=maxHeight;width=height*ratio;}
    width=Math.max(72,width);height=Math.max(52,height);
    navigator.style.width=`${Math.round(width)}px`;
    navigator.style.height=`${Math.round(height)}px`;
    viewportRect.style.left=`${next.left/next.canvasWidth*100}%`;
    viewportRect.style.top=`${next.top/next.canvasHeight*100}%`;
    viewportRect.style.width=`${next.widthFraction*100}%`;
    viewportRect.style.height=`${next.heightFraction*100}%`;
    const visiblePercent=Math.round(next.widthFraction*next.heightFraction*100);
    navigator.title=`Canvas navigator · ${visiblePercent}% visible · drag, tap, or use arrow keys to recenter`;
    navigator.setAttribute('aria-label',navigator.title);
    return true;
  }

  function applyPan(panX,panY){
    if(!canNavigate())return false;
    const state=env.getState()||{};
    const applied=env.setState({
      scale:Math.max(1e-6,finite(state.scale,1)),
      panX:finite(panX,finite(state.panX)),
      panY:finite(panY,finite(state.panY)),
    });
    if(gestures&&typeof gestures.dismissGuidance==='function')gestures.dismissGuidance();
    render(applied);return true;
  }

  function recenterAt(clientX,clientY){
    if(!canNavigate()||!navigator)return false;
    const state=env.getState()||{};
    const rect=navigator.getBoundingClientRect();
    if(!rect||rect.width<=0||rect.height<=0)return false;
    const x=clamp((finite(clientX)-rect.left)/rect.width,0,1);
    const y=clamp((finite(clientY)-rect.top)/rect.height,0,1);
    const canvasWidth=Math.max(1,finite(state.canvasWidth,1));
    const canvasHeight=Math.max(1,finite(state.canvasHeight,1));
    const scale=Math.max(1e-6,finite(state.scale,1));
    return applyPan(
      -(x*canvasWidth-canvasWidth/2)*scale,
      -(y*canvasHeight-canvasHeight/2)*scale,
    );
  }

  function nudge(horizontal,vertical){
    if(!canNavigate())return false;
    const state=env.getState()||{};
    const stepX=Math.max(32,finite(state.viewportWidth,finite(root.innerWidth,1))*.12);
    const stepY=Math.max(32,finite(state.viewportHeight,finite(root.innerHeight,1))*.12);
    return applyPan(
      finite(state.panX)+finite(horizontal)*stepX,
      finite(state.panY)+finite(vertical)*stepY,
    );
  }

  function consume(event){
    try{event.preventDefault();}catch(_){}
    try{event.stopImmediatePropagation();}catch(_){}
    try{event.stopPropagation();}catch(_){}
  }

  function onPointerDown(event){
    if(!event||event.pointerType==='pen'||event.pointerType==='stylus'||!canNavigate())return;
    pointerOwner=event.pointerId==null?'mouse':event.pointerId;
    consume(event);recenterAt(event.clientX,event.clientY);
    try{navigator.setPointerCapture&&event.pointerId!=null&&navigator.setPointerCapture(event.pointerId);}catch(_){}
  }

  function onPointerMove(event){
    if(pointerOwner==null||!event||event.pointerType==='pen'||event.pointerType==='stylus')return;
    const id=event.pointerId==null?'mouse':event.pointerId;
    if(id!==pointerOwner)return;
    consume(event);recenterAt(event.clientX,event.clientY);
  }

  function onPointerEnd(event){
    if(pointerOwner==null)return;
    const id=!event||event.pointerId==null?'mouse':event.pointerId;
    if(id!==pointerOwner)return;
    consume(event);pointerOwner=null;
  }

  function onKeyDown(event){
    if(!event||event.repeat)return;
    let handled=false;
    if(event.key==='ArrowLeft')handled=nudge(1,0);
    else if(event.key==='ArrowRight')handled=nudge(-1,0);
    else if(event.key==='ArrowUp')handled=nudge(0,1);
    else if(event.key==='ArrowDown')handled=nudge(0,-1);
    else if(event.key==='Home')handled=applyPan(0,0);
    if(handled)consume(event);
  }

  function install(){
    if(installed)return true;
    if(!root.document||!root.document.body)return false;
    const factory=root.InkFrameViewportEnvironment;
    env=typeof factory==='function'?factory():null;
    gestures=root.InkFrameViewportGestures||null;
    if(!env||!gestures)return false;

    const style=root.document.createElement('style');
    style.dataset.inkframeViewportNavigatorStyle='true';
    style.textContent=`
      #inkframe-viewport-navigator{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(76px,calc(env(safe-area-inset-bottom) + 68px));z-index:24;box-sizing:border-box;border:1px solid rgba(255,240,243,.48);border-radius:13px;background:rgba(22,4,20,.72);box-shadow:0 12px 32px rgba(10,0,10,.42),inset 0 0 0 1px rgba(255,255,255,.08);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);touch-action:none;overflow:hidden;transition:opacity .14s ease,transform .14s ease;cursor:crosshair}
      #inkframe-viewport-navigator[hidden]{display:none}
      #inkframe-viewport-navigator.circle{border-radius:50%}
      #inkframe-viewport-navigator:focus-visible{outline:2px solid #fff0f3;outline-offset:3px}
      #inkframe-viewport-navigator .inkframe-navigator-grid{position:absolute;inset:0;pointer-events:none;background:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:25% 25%}
      #inkframe-viewport-navigator .inkframe-navigator-viewport{position:absolute;box-sizing:border-box;min-width:5px;min-height:5px;border:2px solid #fff0f3;border-radius:5px;background:rgba(187,0,55,.22);box-shadow:0 0 0 1px rgba(20,0,14,.72),0 0 12px rgba(255,208,220,.36);pointer-events:none}
      body.inkframe-viewport-gesture #inkframe-viewport-navigator{opacity:.46;pointer-events:none}
      @media(max-width:620px),(orientation:portrait){#inkframe-viewport-navigator{right:8px;bottom:max(72px,calc(env(safe-area-inset-bottom) + 64px));transform:scale(.88);transform-origin:100% 100%}}
      @media(prefers-reduced-motion:reduce){#inkframe-viewport-navigator{transition:none!important}}
    `;
    root.document.head.appendChild(style);
    navigator=root.document.createElement('aside');
    navigator.id='inkframe-viewport-navigator';navigator.hidden=true;
    navigator.setAttribute('role','group');
    navigator.setAttribute('aria-label','Canvas navigator');
    navigator.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight ArrowUp ArrowDown Home');
    navigator.tabIndex=0;
    const grid=root.document.createElement('div');grid.className='inkframe-navigator-grid';
    viewportRect=root.document.createElement('div');viewportRect.className='inkframe-navigator-viewport';
    navigator.append(grid,viewportRect);root.document.body.appendChild(navigator);
    navigator.addEventListener('pointerdown',onPointerDown);
    navigator.addEventListener('pointermove',onPointerMove);
    navigator.addEventListener('pointerup',onPointerEnd);
    navigator.addEventListener('pointercancel',onPointerEnd);
    navigator.addEventListener('keydown',onKeyDown);
    root.addEventListener('inkframe:viewportchange',event=>render(event&&event.detail));
    root.addEventListener('resize',()=>render());
    if(root.MutationObserver){
      const observer=new root.MutationObserver(()=>render());
      observer.observe(root.document.body,{attributes:true,attributeFilter:['class','data-canvas-shape']});
    }
    installed=true;render();return true;
  }

  function start(){
    if(install())return;
    if(!root.MutationObserver||!root.document||!root.document.body)return;
    const observer=new root.MutationObserver(()=>{if(install())observer.disconnect();});
    observer.observe(root.document.body,{subtree:true,childList:true});
  }

  const exported=Object.freeze({geometry,render,recenterAt,nudge,install,get installed(){return installed;}});
  root.InkFrameViewportNavigator=exported;
  if(root.document){
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=exported;
})(typeof globalThis!=='undefined'?globalThis:this);
