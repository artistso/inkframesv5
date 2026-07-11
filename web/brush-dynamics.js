// InkFrame — per-brush velocity dynamics
// -----------------------------------------------------------------------------
// Pure response curves plus a narrow browser runtime adapter. The model remains
// deterministic and Node-testable; the adapter applies it only while the main
// canvas pointer listener is actively painting.
'use strict';

const SPEED_EPSILON = 1e-6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp01 = value => clamp(Number(value) || 0, 0, 1);

const DEFAULT_VELOCITY_PROFILES = Object.freeze({
  pencil: Object.freeze({ speedStart:1.2, speedEnd:15, curve:1.15, width:-0.14, opacity:-0.28, flow:-0.18, spacing:0.12 }),
  ink: Object.freeze({ speedStart:1.5, speedEnd:18, curve:1.25, width:-0.36, opacity:-0.06, flow:-0.04, spacing:-0.05 }),
  marker: Object.freeze({ speedStart:1.0, speedEnd:14, curve:1.10, width:-0.08, opacity:-0.14, flow:-0.10, spacing:-0.08 }),
  water: Object.freeze({ speedStart:0.8, speedEnd:13, curve:1.05, width:-0.10, opacity:-0.30, flow:-0.34, spacing:0.10 }),
  frost: Object.freeze({ speedStart:1.0, speedEnd:14, curve:1.10, width:-0.06, opacity:-0.18, flow:-0.20, spacing:0.06 }),
  smudge: Object.freeze({ speedStart:1.0, speedEnd:16, curve:1.15, width:0, opacity:-0.16, flow:-0.25, spacing:-0.05 }),
  glow: Object.freeze({ speedStart:1.5, speedEnd:18, curve:1.20, width:-0.04, opacity:-0.08, flow:-0.08, spacing:-0.04 }),
  neon: Object.freeze({ speedStart:1.5, speedEnd:20, curve:1.25, width:-0.12, opacity:0.02, flow:0.04, spacing:-0.08 }),
  star: Object.freeze({ speedStart:1.0, speedEnd:18, curve:1.10, width:0, opacity:0, flow:0, spacing:0.18 }),
  eraser: Object.freeze({ speedStart:1.5, speedEnd:20, curve:1.20, width:0, opacity:0, flow:0, spacing:-0.05 }),
});

const NEUTRAL_PROFILE = Object.freeze({ speedStart:0, speedEnd:1, curve:1, width:0, opacity:0, flow:0, spacing:0 });

function resolveVelocityProfile(brushId, overrides) {
  const base = DEFAULT_VELOCITY_PROFILES[brushId] || NEUTRAL_PROFILE;
  if (!overrides || typeof overrides !== 'object') return { ...base };
  const out = { ...base };
  for (const key of ['speedStart','speedEnd','curve','width','opacity','flow','spacing']) {
    const value = Number(overrides[key]);
    if (Number.isFinite(value)) out[key] = value;
  }
  out.speedStart = Math.max(0, out.speedStart);
  out.speedEnd = Math.max(out.speedStart + SPEED_EPSILON, out.speedEnd);
  out.curve = clamp(out.curve, 0.25, 4);
  out.width = clamp(out.width, -0.8, 1.0);
  out.opacity = clamp(out.opacity, -0.95, 1.0);
  out.flow = clamp(out.flow, -0.95, 1.0);
  out.spacing = clamp(out.spacing, -0.75, 1.5);
  return out;
}

function velocityAmount(speed, profileOrStart, end, curve) {
  const profile = typeof profileOrStart === 'object' ? profileOrStart : {
    speedStart:Number(profileOrStart)||0, speedEnd:Number(end)||1, curve:Number(curve)||1,
  };
  const start = Math.max(0, Number(profile.speedStart) || 0);
  const finish = Math.max(start + SPEED_EPSILON, Number(profile.speedEnd) || 1);
  const raw = clamp01(((Number(speed) || 0) - start) / (finish - start));
  const smooth = raw * raw * (3 - 2 * raw);
  return Math.pow(smooth, clamp(Number(profile.curve) || 1, 0.25, 4));
}

function multiplier(amount, response, min, max) {
  return clamp(1 + (Number(response) || 0) * amount, min, max);
}

function velocityDynamics(brushId, speed, overrides) {
  const profile = resolveVelocityProfile(brushId, overrides);
  const amount = velocityAmount(speed, profile);
  return {
    amount,
    width:multiplier(amount, profile.width, 0.20, 2.00),
    opacity:multiplier(amount, profile.opacity, 0.05, 1.50),
    flow:multiplier(amount, profile.flow, 0.05, 1.50),
    spacing:multiplier(amount, profile.spacing, 0.25, 2.00),
    profile,
  };
}

function applyVelocityDynamics(values, brushId, speed, overrides) {
  const input = values || {};
  const dynamics = velocityDynamics(brushId, speed, overrides);
  return {
    width:Math.max(0, (Number(input.width)||0) * dynamics.width),
    opacity:clamp((Number(input.opacity)||0) * dynamics.opacity, 0, 1),
    flow:clamp((Number(input.flow)||0) * dynamics.flow, 0, 1),
    spacing:Math.max(0.01, (Number(input.spacing)||0) * dynamics.spacing),
    dynamics,
  };
}

function sampleSpeed(previous, current) {
  if (!previous || !current) return 0;
  const dt = Number(current.timeStamp) - Number(previous.timeStamp);
  if (!(dt > 0)) return 0;
  return Math.hypot(Number(current.clientX)-Number(previous.clientX), Number(current.clientY)-Number(previous.clientY)) / dt * 16;
}

function installVelocityRuntime(root) {
  if (!root || !root.document || !root.EventTarget || !root.CanvasRenderingContext2D) return false;
  if (root.__inkframeVelocityRuntimeInstalled) return false;
  root.__inkframeVelocityRuntimeInstalled = true;

  const runtime = { active:false,current:null,previous:new Map(),contexts:new WeakMap(),samples:0,brushId:'ink' };

  function activeBrushId() {
    const el = root.document.querySelector('[data-id].on');
    const id = el && el.dataset && el.dataset.id;
    return DEFAULT_VELOCITY_PROFILES[id] ? id : (runtime.brushId || 'ink');
  }

  function activateSample(event) {
    if (!event) return;
    const id = event.pointerId == null ? -1 : event.pointerId;
    const previous = runtime.previous.get(id);
    const speed = sampleSpeed(previous, event);
    runtime.previous.set(id, event);
    runtime.brushId = activeBrushId();
    runtime.current = velocityDynamics(runtime.brushId, speed);
    runtime.samples++;
    root.__inkframeVelocity = { brush:runtime.brushId,speed,amount:runtime.current.amount,width:runtime.current.width,opacity:runtime.current.opacity,flow:runtime.current.flow,spacing:runtime.current.spacing,samples:runtime.samples };
  }

  function decorate(event) {
    if (!event || typeof Proxy !== 'function') return event;
    let activated = false;
    return new Proxy(event, {
      get(target, prop) {
        if (!activated && (prop === 'clientX' || prop === 'clientY' || prop === 'pressure')) { activated=true;activateSample(target); }
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  const peProto = root.PointerEvent && root.PointerEvent.prototype;
  if (peProto && typeof peProto.getCoalescedEvents === 'function') {
    const originalCoalesced = peProto.getCoalescedEvents;
    if (!originalCoalesced.__inkframeVelocityWrapped) {
      const wrapped = function(){ return Array.from(originalCoalesced.call(this)||[], decorate); };
      wrapped.__inkframeVelocityWrapped = true;
      try { Object.defineProperty(peProto,'getCoalescedEvents',{configurable:true,writable:true,value:wrapped}); }
      catch (_) { try { peProto.getCoalescedEvents = wrapped; } catch (_) {} }
    }
  }

  const eventProto = root.EventTarget.prototype;
  const originalAdd = eventProto.addEventListener;
  eventProto.addEventListener = function(type, listener, options) {
    if (type === 'pointermove' && this && this.id === 'c' && typeof listener === 'function') {
      const wrappedListener = function(event) { runtime.active=true;runtime.current=null;try{return listener.call(this,event);}finally{runtime.active=false;runtime.current=null;} };
      return originalAdd.call(this,type,wrappedListener,options);
    }
    if ((type === 'pointerup' || type === 'pointercancel') && typeof listener === 'function') {
      const wrappedEnd = function(event) { if(event&&event.pointerId!=null)runtime.previous.delete(event.pointerId);return listener.call(this,event); };
      return originalAdd.call(this,type,wrappedEnd,options);
    }
    return originalAdd.call(this,type,listener,options);
  };

  const ctxProto=root.CanvasRenderingContext2D.prototype;
  const originalArc=ctxProto.arc, originalEllipse=ctxProto.ellipse, originalTranslate=ctxProto.translate;
  const paintMethods=['fill','stroke','fillRect','strokeRect','drawImage'];
  function contextState(ctx){let state=runtime.contexts.get(ctx);if(!state){state={budget:1,skip:false};runtime.contexts.set(ctx,state);}return state;}

  ctxProto.translate=function(x,y){
    if(runtime.active&&runtime.current){const state=contextState(this),spacing=Math.max(1,runtime.current.spacing);state.budget+=1/spacing;if(state.budget>=1){state.budget-=1;state.skip=false;}else state.skip=true;}
    return originalTranslate.call(this,x,y);
  };
  ctxProto.arc=function(x,y,r,start,end,ccw){const mult=runtime.active&&runtime.current?runtime.current.width:1;return originalArc.call(this,x,y,r*mult,start,end,ccw);};
  if(typeof originalEllipse==='function')ctxProto.ellipse=function(x,y,rx,ry,rotation,start,end,ccw){const mult=runtime.active&&runtime.current?runtime.current.width:1;return originalEllipse.call(this,x,y,rx*mult,ry*mult,rotation,start,end,ccw);};

  for(const name of paintMethods){
    const original=ctxProto[name];if(typeof original!=='function')continue;
    ctxProto[name]=function(...args){if(!runtime.active||!runtime.current)return original.apply(this,args);const state=contextState(this);if(state.skip)return undefined;const before=this.globalAlpha;this.globalAlpha=before*runtime.current.opacity*runtime.current.flow;try{return original.apply(this,args);}finally{this.globalAlpha=before;}};
  }

  root.InkFrameVelocityRuntime={stats:()=>({samples:runtime.samples,current:root.__inkframeVelocity||null}),reset:()=>{runtime.samples=0;runtime.previous.clear();root.__inkframeVelocity=null;}};
  return true;
}

{
  const api={DEFAULT_VELOCITY_PROFILES,resolveVelocityProfile,velocityAmount,velocityDynamics,applyVelocityDynamics,sampleSpeed,installVelocityRuntime};
  if(typeof window!=='undefined'){window.InkFrameBrushDynamics=api;installVelocityRuntime(window);}
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
}
