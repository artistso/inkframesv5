// InkFrame — explicit 1:1 canvas-pixel inspection control
'use strict';

(function(root){
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const nearlyActual=value=>Math.abs(finite(value)-1)<=0.002;
  let api=null;
  let env=null;
  let button=null;
  let installed=false;

  function sync(value){
    if(!button)return false;
    const state=value||(env&&typeof env.getState==='function'?env.getState():null);
    const active=nearlyActual(state&&state.scale);
    button.setAttribute('aria-pressed',String(active));
    button.dataset.actual=String(active);
    button.title=active
      ? 'Actual pixels active · one canvas pixel per CSS pixel'
      : 'Actual pixels · one canvas pixel per CSS pixel · Ctrl/⌘+1';
    button.setAttribute('aria-label',button.title);
    return active;
  }

  function canApply(){
    if(!env||typeof env.getState!=='function'||typeof env.setState!=='function')return false;
    if(api&&typeof api.blockingSurfaceOpen==='function'&&api.blockingSurfaceOpen())return false;
    return !(typeof env.canGesture==='function'&&!env.canGesture());
  }

  function actualPixels(){
    if(!canApply())return false;
    const current=env.getState()||{};
    const applied=env.setState({scale:1,panX:finite(current.panX),panY:finite(current.panY)});
    sync(applied);
    if(api&&typeof api.dismissGuidance==='function')api.dismissGuidance();
    if(typeof env.flash==='function')env.flash('Actual pixels · 1:1');
    return nearlyActual(applied&&applied.scale);
  }

  function onKeyDown(event){
    if(!event||event.repeat||!(event.ctrlKey||event.metaKey)||event.altKey||event.key!=='1')return;
    const target=event.target;
    if(target&&(/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)||target.isContentEditable))return;
    if(!canApply())return;
    event.preventDefault();actualPixels();
  }

  function install(){
    if(installed)return true;
    if(!root.document||!root.document.body)return false;
    api=root.InkFrameViewportGestures||null;
    const factory=root.InkFrameViewportEnvironment;
    env=typeof factory==='function'?factory():null;
    const controls=root.document.getElementById('inkframe-viewport-controls');
    if(!api||!env||!controls)return false;

    const style=root.document.createElement('style');
    style.dataset.inkframeActualPixelsStyle='true';
    style.textContent=`
      #inkframe-viewport-dock .inkframe-viewport-actual{font-size:11px;letter-spacing:.035em}
      #inkframe-viewport-dock .inkframe-viewport-actual[aria-pressed="true"]{background:linear-gradient(145deg,rgba(247,202,201,.30),rgba(187,0,55,.82));box-shadow:inset 0 0 0 1px rgba(255,240,243,.56)}
    `;
    root.document.head.appendChild(style);

    button=root.document.createElement('button');
    button.type='button';button.className='inkframe-viewport-actual';button.textContent='1:1';
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',actualPixels);
    controls.appendChild(button);

    root.addEventListener('keydown',onKeyDown);
    root.addEventListener('inkframe:viewportchange',event=>sync(event&&event.detail));
    installed=true;sync();return true;
  }

  function start(){
    if(install())return;
    if(!root.MutationObserver||!root.document||!root.document.body)return;
    const observer=new root.MutationObserver(()=>{if(install())observer.disconnect();});
    observer.observe(root.document.body,{subtree:true,childList:true});
  }

  const exported=Object.freeze({install,actualPixels,sync,get installed(){return installed;}});
  root.InkFrameActualPixels=exported;
  if(root.document){
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=exported;
})(typeof globalThis!=='undefined'?globalThis:this);
