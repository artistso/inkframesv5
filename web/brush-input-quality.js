// InkFrame — Active Brush Input Quality
// -----------------------------------------------------------------------------
// A conservative pre-processor for PointerEvent coalesced samples. The existing
// painter still owns pressure curves, stabilization, dab spacing, rendering,
// undo, and stroke terminals. This layer only removes duplicate micro-samples,
// caps pathological batches, and smooths pressure with velocity-aware response.
// Position samples are never moved, so the artist's line remains 1:1.
'use strict';

(function installInkFrameBrushInputQuality(root, factory){
  const api = factory(root);
  if (root) root.InkFrameBrushInputQuality = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildBrushInputQuality(root){
  const VERSION = 'v1-coalesced-pressure-quality';
  const DEFAULTS = Object.freeze({
    maxBatch: 48,
    dedupeDistance: 0.12,
    pressureEpsilon: 0.004,
    minPressureAlpha: 0.16,
    maxPressureAlpha: 0.72,
    fastSpeed: 1.25,
  });

  const states = new Map();
  const activeTouches = new Set();
  let installed = false;
  let metrics = {
    active: false,
    version: VERSION,
    patchedBatches: 0,
    rawSamples: 0,
    outputSamples: 0,
    duplicatesDropped: 0,
    samplesCapped: 0,
    pressureAdjusted: 0,
    activePointers: 0,
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;

  function createState(){
    return { last: null, pressure: null, lastTime: 0 };
  }

  function copySample(sample, pressure){
    return {
      clientX: finite(sample && sample.clientX, 0),
      clientY: finite(sample && sample.clientY, 0),
      pressure: clamp(finite(pressure, 0.5), 0, 1),
      tiltX: finite(sample && sample.tiltX, 0),
      tiltY: finite(sample && sample.tiltY, 0),
      altitudeAngle: sample && sample.altitudeAngle != null ? finite(sample.altitudeAngle, null) : null,
      azimuthAngle: sample && sample.azimuthAngle != null ? finite(sample.azimuthAngle, null) : null,
      pointerType: (sample && sample.pointerType) || 'mouse',
      pointerId: finite(sample && sample.pointerId, 0),
      timeStamp: finite(sample && sample.timeStamp, 0),
      width: finite(sample && sample.width, 1),
      height: finite(sample && sample.height, 1),
      buttons: finite(sample && sample.buttons, 0),
      button: finite(sample && sample.button, -1),
      tangentialPressure: finite(sample && sample.tangentialPressure, 0),
      twist: finite(sample && sample.twist, 0),
    };
  }

  function selectBatch(samples, maxBatch){
    if (samples.length <= maxBatch) return samples.slice();
    const out = [];
    const last = samples.length - 1;
    for (let i = 0; i < maxBatch; i++) {
      const index = Math.round((i / Math.max(1, maxBatch - 1)) * last);
      if (out[out.length - 1] !== samples[index]) out.push(samples[index]);
    }
    if (out[out.length - 1] !== samples[last]) out[out.length - 1] = samples[last];
    return out;
  }

  function qualityBatch(rawSamples, state, options){
    const opts = { ...DEFAULTS, ...(options || {}) };
    const st = state || createState();
    const input = Array.isArray(rawSamples) ? rawSamples.filter(Boolean) : [];
    if (!input.length) return { samples: [], state: st, stats: { raw: 0, output: 0, dropped: 0, capped: 0, pressureAdjusted: 0 } };

    const maxBatch = Math.max(2, Math.round(finite(opts.maxBatch, DEFAULTS.maxBatch)));
    const selected = selectBatch(input, maxBatch);
    const capped = Math.max(0, input.length - selected.length);
    const output = [];
    let dropped = 0;
    let pressureAdjusted = 0;

    for (let i = 0; i < selected.length; i++) {
      const sample = selected[i];
      const x = finite(sample.clientX, st.last ? st.last.clientX : 0);
      const y = finite(sample.clientY, st.last ? st.last.clientY : 0);
      const time = finite(sample.timeStamp, st.lastTime || i);
      const rawPressure = clamp(finite(sample.pressure, st.pressure == null ? 0.5 : st.pressure), 0, 1);

      const previous = st.last;
      const dist = previous ? Math.hypot(x - previous.clientX, y - previous.clientY) : Infinity;
      const dt = previous ? Math.max(1, time - st.lastTime) : 1;
      const pressureDelta = st.pressure == null ? Infinity : Math.abs(rawPressure - st.pressure);
      const isLast = i === selected.length - 1;

      if (!isLast && previous && dist < opts.dedupeDistance && pressureDelta < opts.pressureEpsilon) {
        dropped++;
        continue;
      }

      const speed = previous ? dist / dt : opts.fastSpeed;
      const speedUnit = clamp(speed / Math.max(0.01, opts.fastSpeed), 0, 1);
      const alpha = opts.minPressureAlpha + (opts.maxPressureAlpha - opts.minPressureAlpha) * speedUnit;
      const nextPressure = st.pressure == null ? rawPressure : st.pressure + (rawPressure - st.pressure) * clamp(alpha, 0.01, 1);
      if (Math.abs(nextPressure - rawPressure) > 0.0005) pressureAdjusted++;

      const copied = copySample({ ...sample, clientX: x, clientY: y, timeStamp: time }, nextPressure);
      output.push(copied);
      st.last = copied;
      st.pressure = nextPressure;
      st.lastTime = time;
    }

    // Never starve the painter. If every non-terminal sample was duplicate noise,
    // preserve the latest physical sample as the batch endpoint.
    if (!output.length) {
      const last = input[input.length - 1];
      const rawPressure = clamp(finite(last.pressure, st.pressure == null ? 0.5 : st.pressure), 0, 1);
      const copied = copySample(last, rawPressure);
      output.push(copied);
      st.last = copied;
      st.pressure = rawPressure;
      st.lastTime = copied.timeStamp;
    }

    return {
      samples: output,
      state: st,
      stats: { raw: input.length, output: output.length, dropped, capped, pressureAdjusted },
    };
  }

  function stateFor(pointerId){
    const id = finite(pointerId, 0);
    let state = states.get(id);
    if (!state) { state = createState(); states.set(id, state); }
    return state;
  }

  function resetPointer(pointerId){
    states.delete(finite(pointerId, 0));
  }

  function updateMetrics(stats){
    metrics.patchedBatches++;
    metrics.rawSamples += stats.raw;
    metrics.outputSamples += stats.output;
    metrics.duplicatesDropped += stats.dropped;
    metrics.samplesCapped += stats.capped;
    metrics.pressureAdjusted += stats.pressureAdjusted;
    metrics.activePointers = states.size;
    root.__inkframeBrushInputQualityMetrics = { ...metrics };
  }

  function patchMoveEvent(event){
    if (!event || !event.target || event.target.id !== 'c') return;
    if (event.pointerType === 'touch' && activeTouches.size >= 2) return;
    if (event.pointerType === 'mouse' && !(event.buttons & 1)) return;

    let raw = [event];
    try {
      const nativeGetter = event.getCoalescedEvents;
      if (typeof nativeGetter === 'function') {
        const got = nativeGetter.call(event);
        if (Array.isArray(got) && got.length) raw = got;
      }
    } catch (_) {}

    const result = qualityBatch(raw, stateFor(event.pointerId));
    try {
      Object.defineProperty(event, 'getCoalescedEvents', {
        configurable: true,
        value: () => result.samples,
      });
      updateMetrics(result.stats);
    } catch (_) {
      // Some WebViews expose a non-extensible event object. The painter receives
      // the native samples unchanged; never block drawing because an optimization
      // could not be installed.
    }
  }

  function install(){
    if (installed || typeof document === 'undefined') return metrics;
    const stage = document.getElementById('stage');
    const canvas = document.getElementById('c');
    if (!stage || !canvas) return metrics;
    installed = true;
    metrics.active = true;

    stage.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') activeTouches.add(event.pointerId);
      if (event.target === canvas) resetPointer(event.pointerId);
      metrics.activePointers = states.size;
    }, true);
    stage.addEventListener('pointermove', patchMoveEvent, true);
    const end = event => {
      if (event.pointerType === 'touch') activeTouches.delete(event.pointerId);
      resetPointer(event.pointerId);
      metrics.activePointers = states.size;
      root.__inkframeBrushInputQualityMetrics = { ...metrics };
    };
    stage.addEventListener('pointerup', end, true);
    stage.addEventListener('pointercancel', end, true);
    root.__inkframeBrushInputQualityMetrics = { ...metrics };
    return metrics;
  }

  function reportLines(){
    const m = metrics;
    return [
      'Brush Input Quality: ' + (m.active ? 'active' : 'inactive'),
      'Brush Input Quality version: ' + VERSION,
      'Brush Input patched batches: ' + m.patchedBatches,
      'Brush Input raw samples: ' + m.rawSamples,
      'Brush Input output samples: ' + m.outputSamples,
      'Brush Input duplicates dropped: ' + m.duplicatesDropped,
      'Brush Input samples capped: ' + m.samplesCapped,
      'Brush Input pressure adjusted: ' + m.pressureAdjusted,
    ];
  }

  const api = {
    VERSION,
    DEFAULTS,
    createState,
    qualityBatch,
    install,
    resetPointer,
    metrics(){ return { ...metrics }; },
    reportLines,
  };

  if (typeof document !== 'undefined') {
    const boot = () => install();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
  return api;
});
