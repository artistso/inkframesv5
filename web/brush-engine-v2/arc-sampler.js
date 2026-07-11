// InkFrame Brush Engine V2 — deterministic arc-length dab placement
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function flattenQuadratic(segment, tolerancePx) {
    const chord = distance(segment.start, segment.end);
    const controlNet = distance(segment.start, segment.control) + distance(segment.control, segment.end);
    const estimate = Math.max(chord, controlNet);
    const steps = Math.max(2, Math.min(96, Math.ceil(estimate / Math.max(0.25, tolerancePx || 1))));
    const out = [];
    for (let i = 0; i <= steps; i++) out.push(ns.quadraticPoint(segment, i / steps));
    return out;
  }

  function createArcSampler(options) {
    const config = Object.assign({ spacingPx: 1, flattenTolerancePx: 0.75 }, options || {});
    let spacing = Math.max(0.01, Number(config.spacingPx) || 1);
    let previous = null;
    let distanceUntilNext = 0;

    function setSpacing(next) {
      spacing = Math.max(0.01, Number(next) || spacing);
    }

    function begin(sample) {
      previous = sample;
      distanceUntilNext = spacing;
      return [sample];
    }

    function walkPoint(next, output) {
      if (!previous) {
        previous = next;
        output.push(next);
        distanceUntilNext = spacing;
        return;
      }
      let start = previous;
      let remaining = distance(start, next);
      if (remaining <= 1e-9) {
        previous = next;
        return;
      }
      while (remaining + 1e-9 >= distanceUntilNext) {
        const t = distanceUntilNext / remaining;
        const dab = ns.interpolateSample(start, next, t);
        output.push(dab);
        start = dab;
        remaining = distance(start, next);
        distanceUntilNext = spacing;
      }
      distanceUntilNext -= remaining;
      previous = next;
    }

    function sampleSegment(segment) {
      const output = [];
      const points = flattenQuadratic(segment, config.flattenTolerancePx);
      for (let i = 1; i < points.length; i++) walkPoint(points[i], output);
      return output;
    }

    function finish(sample) {
      const output = [];
      if (sample && previous && distance(previous, sample) > 1e-6) {
        walkPoint(sample, output);
      }
      if (sample && (!output.length || distance(output[output.length - 1], sample) > 0.25)) output.push(sample);
      previous = sample || previous;
      return output;
    }

    function reset() {
      previous = null;
      distanceUntilNext = 0;
    }

    return { begin, sampleSegment, finish, reset, setSpacing, spacing: () => spacing };
  }

  Object.assign(ns, { flattenQuadratic, createArcSampler });
  if (typeof module !== 'undefined' && module.exports) module.exports = { flattenQuadratic, createArcSampler };
})(typeof globalThis !== 'undefined' ? globalThis : this);
