// InkFrame Brush Engine V2 — canonical stylus samples
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finiteOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  /**
   * Convert a PointerEvent-like object or recorded object into the one canonical
   * sample shape consumed by Brush Engine V2. This function never mutates input.
   */
  function normalizeSample(raw, fallbackTime) {
    const source = raw || {};
    const time = finiteOr(source.time, finiteOr(source.timeStamp, finiteOr(fallbackTime, 0)));
    const pressureFallback = source.pointerType === 'mouse' ? (source.buttons ? 0.5 : 0) : 0;
    return Object.freeze({
      x: finiteOr(source.x, finiteOr(source.clientX, NaN)),
      y: finiteOr(source.y, finiteOr(source.clientY, NaN)),
      pressure: clamp(finiteOr(source.pressure, pressureFallback), 0, 1),
      tiltX: clamp(finiteOr(source.tiltX, 0), -90, 90),
      tiltY: clamp(finiteOr(source.tiltY, 0), -90, 90),
      twist: ((finiteOr(source.twist, 0) % 360) + 360) % 360,
      altitude: clamp(finiteOr(source.altitude, finiteOr(source.altitudeAngle, Math.PI / 2)), 0, Math.PI / 2),
      azimuth: finiteOr(source.azimuth, finiteOr(source.azimuthAngle, 0)),
      width: Math.max(0, finiteOr(source.width, 0)),
      height: Math.max(0, finiteOr(source.height, 0)),
      time,
      pointerId: finiteOr(source.pointerId, 0),
      pointerType: String(source.pointerType || 'pen'),
      predicted: !!source.predicted,
    });
  }

  function isFiniteSample(sample) {
    return !!sample
      && Number.isFinite(sample.x)
      && Number.isFinite(sample.y)
      && Number.isFinite(sample.time)
      && Number.isFinite(sample.pressure);
  }

  function interpolateSample(a, b, t) {
    const k = clamp(Number(t) || 0, 0, 1);
    const mix = (x, y) => x + (y - x) * k;
    return Object.freeze({
      x: mix(a.x, b.x), y: mix(a.y, b.y), pressure: mix(a.pressure, b.pressure),
      tiltX: mix(a.tiltX, b.tiltX), tiltY: mix(a.tiltY, b.tiltY),
      twist: mix(a.twist, b.twist), altitude: mix(a.altitude, b.altitude),
      azimuth: mix(a.azimuth, b.azimuth), width: mix(a.width, b.width),
      height: mix(a.height, b.height), time: mix(a.time, b.time),
      pointerId: b.pointerId, pointerType: b.pointerType, predicted: a.predicted || b.predicted,
    });
  }

  Object.assign(ns, { normalizeSample, isFiniteSample, interpolateSample });
  if (typeof module !== 'undefined' && module.exports) module.exports = { normalizeSample, isFiniteSample, interpolateSample };
})(typeof globalThis !== 'undefined' ? globalThis : this);
