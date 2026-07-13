// InkFrame Brush Engine V2 — deterministic radius continuity guard
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function normalizeRadiusMode(value) {
    return value === 'guarded' ? 'guarded' : 'raw';
  }

  function createRadiusContinuityGuard(options) {
    const input = options || {};
    const size = Math.max(0.1, Number(input.size) || 14);
    const config = Object.freeze({
      enabled: input.enabled !== false,
      size,
      minimumDeltaPx: Math.max(0.05, Number(input.minimumDeltaPx) || size * 0.025),
      distanceFactor: clamp(Number(input.distanceFactor) || 0.42, 0.05, 2),
      timeFactorPxPerMs: clamp(Number(input.timeFactorPxPerMs) || size * 0.0035, 0.001, 2),
      riseScale: clamp(Number(input.riseScale) || 1, 0.1, 4),
      fallScale: clamp(Number(input.fallScale) || 1.35, 0.1, 4),
      resetGapMs: clamp(Number(input.resetGapMs) || 80, 8, 500),
    });

    let previous = null;
    let clampedCount = 0;
    let processedCount = 0;

    function reset() {
      previous = null;
    }

    function allowance(previousDab, nextDab, rising) {
      const distance = Math.hypot(nextDab.x - previousDab.x, nextDab.y - previousDab.y);
      const dt = Math.max(0, Number(nextDab.time) - Number(previousDab.time));
      const base = config.minimumDeltaPx
        + distance * config.distanceFactor
        + dt * config.timeFactorPxPerMs;
      return base * (rising ? config.riseScale : config.fallScale);
    }

    function apply(dab) {
      if (!dab) return dab;
      processedCount++;
      const radius = Math.max(0.05, Number(dab.radius) || 0.05);
      const startsStroke = !!dab.strokeStart || Number(dab.strokeIndex) === 0;
      const timeGap = previous ? Math.max(0, Number(dab.time) - Number(previous.time)) : 0;

      if (!config.enabled || startsStroke || !previous || timeGap > config.resetGapMs) {
        const first = Object.freeze(Object.assign({}, dab, {
          radius,
          rawRadius: radius,
          radiusGuarded: false,
        }));
        previous = first;
        return first;
      }

      const priorRadius = Math.max(0.05, Number(previous.radius) || 0.05);
      const rising = radius >= priorRadius;
      const limit = allowance(previous, dab, rising);
      const resolved = clamp(radius, priorRadius - limit, priorRadius + limit);
      const guarded = Math.abs(resolved - radius) > 1e-9;
      if (guarded) clampedCount++;

      const output = Object.freeze(Object.assign({}, dab, {
        radius: Math.max(0.05, resolved),
        rawRadius: radius,
        radiusGuarded: guarded,
      }));
      previous = output;
      return output;
    }

    function stats() {
      return Object.freeze({
        enabled: config.enabled,
        processed: processedCount,
        clamped: clampedCount,
        config,
      });
    }

    return { apply, reset, stats, config };
  }

  const api = { normalizeRadiusMode, createRadiusContinuityGuard };
  Object.assign(ns, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
