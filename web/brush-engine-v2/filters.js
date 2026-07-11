// InkFrame Brush Engine V2 — sample-rate-independent filters
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const TAU = Math.PI * 2;

  function alphaForDt(dtMs, timeConstantMs) {
    const dt = Math.max(0, Number(dtMs) || 0);
    const tau = Math.max(0.01, Number(timeConstantMs) || 0.01);
    return clamp(1 - Math.exp(-dt / tau), 0, 1);
  }

  function shortestAngleDelta(from, to) {
    return ((((to - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  }

  function createScalarFilter(timeConstantMs) {
    let value = 0;
    let time = 0;
    let initialized = false;
    return {
      reset(next, nextTime) {
        value = Number(next) || 0;
        time = Number(nextTime) || 0;
        initialized = true;
        return value;
      },
      update(next, nextTime) {
        const n = Number(next) || 0;
        const t = Number(nextTime) || time;
        if (!initialized) return this.reset(n, t);
        value += (n - value) * alphaForDt(Math.max(0, t - time), timeConstantMs);
        time = t;
        return value;
      },
      value: () => value,
    };
  }

  function createAngleFilter(timeConstantMs) {
    let value = 0;
    let time = 0;
    let initialized = false;
    return {
      reset(next, nextTime) {
        value = Number(next) || 0;
        time = Number(nextTime) || 0;
        initialized = true;
        return value;
      },
      update(next, nextTime) {
        const n = Number(next) || 0;
        const t = Number(nextTime) || time;
        if (!initialized) return this.reset(n, t);
        value += shortestAngleDelta(value, n) * alphaForDt(Math.max(0, t - time), timeConstantMs);
        time = t;
        return value;
      },
      value: () => value,
    };
  }

  function createStrokeFilter(options) {
    const config = Object.assign({
      positionTimeConstantMs: 8,
      pressureTimeConstantMs: 12,
      tiltTimeConstantMs: 18,
      angleTimeConstantMs: 18,
      resetGapMs: 80,
    }, options || {});
    const x = createScalarFilter(config.positionTimeConstantMs);
    const y = createScalarFilter(config.positionTimeConstantMs);
    const pressure = createScalarFilter(config.pressureTimeConstantMs);
    const tiltX = createScalarFilter(config.tiltTimeConstantMs);
    const tiltY = createScalarFilter(config.tiltTimeConstantMs);
    const altitude = createScalarFilter(config.tiltTimeConstantMs);
    const azimuth = createAngleFilter(config.angleTimeConstantMs);
    let lastTime = null;

    function begin(sample) {
      lastTime = sample.time;
      return Object.freeze(Object.assign({}, sample, {
        x: x.reset(sample.x, sample.time),
        y: y.reset(sample.y, sample.time),
        pressure: pressure.reset(sample.pressure, sample.time),
        tiltX: tiltX.reset(sample.tiltX, sample.time),
        tiltY: tiltY.reset(sample.tiltY, sample.time),
        altitude: altitude.reset(sample.altitude, sample.time),
        azimuth: azimuth.reset(sample.azimuth, sample.time),
      }));
    }

    function update(sample) {
      if (lastTime == null || sample.time - lastTime > config.resetGapMs) return begin(sample);
      lastTime = sample.time;
      return Object.freeze(Object.assign({}, sample, {
        x: x.update(sample.x, sample.time),
        y: y.update(sample.y, sample.time),
        pressure: clamp(pressure.update(sample.pressure, sample.time), 0, 1),
        tiltX: clamp(tiltX.update(sample.tiltX, sample.time), -90, 90),
        tiltY: clamp(tiltY.update(sample.tiltY, sample.time), -90, 90),
        altitude: clamp(altitude.update(sample.altitude, sample.time), 0, Math.PI / 2),
        azimuth: azimuth.update(sample.azimuth, sample.time),
      }));
    }

    return { begin, update, config: Object.freeze(Object.assign({}, config)) };
  }

  Object.assign(ns, { alphaForDt, shortestAngleDelta, createScalarFilter, createAngleFilter, createStrokeFilter });
  if (typeof module !== 'undefined' && module.exports) module.exports = { alphaForDt, shortestAngleDelta, createScalarFilter, createAngleFilter, createStrokeFilter };
})(typeof globalThis !== 'undefined' ? globalThis : this);
