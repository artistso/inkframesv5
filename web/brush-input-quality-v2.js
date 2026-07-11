// InkFrame — Active Brush Input Quality v5
// -----------------------------------------------------------------------------
// Conservative coalesced-sample cleanup in front of the existing painter.
// Position is never altered. Native PointerEvent fields are copied explicitly so
// inherited S Pen pressure, tilt, azimuth, barrel, and contact properties survive.
'use strict';

(function installInkFrameBrushInputQuality(root, factory){
  const api = factory(root);
  if (root) root.InkFrameBrushInputQuality = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildBrushInputQuality(root){
  const VERSION = 'v5-hover-floor-calibration';
  const DEFAULTS = Object.freeze({
    maxBatch:48,
    dedupeDistance:0.12,
    pressureEpsilon:0.004,
    minPressureAlpha:0.16,
    maxPressureAlpha:0.72,
    endpointPressureAlpha:0.55,
    intentionalPressureAlpha:0.82,
    pressureIntentThreshold:0.08,
    fastSpeed:1.25,
    tiltEpsilon:0.5,
    angleEpsilon:0.005,
    pressureFloor:0,
    maxPressureFloor:0.12,
  });

  const states = new Map();
  const activeTouches = new Set();
  const activePens = new Set();
  let installed = false;
  let hoverPressureFloor = 0;
  let hoverSampleCount = 0;

  let metrics = {
    active:false,
    version:VERSION,
    patchedBatches:0,
    rawSamples:0,
    outputSamples:0,
    duplicatesDropped:0,
    samplesCapped:0,
    pressureAdjusted:0,
    nativeFieldsPreserved:0,
    reorderedSamples:0,
    nativeChangesKept:0,
    hoverSkipped:0,
    streamResets:0,
    activePointers:0,
    hoverFloor:0,
    hoverFloorSamples:0,
    calibratedSamples:0,
    intentionalPressureBoosts:0,
  };

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const optional = value => value == null ? null : finite(value, null);

  function createState(){
    return { last:null, pressure:null, lastTime:0 };
  }

  function clearState(state){
    state.last = null;
    state.pressure = null;
    state.lastTime = 0;
    return state;
  }

  function normalizePressure(rawPressure, floor, maxFloor){
    const raw = clamp(finite(rawPressure, 0), 0, 1);
    const safeFloor = clamp(finite(floor, 0), 0, finite(maxFloor, DEFAULTS.maxPressureFloor));
    if (safeFloor <= 0) return raw;
    if (raw <= safeFloor) return 0;
    return clamp((raw-safeFloor)/Math.max(0.0001, 1-safeFloor), 0, 1);
  }

  function learnHoverPressure(rawPressure, options){
    const opts = { ...DEFAULTS, ...(options || {}) };
    const sample = clamp(finite(rawPressure, 0), 0, opts.maxPressureFloor);
    hoverSampleCount++;
    if (hoverSampleCount === 1) hoverPressureFloor = sample;
    else hoverPressureFloor = hoverPressureFloor*0.85 + sample*0.15;
    if (hoverSampleCount >= 4 && hoverPressureFloor < 0.0015) hoverPressureFloor = 0;
    metrics.hoverFloor = hoverPressureFloor;
    metrics.hoverFloorSamples = hoverSampleCount;
    root.__inkframeBrushInputQualityMetrics = { ...metrics };
    return hoverPressureFloor;
  }

  function copyNativeSample(sample, pressure, x, y, timeStamp){
    return {
      clientX:finite(x, finite(sample && sample.clientX, 0)),
      clientY:finite(y, finite(sample && sample.clientY, 0)),
      pressure:clamp(finite(pressure, 0.5), 0, 1),
      tiltX:finite(sample && sample.tiltX, 0),
      tiltY:finite(sample && sample.tiltY, 0),
      altitudeAngle:optional(sample && sample.altitudeAngle),
      azimuthAngle:optional(sample && sample.azimuthAngle),
      pointerType:(sample && sample.pointerType) || 'mouse',
      pointerId:finite(sample && sample.pointerId, 0),
      timeStamp:finite(timeStamp, finite(sample && sample.timeStamp, 0)),
      width:finite(sample && sample.width, 1),
      height:finite(sample && sample.height, 1),
      buttons:finite(sample && sample.buttons, 0),
      button:finite(sample && sample.button, -1),
      tangentialPressure:finite(sample && sample.tangentialPressure, 0),
      twist:finite(sample && sample.twist, 0),
      isPrimary:sample && sample.isPrimary !== false,
    };
  }

  function orderedBatch(samples){
    const tagged = samples.map((sample,index) => ({
      sample,
      index,
      time:finite(sample && sample.timeStamp, index),
    }));
    let ordered = true;
    for (let i=1; i<tagged.length; i++) {
      if (tagged[i].time < tagged[i-1].time) {
        ordered = false;
        break;
      }
    }
    if (ordered) return { samples:samples.slice(), reordered:0 };
    tagged.sort((a,b) => a.time-b.time || a.index-b.index);
    let reordered = 0;
    tagged.forEach((entry,index) => {
      if (entry.index !== index) reordered++;
    });
    return { samples:tagged.map(entry => entry.sample), reordered };
  }

  function selectBatch(samples, maxBatch){
    if (samples.length <= maxBatch) return samples.slice();
    const output = [];
    const last = samples.length-1;
    for (let i=0; i<maxBatch; i++) {
      const index = Math.round((i/Math.max(1,maxBatch-1))*last);
      if (output[output.length-1] !== samples[index]) output.push(samples[index]);
    }
    if (output[output.length-1] !== samples[last]) output[output.length-1] = samples[last];
    return output;
  }

  function nativeChanged(sample, previous, options){
    if (!previous) return false;
    const opts = options || DEFAULTS;
    const changed =
      finite(sample && sample.buttons, 0) !== finite(previous.buttons, 0) ||
      finite(sample && sample.button, -1) !== finite(previous.button, -1) ||
      Math.abs(finite(sample && sample.tiltX, 0)-finite(previous.tiltX, 0)) >= opts.tiltEpsilon ||
      Math.abs(finite(sample && sample.tiltY, 0)-finite(previous.tiltY, 0)) >= opts.tiltEpsilon ||
      Math.abs(finite(sample && sample.twist, 0)-finite(previous.twist, 0)) >= opts.tiltEpsilon ||
      Math.abs(finite(sample && sample.tangentialPressure, 0)-finite(previous.tangentialPressure, 0)) >= opts.pressureEpsilon;
    if (changed) return true;

    const altitude = optional(sample && sample.altitudeAngle);
    const previousAltitude = optional(previous.altitudeAngle);
    const azimuth = optional(sample && sample.azimuthAngle);
    const previousAzimuth = optional(previous.azimuthAngle);
    return (
      altitude != null && previousAltitude != null &&
      Math.abs(altitude-previousAltitude) >= opts.angleEpsilon
    ) || (
      azimuth != null && previousAzimuth != null &&
      Math.abs(azimuth-previousAzimuth) >= opts.angleEpsilon
    );
  }

  function qualityBatch(rawSamples, state, options){
    const opts = { ...DEFAULTS, ...(options || {}) };
    const currentState = state || createState();
    const input = Array.isArray(rawSamples) ? rawSamples.filter(Boolean) : [];
    if (!input.length) {
      return {
        samples:[],
        state:currentState,
        stats:{
          raw:0, output:0, dropped:0, capped:0, pressureAdjusted:0,
          nativeFieldsPreserved:0, reordered:0, nativeChangesKept:0,
          streamResets:0, calibrated:0, intentionalBoosts:0,
        },
      };
    }

    const ordered = orderedBatch(input);
    const maxBatch = Math.max(2, Math.round(finite(opts.maxBatch, DEFAULTS.maxBatch)));
    const selected = selectBatch(ordered.samples, maxBatch);
    const output = [];
    let dropped = 0;
    let pressureAdjusted = 0;
    let nativeFieldsPreserved = 0;
    let nativeChangesKept = 0;
    let streamResets = 0;
    let calibrated = 0;
    let intentionalBoosts = 0;

    const firstTime = finite(selected[0] && selected[0].timeStamp, 0);
    if (currentState.last && firstTime+1 < currentState.lastTime) {
      clearState(currentState);
      streamResets++;
    }

    for (let index=0; index<selected.length; index++) {
      const sample = selected[index];
      const x = finite(sample.clientX, currentState.last ? currentState.last.clientX : 0);
      const y = finite(sample.clientY, currentState.last ? currentState.last.clientY : 0);
      const time = finite(sample.timeStamp, currentState.lastTime || index);
      const sourcePressure = clamp(
        finite(sample.pressure, currentState.pressure == null ? 0.5 : currentState.pressure),
        0,
        1
      );
      const rawPressure = normalizePressure(sourcePressure, opts.pressureFloor, opts.maxPressureFloor);
      if (Math.abs(rawPressure-sourcePressure) > 0.0005) calibrated++;

      const previous = currentState.last;
      const travel = previous ? Math.hypot(x-previous.clientX, y-previous.clientY) : Infinity;
      const elapsed = previous ? Math.max(1, time-currentState.lastTime) : 1;
      const pressureDelta = currentState.pressure == null
        ? Infinity
        : Math.abs(rawPressure-currentState.pressure);
      const isLast = index === selected.length-1;
      const changedNative = nativeChanged(sample, previous, opts);

      if (!isLast && previous &&
          travel < opts.dedupeDistance &&
          pressureDelta < opts.pressureEpsilon &&
          !changedNative) {
        dropped++;
        continue;
      }
      if (previous && travel < opts.dedupeDistance && changedNative) nativeChangesKept++;

      const speed = previous ? travel/elapsed : opts.fastSpeed;
      const speedUnit = clamp(speed/Math.max(0.01,opts.fastSpeed), 0, 1);
      let alpha = clamp(
        opts.minPressureAlpha +
        (opts.maxPressureAlpha-opts.minPressureAlpha)*speedUnit,
        0.01,
        1
      );
      if (isLast) alpha = Math.max(alpha, clamp(opts.endpointPressureAlpha, 0.01, 1));
      if (previous && pressureDelta >= opts.pressureIntentThreshold) {
        const boosted = clamp(opts.intentionalPressureAlpha, 0.01, 1);
        if (boosted > alpha) {
          alpha = boosted;
          intentionalBoosts++;
        }
      }

      const nextPressure = currentState.pressure == null
        ? rawPressure
        : currentState.pressure + (rawPressure-currentState.pressure)*alpha;
      if (Math.abs(nextPressure-rawPressure) > 0.0005) pressureAdjusted++;

      const copied = copyNativeSample(sample, nextPressure, x, y, time);
      if (copied.pointerType === 'pen' && (
        copied.tiltX || copied.tiltY ||
        copied.altitudeAngle != null || copied.azimuthAngle != null ||
        copied.buttons > 1
      )) {
        nativeFieldsPreserved++;
      }
      output.push(copied);
      currentState.last = copied;
      currentState.pressure = nextPressure;
      currentState.lastTime = time;
    }

    if (!output.length) {
      const last = ordered.samples[ordered.samples.length-1];
      const sourcePressure = clamp(
        finite(last.pressure, currentState.pressure == null ? 0.5 : currentState.pressure),
        0,
        1
      );
      const pressure = normalizePressure(sourcePressure, opts.pressureFloor, opts.maxPressureFloor);
      const copied = copyNativeSample(last, pressure);
      output.push(copied);
      currentState.last = copied;
      currentState.pressure = pressure;
      currentState.lastTime = copied.timeStamp;
    }

    return {
      samples:output,
      state:currentState,
      stats:{
        raw:input.length,
        output:output.length,
        dropped,
        capped:Math.max(0,input.length-selected.length),
        pressureAdjusted,
        nativeFieldsPreserved,
        reordered:ordered.reordered,
        nativeChangesKept,
        streamResets,
        calibrated,
        intentionalBoosts,
      },
    };
  }

  function stateFor(pointerId){
    const id = finite(pointerId, 0);
    let state = states.get(id);
    if (!state) {
      state = createState();
      states.set(id, state);
    }
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
    metrics.nativeFieldsPreserved += stats.nativeFieldsPreserved;
    metrics.reorderedSamples += stats.reordered || 0;
    metrics.nativeChangesKept += stats.nativeChangesKept || 0;
    metrics.streamResets += stats.streamResets || 0;
    metrics.calibratedSamples += stats.calibrated || 0;
    metrics.intentionalPressureBoosts += stats.intentionalBoosts || 0;
    metrics.activePointers = states.size;
    metrics.hoverFloor = hoverPressureFloor;
    metrics.hoverFloorSamples = hoverSampleCount;
    root.__inkframeBrushInputQualityMetrics = { ...metrics };
  }

  function patchMoveEvent(event){
    if (!event || !event.target || event.target.id !== 'c') return;
    if (event.pointerType === 'touch' && activeTouches.size >= 2) return;
    if (event.pointerType === 'mouse' && !(event.buttons&1)) return;

    if (event.pointerType === 'pen' && !activePens.has(event.pointerId)) {
      learnHoverPressure(event.pressure);
      metrics.hoverSkipped++;
      root.__inkframeBrushInputQualityMetrics = { ...metrics };
      return;
    }

    let raw = [event];
    try {
      const getter = event.getCoalescedEvents;
      if (typeof getter === 'function') {
        const got = getter.call(event);
        if (Array.isArray(got) && got.length) raw = got;
      }
    } catch (_) {}

    const result = qualityBatch(raw, stateFor(event.pointerId), {
      pressureFloor:hoverSampleCount >= 4 ? hoverPressureFloor : 0,
    });
    try {
      Object.defineProperty(event, 'getCoalescedEvents', {
        configurable:true,
        value:() => result.samples,
      });
      updateMetrics(result.stats);
    } catch (_) {}
  }

  function install(){
    if (installed || typeof document === 'undefined') return { ...metrics };
    const stage = document.getElementById('stage');
    const canvas = document.getElementById('c');
    if (!stage || !canvas) return { ...metrics };

    installed = true;
    metrics.active = true;

    stage.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') activeTouches.add(event.pointerId);
      if (event.pointerType === 'pen') activePens.add(event.pointerId);
      if (event.target === canvas) resetPointer(event.pointerId);
    }, true);

    stage.addEventListener('pointermove', patchMoveEvent, true);

    const end = event => {
      if (event.pointerType === 'touch') activeTouches.delete(event.pointerId);
      if (event.pointerType === 'pen') activePens.delete(event.pointerId);
      resetPointer(event.pointerId);
      metrics.activePointers = states.size;
      root.__inkframeBrushInputQualityMetrics = { ...metrics };
    };
    stage.addEventListener('pointerup', end, true);
    stage.addEventListener('pointercancel', end, true);

    root.__inkframeBrushInputQualityMetrics = { ...metrics };
    return { ...metrics };
  }

  function reportLines(){
    const current = metrics;
    return [
      'Brush Input Quality: ' + (current.active ? 'active' : 'inactive'),
      'Brush Input Quality version: ' + VERSION,
      'Brush Input patched batches: ' + current.patchedBatches,
      'Brush Input raw samples: ' + current.rawSamples,
      'Brush Input output samples: ' + current.outputSamples,
      'Brush Input duplicates dropped: ' + current.duplicatesDropped,
      'Brush Input samples capped: ' + current.samplesCapped,
      'Brush Input pressure adjusted: ' + current.pressureAdjusted,
      'Brush Input native fields preserved: ' + current.nativeFieldsPreserved,
      'Brush Input reordered samples: ' + current.reorderedSamples,
      'Brush Input native changes kept: ' + current.nativeChangesKept,
      'Brush Input hover skipped: ' + current.hoverSkipped,
      'Brush Input hover floor: ' + current.hoverFloor.toFixed(4),
      'Brush Input hover floor samples: ' + current.hoverFloorSamples,
      'Brush Input calibrated samples: ' + current.calibratedSamples,
      'Brush Input intentional boosts: ' + current.intentionalPressureBoosts,
      'Brush Input stream resets: ' + current.streamResets,
    ];
  }

  const api = {
    VERSION,
    DEFAULTS,
    createState,
    clearState,
    normalizePressure,
    learnHoverPressure,
    copyNativeSample,
    orderedBatch,
    nativeChanged,
    qualityBatch,
    install,
    resetPointer,
    metrics(){ return { ...metrics }; },
    reportLines,
  };

  if (typeof document !== 'undefined') {
    const boot = () => install();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once:true });
    } else {
      boot();
    }
  }
  return api;
});