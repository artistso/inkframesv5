// InkFrame -- brush-math regression tests
// Verifies the pure paint-path primitives without a browser or canvas.

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
  isHardPointerJump,
} = sandbox.module.exports;

const near = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≉ ${expected}`);
};
const ev = (x, y, t = 0) => ({ clientX: x, clientY: y, timeStamp: t, pointerType: 'pen' });
const state = (x = 0, y = 0, t = 0, recentStep = 4) => ({
  last: { x, y, t, event: ev(x, y, t) },
  pending: null,
  recentStep,
  dropped: 0,
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

// Collinear samples should remain collinear and preserve the segment midpoint.
{
  const p = catmullRom(0.5, [0, 0], [10, 10], [20, 20], [30, 30]);
  near(p[0], 15);
  near(p[1], 15);
}

// Regression: a tiny middle segment surrounded by long, uneven samples caused
// the old uniform basis to hook almost a full pixel outside a 0.01 px segment.
// Centripetal parameterization must remain inside this local segment corridor.
{
  const points = [[0, 0], [10, 0], [10.01, 0.01], [20, 10]];
  for (let i = 0; i <= 100; i++) {
    const [x, y] = catmullRom(i / 100, ...points);
    assert.ok(Number.isFinite(x) && Number.isFinite(y), 'spline emitted a non-finite point');
    assert.ok(x >= 10 - 1e-9 && x <= 10.01 + 1e-9, `x overshoot at ${i}: ${x}`);
    assert.ok(y >= -1e-9 && y <= 0.01 + 1e-9, `y overshoot at ${i}: ${y}`);
  }
}

// Repeated/coalesced samples are common at pen-down and must never divide by 0.
{
  const points = [[4, 4], [4, 4], [8, 9], [8, 9]];
  for (let i = 0; i <= 20; i++) {
    const p = catmullRom(i / 20, ...points);
    assert.ok(p.every(Number.isFinite), `duplicate-point spline failed at ${i}`);
  }
}

// Tablet regression: one coordinate teleports hundreds of pixels and the next
// coordinate returns to the real path. This is an input spike, not a sharp turn.
{
  const a = { x: 100, y: 100 };
  const b = { x: 780, y: 620 };
  const c = { x: 108, y: 104 };
  assert.equal(isIsolatedPointerSpike(a, b, c, 5), true);
}

// Same-batch outlier removal: keep the real points, drop only the excursion.
{
  const s = state(100, 100, 0, 5);
  const good1 = ev(106, 103, 4);
  const spike = ev(780, 620, 8);
  const good2 = ev(112, 106, 12);
  const out = filterPointerSamples(s, [good1, spike, good2]);
  assert.equal(out.length, 2);
  assert.equal(out[0], good1);
  assert.equal(out[1], good2);
  assert.equal(s.dropped, 1);
  assert.equal(s.pending, null);
}

// Cross-batch quarantine: do not paint an unconfirmed final jump. Drop it when
// the next dispatched move returns to the original path.
{
  const s = state(100, 100, 0, 5);
  const spike = ev(760, 610, 8);
  const first = filterPointerSamples(s, [spike]);
  assert.equal(first.length, 0);
  assert.ok(s.pending, 'large terminal sample should be quarantined');
  const good = ev(109, 105, 12);
  const second = filterPointerSamples(s, [good]);
  assert.equal(second.length, 1);
  assert.equal(second[0], good);
  assert.equal(s.pending, null);
  assert.equal(s.dropped, 1);
}

// A real fast stroke that continues in the same direction must survive. The
// first long sample is released when the next one confirms continued travel.
{
  const s = state(0, 0, 0, 4);
  const fast1 = ev(160, 0, 16);
  assert.equal(filterPointerSamples(s, [fast1]).length, 0);
  const fast2 = ev(320, 0, 32);
  const out = filterPointerSamples(s, [fast2]);
  assert.equal(out.length, 2);
  assert.equal(out[0], fast1);
  assert.equal(out[1], fast2);
  assert.equal(s.pending, null);
  assert.equal(s.dropped, 0);
}

// The dispatched-event safety net rejects only an impossible teleport.
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
