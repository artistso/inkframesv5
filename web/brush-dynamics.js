// InkFrame — Brush Dynamics Response Curves
// -----------------------------------------------------------------------------
// Portable brush dynamics layer on top of brush-engine.js. Adds pressure curves,
// velocity damping, taper response, deterministic jitter, vector-backed symmetry,
// quality metrics, and replay descriptors without taking over the active painter.
'use strict';

(function installInkFrameBrushDynamics(root){
  const VERSION = 'v0.2.0-brush-dynamics-quality';
  const TAU = Math.PI * 2;
  const clamp = (min, value, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const lerp = (a, b, t) => a + (b - a) * clamp(0, t, 1);
  const smoothStep = t => { const x = clamp(0, t, 1); return x * x * (3 - 2 * x); };
  const vec = (x, y) => Object.freeze({ x:Number(x) || 0, y:Number(y) || 0 });
  const avg = values => values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

  function curve(points){
    const sorted = (points && points.length ? points : [{input:0, output:0}, {input:1, output:1}])
      .map(p => ({ input:clamp(0, p.input, 1), output:clamp(0, p.output, 2) }))
      .sort((a, b) => a.input - b.input);
    return Object.freeze({
      points: sorted,
      evaluate(value){
        const x = clamp(0, value, 1);
        if (x <= sorted[0].input) return sorted[0].output;
        if (x >= sorted[sorted.length - 1].input) return sorted[sorted.length - 1].output;
        for (let i = 0; i < sorted.length - 1; i++) {
          const a = sorted[i], b = sorted[i + 1];
          if (x >= a.input && x <= b.input) {
            const t = (x - a.input) / Math.max(0.0001, b.input - a.input);
            return lerp(a.output, b.output, smoothStep(t));
          }
        }
        return sorted[sorted.length - 1].output;
      }
    });
  }

  const Curves = Object.freeze({
    linear: curve([{input:0, output:0}, {input:1, output:1}]),
    softStart: curve([{input:0, output:0}, {input:0.35, output:0.12}, {input:1, output:1}]),
    firmMiddle: curve([{input:0, output:0}, {input:0.28, output:0.36}, {input:0.72, output:0.86}, {input:1, output:1}]),
    inkSnap: curve([{input:0, output:0.04}, {input:0.18, output:0.18}, {input:0.58, output:0.84}, {input:1, output:1}]),
    reverseVelocity: curve([{input:0, output:1}, {input:1, output:0.62}]),
    reverseGentle: curve([{input:0, output:1}, {input:1, output:0.78}]),
    gamma(gamma){
      const g = clamp(0.15, gamma, 4);
      return curve(Array.from({length:9}, (_, i) => { const x = i / 8; return { input:x, output:Math.pow(x, g) }; }));
    }
  });

  function preset(input){
    const p = input || PRESETS['smooth-ink'];
    return Object.freeze({
      id: p.id || 'smooth-ink',
      name: p.name || 'Smooth Ink',
      pressureSize: p.pressureSize || Curves.linear,
      pressureOpacity: p.pressureOpacity || Curves.linear,
      velocitySize: p.velocitySize || Curves.reverseVelocity,
      velocityOpacity: p.velocityOpacity || Curves.reverseVelocity,
      taper: p.taper || Curves.linear,
      pressureDeadZone: clamp(0, p.pressureDeadZone == null ? 0.02 : p.pressureDeadZone, 0.55),
      pressureGain: clamp(0.1, p.pressureGain == null ? 1 : p.pressureGain, 3),
      velocityScale: clamp(0.1, p.velocityScale == null ? 22 : p.velocityScale, 100),
      jitterAmount: clamp(0, p.jitterAmount || 0, 1),
      jitterSeed: (p.jitterSeed || 17) | 0,
    });
  }

  const PRESETS = Object.freeze({
    'smooth-ink': preset({
      id:'smooth-ink', name:'Smooth Ink', pressureSize:Curves.firmMiddle, pressureOpacity:Curves.inkSnap,
      velocitySize:Curves.reverseVelocity, velocityOpacity:Curves.reverseGentle, pressureDeadZone:0.015, pressureGain:1.08, velocityScale:20
    }),
    'pencil-texture': preset({
      id:'pencil-texture', name:'Pencil Texture', pressureSize:Curves.softStart, pressureOpacity:Curves.gamma(1.35),
      velocitySize:curve([{input:0, output:1}, {input:1, output:0.78}]), velocityOpacity:curve([{input:0, output:1}, {input:1, output:0.58}]),
      pressureDeadZone:0.04, pressureGain:1.18, velocityScale:28, jitterAmount:0.12, jitterSeed:83
    }),
    'vector-clean': preset({
      id:'vector-clean', name:'Vector Clean', pressureSize:curve([{input:0, output:0.84}, {input:1, output:1}]), pressureOpacity:curve([{input:0, output:0.82}, {input:1, output:1}]),
      velocitySize:curve([{input:0, output:1}, {input:1, output:0.90}]), velocityOpacity:curve([{input:0, output:1}, {input:1, output:0.92}]),
      pressureDeadZone:0, pressureGain:0.92, velocityScale:16, jitterAmount:0
    }),
    'marker-flow': preset({
      id:'marker-flow', name:'Marker Flow', pressureSize:curve([{input:0, output:0.68}, {input:0.45, output:0.92}, {input:1, output:1.08}]),
      pressureOpacity:curve([{input:0, output:0.44}, {input:0.35, output:0.76}, {input:1, output:1.08}]), velocitySize:Curves.reverseGentle,
      velocityOpacity:curve([{input:0, output:1.08}, {input:1, output:0.72}]), pressureDeadZone:0.025, pressureGain:1.05, velocityScale:24, jitterAmount:0.025, jitterSeed:18
    })
  });

  function normalizePressure(rawPressure, dynamics){
    const p = preset(dynamics);
    const shifted = (clamp(0, rawPressure, 1) - p.pressureDeadZone) / Math.max(0.0001, 1 - p.pressureDeadZone);
    return clamp(0, shifted * p.pressureGain, 1);
  }

  function velocityUnit(rawVelocity, dynamics){
    const p = preset(dynamics);
    return clamp(0, Math.max(0, Number(rawVelocity) || 0) * p.velocityScale, 1);
  }

  function hash(seed){
    let x = seed | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 1) % 10000) / 10000;
  }

  function deterministicJitter(index, dynamics){
    const p = preset(dynamics);
    if (p.jitterAmount <= 0) return vec(0, 0);
    const n = hash(index + p.jitterSeed * 31);
    const m = hash(index * 17 + p.jitterSeed * 101);
    const angle = n * TAU;
    const radius = (m - 0.5) * p.jitterAmount;
    return vec(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }

  function dynamicDabFromSample(sample, stamp, brush, sampleIndex, symmetryIndex, positionOverride){
    const engine = root && root.InkFrameBrushEngine;
    const defaultProfile = engine && engine.DEFAULT_PROFILE || { opacity:1, maxSize:96 };
    const b = brush || {};
    const profile = b.brushProfile || defaultProfile;
    const dynamics = preset(b.dynamics || PRESETS['smooth-ink']);
    const pressure = normalizePressure(sample.pressure, dynamics);
    const velocity = velocityUnit(sample.velocity, dynamics);
    const sizePressure = lerp(0.42, 1.22, dynamics.pressureSize.evaluate(pressure));
    const sizeVelocity = lerp(0.72, 1.08, dynamics.velocitySize.evaluate(velocity));
    const opacityPressure = lerp(0.18, 1.12, dynamics.pressureOpacity.evaluate(pressure));
    const opacityVelocity = lerp(0.58, 1.04, dynamics.velocityOpacity.evaluate(velocity));
    const taper = clamp(0, dynamics.taper.evaluate(sample.taper == null ? 1 : sample.taper), 1.35);
    const jitter = deterministicJitter((sampleIndex || 0) + (symmetryIndex || 0) * 10007, dynamics);
    const pos = positionOverride || vec(sample.x, sample.y);
    const maxRadius = (profile.maxSize || 96) / 2;
    const radius = clamp(0.25, stamp.radius * sizePressure * sizeVelocity * Math.max(0.25, taper), maxRadius);
    const hardRadius = clamp(0.05, radius * (stamp.hardRadius / Math.max(0.0001, stamp.radius)), radius);
    return Object.freeze({
      x: pos.x + jitter.x * radius,
      y: pos.y + jitter.y * radius,
      radius,
      hardRadius,
      feather: Math.max(0.1, radius - hardRadius),
      opacity: clamp(0, stamp.opacity * opacityPressure * opacityVelocity, profile.opacity || 1),
      angle: stamp.angle || 0,
      grain: clamp(0, stamp.grain || 0, 1),
      pressure,
      velocity,
      taper,
      symmetryIndex: symmetryIndex || 0,
    });
  }

  function jitterScore(samples){
    if (!samples || samples.length < 3) return 0;
    let total = 0, count = 0;
    for (let i = 2; i < samples.length; i++) {
      const ax = samples[i - 1].x - samples[i - 2].x;
      const ay = samples[i - 1].y - samples[i - 2].y;
      const bx = samples[i].x - samples[i - 1].x;
      const by = samples[i].y - samples[i - 1].y;
      const al = Math.hypot(ax, ay), bl = Math.hypot(bx, by);
      if (al < 0.0001 || bl < 0.0001) continue;
      const dot = clamp(-1, (ax * bx + ay * by) / (al * bl), 1);
      total += Math.abs(1 - dot);
      count++;
    }
    return count ? clamp(0, total / count, 1) : 0;
  }

  function analyzeDynamicStroke(rawPointCount, baseStroke, dabs){
    const pressures = dabs.map(d => d.pressure);
    const velocities = dabs.map(d => d.velocity);
    const pressureMin = pressures.length ? Math.min(...pressures) : 0;
    const pressureMax = pressures.length ? Math.max(...pressures) : 0;
    const copies = new Set(dabs.map(d => d.symmetryIndex)).size || (dabs.length ? 1 : 0);
    const jitter = jitterScore(baseStroke.samples || []);
    const replayCost = clamp(0, (dabs.length / 4096) + jitter * 0.35 + copies * 0.05, 1);
    return Object.freeze({
      rawPointCount,
      sampleCount: baseStroke.sampleCount || (baseStroke.samples || []).length,
      dabCount: dabs.length,
      symmetryCopies: copies,
      distance: baseStroke.distance || 0,
      averageRadius: avg(dabs.map(d => d.radius)),
      averageOpacity: avg(dabs.map(d => d.opacity)),
      averagePressure: avg(pressures),
      pressureRange: pressureMax - pressureMin,
      averageVelocity: avg(velocities),
      jitterScore: jitter,
      smoothnessScore: clamp(0, 1 - jitter, 1),
      replayCost,
    });
  }

  function planDynamicStroke(rawPoints, options){
    const engine = root && root.InkFrameBrushEngine;
    const vector = root && root.InkFrameVectorEngine;
    if (!engine || typeof engine.planStroke !== 'function') throw new Error('InkFrameBrushEngine is required');
    const opts = options || {};
    const brush = { brushProfile: opts.brushProfile || engine.DEFAULT_PROFILE, dynamics: preset(opts.dynamics || PRESETS['smooth-ink']) };
    const base = engine.planStroke(rawPoints || [], brush.brushProfile);
    const basePositions = base.samples.map(s => vec(s.x, s.y));
    const mode = opts.symmetryMode || 'none';
    const center = opts.symmetryCenter || vec(0, 0);
    const symmetryPositions = vector && typeof vector.symmetryCopies === 'function' ? vector.symmetryCopies(basePositions, mode, center) : [basePositions];
    const dabs = [];
    symmetryPositions.forEach((points, symmetryIndex) => {
      base.samples.forEach((sample, sampleIndex) => {
        dabs.push(dynamicDabFromSample(sample, base.stamps[sampleIndex], brush, sampleIndex, symmetryIndex, points[sampleIndex]));
      });
    });
    const quality = analyzeDynamicStroke((rawPoints || []).length, base, dabs);
    return Object.freeze({ baseStroke:base, dabs, dabCount:dabs.length, symmetryMode:mode, symmetryCenter:center, preset:brush.dynamics, quality });
  }

  function replayDescriptor(plan){
    const q = plan.quality || analyzeDynamicStroke(0, plan.baseStroke || {}, plan.dabs || []);
    return Object.freeze({
      version: VERSION,
      preset: plan.preset && plan.preset.id || 'smooth-ink',
      symmetry: plan.symmetryMode || 'none',
      symmetryCopies: String(q.symmetryCopies),
      rawPoints: String(q.rawPointCount),
      samples: String(q.sampleCount),
      dabs: String(q.dabCount),
      distance: String(q.distance),
      avgRadius: String(q.averageRadius),
      avgOpacity: String(q.averageOpacity),
      smoothness: String(q.smoothnessScore),
      replayCost: String(q.replayCost),
    });
  }

  const api = Object.freeze({
    VERSION,
    curve,
    Curves,
    PRESETS,
    preset,
    normalizePressure,
    velocityUnit,
    deterministicJitter,
    dynamicDabFromSample,
    jitterScore,
    analyzeDynamicStroke,
    planDynamicStroke,
    replayDescriptor,
  });

  if (root && typeof root === 'object') root.InkFrameBrushDynamics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
