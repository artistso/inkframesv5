// InkFrame Brush Engine V2 — frame-budgeted live painting and soft-dab cache
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const adapter = root.InkFrameBrushV2Adapter;
  if (!adapter || adapter.__performanceBudgetInstalled || typeof ns.paintRoundDab !== 'function') return;

  const MAX_STAMPS = 96;
  const MAX_QUEUE = 1024;
  const MAX_EVENTS_PER_FRAME = 48;
  const FRAME_BUDGET_MS = 5;
  const stampCache = new Map();
  const coverageState = new WeakMap();
  const totals = {
    frames: 0,
    queuedEvents: 0,
    processedEvents: 0,
    compactedEvents: 0,
    liveRenders: 0,
    stampHits: 0,
    stampMisses: 0,
    stampFallbacks: 0,
    paintedDabs: 0,
    ribbonLines: 0,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  function now() {
    if (root.performance && typeof root.performance.now === 'function') return root.performance.now();
    return Date.now();
  }

  function requestFrame(callback) {
    if (typeof root.requestAnimationFrame === 'function') return root.requestAnimationFrame(callback);
    return root.setTimeout ? root.setTimeout(() => callback(now()), 16) : setTimeout(() => callback(now()), 16);
  }

  function cancelFrame(id) {
    if (!id) return;
    if (typeof root.cancelAnimationFrame === 'function') root.cancelAnimationFrame(id);
    else if (root.clearTimeout) root.clearTimeout(id);
    else clearTimeout(id);
  }

  function createStampSurface(context, size) {
    const owner = context && context.canvas && context.canvas.ownerDocument;
    let canvas = null;
    if (owner && typeof owner.createElement === 'function') canvas = owner.createElement('canvas');
    else if (root.document && typeof root.document.createElement === 'function') canvas = root.document.createElement('canvas');
    else if (typeof root.OffscreenCanvas === 'function') canvas = new root.OffscreenCanvas(size, size);
    if (!canvas) return null;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext && canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  }

  function stampKey(dab, color) {
    const radius = Math.max(0.5, Math.round(Math.max(0.05, Number(dab.radius) || 0.05) * 4) / 4);
    const hardness = Math.round(clamp(dab.hardness, 0, 1) * 50) / 50;
    const erase = dab.composite === 'destination-out';
    return {
      key: `${radius}|${hardness}|${erase ? 'erase' : String(color || '#000')}`,
      radius,
      hardness,
      paint: erase ? 'rgba(0,0,0,1)' : String(color || '#000'),
    };
  }

  function createStamp(context, dab, color) {
    const normalized = stampKey(dab, color);
    const cached = stampCache.get(normalized.key);
    if (cached) {
      stampCache.delete(normalized.key);
      stampCache.set(normalized.key, cached);
      totals.stampHits++;
      return cached;
    }

    const pad = 2;
    const size = Math.max(2, Math.ceil(normalized.radius * 2) + pad * 2);
    const surface = createStampSurface(context, size);
    if (!surface || typeof surface.ctx.createRadialGradient !== 'function') {
      totals.stampFallbacks++;
      return null;
    }

    const center = size / 2;
    const inner = normalized.radius * normalized.hardness;
    const gradient = surface.ctx.createRadialGradient(center, center, inner, center, center, normalized.radius);
    gradient.addColorStop(0, normalized.paint);
    gradient.addColorStop(Math.max(0.001, normalized.hardness), normalized.paint);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    surface.ctx.fillStyle = gradient;
    surface.ctx.beginPath();
    surface.ctx.arc(center, center, normalized.radius, 0, Math.PI * 2);
    surface.ctx.fill();

    const stamp = Object.freeze({ canvas: surface.canvas, center, key: normalized.key });
    stampCache.set(normalized.key, stamp);
    if (stampCache.size > MAX_STAMPS) stampCache.delete(stampCache.keys().next().value);
    totals.stampMisses++;
    return stamp;
  }

  function paintDirectDab(context, dab, color) {
    context.save();
    context.globalCompositeOperation = dab.composite;
    context.globalAlpha = dab.opacity;
    const radius = Math.max(0.05, dab.radius);
    if (dab.hardness >= 0.995 || typeof context.createRadialGradient !== 'function') {
      context.fillStyle = dab.composite === 'destination-out' ? '#000' : color;
    } else {
      const inner = radius * clamp(dab.hardness, 0, 1);
      const gradient = context.createRadialGradient(dab.x, dab.y, inner, dab.x, dab.y, radius);
      const paint = dab.composite === 'destination-out' ? 'rgba(0,0,0,1)' : color;
      gradient.addColorStop(0, paint);
      gradient.addColorStop(Math.max(0.001, dab.hardness), paint);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
    }
    context.beginPath();
    context.arc(dab.x, dab.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return true;
  }

  function paintIsolatedDab(context, dab, color) {
    if (!context || !dab) return false;
    totals.paintedDabs++;
    if (dab.hardness >= 0.995 || typeof context.drawImage !== 'function') {
      return paintDirectDab(context, dab, color);
    }
    const stamp = createStamp(context, dab, color);
    if (!stamp) return paintDirectDab(context, dab, color);
    context.save();
    context.globalCompositeOperation = dab.composite;
    context.globalAlpha = dab.opacity;
    context.drawImage(stamp.canvas, dab.x - stamp.center, dab.y - stamp.center);
    context.restore();
    return true;
  }

  function ribbonGeometry(from, to) {
    if (typeof ns.ribbonGeometry === 'function') return ns.ribbonGeometry(from, to);
    const radius = Math.max(0.05, (Math.max(0.05, from.radius) + Math.max(0.05, to.radius)) * 0.5);
    const hardness = clamp((Number(from.hardness) + Number(to.hardness)) * 0.5, 0, 1);
    const opacity = clamp((Number(from.opacity) + Number(to.opacity)) * 0.5, 0, 1);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return {
      distance: Math.hypot(dx, dy),
      radius,
      coreRadius: Math.max(0.05, radius * Math.max(0.18, hardness)),
      opacity,
      edgeAlpha: opacity * clamp((1 - hardness) * 0.55, 0, 0.35),
    };
  }

  function ribbonGapLimit(from, to) {
    if (typeof ns.ribbonGapLimit === 'function') return ns.ribbonGapLimit(from, to);
    const radius = Math.max(0.05, Number(from && from.radius) || 0, Number(to && to.radius) || 0);
    const elapsed = Number.isFinite(Number(from && from.time)) && Number.isFinite(Number(to && to.time))
      ? clamp(Number(to.time) - Number(from.time), 0, 250)
      : 0;
    return Math.max(24, radius * 6, elapsed * 2);
  }

  function paintRoundLine(context, from, to, width, alpha, composite, color) {
    if (!(width > 0) || !(alpha > 0)) return;
    totals.ribbonLines++;
    context.save();
    context.globalCompositeOperation = composite;
    context.globalAlpha = clamp(alpha, 0, 1);
    context.strokeStyle = composite === 'destination-out' ? '#000' : color;
    context.lineWidth = Math.max(0.1, width);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }

  function resetCoverage(context) {
    if (context) coverageState.delete(context);
  }

  function paintRibbonDab(context, dab, color) {
    let state = coverageState.get(context);
    if (!state) {
      state = { previous: null };
      coverageState.set(context, state);
    }
    const previous = state.previous;
    const reset = dab.strokeStart || !previous || previous.strokeId !== dab.strokeId
      || previous.brushId !== dab.brushId || previous.composite !== dab.composite || dab.strokeIndex === 0;
    if (reset) {
      paintIsolatedDab(context, dab, color);
      state.previous = dab;
      return true;
    }
    const geometry = ribbonGeometry(previous, dab);
    if (geometry.distance <= 1e-7 || geometry.distance > ribbonGapLimit(previous, dab)) {
      paintIsolatedDab(context, dab, color);
      state.previous = dab;
      return true;
    }
    if (geometry.edgeAlpha > 0.001) {
      paintRoundLine(context, previous, dab, geometry.radius * 2, geometry.edgeAlpha, dab.composite, color);
    }
    paintRoundLine(context, previous, dab, geometry.coreRadius * 2, geometry.opacity, dab.composite, color);
    paintIsolatedDab(context, dab, color);
    state.previous = dab;
    return true;
  }

  function paintRoundDab(context, dab, color) {
    if (!context || !dab) return false;
    if (dab.coverage === 'ribbon') return paintRibbonDab(context, dab, color);
    if (dab.strokeStart || dab.strokeIndex === 0) resetCoverage(context);
    return paintIsolatedDab(context, dab, color);
  }

  ns.paintRoundDab = paintRoundDab;

  const original = {
    begin: adapter.begin,
    move: adapter.move,
    end: adapter.end,
    finishStaleSession: adapter.finishStaleSession,
  };
  let stroke = null;

  function queueSize(value) {
    return value ? value.events.length - value.head : 0;
  }

  function compactQueue(value) {
    const count = queueSize(value);
    if (count <= MAX_QUEUE) return;
    const source = value.events;
    const compacted = [source[value.head]];
    for (let index = value.head + 2; index < source.length - 1; index += 2) compacted.push(source[index]);
    compacted.push(source[source.length - 1]);
    totals.compactedEvents += count - compacted.length;
    value.events = compacted;
    value.head = 0;
  }

  function restoreEnvironment(value) {
    if (!value || !value.env || !value.wrappedRenderLive) return;
    if (value.env.renderLive === value.wrappedRenderLive) value.env.renderLive = value.originalRenderLive;
  }

  function clearStroke(value) {
    if (!value) return;
    cancelFrame(value.raf);
    value.raf = 0;
    value.events.length = 0;
    value.head = 0;
    restoreEnvironment(value);
    if (stroke === value) stroke = null;
  }

  function schedule(value) {
    if (!value || value.raf || value.ending) return;
    value.raf = requestFrame(() => flushFrame(value, false, true));
  }

  function renderLive(value) {
    if (!value || !value.liveDirty || typeof value.originalRenderLive !== 'function') return;
    value.liveDirty = false;
    value.originalRenderLive();
    totals.liveRenders++;
  }

  function flushFrame(value, force, allowLiveRender) {
    if (!value || stroke !== value) return 0;
    value.raf = 0;
    const startedAt = now();
    let processed = 0;
    while (value.head < value.events.length) {
      if (!force && processed >= MAX_EVENTS_PER_FRAME) break;
      if (!force && processed >= 4 && now() - startedAt >= FRAME_BUDGET_MS) break;
      const event = value.events[value.head++];
      original.move.call(adapter, event);
      processed++;
      totals.processedEvents++;
      if (typeof adapter.isActive === 'function' && !adapter.isActive()) break;
    }
    if (value.head >= value.events.length) {
      value.events.length = 0;
      value.head = 0;
    } else if (value.head > 128) {
      value.events = value.events.slice(value.head);
      value.head = 0;
    }
    if (allowLiveRender) renderLive(value);
    totals.frames++;
    if (!force && queueSize(value) && (!adapter.isActive || adapter.isActive())) schedule(value);
    return processed;
  }

  adapter.begin = function(event, env) {
    if (stroke) clearStroke(stroke);
    const value = {
      env,
      events: [],
      head: 0,
      raf: 0,
      liveDirty: false,
      ending: false,
      starting: true,
      originalRenderLive: env && env.renderLive,
      wrappedRenderLive: null,
    };
    if (env && typeof env.renderLive === 'function') {
      value.wrappedRenderLive = function() {
        value.liveDirty = true;
        if (!value.starting && !value.ending) schedule(value);
      };
      env.renderLive = value.wrappedRenderLive;
    }
    stroke = value;
    const handled = original.begin.call(adapter, event, env);
    value.starting = false;
    const active = typeof adapter.isActive !== 'function' || adapter.isActive();
    if (!handled || !active) {
      clearStroke(value);
      return handled;
    }
    renderLive(value);
    return handled;
  };

  adapter.move = function(event) {
    const value = stroke;
    if (!value || !event || (typeof adapter.isActive === 'function' && !adapter.isActive())) {
      return original.move.call(adapter, event);
    }
    if (typeof event.preventDefault === 'function') event.preventDefault();
    value.events.push(event);
    totals.queuedEvents++;
    compactQueue(value);
    schedule(value);
    return true;
  };

  adapter.end = function(event) {
    const value = stroke;
    if (!value) return original.end.call(adapter, event);
    cancelFrame(value.raf);
    value.raf = 0;
    value.ending = true;
    flushFrame(value, true, false);
    const handled = original.end.call(adapter, event);
    clearStroke(value);
    return handled;
  };

  if (typeof original.finishStaleSession === 'function') {
    adapter.finishStaleSession = function(reason) {
      const value = stroke;
      if (value) {
        cancelFrame(value.raf);
        value.raf = 0;
        value.ending = true;
        flushFrame(value, true, false);
      }
      const handled = original.finishStaleSession.call(adapter, reason);
      if (value) clearStroke(value);
      return handled;
    };
  }

  function performanceStats() {
    return Object.freeze(Object.assign({}, totals, {
      installed: true,
      active: !!stroke,
      queued: queueSize(stroke),
      stampCacheSize: stampCache.size,
      maxEventsPerFrame: MAX_EVENTS_PER_FRAME,
      frameBudgetMs: FRAME_BUDGET_MS,
    }));
  }

  adapter.flushPerformanceQueue = () => stroke ? flushFrame(stroke, true, true) : 0;
  adapter.performanceStats = performanceStats;
  adapter.__performanceBudgetInstalled = true;
  root.InkFrameBrushV2Performance = Object.freeze({
    paintRoundDab,
    resetCoverage,
    stats: performanceStats,
    clearStampCache() { stampCache.clear(); },
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = root.InkFrameBrushV2Performance;
})(typeof globalThis !== 'undefined' ? globalThis : this);
