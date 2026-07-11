// InkFrame -- brush-math regression tests
// Verifies pure paint-path and stylus-input primitives without a browser/canvas.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '..', 'brush-math.js'), 'utf8');
const sandbox = { module: { exports: {} }, exports: {}, Math, Float32Array };
vm.runInNewContext(source, sandbox, { filename: 'brush-math.js' });

const {
  catmullRom,
  buildGrain,
  sampleGrain,
  easeAngle,
  isIsolatedPointerSpike,
  filterPointerSamples,
  interpolatePointerSample,
  resamplePointerSamples,
  isHardPointerJump,
} = sandbox.module.exports;

const near = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≉ ${expected}`);
};

const ev = (x, y, t = 0, extra = {}) => ({
  clientX: x,
  clientY: y,
  timeStamp: t,
  pressure: 0.5,
  tiltX: 0,
  tiltY: 0,
  pointerType: 'pen',
  ...extra,
});

const guardState = (x = 0, y = 0, t = 0, recentStep = 4) => ({
  last: { x, y, t, event: ev(x, y, t) },
  pending: null,
  recentStep,
  dropped: 0,
});

const resampleState = () => ({
  resampleInput: null,
  resampleNextT: NaN,
});

assert.equal(typeof catmullRom, 'function');

// Segment endpoints must remain exact.
{
  const points = [[0, 0], [2, 3], [9, 7], [12, 1]];
  const start = catmullRom(0, ...points);
  const end = catmullRom(1, ...points);
  near(start[0], points[1][0]); near(start[1], points[1][1]);
  near(end[0], points[2][0]); near(end[1], points[2][1]);
}

// Collinear samples should remain collinear and preserve the midpoint.
{
  const p = catmullRom(0.5, [0, 0], [10, 10], [20, 20], [30, 30]);
  near(p[0], 15);
  near(p[1], 15);
}

// Tiny middle segment surrounded by long samples must not overshoot.
{
  const points = [[0, 0], [10, 0], [10.01, 0.01], [20, 10]];
  for (let i = 0; i <= 100; i++) {
    const [x, y] = catmullRom(i / 100, ...points);
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= 10 - 1e-9 && x <= 10.01 + 1e-9, `x overshoot at ${i}: ${x}`);
    assert.ok(y >= -1e-9 && y <= 0.01 + 1e-9, `y overshoot at ${i}: ${y}`);
  }
}

// Repeated/coalesced samples must remain finite.
{
  const points = [[4, 4], [4, 4], [8, 9], [8, 9]];
  for (let i = 0; i <= 20; i++) {
    const p = catmullRom(i / 20, ...points);
    assert.ok(p.every(Number.isFinite));
  }
}

// One coordinate teleports and returns: reject it as an input spike.
{
  const a = { x: 100, y: 100 };
  const b = { x: 780, y: 620 };
  const c = { x: 108, y: 104 };
  assert.equal(isIsolatedPointerSpike(a, b, c, 5), true);
}

// Same-batch outlier removal.
{
  const s = guardState(100, 100, 0, 5);
  const good1 = ev(106, 103, 4);
  const spike = ev(780, 620, 8);
  const good2 = ev(112, 106, 12);
  const out = filterPointerSamples(s, [good1, spike, good2]);
  assert.equal(out.length, 2);
  assert.equal(out[0], good1);
  assert.equal(out[1], good2);
  assert.equal(s.dropped, 1);
}

// Cross-batch quarantine removes an out-and-back terminal jump.
{
  const s = guardState(100, 100, 0, 5);
  const spike = ev(760, 610, 8);
  assert.equal(filterPointerSamples(s, [spike]).length, 0);
  assert.ok(s.pending);
  const good = ev(109, 105, 12);
  const second = filterPointerSamples(s, [good]);
  assert.equal(second.length, 1);
  assert.equal(second[0], good);
  assert.equal(s.pending, null);
  assert.equal(s.dropped, 1);
}

// Real fast travel is released when the next sample confirms continuation.
{
  const s = guardState(0, 0, 0, 4);
  const fast1 = ev(160, 0, 16);
  assert.equal(filterPointerSamples(s, [fast1]).length, 0);
  const fast2 = ev(320, 0, 32);
  const out = filterPointerSamples(s, [fast2]);
  assert.equal(out.length, 2);
  assert.equal(out[0], fast1);
  assert.equal(out[1], fast2);
  assert.equal(s.dropped, 0);
}

// Synthetic samples interpolate geometry, pressure, and tilt.
{
  const a = ev(0, 0, 0, { pressure: 0.2, tiltX: 10, tiltY: -10 });
  const b = ev(16, 8, 16, { pressure: 0.8, tiltX: 30, tiltY: 10 });
  const mid = interpolatePointerSample(a, b, 0.5, 8);
  near(mid.clientX, 8);
  near(mid.clientY, 4);
  near(mid.pressure, 0.5);
  near(mid.tiltX, 20);
  near(mid.tiltY, 0);
  near(mid.timeStamp, 8);
}

// 60 Hz input (16 ms) becomes a stable 8 ms stream.
{
  const s = resampleState();
  const out = resamplePointerSamples(s, [
    ev(0, 0, 0, { pressure: 0.2 }),
    ev(16, 0, 16, { pressure: 0.6 }),
    ev(32, 0, 32, { pressure: 1.0 }),
  ], 8);
  assert.deepEqual(Array.from(out, x => x.timeStamp), [0, 8, 16, 24, 32]);
  assert.deepEqual(Array.from(out, x => Math.round(x.clientX)), [0, 8, 16, 24, 32]);
  near(out[1].pressure, 0.4);
  near(out[3].pressure, 0.8);
}

// 240 Hz input (4 ms) decimates to the same 8 ms cadence.
{
  const s = resampleState();
  const events = [];
  for (let t = 0; t <= 32; t += 4) events.push(ev(t, 0, t));
  const out = resamplePointerSamples(s, events, 8);
  assert.deepEqual(Array.from(out, x => x.timeStamp), [0, 8, 16, 24, 32]);
  assert.deepEqual(Array.from(out, x => Math.round(x.clientX)), [0, 8, 16, 24, 32]);
}

// Equivalent 60 Hz and 240 Hz paths produce identical normalized geometry.
{
  const slowState = resampleState();
  const fastState = resampleState();
  const slow = resamplePointerSamples(slowState, [
    ev(0, 0, 0),
    ev(32, 16, 16),
    ev(64, 32, 32),
  ], 8);
  const fastEvents = [];
  for (let t = 0; t <= 32; t += 4) fastEvents.push(ev(t * 2, t, t));
  const fast = resamplePointerSamples(fastState, fastEvents, 8);
  assert.deepEqual(
    Array.from(slow, x => [Math.round(x.clientX), Math.round(x.clientY), x.timeStamp]),
    Array.from(fast, x => [Math.round(x.clientX), Math.round(x.clientY), x.timeStamp]),
  );
}

// A dwell gap resets cadence instead of generating a burst of synthetic points.
{
  const s = resampleState();
  const out = resamplePointerSamples(s, [
    ev(0, 0, 0),
    ev(8, 0, 8),
    ev(12, 0, 200),
  ], 8);
  assert.deepEqual(Array.from(out, x => x.timeStamp), [0, 8, 200]);
}

// Dispatched-event safety net rejects only an impossible teleport.
{
  const s = { outerLast: { x: 20, y: 20, t: 0 }, outerStep: 5 };
  assert.equal(isHardPointerJump(s, ev(500, 500, 10)), true);
  assert.equal(isHardPointerJump(s, ev(60, 50, 10)), false);
}

// Existing helpers remain intact.
{
  const grain = buildGrain(4, () => 0.5);
  near(sampleGrain(grain, 0, 0, 4), 0.5, 1e-6);
  near(sampleGrain(grain, -4, -4, 4), 0.5, 1e-6);
  const eased = easeAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
  near(eased, Math.PI, 1e-9);
}

console.log('✅ brush-math tests passed');
