// InkFrame full-studio native S Pen bridge — Android generated assets only.
'use strict';

(function(root){
  const android = root.InkFrameStudioNativeBridge;
  if (!android || typeof android.configureCanvas !== 'function') return;

  const CONFIG_SCHEMA = 2;
  const STROKE_SCHEMA = 2;
  const PROJECT_RECONCILIATION_SCHEMA = 1;
  const MAX_SAMPLES = 262144;
  let canvas = null;
  let resizeObserver = null;
  let mutationObserver = null;
  let publishQueued = false;
  let lastPublished = '';
  let contextRevision = 0;

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

  function boundedInteger(value, fallback){
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1000000, Math.round(number))) : fallback;
  }

  function boundedOpacity(value, fallback){
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    const normalized = number > 1 ? number / 100 : number;
    return Math.max(0, Math.min(1, normalized));
  }

  function safeText(value, fallback){
    const text = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g,'').trim();
    return text.slice(0,48) || fallback;
  }

  function layerSnapshot(){
    const fallback = Object.freeze({
      count:0, active:0, background:false, visible:true, opacity:1, blend:'Normal'
    });
    try {
      if (typeof root.InkFrameTabletDeckEnvironment !== 'function') return fallback;
      const deck = root.InkFrameTabletDeckEnvironment();
      if (!deck || typeof deck.layerSnapshot !== 'function') return fallback;
      const raw = deck.layerSnapshot() || {};
      const count = boundedInteger(raw.count, 0);
      const background = !!raw.background;
      const active = background ? 0 : Math.min(count, boundedInteger(raw.active, 0));
      return Object.freeze({
        count,
        active,
        background,
        visible:raw.visible !== false,
        opacity:boundedOpacity(raw.opacity, 1),
        blend:safeText(raw.blend, 'Normal'),
      });
    } catch (_) {
      return fallback;
    }
  }

  function timelineSnapshot(){
    const fallback = Object.freeze({
      frameCount:0, currentFrame:1, maxFrames:0, selected:Object.freeze([]),
      hold:1, fps:12, playing:false, loopEnabled:false
    });
    try {
      if (typeof root.InkFrameTabletDeckEnvironment !== 'function') return fallback;
      const deck = root.InkFrameTabletDeckEnvironment();
      if (!deck || typeof deck.timelineSnapshot !== 'function') return fallback;
      const raw = deck.timelineSnapshot() || {};
      const frameCount = boundedInteger(raw.frameCount, 0);
      const currentFrame = Math.min(
        Math.max(1, boundedInteger(raw.currentFrame, 1) || 1),
        Math.max(1, frameCount),
      );
      const maxFrames = Math.max(frameCount, boundedInteger(raw.maxFrames, frameCount));
      const selected = Array.isArray(raw.selected)
        ? Array.from(new Set(raw.selected
          .map(value => boundedInteger(value, 0))
          .filter(value => value >= 1 && value <= Math.max(1, frameCount))))
          .slice(0,120)
        : [];
      return Object.freeze({
        frameCount,
        currentFrame,
        maxFrames,
        selected:Object.freeze(selected),
        hold:Math.max(1, Math.min(8, boundedInteger(raw.hold, 1) || 1)),
        fps:Math.max(1, Math.min(120, boundedInteger(raw.fps, 12) || 12)),
        playing:!!raw.playing,
        loopEnabled:!!raw.loopEnabled,
      });
    } catch (_) {
      return fallback;
    }
  }

  function geometryPart(value){
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(3) : '0.000';
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
    const layers = layerSnapshot();
    const timeline = timelineSnapshot();
    const baseToken = String(env.contextToken || '');
    const projectIndex = boundedInteger(env.projectIndex, 0);
    const frameIndex = boundedInteger(env.frameIndex, 0);
    const layerIndex = layers.background ? -1 : Math.max(0, layers.active - 1);
    const frameCount = Math.max(1, timeline.frameCount, frameIndex + 1);
    const activeFrameIndex = Math.min(frameCount - 1, frameIndex);
    const maxFrames = Math.max(frameCount, timeline.maxFrames);
    const selectedFrames = timeline.selected
      .map(value => value - 1)
      .filter(value => value >= 0 && value < frameCount);
    const geometryToken = [rect.left, rect.top, rect.width, rect.height].map(geometryPart).join(',');
    const token = [
      'native-studio-v2',
      baseToken,
      `project:${projectIndex}`,
      `frame:${frameIndex}`,
      layers.background ? 'layer:background' : `layer:${layerIndex}/${layers.count}`,
      `geometry:${geometryToken}`,
      `revision:${contextRevision}`,
    ].join('|');

    return {
      schema:CONFIG_SCHEMA,
      enabled:!!env.supported && visible && !blockingSurfaceOpen() && !document.hidden,
      contextToken:token,
      baseContextToken:baseToken,
      contextRevision,
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
      projectIndex,
      frameIndex,
      layerIndex,
      layerCount:layers.count,
      backgroundActive:layers.background,
      brushId:String(env.brushId || ''),

      // Read-only Project -> Scene -> Layer -> Cel reconciliation payload.
      projectReconciliationSchema:PROJECT_RECONCILIATION_SCHEMA,
      projectRevision:contextRevision,
      sceneIndex:0,
      frameCount,
      activeFrameIndex,
      maxFrames,
      playbackStartFrame:0,
      playbackEndFrame:frameCount - 1,
      fps:timeline.fps,
      playing:timeline.playing,
      loopEnabled:timeline.loopEnabled,
      holdFrames:timeline.hold,
      selectedFrames,
      layerVisible:layers.visible,
      layerOpacity:layers.opacity,
      layerBlend:layers.blend,
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

  function markContextChanged(){
    contextRevision = (contextRevision + 1) % 2147483647;
    queuePublish();
  }

  function eventFor(sample, payload, type, rect, baseTime){
    const eraser = !!payload.eraser;
    const ending = type === 'pointerup' || type === 'pointercancel';
    const buttons = ending ? 0 : (eraser ? 32 : 1);
    const button = type === 'pointerdown' || ending ? (eraser ? 5 : 0) : -1;
    return {
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
  }

  function sameExplicitContext(payload, state){
    if (Number(payload.schema) < STROKE_SCHEMA) return true;
    return Number(payload.projectIndex) === state.projectIndex &&
      Number(payload.frameIndex) === state.frameIndex &&
      Number(payload.layerIndex) === state.layerIndex &&
      Number(payload.layerCount) === state.layerCount &&
      !!payload.backgroundActive === state.backgroundActive &&
      Number(payload.contextRevision) === state.contextRevision;
  }

  function replayStroke(payloadJson){
    let payload;
    try { payload = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson; }
    catch (error) { return JSON.stringify({ok:false, reason:'invalid-json', error:String(error)}); }

    const schema = Number(payload && payload.schema);
    if (!payload || (schema !== 1 && schema !== STROKE_SCHEMA) || !Array.isArray(payload.samples)) {
      return JSON.stringify({ok:false, reason:'invalid-schema'});
    }
    if (!payload.samples.length || payload.samples.length > MAX_SAMPLES) {
      return JSON.stringify({ok:false, reason:'invalid-sample-count'});
    }

    const state = computeState();
    const env = environment();
    const input = root.InkFrameBrushV2InputBridge;
    if (!state || !env || !env.brushEnvironment || !input) {
      return JSON.stringify({ok:false, reason:'bridge-unavailable'});
    }
    if (!state.enabled || !env.supported) return JSON.stringify({ok:false, reason:'brush-not-supported'});
    if (String(payload.contextToken || '') !== String(state.contextToken || '') || !sameExplicitContext(payload, state)) {
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
      return JSON.stringify({
        ok:true,
        samples:samples.length,
        projectIndex:state.projectIndex,
        frameIndex:state.frameIndex,
        layerIndex:state.layerIndex,
        backgroundActive:state.backgroundActive,
      });
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
  root.addEventListener('inkframe:layers', markContextChanged);
  root.addEventListener('inkframe:frames', markContextChanged);
  root.addEventListener('inkframe:timeline', markContextChanged);
  root.addEventListener('inkframe:project', markContextChanged);
  document.addEventListener('visibilitychange', queuePublish);
  document.addEventListener('click', markContextChanged, true);
  document.addEventListener('change', markContextChanged, true);
  document.addEventListener('input', markContextChanged, true);
})(typeof globalThis !== 'undefined' ? globalThis : this);
