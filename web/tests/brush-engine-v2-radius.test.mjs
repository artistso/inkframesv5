// InkFrame Brush Engine V2 — pressure-to-radius continuity tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const files = [
  'brush-engine-v2/sample.js',
  'brush-engine-v2/validator.js',
  'brush-engine-v2/filters.js',
  'brush-engine-v2/path.js',
  'brush-engine-v2/arc-sampler.js',
  'brush-engine-v2/radius.js',
  'brush-engine-v2/rasterizer.js',
  'brush-engine-v2/trace.js',
  'brush-engine-v2/engine.js',
  'brush-engine-v2/tuning.js',
];
const sandbox = { console, Math, Date, JSON, Object, Array, Number, String, Boolean, Map, Set, WeakMap, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of files) vm.runInContext(readFileSync(resolve(web, file), 'utf8'), sandbox, { filename:file });
const V2 = sandbox.InkFrameBrushV2;

const dab = (radius, x, time, index, start = false) => Object.freeze({
  kind:'round-dab', brushId:'ink', x, y:0, radius, opacity:1, hardness:1,
  composite:'source-over', coverage:'ribbon', pressure:0.5, time,
  tiltX:0, tiltY:0, azimuth:0, strokeId:1, strokeIndex:index, strokeStart:start,
});

// A near-stationary one-sample width excursion is bounded.
{
  const guard = V2.createRadiusContinuityGuard({
    size:14,
    minimumDeltaPx:0.25,
    distanceFactor:0.1,
    timeFactorPxPerMs:0.02,
  });
  const a = guard.apply(dab(2, 0, 0, 0, true));
  const b = guard.apply(dab(7, 0.5, 8, 1));
  assert.equal(a.radius, 2);
  assert.ok(b.radius < 3, `unexpected unbounded radius ${b.radius}`);
  assert.equal(b.rawRadius, 7);
  assert.equal(b.radiusGuarded, true);
  assert.equal(guard.stats().clamped, 1);
}

// Deliberate width ramps remain monotonic and converge rather than flattening.
{
  const guard = V2.createRadiusContinuityGuard({ size:20 });
  const values = [2, 3, 4, 5, 6, 7].map((radius, index) =>
    guard.apply(dab(radius, index * 4, index * 12, index, index === 0)).radius
  );
  for (let i = 1; i < values.length; i++) assert.ok(values[i] >= values[i - 1]);
  assert.ok(values.at(-1) > 5.5, values.join(','));
}

// A fresh stroke resets prior width state and cannot connect to the previous gesture.
{
  const guard = V2.createRadiusContinuityGuard({ size:14 });
  guard.apply(dab(2, 0, 0, 0, true));
  guard.apply(dab(3, 5, 8, 1));
  const next = guard.apply({ ...dab(8, 100, 16, 0, true), strokeId:2 });
  assert.equal(next.radius, 8);
  assert.equal(next.radiusGuarded, false);
}

// Raw mode is a byte-stable pass-through for historical traces and direct comparison.
{
  const guard = V2.createRadiusContinuityGuard({ enabled:false, size:14 });
  const output = guard.apply(dab(9, 1, 8, 1));
  assert.equal(output.radius, 9);
  assert.equal(output.rawRadius, 9);
  assert.equal(output.radiusGuarded, false);
  assert.equal(guard.stats().clamped, 0);
}

// New V2 presets enable guarded radius continuity and embed it in the effective profile.
{
  const tuning = V2.presetValue('balanced');
  assert.equal(tuning.radiusMode, 'guarded');
  const profile = V2.applyTuningToProfile({ size:14, spacing:0.05 }, tuning);
  assert.equal(profile.radiusMode, 'guarded');
  assert.equal(V2.normalizeTuning({ radiusMode:'raw' }).radiusMode, 'raw');
}

// The complete engine exposes clamp diagnostics and only guards profiles that opt in.
{
  const guardedProfile = V2.applyTuningToProfile(
    { size:20, minSize:0.05, opacity:1, spacing:0.05, hardness:1, response:0 },
    V2.presetValue('balanced')
  );
  const guarded = V2.createBrushEngine({ width:500, height:300, profile:guardedProfile });
  guarded.begin({ x:0, y:0, pressure:0.05, time:0 });
  guarded.move({ x:1, y:0, pressure:1, time:8 });
  guarded.move({ x:2, y:0, pressure:0.05, time:16 });
  guarded.end({ x:3, y:0, pressure:0.05, time:24 });
  assert.equal(guarded.stats().radius.enabled, true);
  assert.ok(guarded.stats().radius.processed > 0);

  const raw = V2.createBrushEngine({
    width:500,
    height:300,
    profile:{ size:20, minSize:0.05, opacity:1, spacing:0.05, hardness:1, response:0, radiusMode:'raw' },
  });
  raw.begin({ x:0, y:0, pressure:0.05, time:0 });
  raw.move({ x:1, y:0, pressure:1, time:8 });
  raw.end({ x:2, y:0, pressure:0.05, time:16 });
  assert.equal(raw.stats().radius.enabled, false);
  assert.equal(raw.stats().radius.clamped, 0);
}

console.log('✅ brush-engine-v2 radius continuity tests passed');
