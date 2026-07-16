// InkFrame full-studio native S Pen bridge — Android generated assets only.
'use strict';

(function(root){
  const android = root.InkFrameStudioNativeBridge;
  if (!android || typeof android.configureCanvas !== 'function') return;

  const MAX_SAMPLES = 262144;
  let canvas = null;
  let resizeObserver = null;
  let mutationObserver = null;
  let publishQueued = false;
  let lastPublished = '';

  function environment(){
    if (typeof root.InkFrameNativeStudioEnvironment !== 'function') return null;
    try { return root.InkFrameNativeStudioEnvironment(); }
    catch (_) { return null; }
  }

  function blockingSurfaceOpen(){
    return !!document.querySelector([
      '#studio.show',
      '#projectPanel.show',
      '#startPanel.show',
      '#helpPanel.show',
      '#inkframe-v2-tuning:not([hidden])',
      '.inkframe-feedback:not([hidden])'
    ].join(','));
  }

  function resolveColor(value, fallback){
    try {
      const probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      const context = probe.getContext('2d', { willReadFrequently:true });
      if (!context) return fallback;
      context.clearRect(0,0,1,1);
      context.fillStyle = String(value || '');
      context.fillRect(0,0,1,1);
      const rgba = context.getImageData(0,0,1,1).data;
      return ((rgba[3] << 24) | (rgba[0] << 16) | (rgba[1] << 8) | rgba[2]) | 0;
    } catch (_) {
      return fallback;
    }
  }

  function computeState(){
    const env = environment();
    canvas = env && env.canvas || document.getElementById('c');
    if (!env || !canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const style = root.getComputedStyle ? root.getComputedStyle(canvas) : null;
    const visible = rect.width > 1 && rect.height > 1 &&
      (!style || (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0));
    const paper = style && style.backgroundColor || '#fff0f3';
    const token = String(env.contextToken || '');

    return {
      schema:1,
      enabled:!!env.supported && visible && !blockingSurfaceOpen() && !document.hidden,
      contextToken:token,
      left:Number(rect.left)||0,
      top:Number(rect.top)||0,
      width:Number(rect.width)||0,
      height:Number(rect.height)||0,
      viewportWidth:Number(root.innerWidth)||1,
      viewportHeight:Number(root.innerHeight)||1,
      canvasWidth:Number(env.width)||Number(canvas.width)||1,
      canvasHeight:Number(env.height)||Number(canvas.height)||1,
      brushColor:resolveColor(env.color, 0xff100a12|0),
      paperColor:resolveColor(paper, 0xfffff0f3|0),
      brushSize:Number(env.size)||1,
      opacity:Number(env.opacity == null ? 1 : env.opacity),
      shape:env.canvasShape === 'circle' ? 'circle' : 'square',
      projectIndex:Number(env.projectIndex)||0,
      frameIndex:Number(env.frameIndex)||0,
      brushId:String(env.brushId || ''),
    };
  }

  function publish(){
    publishQueued = false;
    const state = computeState();
    if (!state) return false;
    const serialized = JSON.stringify(state);
    if (serialized === lastPublished) return true;
    lastPublished = serialized;
    try {
      android.configureCanvas(serialized);
      return true;
    } catch (_) {
      return false;
    }
  }

  function queuePublish(){
    if (publishQueued) return;
    publishQueued = true;
    (root.requestAnimationFrame || function(fn){ Promise.resolve().then(fn); })(publish);
  }

  function eventFor(sample, payload, type, rect, baseTime){
    const eraser = !!payload.eraser;
    const ending = type === 'pointerup' || type === 'pointercancel';
    const buttons = ending ? 0 : (eraser ? 32 : 1);
    const button = type === 'pointerdown' || ending ? (eraser ? 5 : 0) : -1;
    const event = {
      type,
      pointerId:Number(payload.pointerId)||1,
      pointerType:'pen',
      isPrimary:true,
      clientX:rect.left + Math.max(0,Math.min(1,Number(sample.x)||0))*rect.width,
      clientY:rect.top + Math.max(0,Math.min(1,Number(sample.y)||0))*rect.height,
      pressure:Math.max(0,Math.min(1,Number(sample.pressure)||0)),
      tiltX:Math.max(-90,Math.min(90,Number(sample.tiltX)||0)),
      tiltY:Math.max(-90,Math.min(90,Number(sample.tiltY)||0)),
      twist:((Number(sample.twist)||0)%360+360)%360,
      width:1,
      height:1,
      buttons,
      button,
      timeStamp:baseTime + Math.max(0,Number(sample.dt)||0),
      altitudeAngle:Math.PI/2,
      azimuthAngle:0,
      preventDefault(){},
      stopPropagation(){},
      stopImmediatePropagation(){},
      setPointerCapture(){},
      releasePointerCapture(){},
      getCoalescedEvents(){ return []; },
    };
    return event;
  }

  function replayStroke(payloadJson){
    let payload;
    try { payload = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson; }
    catch (error) { return JSON.stringify({ok:false, reason:'invalid-json', error:String(error)}); }

    if (!payload || Number(payload.schema) !== 1 || !Array.isArray(payload.samples)) {
      return JSON.stringify({ok:false, reason:'invalid-schema'});
    }
    if (!payload.samples.length || payload.samples.length > MAX_SAMPLES) {
      return JSON.stringify({ok:false, reason:'invalid-sample-count'});
    }

    const env = environment();
    const input = root.InkFrameBrushV2InputBridge;
    if (!env || !env.brushEnvironment || !input) {
      return JSON.stringify({ok:false, reason:'bridge-unavailable'});
    }
    if (!env.supported) return JSON.stringify({ok:false, reason:'brush-not-supported'});
    if (String(payload.contextToken || '') !== String(env.contextToken || '')) {
      queuePublish();
      return JSON.stringify({ok:false, reason:'studio-context-changed'});
    }

    const target = env.canvas || document.getElementById('c');
    if (!target) return JSON.stringify({ok:false, reason:'canvas-unavailable'});
    const rect = target.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return JSON.stringify({ok:false, reason:'canvas-hidden'});

    const samples = payload.samples;
    const baseTime = root.performance && performance.now ? performance.now() : Date.now();
    const first = eventFor(samples[0], payload, 'pointerdown', rect, baseTime);
    let handled = false;
    try {
      handled = !!input.begin(first, env.brushEnvironment);
      if (!handled) return JSON.stringify({ok:false, reason:'begin-rejected'});

      for (let index=1; index<samples.length-1; index++) {
        input.move(eventFor(samples[index], payload, 'pointermove', rect, baseTime));
      }
      const last = samples.length === 1 ? samples[0] : samples[samples.length-1];
      input.end(eventFor(last, payload, 'pointerup', rect, baseTime));
      queuePublish();
      return JSON.stringify({ok:true, samples:samples.length});
    } catch (error) {
      try {
        input.end(eventFor(samples[samples.length-1], payload, 'pointercancel', rect, baseTime));
      } catch (_) {}
      return JSON.stringify({ok:false, reason:'replay-failed', error:String(error && error.message || error)});
    }
  }

  function installObservers(){
    canvas = document.getElementById('c');
    if (canvas && root.ResizeObserver) {
      resizeObserver = new ResizeObserver(queuePublish);
      resizeObserver.observe(canvas);
    }
    if (root.MutationObserver && document.body) {
      mutationObserver = new MutationObserver(queuePublish);
      mutationObserver.observe(document.body, {
        subtree:true,
        childList:true,
        attributes:true,
        attributeFilter:['class','style','hidden','aria-hidden','width','height'],
      });
    }
  }

  root.InkFrameNativeStudio = Object.freeze({
    publish,
    replayStroke,
    snapshot:computeState,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { installObservers(); queuePublish(); }, {once:true});
  } else {
    installObservers();
    queuePublish();
  }
  root.addEventListener('resize', queuePublish, {passive:true});
  root.addEventListener('inkframe:viewportchange', queuePublish);
  document.addEventListener('visibilitychange', queuePublish);
  document.addEventListener('click', queuePublish, true);
  document.addEventListener('change', queuePublish, true);
  document.addEventListener('input', queuePublish, true);
})(typeof globalThis !== 'undefined' ? globalThis : this);
