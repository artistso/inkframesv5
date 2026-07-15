// InkFrame Brush Engine V2 — live stylus session continuity
// Prevents missed Android pointer termination events from bridging separate strokes.
'use strict';

(function(root){
  const adapter = root.InkFrameBrushV2Adapter;
  if (!adapter || adapter.__sessionContinuityInstalled) return;

  const original = {
    begin: adapter.begin,
    move: adapter.move,
    end: adapter.end,
  };
  let lastEvent = null;
  let pointerId = null;
  const counters = {
    implicitEnds: 0,
    restartedOnPointerDown: 0,
    lostCaptureEnds: 0,
    blurEnds: 0,
    hiddenEnds: 0,
  };

  function finite(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function remember(event) {
    if (!event) return;
    pointerId = event.pointerId != null ? event.pointerId : pointerId;
    lastEvent = {
      pointerId,
      pointerType: event.pointerType || 'pen',
      clientX: finite(event.clientX, lastEvent ? lastEvent.clientX : 0),
      clientY: finite(event.clientY, lastEvent ? lastEvent.clientY : 0),
      pressure: finite(event.pressure, lastEvent ? lastEvent.pressure : 0),
      tiltX: finite(event.tiltX, lastEvent ? lastEvent.tiltX : 0),
      tiltY: finite(event.tiltY, lastEvent ? lastEvent.tiltY : 0),
      twist: finite(event.twist, lastEvent ? lastEvent.twist : 0),
      width: finite(event.width, lastEvent ? lastEvent.width : 0),
      height: finite(event.height, lastEvent ? lastEvent.height : 0),
      altitudeAngle: finite(event.altitudeAngle, lastEvent ? lastEvent.altitudeAngle : Math.PI / 2),
      azimuthAngle: finite(event.azimuthAngle, lastEvent ? lastEvent.azimuthAngle : 0),
      buttons: finite(event.buttons, 0),
      button: finite(event.button, -1),
      timeStamp: finite(event.timeStamp,
        lastEvent ? lastEvent.timeStamp : (root.performance && root.performance.now ? root.performance.now() : Date.now())),
    };
  }

  function syntheticTerminal(reason) {
    const source = lastEvent || {};
    return {
      pointerId: pointerId != null ? pointerId : source.pointerId,
      pointerType: source.pointerType || 'pen',
      clientX: finite(source.clientX, 0),
      clientY: finite(source.clientY, 0),
      pressure: finite(source.pressure, 0),
      tiltX: finite(source.tiltX, 0),
      tiltY: finite(source.tiltY, 0),
      twist: finite(source.twist, 0),
      width: finite(source.width, 0),
      height: finite(source.height, 0),
      altitudeAngle: finite(source.altitudeAngle, Math.PI / 2),
      azimuthAngle: finite(source.azimuthAngle, 0),
      buttons: 0,
      button: -1,
      timeStamp: finite(source.timeStamp,
        root.performance && root.performance.now ? root.performance.now() : Date.now()),
      type: reason || 'implicit-end',
      preventDefault() {},
    };
  }

  function clearRemembered() {
    lastEvent = null;
    pointerId = null;
  }

  function isActive() {
    return typeof adapter.isActive === 'function' && adapter.isActive();
  }

  function finishImplicit(reason) {
    if (!isActive()) return false;
    // Resolve end dynamically so wrappers installed after session continuity
    // (Ghost Trail, performance budgeting, diagnostics) can flush and finalize.
    const handled = adapter.end(syntheticTerminal(reason));
    if (handled) {
      counters.implicitEnds++;
      clearRemembered();
    }
    return handled;
  }

  adapter.begin = function(event, env) {
    if (isActive()) {
      if (finishImplicit('implicit-pointerdown')) counters.restartedOnPointerDown++;
    }
    const handled = original.begin.call(adapter, event, env);
    if (handled && isActive()) remember(event);
    return handled;
  };

  adapter.move = function(event) {
    const handled = original.move.call(adapter, event);
    if (handled && isActive()) remember(event);
    return handled;
  };

  adapter.end = function(event) {
    const handled = original.end.call(adapter, event);
    if (handled && !isActive()) clearRemembered();
    return handled;
  };

  function endForLifecycle(reason, counter) {
    if (finishImplicit(reason)) counters[counter]++;
  }

  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('lostpointercapture', event => {
      if (!isActive()) return;
      if (event && event.pointerId != null && pointerId != null && event.pointerId !== pointerId) return;
      endForLifecycle('lostpointercapture', 'lostCaptureEnds');
    }, true);
    root.document.addEventListener('visibilitychange', () => {
      if (root.document.hidden) endForLifecycle('visibility-hidden', 'hiddenEnds');
    });
  }
  if (root.addEventListener) {
    root.addEventListener('blur', () => endForLifecycle('window-blur', 'blurEnds'));
  }

  adapter.finishStaleSession = finishImplicit;
  adapter.sessionStats = () => Object.assign({ active: isActive(), pointerId }, counters);
  adapter.__sessionContinuityInstalled = true;
  root.InkFrameBrushV2SessionContinuity = Object.freeze({
    finishStaleSession: finishImplicit,
    stats: adapter.sessionStats,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.InkFrameBrushV2SessionContinuity;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
