// InkFrame Brush Engine V2 — explicit reference rasterizers
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const DEFAULT_PROFILES = Object.freeze({
    ink: Object.freeze({ size: 14, minSize: 0.08, opacity: 1, spacing: 0.055, hardness: 0.92, composite: 'source-over' }),
    eraser: Object.freeze({ size: 40, minSize: 1, opacity: 1, spacing: 0.12, hardness: 0.82, composite: 'destination-out' }),
  });

  function shapePressure(pressure, response) {
    const p = clamp(Number(pressure) || 0, 0, 1);
    const r = clamp(Number(response) || 0, -1, 1);
    if (r < 0) return Math.pow(p, 1 + (-r * 2));
    if (r > 0) {
      const smooth = p * p * (3 - 2 * p);
      return p + (smooth - p) * r;
    }
    return p;
  }

  function resolveProfile(brushId, overrides) {
    const base = DEFAULT_PROFILES[brushId] || DEFAULT_PROFILES.ink;
    const out = Object.assign({}, base, overrides || {});
    out.size = Math.max(0.1, Number(out.size) || base.size);
    out.minSize = clamp(Number(out.minSize), 0, 1);
    out.opacity = clamp(Number(out.opacity), 0, 1);
    out.spacing = clamp(Number(out.spacing), 0.01, 2);
    out.hardness = clamp(Number(out.hardness), 0, 1);
    out.response = clamp(Number(out.response) || 0, -1, 1);
    out.composite = brushId === 'eraser' ? 'destination-out' : String(out.composite || 'source-over');
    return Object.freeze(out);
  }

  function dabFromSample(sample, brushId, profile) {
    const p = shapePressure(sample.pressure, profile.response);
    const diameter = profile.size * (profile.minSize + (1 - profile.minSize) * p);
    return Object.freeze({
      kind: 'round-dab',
      brushId,
      x: sample.x,
      y: sample.y,
      radius: Math.max(0.05, diameter * 0.5),
      opacity: profile.opacity,
      hardness: profile.hardness,
      composite: profile.composite,
      pressure: sample.pressure,
      time: sample.time,
      tiltX: sample.tiltX,
      tiltY: sample.tiltY,
      azimuth: sample.azimuth,
    });
  }

  function paintRoundDab(context, dab, color) {
    if (!context || !dab) return false;
    context.save();
    context.globalCompositeOperation = dab.composite;
    context.globalAlpha = dab.opacity;
    const radius = Math.max(0.05, dab.radius);
    if (dab.hardness >= 0.995 || typeof context.createRadialGradient !== 'function') {
      context.fillStyle = dab.composite === 'destination-out' ? '#000' : color;
    } else {
      const inner = radius * clamp(dab.hardness, 0, 1);
      const gradient = context.createRadialGradient(dab.x, dab.y, inner, dab.x, dab.y, radius);
      const paint = dab.composite === 'destination-out' ? 'rgba(0,0,0,1)' : color;
      gradient.addColorStop(0, paint);
      gradient.addColorStop(Math.max(0.001, dab.hardness), paint);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
    }
    context.beginPath();
    context.arc(dab.x, dab.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return true;
  }

  Object.assign(ns, { DEFAULT_PROFILES, shapePressure, resolveProfile, dabFromSample, paintRoundDab });
  if (typeof module !== 'undefined' && module.exports) module.exports = { DEFAULT_PROFILES, shapePressure, resolveProfile, dabFromSample, paintRoundDab };
})(typeof globalThis !== 'undefined' ? globalThis : this);
