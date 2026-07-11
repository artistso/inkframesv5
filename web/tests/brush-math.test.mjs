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
const { catmullRom, buildGrain, sampleGrain, easeAngle } = sandbox.module.exports;

const near = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≉ ${expected}`);
};

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

// Existing helpers remain intact.
{
  const grain = buildGrain(4, () => 0.5);
  near(sampleGrain(grain, 0, 0, 4), 0.5, 1e-6);
  near(sampleGrain(grain, -4, -4, 4), 0.5, 1e-6);
  const eased = easeAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
  near(eased, Math.PI, 1e-9);
}

console.log('✅ brush-math tests passed');
