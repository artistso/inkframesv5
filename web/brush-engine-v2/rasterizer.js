// InkFrame Brush Engine V2 — explicit reference rasterizers
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const coverageState = new WeakMap();

  const DEFAULT_PROFILES = Object.freeze({
    ink: Object.freeze({ size: 14, minSize: 0.08, opacity: 1, spacing: 0.055, hardness: 0.92, composite: 'source-over', coverage: 'dabs', radiusMode: 'raw', contactMode: 'raw' }),
    eraser: Object.freeze({ size: 40, minSize: 1, opacity: 1, spacing: 0.12, hardness: 0.82, composite: 'destination-out', coverage: 'dabs', radiusMode: 'raw', contactMode: 'raw' }),
  });

  function normalizeCoverage(value) {
    return value === 'ribbon' ? 'ribbon' : 'dabs';
  }

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
    out.coverage = normalizeCoverage(out.coverage);
    out.radiusMode = ns.normalizeRadiusMode ? ns.normalizeRadiusMode(out.radiusMode) : (out.radiusMode === 'guarded' ? 'guarded' : 'raw');
    out.contactMode = ns.normalizeContactMode ? ns.normalizeContactMode(out.contactMode) : (out.contactMode === 'strict' ? 'strict' : 'raw');
    return Object.freeze(out);
  }

  function dabFromSample(sample, brushId, profile, metadata) {
    const p = shapePressure(sample.pressure, profile.response);
    const diameter = profile.size * (profile.minSize + (1 - profile.minSize) * p);
    const meta = metadata || {};
    return Object.freeze({
      kind: 'round-dab',
      brushId,
      x: sample.x,
      y: sample.y,
      radius: Math.max(0.05, diameter * 0.5),
      opacity: profile.opacity,
      hardness: profile.hardness,
      composite: profile.composite,
      coverage: normalizeCoverage(profile.coverage),
      pressure: sample.pressure,
      time: sample.time,
      tiltX: sample.tiltX,
      tiltY: sample.tiltY,
      azimuth: sample.azimuth,
      strokeId: Number(meta.strokeId) || 0,
      strokeIndex: Math.max(0, Number(meta.strokeIndex) || 0),
      strokeStart: !!meta.strokeStart,
    });
  }

  function paintIsolatedRoundDab(context, dab, color) {
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

  function ribbonGeometry(from, to) {
    const radius = Math.max(0.05, (Math.max(0.05, from.radius) + Math.max(0.05, to.radius)) * 0.5);
    const hardness = clamp((Number(from.hardness) + Number(to.hardness)) * 0.5, 0, 1);
    const opacity = clamp((Number(from.opacity) + Number(to.opacity)) * 0.5, 0, 1);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Object.freeze({
      dx,
      dy,
      distance: Math.hypot(dx, dy),
      radius,
      coreRadius: Math.max(0.05, radius * Math.max(0.18, hardness)),
      hardness,
      opacity,
      edgeAlpha: opacity * clamp((1 - hardness) * 0.55, 0, 0.35),
    });
  }

  function paintRoundLine(context, from, to, width, alpha, composite, color) {
    if (!(width > 0) || !(alpha > 0)) return;
    context.save();
    context.globalCompositeOperation = composite;
    context.globalAlpha = clamp(alpha, 0, 1);
    context.strokeStyle = composite === 'destination-out' ? '#000' : color;
    context.lineWidth = Math.max(0.1, width);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }

  function resetRoundCoverage(context) {
    if (context) coverageState.delete(context);
  }

  function paintRoundRibbonDab(context, dab, color) {
    if (!context || !dab) return false;
    let state = coverageState.get(context);
    if (!state) {
      state = { previous: null };
      coverageState.set(context, state);
    }

    const previous = state.previous;
    const reset = dab.strokeStart
      || !previous
      || previous.brushId !== dab.brushId
      || previous.composite !== dab.composite
      || dab.strokeIndex === 0;

    if (reset) {
      paintIsolatedRoundDab(context, dab, color);
      state.previous = dab;
      return true;
    }

    const geometry = ribbonGeometry(previous, dab);
    if (geometry.distance <= 1e-7) {
      paintIsolatedRoundDab(context, dab, color);
      state.previous = dab;
      return true;
    }

    if (geometry.edgeAlpha > 0.001) {
      paintRoundLine(
        context,
        previous,
        dab,
        geometry.radius * 2,
        geometry.edgeAlpha,
        dab.composite,
        color
      );
    }
    paintRoundLine(
      context,
      previous,
      dab,
      geometry.coreRadius * 2,
      geometry.opacity,
      dab.composite,
      color
    );
    paintIsolatedRoundDab(context, dab, color);
    state.previous = dab;
    return true;
  }

  function paintRoundDab(context, dab, color) {
    if (!context || !dab) return false;
    if (normalizeCoverage(dab.coverage) === 'ribbon') {
      return paintRoundRibbonDab(context, dab, color);
    }
    if (dab.strokeStart || dab.strokeIndex === 0) resetRoundCoverage(context);
    return paintIsolatedRoundDab(context, dab, color);
  }

  const api = {
    DEFAULT_PROFILES,
    normalizeCoverage,
    shapePressure,
    resolveProfile,
    dabFromSample,
    ribbonGeometry,
    resetRoundCoverage,
    paintIsolatedRoundDab,
    paintRoundRibbonDab,
    paintRoundDab,
  };
  Object.assign(ns, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
