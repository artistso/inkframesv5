// InkFrame Brush Engine V2 — deterministic foundation tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const files = [
  'brush-engine-v2/sample.js',
  'brush-engine-v2/validator.js',
  'brush-engine-v2/stabilizer.js',
  'brush-engine-v2/filters.js',
  'brush-engine-v2/path.js',
  'brush-engine-v2/arc-sampler.js',
  'brush-engine-v2/rasterizer.js',
  'brush-engine-v2/trace.js',
  'brush-engine-v2/engine.js',
];
const sandbox = { console, Math, Date, JSON, Object, Array, Number, String, Boolean, Map, Set, WeakMap, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of files) vm.runInContext(readFileSync(resolve(root, file), 'utf8'), sandbox, { filename: file });
const V2 = sandbox.InkFrameBrushV2;
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} ≉ ${b}`);
const sample = (x, y, time, pressure = 0.5) => V2.normalizeSample({ x, y, time, pressure, pointerType: 'pen' });

// Canonical samples clamp physical channels and preserve non-finite coordinates
// for the validator to reject instead of silently inventing geometry.
{
  const s = V2.normalizeSample({ x: 4, y: 5, time: 8, pressure: 4, tiltX: -120, tiltY: 120 });
  assert.equal(s.pressure, 1);
  assert.equal(s.tiltX, -90);
  assert.equal(s.tiltY, 90);
  assert.equal(V2.isFiniteSample(s), true);
  assert.equal(V2.isFiniteSample(V2.normalizeSample({ x: NaN, y: 2, time: 3 })), false);
}

// Isolated out-and-back jumps are quarantined and discarded.
{
  const guard = V2.createSampleValidator({ width: 1000, height: 800 });
  assert.equal(guard.begin(sample(100, 100, 0)).length, 1);
  assert.equal(guard.push(sample(108, 103, 8)).length, 1);
  assert.equal(guard.push(sample(300, 280, 16)).length, 0);
  const returned = guard.push(sample(116, 106, 24));
  assert.equal(returned.length, 1);
  assert.equal(returned[0].x, 116);
  assert.equal(guard.snapshot().reasons['isolated-spike'], 1);
}

// A legitimate fast continuation releases the held sample instead of flattening
// deliberate motion.
{
  const guard = V2.createSampleValidator({ width: 1200, height: 800 });
  guard.begin(sample(0, 0, 0));
  assert.equal(guard.push(sample(120, 0, 8)).length, 0);
  const continued = guard.push(sample(240, 0, 16));
  assert.equal(continued.length, 2);
  assert.equal(continued[0].x, 120);
  assert.equal(continued[1].x, 240);
}

// Time-constant filtering composes consistently across different event rates.
{
  const run = step => {
    const f = V2.createStrokeFilter({ stabilizerMode:'fixed', positionTimeConstantMs: 12, pressureTimeConstantMs: 12 });
    let out = f.begin(sample(0, 0, 0, 0));
    for (let t = step; t <= 120; t += step) out = f.update(sample(100, 0, t, 1));
    return out;
  };
  const slow = run(10), fast = run(2);
  near(slow.x, fast.x, 1e-7);
  near(slow.pressure, fast.pressure, 1e-7);
  assert.ok(slow.x > 99.9);
}

// Azimuth filtering crosses ±PI by the short route.
{
  const f = V2.createAngleFilter(10);
  f.reset(Math.PI - 0.05, 0);
  const out = f.update(-Math.PI + 0.05, 10);
  assert.ok(out > 3.0 && out < 3.3, `unexpected wrapped angle ${out}`);
}

// Every quadratic point remains inside the local control-point hull.
{
  const builder = V2.createQuadraticPathBuilder();
  builder.begin(sample(10, 10, 0));
  const segments = [
    ...builder.push(sample(60, 120, 8)),
    ...builder.push(sample(130, 20, 16)),
    ...builder.finish(),
  ];
  for (const segment of segments) {
    const xs = [segment.start.x, segment.control.x, segment.end.x];
    const ys = [segment.start.y, segment.control.y, segment.end.y];
    for (let i = 0; i <= 100; i++) {
      const p = V2.quadraticPoint(segment, i / 100);
      assert.ok(p.x >= Math.min(...xs) - 1e-9 && p.x <= Math.max(...xs) + 1e-9);
      assert.ok(p.y >= Math.min(...ys) - 1e-9 && p.y <= Math.max(...ys) + 1e-9);
    }
  }
}

// Arc-length sampling places dabs by physical distance, not event count.
{
  const arc = V2.createArcSampler({ spacingPx: 10, flattenTolerancePx: 0.5 });
  arc.begin(sample(0, 0, 0));
  const segment = { kind: 'quadratic', start: sample(0, 0, 0), control: sample(50, 0, 50), end: sample(100, 0, 100) };
  const dabs = arc.sampleSegment(segment);
  assert.ok(dabs.length >= 9 && dabs.length <= 10);
  let previous = sample(0, 0, 0);
  for (const dab of dabs) {
    const spacing = Math.hypot(dab.x - previous.x, dab.y - previous.y);
    near(spacing, 10, 0.12);
    previous = dab;
  }
}

function makeTrace(step) {
  const recorder = V2.createTraceRecorder({ name: `line-${step}` });
  recorder.begin({ x: 0, y: 30, time: 0, pressure: 0.15 });
  for (let t = step; t <= 160; t += step) recorder.move({ x: t * 0.5, y: 30, time: t, pressure: 0.15 + t / 200 });
  recorder.end({ x: 80, y: 30, time: 168, pressure: 0.95 });
  return recorder.snapshot();
}

// Recorded traces replay deterministically byte-for-byte.
{
  const trace = makeTrace(8);
  const a = V2.replayTrace(V2.createBrushEngine({ width: 500, height: 300 }), trace);
  const b = V2.replayTrace(V2.createBrushEngine({ width: 500, height: 300 }), trace);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.ok(a.length > 20);
}

// Equivalent straight strokes at low and high input rates converge to nearly the
// same endpoint and dab count.
{
  const low = V2.replayTrace(V2.createBrushEngine({ width: 500, height: 300 }), makeTrace(16));
  const high = V2.replayTrace(V2.createBrushEngine({ width: 500, height: 300 }), makeTrace(4));
  near(low.at(-1).x, high.at(-1).x, 1.5);
  assert.ok(Math.abs(low.length - high.length) <= 2, `${low.length} vs ${high.length}`);
}

// A real engine replay never emits geometry toward a rejected spike.
{
  const recorder = V2.createTraceRecorder({ name: 'spike' });
  recorder.begin({ x: 100, y: 100, time: 0, pressure: 0.5 });
  recorder.move({ x: 110, y: 104, time: 8, pressure: 0.5 });
  recorder.move({ x: 310, y: 300, time: 16, pressure: 0.5 });
  recorder.move({ x: 118, y: 108, time: 24, pressure: 0.5 });
  recorder.end({ x: 122, y: 110, time: 32, pressure: 0.5 });
  const engine = V2.createBrushEngine({ width: 1000, height: 800 });
  const dabs = V2.replayTrace(engine, recorder.snapshot());
  assert.ok(Math.max(...dabs.map(d => d.x)) < 140);
  assert.equal(engine.stats().validator.reasons['isolated-spike'], 1);
}

// Reference eraser uses explicit destination-out commands without patching the
// Canvas API globally.
{
  const engine = V2.createBrushEngine({ brushId: 'eraser', width: 500, height: 300 });
  const commands = engine.begin({ x: 20, y: 20, time: 0, pressure: 0.5 });
  assert.equal(commands[0].composite, 'destination-out');
  assert.equal(commands[0].brushId, 'eraser');
  assert.ok(commands[0].radius > 0);
}

console.log('✅ Brush Engine V2 foundation tests passed');
