// InkFrame Brush Engine V2 — bounded speed- and corner-adaptive position stabilizer
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
    const cornerStart = clamp(input.cornerStartRadians ?? Math.PI / 10, 0.01, Math.PI - 0.02);
    const cornerEnd = clamp(input.cornerEndRadians ?? Math.PI * 0.72, cornerStart + 0.01, Math.PI);
    return Object.freeze({
      mode: input.mode === 'adaptive' ? 'adaptive' : 'fixed',
      fixedTimeConstantMs: clamp(input.fixedTimeConstantMs ?? 8, 0.25, 60),
      slowTimeConstantMs: slow,
      fastTimeConstantMs: fast,
      speedStartPxPerMs: speedStart,
      speedEndPxPerMs: speedEnd,
      speedSmoothingTimeConstantMs: clamp(input.speedSmoothingTimeConstantMs ?? 24, 0.25, 100),
      cornerMode: input.cornerMode === 'preserve' ? 'preserve' : 'smooth',
      cornerStrength: clamp(input.cornerStrength ?? 0, 0, 1),
      cornerStartRadians: cornerStart,
      cornerEndRadians: cornerEnd,
      cornerTimeConstantMs: clamp(input.cornerTimeConstantMs ?? 1.75, 0.2, slow),
      cornerMinimumSegmentPx: clamp(input.cornerMinimumSegmentPx ?? 0.75, 0.05, 24),
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

  function segmentTurnRadians(previousDx, previousDy, nextDx, nextDy, minimumLength) {
    const previousLength = Math.hypot(previousDx, previousDy);
    const nextLength = Math.hypot(nextDx, nextDy);
    const minimum = Math.max(0, Number(minimumLength) || 0);
    if (previousLength < minimum || nextLength < minimum) return 0;
    const cosine = clamp(
      (previousDx * nextDx + previousDy * nextDy) / (previousLength * nextLength),
      -1,
      1
    );
    return Math.acos(cosine);
  }

  function cornerResponse(turnRadians, options) {
    const config = normalizeOptions(options);
    if (config.cornerMode !== 'preserve' || config.cornerStrength <= 0) return 0;
    const span = config.cornerEndRadians - config.cornerStartRadians;
    const normalized = span > 0
      ? (Number(turnRadians) - config.cornerStartRadians) / span
      : 1;
    return clamp(config.cornerStrength * smoothstep01(normalized), 0, 1);
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
    let previousDx = 0;
    let previousDy = 0;
    let hasDirection = false;
    let lastTurnRadians = 0;
    let lastCornerFactor = 0;
    let cornerActivations = 0;
    let maximumCornerFactor = 0;
    let lastBaseTimeConstant = config.mode === 'adaptive'
      ? config.slowTimeConstantMs
      : config.fixedTimeConstantMs;
    let lastTimeConstant = lastBaseTimeConstant;
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
      previousDx = 0;
      previousDy = 0;
      hasDirection = false;
      lastTurnRadians = 0;
      lastCornerFactor = 0;
      cornerActivations = 0;
      maximumCornerFactor = 0;
      lastBaseTimeConstant = config.mode === 'adaptive'
        ? config.slowTimeConstantMs
        : config.fixedTimeConstantMs;
      lastTimeConstant = lastBaseTimeConstant;
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
      const dx = nextX - rawX;
      const dy = nextY - rawY;
      const distance = Math.hypot(dx, dy);
      const rawSpeed = dt > 0 ? distance / dt : 0;

      if (updates === 0) smoothedSpeed = rawSpeed;
      else {
        smoothedSpeed += (rawSpeed - smoothedSpeed)
          * alphaForDt(dt, config.speedSmoothingTimeConstantMs);
      }

      const baseTau = adaptiveTimeConstant(smoothedSpeed, config);
      const turn = hasDirection
        ? segmentTurnRadians(previousDx, previousDy, dx, dy, config.cornerMinimumSegmentPx)
        : 0;
      const factor = cornerResponse(turn, config);
      const cornerTau = Math.min(baseTau, config.cornerTimeConstantMs);
      const effectiveTau = baseTau + (cornerTau - baseTau) * factor;

      if (config.mode === 'adaptive') {
        filteredX = integrateLinearInput(filteredX, rawX, nextX, dt, effectiveTau);
        filteredY = integrateLinearInput(filteredY, rawY, nextY, dt, effectiveTau);
      } else {
        // Historical fixed mode deliberately retains the original endpoint EMA
        // whenever cornerMode is smooth (the compatibility default).
        const alpha = alphaForDt(dt, effectiveTau);
        filteredX += (nextX - filteredX) * alpha;
        filteredY += (nextY - filteredY) * alpha;
      }

      if (distance >= config.cornerMinimumSegmentPx) {
        previousDx = dx;
        previousDy = dy;
        hasDirection = true;
      }
      if (factor > 1e-6) cornerActivations++;

      rawX = nextX;
      rawY = nextY;
      time = resolvedTime;
      lastRawSpeed = rawSpeed;
      lastTurnRadians = turn;
      lastCornerFactor = factor;
      maximumCornerFactor = Math.max(maximumCornerFactor, factor);
      lastBaseTimeConstant = baseTau;
      lastTimeConstant = effectiveTau;
      updates++;
      speedTotal += smoothedSpeed;
      tauTotal += effectiveTau;
      minimumTau = Math.min(minimumTau, effectiveTau);
      maximumTau = Math.max(maximumTau, effectiveTau);

      return Object.freeze({ x:filteredX, y:filteredY });
    }

    function stats() {
      return Object.freeze({
        mode: config.mode,
        updates,
        rawSpeedPxPerMs: lastRawSpeed,
        speedPxPerMs: smoothedSpeed,
        baseTimeConstantMs: lastBaseTimeConstant,
        timeConstantMs: lastTimeConstant,
        averageSpeedPxPerMs: updates ? speedTotal / updates : 0,
        averageTimeConstantMs: updates ? tauTotal / updates : lastTimeConstant,
        minimumTimeConstantMs: updates ? minimumTau : lastTimeConstant,
        maximumTimeConstantMs: updates ? maximumTau : lastTimeConstant,
        cornerMode: config.cornerMode,
        cornerStrength: config.cornerStrength,
        turnRadians: lastTurnRadians,
        cornerFactor: lastCornerFactor,
        cornerActivations,
        maximumCornerFactor,
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
    segmentTurnRadians,
    cornerResponse,
    integrateLinearInput,
    createPositionStabilizer,
  };
  Object.assign(ns, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
