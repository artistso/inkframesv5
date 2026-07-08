// InkFrame — Kotlin-ready Brush Engine Core
// -----------------------------------------------------------------------------
// Portable brush planning primitives for the next engine phase. This file does
// not replace the current canvas painter yet. It creates a stable contract that
// can be mirrored directly in Kotlin: BrushProfile, StylusPoint, StrokeState,
// StrokeSample, and StampPlan.
'use strict';

(function installInkFrameBrushEngine(root){
  const VERSION = 'v0.2.0-kotlin-ready-core';
  const TAU = Math.PI * 2;
  const EPS = 1e-6;

  const clamp = (min, value, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hypot = (x, y) => Math.hypot(x, y);
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  const DEFAULT_PROFILE = Object.freeze({
    id: 'lovely-ink',
    name: 'Lovely Ink',
    shape: 'round',
    blendMode: 'source-over',
    spacing: 0.18,
    size: 8,
    minSize: 1.25,
    maxSize: 96,
    opacity: 0.92,
    minOpacity: 0.12,
    flow: 0.72,
    softness: 0.42,
    jitter: 0,
    grain: 0.10,
    taperStart: 0.08,
    taperEnd: 0.12,
    pressureSize: 0.78,
    pressureOpacity: 0.42,
    velocitySize: 0.18,
    velocityOpacity: 0.08,
    tiltSize: 0.14,
    tiltAngle: 0.24,
    smoothing: 0.52,
    stabilization: 0.22,
    stampCap: 512,
  });

  const PRESETS = Object.freeze({
    'lovely-ink': DEFAULT_PROFILE,
    'glass-pencil': Object.freeze({
      ...DEFAULT_PROFILE,
      id: 'glass-pencil',
      name: 'Glass Pencil',
      size: 4.5,
      minSize: 0.8,
      opacity: 0.72,
      flow: 0.48,
      softness: 0.18,
      grain: 0.34,
      pressureSize: 0.62,
      pressureOpacity: 0.24,
      velocitySize: 0.26,
      spacing: 0.12,
    }),
    'rose-brush': Object.freeze({
      ...DEFAULT_PROFILE,
      id: 'rose-brush',
      name: 'Rose Brush',
      size: 18,
      minSize: 2.5,
      opacity: 0.64,
      flow: 0.42,
      softness: 0.72,
      grain: 0.18,
      pressureSize: 0.88,
      pressureOpacity: 0.56,
      tiltSize: 0.22,
      spacing: 0.20,
    }),
    'vector-ink': Object.freeze({
      ...DEFAULT_PROFILE,
      id: 'vector-ink',
      name: 'Vector Ink',
      size: 6,
      minSize: 1.1,
      opacity: 0.98,
      flow: 0.88,
      softness: 0.10,
      grain: 0,
      pressureSize: 0.72,
      pressureOpacity: 0.16,
      velocitySize: 0.10,
      spacing: 0.10,
    }),
  });

  function profile(input) {
    const base = typeof input === 'string' ? PRESETS[input] || DEFAULT_PROFILE : { ...DEFAULT_PROFILE, ...(input || {}) };
    const out = {
      ...DEFAULT_PROFILE,
      ...base,
      spacing: clamp(0.04, finite(base.spacing, DEFAULT_PROFILE.spacing), 1.0),
      size: clamp(0.25, finite(base.size, DEFAULT_PROFILE.size), 512),
      minSize: clamp(0.1, finite(base.minSize, DEFAULT_PROFILE.minSize), 512),
      maxSize: clamp(0.25, finite(base.maxSize, DEFAULT_PROFILE.maxSize), 1024),
      opacity: clamp(0, finite(base.opacity, DEFAULT_PROFILE.opacity), 1),
      minOpacity: clamp(0, finite(base.minOpacity, DEFAULT_PROFILE.minOpacity), 1),
      flow: clamp(0, finite(base.flow, DEFAULT_PROFILE.flow), 1),
      softness: clamp(0, finite(base.softness, DEFAULT_PROFILE.softness), 1),
      jitter: clamp(0, finite(base.jitter, DEFAULT_PROFILE.jitter), 1),
      grain: clamp(0, finite(base.grain, DEFAULT_PROFILE.grain), 1),
      taperStart: clamp(0, finite(base.taperStart, DEFAULT_PROFILE.taperStart), 0.5),
      taperEnd: clamp(0, finite(base.taperEnd, DEFAULT_PROFILE.taperEnd), 0.5),
      pressureSize: clamp(0, finite(base.pressureSize, DEFAULT_PROFILE.pressureSize), 1),
      pressureOpacity: clamp(0, finite(base.pressureOpacity, DEFAULT_PROFILE.pressureOpacity), 1),
      velocitySize: clamp(0, finite(base.velocitySize, DEFAULT_PROFILE.velocitySize), 1),
      velocityOpacity: clamp(0, finite(base.velocityOpacity, DEFAULT_PROFILE.velocityOpacity), 1),
      tiltSize: clamp(0, finite(base.tiltSize, DEFAULT_PROFILE.tiltSize), 1),
      tiltAngle: clamp(0, finite(base.tiltAngle, DEFAULT_PROFILE.tiltAngle), 1),
      smoothing: clamp(0, finite(base.smoothing, DEFAULT_PROFILE.smoothing), 0.98),
      stabilization: clamp(0, finite(base.stabilization, DEFAULT_PROFILE.stabilization), 0.95),
      stampCap: Math.max(8, Math.min(4096, finite(base.stampCap, DEFAULT_PROFILE.stampCap) | 0)),
    };
    out.minSize = Math.min(out.minSize, out.maxSize);
    out.size = clamp(out.minSize, out.size, out.maxSize);
    out.minOpacity = Math.min(out.minOpacity, out.opacity);
    return Object.freeze(out);
  }

  function normalizePoint(raw, previous) {
    const t = finite(raw && raw.t, (previous && previous.t || 0) + 16.67);
    const x = finite(raw && raw.x, previous ? previous.x : 0);
    const y = finite(raw && raw.y, previous ? previous.y : 0);
    const pressure = clamp(0, finite(raw && raw.pressure, 0.5), 1);
    const tiltX = clamp(-90, finite(raw && raw.tiltX, 0), 90);
    const tiltY = clamp(-90, finite(raw && raw.tiltY, 0), 90);
    const altitude = clamp(0, finite(raw && raw.altitudeAngle, Math.PI / 2), Math.PI / 2);
    const azimuth = finite(raw && raw.azimuthAngle, Math.atan2(tiltY, tiltX || EPS));
    const dt = Math.max(1, t - (previous ? previous.t : t - 16.67));
    const dx = x - (previous ? previous.x : x);
    const dy = y - (previous ? previous.y : y);
    const velocity = hypot(dx, dy) / dt;
    return Object.freeze({ x, y, t, pressure, tiltX, tiltY, altitudeAngle: altitude, azimuthAngle: azimuth, velocity });
  }

  function newStrokeState(profileInput) {
    return {
      profile: profile(profileInput),
      lastPoint: null,
      smoothedPoint: null,
      distance: 0,
      sampleCount: 0,
      stampRemainder: 0,
      startedAt: 0,
    };
  }

  function smoothPoint(state, point) {
    const p = state.profile;
    if (!state.smoothedPoint) return point;
    const s = p.smoothing;
    const stable = p.stabilization;
    const prev = state.smoothedPoint;
    const velocityBias = clamp(0, point.velocity * 20, 0.28);
    const alpha = clamp(0.02, 1 - s + velocityBias - stable * 0.18, 1);
    return Object.freeze({
      ...point,
      x: lerp(prev.x, point.x, alpha),
      y: lerp(prev.y, point.y, alpha),
      pressure: lerp(prev.pressure, point.pressure, clamp(0.12, alpha + 0.10, 1)),
      velocity: lerp(prev.velocity, point.velocity, clamp(0.10, alpha + 0.08, 1)),
    });
  }

  function taperFor(distance, total, p) {
    if (!total || total < EPS) return 1;
    const u = clamp(0, distance / total, 1);
    const start = p.taperStart > EPS ? clamp(0, u / p.taperStart, 1) : 1;
    const end = p.taperEnd > EPS ? clamp(0, (1 - u) / p.taperEnd, 1) : 1;
    return Math.sin(Math.min(start, end) * Math.PI / 2);
  }

  function pointMetrics(point, p, distance, total) {
    const pressureSize = lerp(1 - p.pressureSize, 1, point.pressure);
    const pressureOpacity = lerp(1 - p.pressureOpacity, 1, point.pressure);
    const velocitySize = lerp(1, 1 - p.velocitySize, clamp(0, point.velocity * 24, 1));
    const velocityOpacity = lerp(1, 1 - p.velocityOpacity, clamp(0, point.velocity * 18, 1));
    const tiltMag = clamp(0, Math.hypot(point.tiltX, point.tiltY) / 90, 1);
    const tiltSize = lerp(1, 1 + p.tiltSize, tiltMag);
    const taper = taperFor(distance, total || distance, p);
    const size = clamp(p.minSize, p.size * pressureSize * velocitySize * tiltSize * taper, p.maxSize);
    const opacity = clamp(p.minOpacity, p.opacity * p.flow * pressureOpacity * velocityOpacity * taper, p.opacity);
    const angle = point.azimuthAngle + p.tiltAngle * tiltMag * Math.PI;
    return Object.freeze({ size, opacity, angle, softness: p.softness, grain: p.grain, taper, velocity: point.velocity });
  }

  function sampleSegment(a, b, p, distanceOffset) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = hypot(dx, dy);
    if (len < EPS) {
      const m = pointMetrics(b, p, distanceOffset, distanceOffset || 1);
      return [{ x: b.x, y: b.y, t: b.t, pressure: b.pressure, distance: distanceOffset, ...m }];
    }
    const spacingPx = clamp(0.5, p.size * p.spacing, 64);
    const count = Math.max(1, Math.min(p.stampCap, Math.ceil(len / spacingPx)));
    const out = [];
    for (let i = 1; i <= count; i++) {
      const u = i / count;
      const point = Object.freeze({
        x: lerp(a.x, b.x, u),
        y: lerp(a.y, b.y, u),
        t: lerp(a.t, b.t, u),
        pressure: lerp(a.pressure, b.pressure, u),
        tiltX: lerp(a.tiltX, b.tiltX, u),
        tiltY: lerp(a.tiltY, b.tiltY, u),
        altitudeAngle: lerp(a.altitudeAngle, b.altitudeAngle, u),
        azimuthAngle: lerp(a.azimuthAngle, b.azimuthAngle, u),
        velocity: lerp(a.velocity, b.velocity, u),
      });
      const dist = distanceOffset + len * u;
      const m = pointMetrics(point, p, dist, distanceOffset + len);
      out.push(Object.freeze({ x: point.x, y: point.y, t: point.t, pressure: point.pressure, distance: dist, ...m }));
    }
    return out;
  }

  function feedPoint(state, rawPoint) {
    const p = state.profile || profile();
    const normalized = normalizePoint(rawPoint, state.lastPoint);
    const smoothed = smoothPoint(state, normalized);
    let samples;
    if (!state.lastPoint) {
      state.startedAt = smoothed.t;
      samples = sampleSegment(smoothed, smoothed, p, 0);
    } else {
      samples = sampleSegment(state.smoothedPoint || state.lastPoint, smoothed, p, state.distance);
    }
    if (samples.length) {
      state.distance = samples[samples.length - 1].distance;
      state.sampleCount += samples.length;
    }
    state.lastPoint = normalized;
    state.smoothedPoint = smoothed;
    return samples;
  }

  function planStamp(sample, p) {
    const radius = Math.max(0.5, sample.size / 2);
    const softness = clamp(0, sample.softness == null ? p.softness : sample.softness, 1);
    const hardRadius = radius * lerp(0.36, 0.86, 1 - softness);
    const feather = Math.max(0.25, radius - hardRadius);
    return Object.freeze({
      x: sample.x,
      y: sample.y,
      radius,
      hardRadius,
      feather,
      opacity: sample.opacity,
      angle: sample.angle || 0,
      grain: clamp(0, sample.grain == null ? p.grain : sample.grain, 1),
      blendMode: p.blendMode,
      shape: p.shape,
    });
  }

  function planStroke(rawPoints, profileInput) {
    const state = newStrokeState(profileInput);
    const samples = [];
    for (const point of rawPoints || []) samples.push(...feedPoint(state, point));
    const stamps = samples.map(sample => planStamp(sample, state.profile));
    return Object.freeze({ profile: state.profile, samples, stamps, distance: state.distance, sampleCount: state.sampleCount });
  }

  function makeKotlinSignature() {
    return Object.freeze({
      BrushProfile: ['id:String', 'name:String', 'shape:String', 'blendMode:String', 'spacing:Float', 'size:Float', 'minSize:Float', 'maxSize:Float', 'opacity:Float', 'flow:Float', 'softness:Float'],
      StylusPoint: ['x:Float', 'y:Float', 't:Long', 'pressure:Float', 'tiltX:Float', 'tiltY:Float', 'altitudeAngle:Float', 'azimuthAngle:Float', 'velocity:Float'],
      StrokeSample: ['x:Float', 'y:Float', 't:Long', 'pressure:Float', 'distance:Float', 'size:Float', 'opacity:Float', 'angle:Float'],
      StampPlan: ['x:Float', 'y:Float', 'radius:Float', 'hardRadius:Float', 'feather:Float', 'opacity:Float', 'angle:Float', 'grain:Float', 'blendMode:String', 'shape:String'],
    });
  }

  const api = Object.freeze({
    VERSION,
    DEFAULT_PROFILE,
    PRESETS,
    profile,
    normalizePoint,
    newStrokeState,
    feedPoint,
    pointMetrics,
    sampleSegment,
    planStamp,
    planStroke,
    makeKotlinSignature,
  });

  if (root && typeof root === 'object') root.InkFrameBrushEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
