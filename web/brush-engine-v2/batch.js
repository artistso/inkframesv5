// InkFrame Brush Engine V2 — deterministic raw coalesced pointer-event normalization
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

    let lastEvent = null;
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
    const numberOr = (value, fallback) => finite(value) ? Number(value) : fallback;

    function eventTime(event) {
      return numberOr(event && event.timeStamp, NaN);
    }

    function sameEvent(a, b) {
      if (!a || !b) return false;
      return Math.abs(a.timeStamp - b.timeStamp) <= config.timestampTolerance
        && Math.abs(a.clientX - b.clientX) <= config.coordinateEpsilon
        && Math.abs(a.clientY - b.clientY) <= config.coordinateEpsilon
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

    function snapshot(raw, parent) {
      const timeStamp = eventTime(raw);
      const clientX = numberOr(raw && raw.clientX, NaN);
      const clientY = numberOr(raw && raw.clientY, NaN);
      if (!Number.isFinite(timeStamp) || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
      const pointerId = numberOr(raw && raw.pointerId, numberOr(parent && parent.pointerId, 0));
      const pointerType = String((raw && raw.pointerType) || (parent && parent.pointerType) || config.pointerType || 'pen');
      const prevent = parent && typeof parent.preventDefault === 'function'
        ? () => parent.preventDefault()
        : () => {};
      return Object.freeze({
        type: String((raw && raw.type) || (parent && parent.type) || 'pointermove'),
        pointerId,
        pointerType,
        clientX,
        clientY,
        pressure: Math.max(0, Math.min(1, numberOr(raw && raw.pressure, 0))),
        tiltX: numberOr(raw && raw.tiltX, 0),
        tiltY: numberOr(raw && raw.tiltY, 0),
        twist: numberOr(raw && raw.twist, 0),
        altitudeAngle: numberOr(raw && raw.altitudeAngle, Math.PI / 2),
        azimuthAngle: numberOr(raw && raw.azimuthAngle, 0),
        width: Math.max(0, numberOr(raw && raw.width, 0)),
        height: Math.max(0, numberOr(raw && raw.height, 0)),
        buttons: numberOr(raw && raw.buttons, numberOr(parent && parent.buttons, 0)),
        button: numberOr(raw && raw.button, numberOr(parent && parent.button, -1)),
        timeStamp,
        predicted: !!(raw && raw.predicted),
        preventDefault: prevent,
        getCoalescedEvents: () => [],
      });
    }

    function seed(event) {
      const value = snapshot(event, event);
      lastEvent = value;
      lastTime = value ? value.timeStamp : -Infinity;
      return value;
    }

    function normalize(event) {
      totals.batches++;
      const rawList = collectRaw(event);
      totals.rawEvents += rawList.length;
      const entries = [];

      for (let index = 0; index < rawList.length; index++) {
        const raw = rawList[index];
        if (!belongs(raw, event)) continue;
        const value = snapshot(raw, event);
        if (!value) { totals.invalid++; continue; }
        entries.push({ value, index });
      }

      let reordered = false;
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].value.timeStamp < entries[i - 1].value.timeStamp) { reordered = true; break; }
      }
      entries.sort((a, b) => (a.value.timeStamp - b.value.timeStamp) || (a.index - b.index));
      if (reordered) totals.reorderedBatches++;

      if (entries.length > config.maxBatchSize) {
        totals.capped += entries.length - config.maxBatchSize;
        entries.splice(0, entries.length - config.maxBatchSize);
      }

      const output = [];
      for (const entry of entries) {
        const value = entry.value;
        if (value.timeStamp < lastTime - config.timestampTolerance) {
          totals.stale++;
          continue;
        }
        const previous = output.length ? output[output.length - 1] : lastEvent;
        if (sameEvent(previous, value)) {
          totals.duplicates++;
          continue;
        }
        output.push(value);
        lastEvent = value;
        lastTime = Math.max(lastTime, value.timeStamp);
        totals.emitted++;
      }
      return output;
    }

    function stats() {
      return Object.assign({}, totals, {
        lastTime: Number.isFinite(lastTime) ? lastTime : null,
        seeded: !!lastEvent,
      });
    }

    function reset(event) {
      lastEvent = null;
      lastTime = -Infinity;
      if (event) seed(event);
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
