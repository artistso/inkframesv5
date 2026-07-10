// InkFrame — Active Brush Input Quality v3
// -----------------------------------------------------------------------------
// Conservative coalesced-sample cleanup in front of the existing painter.
// Position is never altered. Native PointerEvent fields are copied explicitly
// so inherited S Pen pressure, tilt, azimuth, barrel, and contact properties are
// preserved even though they are not enumerable on browser event objects.
'use strict';

(function installInkFrameBrushInputQuality(root, factory){
  const api = factory(root);
  if (root) root.InkFrameBrushInputQuality = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildBrushInputQuality(root){
  const VERSION = 'v3-orientation-responsive';
  const DEFAULTS = Object.freeze({
    maxBatch: 48,
    dedupeDistance: 0.12,
    pressureEpsilon: 0.004,
    minPressureAlpha: 0.16,
    maxPressureAlpha: 0.72,
    endpointPressureAlpha: 0.55,
    fastSpeed: 1.25,
    tiltEpsilon: 0.5,
    angleEpsilon: 0.005,
  });

  const states = new Map();
  const activeTouches = new Set();
  let installed = false;
  let metrics = {
    active:false, version:VERSION, patchedBatches:0, rawSamples:0,
    outputSamples:0, duplicatesDropped:0, samplesCapped:0,
    pressureAdjusted:0, nativeFieldsPreserved:0, reorderedSamples:0,
    nativeChangesKept:0, hoverSkipped:0, streamResets:0, activePointers:0,
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const optional = v => v == null ? null : finite(v, null);

  function createState(){ return { last:null, pressure:null, lastTime:0 }; }
  function clearState(state){ state.last=null; state.pressure=null; state.lastTime=0; return state; }

  function copyNativeSample(sample, pressure, x, y, timeStamp){
    const copied = {
      clientX: finite(x, finite(sample && sample.clientX, 0)),
      clientY: finite(y, finite(sample && sample.clientY, 0)),
      pressure: clamp(finite(pressure, 0.5), 0, 1),
      tiltX: finite(sample && sample.tiltX, 0),
      tiltY: finite(sample && sample.tiltY, 0),
      altitudeAngle: optional(sample && sample.altitudeAngle),
      azimuthAngle: optional(sample && sample.azimuthAngle),
      pointerType: (sample && sample.pointerType) || 'mouse',
      pointerId: finite(sample && sample.pointerId, 0),
      timeStamp: finite(timeStamp, finite(sample && sample.timeStamp, 0)),
      width: finite(sample && sample.width, 1),
      height: finite(sample && sample.height, 1),
      buttons: finite(sample && sample.buttons, 0),
      button: finite(sample && sample.button, -1),
      tangentialPressure: finite(sample && sample.tangentialPressure, 0),
      twist: finite(sample && sample.twist, 0),
      isPrimary: sample && sample.isPrimary !== false,
    };
    return copied;
  }

  function orderedBatch(samples){
    const tagged = samples.map((sample,index)=>({ sample, index, time:finite(sample && sample.timeStamp,index) }));
    let ordered = true;
    for(let i=1;i<tagged.length;i++) if(tagged[i].time < tagged[i-1].time){ ordered=false; break; }
    if(ordered) return { samples:samples.slice(), reordered:0 };
    tagged.sort((a,b)=>a.time-b.time || a.index-b.index);
    let reordered=0;
    tagged.forEach((entry,index)=>{ if(entry.index!==index) reordered++; });
    return { samples:tagged.map(entry=>entry.sample), reordered };
  }

  function selectBatch(samples, maxBatch){
    if (samples.length <= maxBatch) return samples.slice();
    const out = [], last = samples.length - 1;
    for (let i=0; i<maxBatch; i++) {
      const index = Math.round((i / Math.max(1, maxBatch - 1)) * last);
      if (out[out.length - 1] !== samples[index]) out.push(samples[index]);
    }
    if (out[out.length - 1] !== samples[last]) out[out.length - 1] = samples[last];
    return out;
  }

  function nativeChanged(sample, previous, options){
    if(!previous) return false;
    const opts=options || DEFAULTS;
    const changed =
      finite(sample && sample.buttons,0) !== finite(previous.buttons,0) ||
      finite(sample && sample.button,-1) !== finite(previous.button,-1) ||
      Math.abs(finite(sample && sample.tiltX,0)-finite(previous.tiltX,0)) >= opts.tiltEpsilon ||
      Math.abs(finite(sample && sample.tiltY,0)-finite(previous.tiltY,0)) >= opts.tiltEpsilon ||
      Math.abs(finite(sample && sample.twist,0)-finite(previous.twist,0)) >= opts.tiltEpsilon ||
      Math.abs(finite(sample && sample.tangentialPressure,0)-finite(previous.tangentialPressure,0)) >= opts.pressureEpsilon;
    if(changed) return true;
    const altitude=optional(sample && sample.altitudeAngle), prevAltitude=optional(previous.altitudeAngle);
    const azimuth=optional(sample && sample.azimuthAngle), prevAzimuth=optional(previous.azimuthAngle);
    return (altitude!=null && prevAltitude!=null && Math.abs(altitude-prevAltitude)>=opts.angleEpsilon) ||
      (azimuth!=null && prevAzimuth!=null && Math.abs(azimuth-prevAzimuth)>=opts.angleEpsilon);
  }

  function qualityBatch(rawSamples, state, options){
    const opts = { ...DEFAULTS, ...(options || {}) };
    const st = state || createState();
    const input = Array.isArray(rawSamples) ? rawSamples.filter(Boolean) : [];
    if (!input.length) return { samples:[], state:st, stats:{raw:0,output:0,dropped:0,capped:0,pressureAdjusted:0,nativeFieldsPreserved:0,reordered:0,nativeChangesKept:0,streamResets:0} };

    const ordered = orderedBatch(input);
    const maxBatch = Math.max(2, Math.round(finite(opts.maxBatch, DEFAULTS.maxBatch)));
    const selected = selectBatch(ordered.samples, maxBatch);
    const output = [];
    let dropped = 0, pressureAdjusted = 0, nativeFieldsPreserved = 0, nativeChangesKept=0, streamResets=0;

    const firstTime=finite(selected[0] && selected[0].timeStamp,0);
    if(st.last && firstTime + 1 < st.lastTime){ clearState(st); streamResets++; }

    for (let i=0; i<selected.length; i++) {
      const sample = selected[i];
      const x = finite(sample.clientX, st.last ? st.last.clientX : 0);
      const y = finite(sample.clientY, st.last ? st.last.clientY : 0);
      const time = finite(sample.timeStamp, st.lastTime || i);
      const rawPressure = clamp(finite(sample.pressure, st.pressure == null ? 0.5 : st.pressure), 0, 1);
      const previous = st.last;
      const dist = previous ? Math.hypot(x-previous.clientX, y-previous.clientY) : Infinity;
      const dt = previous ? Math.max(1, time-st.lastTime) : 1;
      const pressureDelta = st.pressure == null ? Infinity : Math.abs(rawPressure-st.pressure);
      const isLast = i === selected.length-1;
      const changedNative = nativeChanged(sample,previous,opts);

      if (!isLast && previous && dist < opts.dedupeDistance && pressureDelta < opts.pressureEpsilon && !changedNative) {
        dropped++;
        continue;
      }
      if(previous && dist < opts.dedupeDistance && changedNative) nativeChangesKept++;

      const speed = previous ? dist/dt : opts.fastSpeed;
      const speedUnit = clamp(speed/Math.max(0.01, opts.fastSpeed), 0, 1);
      let alpha = clamp(opts.minPressureAlpha + (opts.maxPressureAlpha-opts.minPressureAlpha)*speedUnit, 0.01, 1);
      if(isLast) alpha=Math.max(alpha,clamp(opts.endpointPressureAlpha,0.01,1));
      const nextPressure = st.pressure == null ? rawPressure : st.pressure + (rawPressure-st.pressure)*alpha;
      if (Math.abs(nextPressure-rawPressure) > 0.0005) pressureAdjusted++;

      const copied = copyNativeSample(sample, nextPressure, x, y, time);
      if (copied.pointerType==='pen' && (copied.tiltX || copied.tiltY || copied.altitudeAngle!=null || copied.azimuthAngle!=null || copied.buttons>1)) nativeFieldsPreserved++;
      output.push(copied);
      st.last = copied;
      st.pressure = nextPressure;
      st.lastTime = time;
    }

    if (!output.length) {
      const last = ordered.samples[ordered.samples.length-1];
      const p = clamp(finite(last.pressure, st.pressure == null ? 0.5 : st.pressure), 0, 1);
      const copied = copyNativeSample(last, p);
      output.push(copied);
      st.last = copied; st.pressure = p; st.lastTime = copied.timeStamp;
    }

    return {
      samples:output,
      state:st,
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
      },
    };
  }

  function stateFor(pointerId){
    const id = finite(pointerId,0);
    let state = states.get(id);
    if (!state) { state=createState(); states.set(id,state); }
    return state;
  }
  function resetPointer(pointerId){ states.delete(finite(pointerId,0)); }

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
    metrics.activePointers = states.size;
    root.__inkframeBrushInputQualityMetrics = { ...metrics };
  }

  function patchMoveEvent(event){
    if (!event || !event.target || event.target.id!=='c') return;
    if (event.pointerType==='touch' && activeTouches.size>=2) return;
    if (event.pointerType==='mouse' && !(event.buttons&1)) return;
    if (event.pointerType==='pen' && !(event.buttons&1) && finite(event.pressure,0)===0) {
      metrics.hoverSkipped++;
      root.__inkframeBrushInputQualityMetrics={...metrics};
      return;
    }

    let raw=[event];
    try {
      const getter=event.getCoalescedEvents;
      if (typeof getter==='function') {
        const got=getter.call(event);
        if (Array.isArray(got) && got.length) raw=got;
      }
    } catch (_) {}

    const result=qualityBatch(raw,stateFor(event.pointerId));
    try {
      Object.defineProperty(event,'getCoalescedEvents',{configurable:true,value:()=>result.samples});
      updateMetrics(result.stats);
    } catch (_) {}
  }

  function install(){
    if (installed || typeof document==='undefined') return { ...metrics };
    const stage=document.getElementById('stage'), canvas=document.getElementById('c');
    if (!stage || !canvas) return { ...metrics };
    installed=true; metrics.active=true;

    stage.addEventListener('pointerdown',event=>{
      if (event.pointerType==='touch') activeTouches.add(event.pointerId);
      if (event.target===canvas) resetPointer(event.pointerId);
    },true);
    stage.addEventListener('pointermove',patchMoveEvent,true);
    const end=event=>{
      if (event.pointerType==='touch') activeTouches.delete(event.pointerId);
      resetPointer(event.pointerId);
      metrics.activePointers=states.size;
      root.__inkframeBrushInputQualityMetrics={...metrics};
    };
    stage.addEventListener('pointerup',end,true);
    stage.addEventListener('pointercancel',end,true);
    root.__inkframeBrushInputQualityMetrics={...metrics};
    return { ...metrics };
  }

  function reportLines(){
    const m=metrics;
    return [
      'Brush Input Quality: '+(m.active?'active':'inactive'),
      'Brush Input Quality version: '+VERSION,
      'Brush Input patched batches: '+m.patchedBatches,
      'Brush Input raw samples: '+m.rawSamples,
      'Brush Input output samples: '+m.outputSamples,
      'Brush Input duplicates dropped: '+m.duplicatesDropped,
      'Brush Input samples capped: '+m.samplesCapped,
      'Brush Input pressure adjusted: '+m.pressureAdjusted,
      'Brush Input native fields preserved: '+m.nativeFieldsPreserved,
      'Brush Input reordered samples: '+m.reorderedSamples,
      'Brush Input native changes kept: '+m.nativeChangesKept,
      'Brush Input hover skipped: '+m.hoverSkipped,
      'Brush Input stream resets: '+m.streamResets,
    ];
  }

  const api={VERSION,DEFAULTS,createState,copyNativeSample,orderedBatch,nativeChanged,qualityBatch,install,resetPointer,metrics(){return {...metrics};},reportLines};
  if (typeof document!=='undefined') {
    const boot=()=>install();
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
    else boot();
  }
  return api;
});