// InkFrame Brush Engine V2 — generated-APK raw input bridge
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const adapter = root.InkFrameBrushV2Adapter;
  if (!adapter || !ns.createInputBatchNormalizer) return;

  const MAX_TRACE_EVENTS = 8192;
  let active = null;
  let lastStats = null;
  let lastTraceEvents = [];

  function adapterActive() {
    return typeof adapter.isActive === 'function' && adapter.isActive();
  }

  function eventSnapshot(kind, event) {
    return {
      kind:String(kind || (event && event.type) || 'unknown'),
      type:String(event && event.type || ''),
      pointerId:Number(event && event.pointerId),
      pointerType:String(event && event.pointerType || ''),
      timeStamp:Number(event && event.timeStamp),
      clientX:Number(event && event.clientX),
      clientY:Number(event && event.clientY),
      pressure:Number(event && event.pressure || 0),
      tiltX:Number(event && event.tiltX || 0),
      tiltY:Number(event && event.tiltY || 0),
      twist:Number(event && event.twist || 0),
      width:Number(event && event.width || 0),
      height:Number(event && event.height || 0),
      buttons:Number(event && event.buttons || 0),
      button:Number(event && event.button == null ? -1 : event.button),
    };
  }

  function appendTraceEvent(kind, event) {
    if (!active) return;
    active.events.push(eventSnapshot(kind, event));
    if (active.events.length > MAX_TRACE_EVENTS) {
      active.events.splice(0, active.events.length - MAX_TRACE_EVENTS);
      active.traceEventsTruncated++;
    }
  }

  function markNative(phase, event) {
    const bridge = root.InkFrameNativePenBridge;
    if (!bridge || typeof bridge.markWebPhase !== 'function') return;
    try {
      bridge.markWebPhase(
        String(phase || 'unknown'),
        Number(event && event.pointerId) || 0,
        Number(event && event.timeStamp) || 0
      );
    } catch (_) {}
  }

  function rememberStats(reason) {
    if (!active) return;
    lastStats = Object.assign({
      reason: reason || 'finished',
      pointerId: active.pointerId,
      traceEvents: active.events.length,
      traceEventsTruncated: active.traceEventsTruncated,
    }, active.normalizer.stats());
    lastTraceEvents = active.events.slice();
    active = null;
  }

  function begin(event, env) {
    const normalizer = ns.createInputBatchNormalizer({
      pointerId: event && event.pointerId,
      pointerType: event && event.pointerType || 'pen',
    });
    normalizer.seed(event);
    const handled = adapter.begin(event, env);
    if (handled && adapterActive()) {
      active = {
        pointerId: event.pointerId,
        normalizer,
        events:[],
        traceEventsTruncated:0,
      };
      appendTraceEvent('begin', event);
      markNative('begin', event);
    } else {
      lastStats = Object.assign({ reason:'begin-not-active' }, normalizer.stats());
      lastTraceEvents = [];
      active = null;
    }
    return handled;
  }

  function move(event) {
    if (!active || !event || event.pointerId !== active.pointerId) {
      return adapter.move(event);
    }

    const events = active.normalizer.normalize(event);
    if (!events.length) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      return adapterActive();
    }

    let handled = false;
    for (const value of events) {
      appendTraceEvent('move', value);
      handled = adapter.move(value) || handled;
      if (!adapterActive()) break;
    }
    return handled || adapterActive();
  }

  function end(event) {
    if (active) {
      appendTraceEvent(event && event.type || 'end', event);
      markNative(event && event.type || 'end', event);
    }
    // The adapter snapshots the V2 trace inside end(). Keep active populated
    // until that snapshot completes so native.js can attach this exact stream.
    const handled = adapter.end(event);
    rememberStats(event && event.type || 'pointer-end');
    return handled;
  }

  function clearIfEnded(reason) {
    if (active && !adapterActive()) rememberStats(reason);
  }

  function traceSnapshot() {
    if (active) {
      return {
        active:true,
        pointerId:active.pointerId,
        events:active.events.slice(),
        traceEventsTruncated:active.traceEventsTruncated,
        stats:Object.assign({}, active.normalizer.stats()),
      };
    }
    return {
      active:false,
      events:lastTraceEvents.slice(),
      stats:Object.assign({}, lastStats || {}),
    };
  }

  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('lostpointercapture', () => clearIfEnded('lostpointercapture'), true);
    root.document.addEventListener('visibilitychange', () => {
      if (root.document.hidden) clearIfEnded('visibility-hidden');
    });
  }
  if (root.addEventListener) root.addEventListener('blur', () => clearIfEnded('window-blur'));

  root.InkFrameBrushV2InputBridge = Object.freeze({
    begin,
    move,
    end,
    traceSnapshot,
    stats: () => active
      ? Object.assign({ active:true, pointerId:active.pointerId }, active.normalizer.stats())
      : Object.assign({ active:false }, lastStats || {}),
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = root.InkFrameBrushV2InputBridge;
})(typeof globalThis !== 'undefined' ? globalThis : this);
