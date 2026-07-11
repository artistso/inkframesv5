// InkFrame Brush Engine V2 — bounded midpoint-quadratic path construction
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const midpoint = (a, b) => ns.interpolateSample(a, b, 0.5);

  function quadraticPoint(segment, t) {
    const k = Math.max(0, Math.min(1, Number(t) || 0));
    const u = 1 - k;
    const p0 = segment.start;
    const p1 = segment.control;
    const p2 = segment.end;
    const attrs = ns.interpolateSample(p0, p2, k);
    return Object.freeze(Object.assign({}, attrs, {
      x: u * u * p0.x + 2 * u * k * p1.x + k * k * p2.x,
      y: u * u * p0.y + 2 * u * k * p1.y + k * k * p2.y,
    }));
  }

  function createQuadraticPathBuilder() {
    let first = null;
    let previous = null;
    let previousMid = null;
    let count = 0;

    function begin(sample) {
      first = sample;
      previous = sample;
      previousMid = sample;
      count = 1;
      return [];
    }

    function push(sample) {
      if (!previous) return begin(sample);
      const nextMid = midpoint(previous, sample);
      const segment = Object.freeze({
        kind: 'quadratic',
        start: previousMid,
        control: previous,
        end: nextMid,
      });
      previous = sample;
      previousMid = nextMid;
      count++;
      return [segment];
    }

    function finish() {
      if (!previous || count < 2) return [];
      const segment = Object.freeze({
        kind: 'quadratic',
        start: previousMid,
        control: previous,
        end: previous,
      });
      previousMid = previous;
      return [segment];
    }

    function reset() {
      first = previous = previousMid = null;
      count = 0;
    }

    return { begin, push, finish, reset, count: () => count };
  }

  Object.assign(ns, { quadraticPoint, createQuadraticPathBuilder });
  if (typeof module !== 'undefined' && module.exports) module.exports = { quadraticPoint, createQuadraticPathBuilder };
})(typeof globalThis !== 'undefined' ? globalThis : this);
