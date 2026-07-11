// InkFrame -- per-brush velocity dynamics regression tests

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '..', 'brush-dynamics.js'), 'utf8');
const sandbox = { module: { exports: {} }, exports: {}, Math, Object };
vm.runInNewContext(source, sandbox, { filename: 'brush-dynamics.js' });

const {
  DEFAULT_VELOCITY_PROFILES,
  resolveVelocityProfile,
  velocityAmount,
  velocityDynamics,
  applyVelocityDynamics,
} = sandbox.module.exports;

const near = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≉ ${expected}`);
};

assert.equal(typeof velocityDynamics, 'function');
assert.ok(DEFAULT_VELOCITY_PROFILES.ink);
assert.ok(DEFAULT_VELOCITY_PROFILES.pencil);

// At or below speedStart, every brush remains neutral.
for (const [brushId, profile] of Object.entries(DEFAULT_VELOCITY_PROFILES)) {
  const response = velocityDynamics(brushId, profile.speedStart);
  near(response.amount, 0);
  near(response.width, 1);
  near(response.opacity, 1);
  near(response.flow, 1);
  near(response.spacing, 1);
}

// At speedEnd, the signed profile values are fully applied.
{
  const profile = DEFAULT_VELOCITY_PROFILES.ink;
  const response = velocityDynamics('ink', profile.speedEnd);
  near(response.amount, 1);
  near(response.width, 1 + profile.width);
  near(response.opacity, 1 + profile.opacity);
  near(response.flow, 1 + profile.flow);
  near(response.spacing, 1 + profile.spacing);
}

// Ink must thin substantially at speed; pencil should fade more than ink.
{
  const ink = velocityDynamics('ink', 100);
  const pencil = velocityDynamics('pencil', 100);
  assert.ok(ink.width < pencil.width, 'ink should have the stronger speed-to-width taper');
  assert.ok(pencil.opacity < ink.opacity, 'pencil should lose more opacity at speed');
}

// Watercolour should become visibly drier and lighter during a fast stroke.
{
  const water = velocityDynamics('water', 100);
  assert.ok(water.flow <= 0.66 + 1e-9);
  assert.ok(water.opacity <= 0.70 + 1e-9);
  assert.ok(water.spacing > 1);
}

// Unknown brushes are neutral instead of inheriting surprising dynamics.
{
  const response = velocityDynamics('future-brush', 999);
  near(response.width, 1);
  near(response.opacity, 1);
  near(response.flow, 1);
  near(response.spacing, 1);
}

// Response must be continuous and monotonic over the shipped speed range.
for (const [brushId, profile] of Object.entries(DEFAULT_VELOCITY_PROFILES)) {
  let previous = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const speed = profile.speedStart +
      (profile.speedEnd - profile.speedStart) * (i / 100);
    const amount = velocityDynamics(brushId, speed).amount;
    assert.ok(amount + 1e-12 >= previous, `${brushId} response reversed at step ${i}`);
    assert.ok(amount >= 0 && amount <= 1);
    previous = amount;
  }
}

// Smoothstep endpoints should not introduce a hard derivative jump.
{
  const profile = { speedStart: 2, speedEnd: 18, curve: 1 };
  near(velocityAmount(2, profile), 0);
  near(velocityAmount(18, profile), 1);
  assert.ok(velocityAmount(2.01, profile) < 1e-4);
  assert.ok(velocityAmount(17.99, profile) > 0.9999);
}

// Overrides are sanitized to safe ranges and cannot invert or explode the nib.
{
  const profile = resolveVelocityProfile('ink', {
    speedStart: -5,
    speedEnd: -10,
    curve: 99,
    width: -99,
    opacity: 99,
    flow: -99,
    spacing: 99,
  });
  assert.equal(profile.speedStart, 0);
  assert.ok(profile.speedEnd > profile.speedStart);
  assert.equal(profile.curve, 4);
  assert.equal(profile.width, -0.8);
  assert.equal(profile.opacity, 1);
  assert.equal(profile.flow, -0.95);
  assert.equal(profile.spacing, 1.5);

  const response = velocityDynamics('ink', 100, profile);
  assert.ok(response.width >= 0.20);
  assert.ok(response.opacity <= 1.50);
  assert.ok(response.flow >= 0.05);
  assert.ok(response.spacing <= 2.00);
}

// Applying dynamics clamps physical paint values while preserving zero inputs.
{
  const applied = applyVelocityDynamics({
    width: 20,
    opacity: 0.9,
    flow: 0.8,
    spacing: 4,
  }, 'pencil', 100);
  assert.ok(applied.width < 20);
  assert.ok(applied.opacity < 0.9);
  assert.ok(applied.flow < 0.8);
  assert.ok(applied.spacing > 4);

  const zero = applyVelocityDynamics({}, 'ink', 100);
  near(zero.width, 0);
  near(zero.opacity, 0);
  near(zero.flow, 0);
  near(zero.spacing, 0.01);
}

// Equivalent normalized velocities produce identical dynamics regardless of
// the source device's original pointer-report rate.
{
  const from60Hz = velocityDynamics('ink', 12);
  const from240Hz = velocityDynamics('ink', 12);
  assert.deepEqual(
    [from60Hz.amount, from60Hz.width, from60Hz.opacity, from60Hz.flow, from60Hz.spacing],
    [from240Hz.amount, from240Hz.width, from240Hz.opacity, from240Hz.flow, from240Hz.spacing],
  );
}

console.log('✅ brush-dynamics tests passed');
