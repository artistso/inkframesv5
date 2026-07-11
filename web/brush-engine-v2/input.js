// InkFrame Brush Engine V2 — generated-APK raw input bridge
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const adapter = root.InkFrameBrushV2Adapter;
  if (!adapter || !ns.createInputBatchNormalizer) return;

  let active = null;
  let lastStats = null;

  function adapterActive() {
    return typeof adapter.isActive === 'function' && adapter.isActive();
  }

  function rememberStats(reason) {
    if (!active) return;
    lastStats = Object.assign({
      reason: reason || 'finished',
      pointerId: active.pointerId,
    }, active.normalizer.stats());
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
      };
    } else {
      lastStats = Object.assign({ reason:'begin-not-active' }, normalizer.stats());
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
      handled = adapter.move(value) || handled;
      if (!adapterActive()) break;
    }
    return handled || adapterActive();
  }

  function end(event) {
    const handled = adapter.end(event);
    rememberStats(event && event.type || 'pointer-end');
    return handled;
  }

  function clearIfEnded(reason) {
    if (active && !adapterActive()) rememberStats(reason);
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
    stats: () => active
      ? Object.assign({ active:true, pointerId:active.pointerId }, active.normalizer.stats())
      : Object.assign({ active:false }, lastStats || {}),
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = root.InkFrameBrushV2InputBridge;
})(typeof globalThis !== 'undefined' ? globalThis : this);
