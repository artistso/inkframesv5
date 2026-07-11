// InkFrame — per-brush velocity dynamics
// -----------------------------------------------------------------------------
// Pure, deterministic response curves that translate normalized stroke speed
// into width, opacity, flow, and spacing multipliers. The paint engine reports
// speed in its existing drawVel units: canvas pixels travelled per 16 ms.
//
// This module intentionally contains no DOM or canvas code. Runtime wiring can
// consume the same functions in the browser, while Node tests lock down brush
// feel before the Brush Lab exposes editable dynamics controls.
'use strict';

const SPEED_EPSILON = 1e-6;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp01 = value => clamp(Number(value) || 0, 0, 1);

/**
 * Shipped velocity-response profiles.
 *
 * Signed channel values are proportional changes at maximum speed:
 *   -0.25 => 25% less at speed
 *   +0.20 => 20% more at speed
 *
 * `speedStart` and `speedEnd` use InkFrame drawVel units (px / 16 ms).
 */
const DEFAULT_VELOCITY_PROFILES = Object.freeze({
  pencil: Object.freeze({
    speedStart: 1.2, speedEnd: 15, curve: 1.15,
    width: -0.14, opacity: -0.28, flow: -0.18, spacing: 0.12,
  }),
  ink: Object.freeze({
    speedStart: 1.5, speedEnd: 18, curve: 1.25,
    width: -0.36, opacity: -0.06, flow: -0.04, spacing: -0.05,
  }),
  marker: Object.freeze({
    speedStart: 1.0, speedEnd: 14, curve: 1.10,
    width: -0.08, opacity: -0.14, flow: -0.10, spacing: -0.08,
  }),
  water: Object.freeze({
    speedStart: 0.8, speedEnd: 13, curve: 1.05,
    width: -0.10, opacity: -0.30, flow: -0.34, spacing: 0.10,
  }),
  frost: Object.freeze({
    speedStart: 1.0, speedEnd: 14, curve: 1.10,
    width: -0.06, opacity: -0.18, flow: -0.20, spacing: 0.06,
  }),
  smudge: Object.freeze({
    speedStart: 1.0, speedEnd: 16, curve: 1.15,
    width: 0, opacity: -0.16, flow: -0.25, spacing: -0.05,
  }),
  glow: Object.freeze({
    speedStart: 1.5, speedEnd: 18, curve: 1.20,
    width: -0.04, opacity: -0.08, flow: -0.08, spacing: -0.04,
  }),
  neon: Object.freeze({
    speedStart: 1.5, speedEnd: 20, curve: 1.25,
    width: -0.12, opacity: 0.02, flow: 0.04, spacing: -0.08,
  }),
  star: Object.freeze({
    speedStart: 1.0, speedEnd: 18, curve: 1.10,
    width: 0, opacity: 0, flow: 0, spacing: 0.18,
  }),
  eraser: Object.freeze({
    speedStart: 1.5, speedEnd: 20, curve: 1.20,
    width: 0, opacity: 0, flow: 0, spacing: -0.05,
  }),
});

const NEUTRAL_PROFILE = Object.freeze({
  speedStart: 0,
  speedEnd: 1,
  curve: 1,
  width: 0,
  opacity: 0,
  flow: 0,
  spacing: 0,
});

/** Merge a shipped profile with optional per-brush overrides. */
function resolveVelocityProfile(brushId, overrides) {
  const base = DEFAULT_VELOCITY_PROFILES[brushId] || NEUTRAL_PROFILE;
  if (!overrides || typeof overrides !== 'object') return { ...base };

  const out = { ...base };
  for (const key of [
    'speedStart', 'speedEnd', 'curve',
    'width', 'opacity', 'flow', 'spacing',
  ]) {
    const value = Number(overrides[key]);
    if (Number.isFinite(value)) out[key] = value;
  }

  out.speedStart = Math.max(0, out.speedStart);
  out.speedEnd = Math.max(out.speedStart + SPEED_EPSILON, out.speedEnd);
  out.curve = clamp(out.curve, 0.25, 4);
  out.width = clamp(out.width, -0.8, 1.0);
  out.opacity = clamp(out.opacity, -0.95, 1.0);
  out.flow = clamp(out.flow, -0.95, 1.0);
  out.spacing = clamp(out.spacing, -0.75, 1.5);
  return out;
}

/**
 * Normalize speed into a curved 0..1 response amount.
 * Smoothstep removes a hard knee at the start/end thresholds; `curve` then
 * controls how quickly the brush reaches its fast-stroke character.
 */
function velocityAmount(speed, profileOrStart, end, curve) {
  const profile = typeof profileOrStart === 'object'
    ? profileOrStart
    : {
        speedStart: Number(profileOrStart) || 0,
        speedEnd: Number(end) || 1,
        curve: Number(curve) || 1,
      };

  const start = Math.max(0, Number(profile.speedStart) || 0);
  const finish = Math.max(start + SPEED_EPSILON, Number(profile.speedEnd) || 1);
  const raw = clamp01(((Number(speed) || 0) - start) / (finish - start));
  const smooth = raw * raw * (3 - 2 * raw);
  return Math.pow(smooth, clamp(Number(profile.curve) || 1, 0.25, 4));
}

function multiplier(amount, response, min, max) {
  return clamp(1 + (Number(response) || 0) * amount, min, max);
}

/**
 * Return safe per-channel multipliers for one brush sample.
 */
function velocityDynamics(brushId, speed, overrides) {
  const profile = resolveVelocityProfile(brushId, overrides);
  const amount = velocityAmount(speed, profile);
  return {
    amount,
    width: multiplier(amount, profile.width, 0.20, 2.00),
    opacity: multiplier(amount, profile.opacity, 0.05, 1.50),
    flow: multiplier(amount, profile.flow, 0.05, 1.50),
    spacing: multiplier(amount, profile.spacing, 0.25, 2.00),
    profile,
  };
}

/**
 * Apply dynamics to concrete paint values. This is the intended runtime entry
 * point once index.html is wired to the model.
 */
function applyVelocityDynamics(values, brushId, speed, overrides) {
  const input = values || {};
  const dynamics = velocityDynamics(brushId, speed, overrides);
  const width = Math.max(0, (Number(input.width) || 0) * dynamics.width);
  const opacity = clamp((Number(input.opacity) || 0) * dynamics.opacity, 0, 1);
  const flow = clamp((Number(input.flow) || 0) * dynamics.flow, 0, 1);
  const spacing = Math.max(0.01, (Number(input.spacing) || 0) * dynamics.spacing);
  return { width, opacity, flow, spacing, dynamics };
}

{
  const api = {
    DEFAULT_VELOCITY_PROFILES,
    resolveVelocityProfile,
    velocityAmount,
    velocityDynamics,
    applyVelocityDynamics,
  };
  if (typeof window !== 'undefined') window.InkFrameBrushDynamics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}
