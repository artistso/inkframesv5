// InkFrame Brush Engine V2 — deterministic coalesced pointer-event normalization
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});

  function createInputBatchNormalizer(options) {
    const config = Object.assign({
      pointerId: null,
      pointerType: 'pen',
      timestampTolerance: 0.25,
      coordinateEpsilon: 1e-4,
      pressureEpsilon: 1e-5,
      maxBatchSize: 256,
    }, options || {});

    let lastSample = null;
    let lastTime = -Infinity;
    const totals = {
      batches: 0,
      rawEvents: 0,
      emitted: 0,
      duplicates: 0,
      stale: 0,
      invalid: 0,
      foreignPointer: 0,
      foreignType: 0,
      reorderedBatches: 0,
      parentAppended: 0,
      capped: 0,
    };

    const finite = value => Number.isFinite(Number(value));

    function sameSample(a, b) {
      if (!a || !b) return false;
      return Math.abs(a.time - b.time) <= config.timestampTolerance
        && Math.abs(a.x - b.x) <= config.coordinateEpsilon
        && Math.abs(a.y - b.y) <= config.coordinateEpsilon
        && Math.abs(a.pressure - b.pressure) <= config.pressureEpsilon
        && Math.abs(a.tiltX - b.tiltX) <= config.coordinateEpsilon
        && Math.abs(a.tiltY - b.tiltY) <= config.coordinateEpsilon;
    }

    function belongs(raw, parent) {
      const expectedId = config.pointerId != null ? Number(config.pointerId) : Number(parent && parent.pointerId);
      if (raw && raw.pointerId != null && finite(raw.pointerId)
        && finite(expectedId) && Number(raw.pointerId) !== expectedId) {
        totals.foreignPointer++;
        return false;
      }
      const expectedType = String(config.pointerType || (parent && parent.pointerType) || 'pen');
      if (raw && raw.pointerType && String(raw.pointerType) !== expectedType) {
        totals.foreignType++;
        return false;
      }
      return true;
    }

    function rawEquivalent(a, b) {
      if (!a || !b) return false;
      return Number(a.timeStamp) === Number(b.timeStamp)
        && Number(a.clientX) === Number(b.clientX)
        && Number(a.clientY) === Number(b.clientY)
        && Number(a.pressure || 0) === Number(b.pressure || 0)
        && Number(a.pointerId) === Number(b.pointerId);
    }

    function collectRaw(event) {
      let list = [];
      try {
        if (event && typeof event.getCoalescedEvents === 'function') {
          list = Array.from(event.getCoalescedEvents() || []);
        }
      } catch (_) {}
      if (!list.length) return event ? [event] : [];
      const tail = list[list.length - 1];
      if (event && tail !== event && !rawEquivalent(tail, event)) {
        list.push(event);
        totals.parentAppended++;
      }
      return list;
    }

    function seed(sample) {
      lastSample = sample || null;
      lastTime = sample && finite(sample.time) ? Number(sample.time) : -Infinity;
    }

    function normalize(event, toSample) {
      totals.batches++;
      const rawList = collectRaw(event);
      totals.rawEvents += rawList.length;
      const entries = [];

      for (let index = 0; index < rawList.length; index++) {
        const raw = rawList[index];
        if (!belongs(raw, event)) continue;
        let sample = null;
        try { sample = typeof toSample === 'function' ? toSample(raw) : ns.normalizeSample(raw, lastTime); }
        catch (_) { totals.invalid++; continue; }
        if (!sample || !ns.isFiniteSample || !ns.isFiniteSample(sample)) {
          totals.invalid++;
          continue;
        }
        entries.push({ sample, index });
      }

      let reordered = false;
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].sample.time < entries[i - 1].sample.time) { reordered = true; break; }
      }
      entries.sort((a, b) => (a.sample.time - b.sample.time) || (a.index - b.index));
      if (reordered) totals.reorderedBatches++;

      if (entries.length > config.maxBatchSize) {
        totals.capped += entries.length - config.maxBatchSize;
        entries.splice(0, entries.length - config.maxBatchSize);
      }

      const output = [];
      for (const entry of entries) {
        const sample = entry.sample;
        if (sample.time < lastTime - config.timestampTolerance) {
          totals.stale++;
          continue;
        }
        const previous = output.length ? output[output.length - 1] : lastSample;
        if (sameSample(previous, sample)) {
          totals.duplicates++;
          continue;
        }
        output.push(sample);
        lastSample = sample;
        lastTime = Math.max(lastTime, sample.time);
        totals.emitted++;
      }
      return output;
    }

    function stats() {
      return Object.assign({}, totals, {
        lastTime: Number.isFinite(lastTime) ? lastTime : null,
        seeded: !!lastSample,
      });
    }

    function reset(sample) {
      lastSample = null;
      lastTime = -Infinity;
      if (sample) seed(sample);
    }

    return {
      normalize,
      seed,
      reset,
      stats,
      config: Object.freeze(Object.assign({}, config)),
    };
  }

  Object.assign(ns, { createInputBatchNormalizer });
  if (typeof module !== 'undefined' && module.exports) module.exports = { createInputBatchNormalizer };
})(typeof globalThis !== 'undefined' ? globalThis : this);
