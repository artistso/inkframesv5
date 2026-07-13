// InkFrame Brush Engine V2 — deterministic pen-down and pen-up boundary handling
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function normalizeContactMode(value) {
    return value === 'strict' ? 'strict' : 'raw';
  }

  function createContactBoundaryGuard(options) {
    const config = Object.assign({
      mode: 'strict',
      displacedStartMinPx: 18,
      clusterRatio: 0.45,
      returnRatio: 0.70,
      maxSettleMs: 48,
    }, options || {});
    config.mode = normalizeContactMode(config.mode);

    let start = null;
    let firstMove = null;
    let started = false;
    let last = null;
    const totals = {
      heldStarts: 0,
      displacedStarts: 0,
      terminalSamplesIgnored: 0,
      rawTerminalSamples: 0,
      taps: 0,
      shortStrokes: 0,
    };

    function reset() {
      start = null;
      firstMove = null;
      started = false;
      last = null;
    }

    function isDisplacedStart(a, b, c) {
      if (!a || !b || !c) return false;
      const ab = distance(a, b);
      const bc = distance(b, c);
      const ac = distance(a, c);
      const elapsed = Math.max(0, c.time - a.time);
      if (elapsed > config.maxSettleMs) return false;
      if (ab < config.displacedStartMinPx) return false;
      if (bc > Math.max(6, ab * config.clusterRatio)) return false;
      return ac >= ab * config.returnRatio;
    }

    function begin(sample) {
      reset();
      start = sample;
      if (config.mode === 'raw') {
        started = true;
        last = sample;
        return [sample];
      }
      totals.heldStarts++;
      return [];
    }

    function move(sample) {
      if (config.mode === 'raw') {
        last = sample;
        return [sample];
      }
      if (started) {
        last = sample;
        return [sample];
      }
      if (!firstMove) {
        firstMove = sample;
        return [];
      }

      const output = isDisplacedStart(start, firstMove, sample)
        ? [firstMove, sample]
        : [start, firstMove, sample];
      if (output[0] !== start) totals.displacedStarts++;
      started = true;
      last = sample;
      return output;
    }

    function end(sample) {
      if (config.mode === 'raw') {
        if (!sample) return [];
        totals.rawTerminalSamples++;
        last = sample;
        return [sample];
      }

      if (sample) totals.terminalSamplesIgnored++;
      if (started) return [];
      if (start && firstMove) {
        totals.shortStrokes++;
        started = true;
        last = firstMove;
        return [start, firstMove];
      }
      if (start) {
        totals.taps++;
        started = true;
        last = start;
        return [start];
      }
      return [];
    }

    function snapshot() {
      return Object.assign({}, totals, {
        mode: config.mode,
        pendingStart: !!start && !started,
        pendingFirstMove: !!firstMove && !started,
        lastTime: last ? last.time : null,
      });
    }

    return {
      begin,
      move,
      end,
      reset,
      snapshot,
      config: Object.freeze(Object.assign({}, config)),
    };
  }

  const api = { normalizeContactMode, createContactBoundaryGuard };
  Object.assign(ns, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
