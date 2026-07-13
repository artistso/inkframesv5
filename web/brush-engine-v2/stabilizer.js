// InkFrame Brush Engine V2 — bounded speed-adaptive position stabilizer
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

  function alphaForDt(dtMs, timeConstantMs) {
    const dt = Math.max(0, Number(dtMs) || 0);
    const tau = Math.max(0.01, Number(timeConstantMs) || 0.01);
    return clamp(1 - Math.exp(-dt / tau), 0, 1);
  }

  function smoothstep01(value) {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function normalizeOptions(value) {
    const input = value || {};
    const slow = clamp(input.slowTimeConstantMs ?? 18, 0.5, 60);
    const fast = clamp(input.fastTimeConstantMs ?? 3.5, 0.25, slow);
    const speedStart = clamp(input.speedStartPxPerMs ?? 0.12, 0, 20);
    const speedEnd = clamp(input.speedEndPxPerMs ?? 4, speedStart + 0.01, 40);
    return Object.freeze({
      mode: input.mode === 'adaptive' ? 'adaptive' : 'fixed',
      fixedTimeConstantMs: clamp(input.fixedTimeConstantMs ?? 8, 0.25, 60),
      slowTimeConstantMs: slow,
      fastTimeConstantMs: fast,
      speedStartPxPerMs: speedStart,
      speedEndPxPerMs: speedEnd,
      speedSmoothingTimeConstantMs: clamp(input.speedSmoothingTimeConstantMs ?? 24, 0.25, 100),
    });
  }

  function adaptiveTimeConstant(speedPxPerMs, options) {
    const config = normalizeOptions(options);
    if (config.mode !== 'adaptive') return config.fixedTimeConstantMs;
    const span = config.speedEndPxPerMs - config.speedStartPxPerMs;
    const normalized = span > 0
      ? (Number(speedPxPerMs) - config.speedStartPxPerMs) / span
      : 1;
    const release = smoothstep01(normalized);
    return config.slowTimeConstantMs
      + (config.fastTimeConstantMs - config.slowTimeConstantMs) * release;
  }

  // Exact solution of dy/dt=(x-y)/tau when x moves linearly from previousRaw
  // to nextRaw over dt. Unlike an endpoint EMA, constant-speed motion converges
  // to the same filtered trajectory at different event rates.
  function integrateLinearInput(filtered, previousRaw, nextRaw, dt, tau) {
    if (!(dt > 0)) return filtered;
    const velocity = (nextRaw - previousRaw) / dt;
    const decay = Math.exp(-dt / Math.max(0.01, tau));
    return nextRaw - velocity * tau
      + (filtered - previousRaw + velocity * tau) * decay;
  }

  function createPositionStabilizer(options) {
    const config = normalizeOptions(options);
    let initialized = false;
    let rawX = 0;
    let rawY = 0;
    let filteredX = 0;
    let filteredY = 0;
    let time = 0;
    let smoothedSpeed = 0;
    let lastRawSpeed = 0;
    let lastTimeConstant = config.mode === 'adaptive'
      ? config.slowTimeConstantMs
      : config.fixedTimeConstantMs;
    let updates = 0;
    let speedTotal = 0;
    let tauTotal = 0;
    let minimumTau = Infinity;
    let maximumTau = 0;

    function reset(sample) {
      const next = sample || {};
      rawX = Number(next.x) || 0;
      rawY = Number(next.y) || 0;
      filteredX = rawX;
      filteredY = rawY;
      time = Number(next.time) || 0;
      smoothedSpeed = 0;
      lastRawSpeed = 0;
      lastTimeConstant = config.mode === 'adaptive'
        ? config.slowTimeConstantMs
        : config.fixedTimeConstantMs;
      initialized = true;
      updates = 0;
      speedTotal = 0;
      tauTotal = 0;
      minimumTau = Infinity;
      maximumTau = 0;
      return Object.freeze({ x:filteredX, y:filteredY });
    }

    function update(sample) {
      if (!initialized) return reset(sample);
      const next = sample || {};
      const nextX = Number(next.x) || 0;
      const nextY = Number(next.y) || 0;
      const nextTime = Number(next.time);
      const resolvedTime = Number.isFinite(nextTime) ? nextTime : time;
      const dt = Math.max(0, resolvedTime - time);
      const distance = Math.hypot(nextX - rawX, nextY - rawY);
      const rawSpeed = dt > 0 ? distance / dt : 0;

      if (updates === 0) smoothedSpeed = rawSpeed;
      else {
        smoothedSpeed += (rawSpeed - smoothedSpeed)
          * alphaForDt(dt, config.speedSmoothingTimeConstantMs);
      }

      const tau = adaptiveTimeConstant(smoothedSpeed, config);
      if (config.mode === 'adaptive') {
        filteredX = integrateLinearInput(filteredX, rawX, nextX, dt, tau);
        filteredY = integrateLinearInput(filteredY, rawY, nextY, dt, tau);
      } else {
        // Historical fixed mode deliberately retains the original endpoint EMA.
        const alpha = alphaForDt(dt, tau);
        filteredX += (nextX - filteredX) * alpha;
        filteredY += (nextY - filteredY) * alpha;
      }

      rawX = nextX;
      rawY = nextY;
      time = resolvedTime;
      lastRawSpeed = rawSpeed;
      lastTimeConstant = tau;
      updates++;
      speedTotal += smoothedSpeed;
      tauTotal += tau;
      minimumTau = Math.min(minimumTau, tau);
      maximumTau = Math.max(maximumTau, tau);

      return Object.freeze({ x:filteredX, y:filteredY });
    }

    function stats() {
      return Object.freeze({
        mode: config.mode,
        updates,
        rawSpeedPxPerMs: lastRawSpeed,
        speedPxPerMs: smoothedSpeed,
        timeConstantMs: lastTimeConstant,
        averageSpeedPxPerMs: updates ? speedTotal / updates : 0,
        averageTimeConstantMs: updates ? tauTotal / updates : lastTimeConstant,
        minimumTimeConstantMs: updates ? minimumTau : lastTimeConstant,
        maximumTimeConstantMs: updates ? maximumTau : lastTimeConstant,
      });
    }

    return {
      reset,
      update,
      stats,
      config,
      value: () => Object.freeze({ x:filteredX, y:filteredY }),
    };
  }

  const api = {
    alphaForDt,
    smoothstep01,
    normalizeStabilizerOptions:normalizeOptions,
    adaptiveTimeConstant,
    integrateLinearInput,
    createPositionStabilizer,
  };
  Object.assign(ns, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
