// InkFrame — brush-engine math helpers
// -----------------------------------------------------------------------------
// Pure math used by the paint engine. No DOM, no canvas, no globals -- safe to
// unit-test in Node and safe to move to WASM later without dragging the app
// state along. The heavier dab()/seg*() live in index.html because they touch
// module-level paint state (brush, color, opacity, size, ...); this file is
// just the underlying primitives they compose.
'use strict';

// ============================================================================
// Paper grain -- a value-noise field the dry-media brushes (pencil / marker)
// bite into. Tiled at GW=256 so repeat passes reveal the same tooth (like
// graphite catching on paper fibres).
// ============================================================================

/** Default grain field size in pixels; tiled. */
const GRAIN_SIZE = 256;

/**
 * Build a fresh grain field. Returns a Float32Array of length `size*size`
 * with values in [0, 1]. Blur-soft clumps + fine raw fibre mixed 60/40.
 *
 * @param {number} [size]  side length in px (default 256)
 * @param {() => number} [rand]  RNG (default Math.random); accept an override
 *                                so tests get deterministic output.
 * @returns {Float32Array}
 */
function buildGrain(size, rand) {
  const N = size || GRAIN_SIZE;
  const r = rand || Math.random;
  const raw = new Float32Array(N * N);
  for (let i = 0; i < raw.length; i++) raw[i] = r();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // 3x3 box blur, wrapped
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          s += raw[(((y + dy) + N) % N) * N + (((x + dx) + N) % N)];
      out[y * N + x] = (s / 9) * 0.6 + raw[y * N + x] * 0.4;
    }
  }
  return out;
}

/**
 * Sample the tiled grain field at canvas-space (x, y). Returns [0, 1].
 * @param {Float32Array} grain
 * @param {number} x
 * @param {number} y
 * @param {number} [size]
 * @returns {number}
 */
function sampleGrain(grain, x, y, size) {
  const N = size || GRAIN_SIZE;
  const ix = (((x | 0) % N) + N) % N;
  const iy = (((y | 0) % N) + N) % N;
  return grain[iy * N + ix];
}

// ============================================================================
// Angle + colour utilities
// ============================================================================

/**
 * Shortest-path angle ease (handles the -PI..PI wrap so a swivelling nib never
 * spins the long way round). k in [0, 1]; typical values 0.15..0.35.
 * @param {number} cur   current angle in radians
 * @param {number} tgt   target angle in radians
 * @param {number} k     lerp amount
 * @returns {number}     eased angle in radians
 */
function easeAngle(cur, tgt, k) {
  const tau = 2 * Math.PI;
  // JavaScript's % is a signed remainder, not a mathematical modulo. Normalize
  // twice so crossing -PI/PI always chooses the short rotation direction.
  const dA = ((((tgt - cur + Math.PI) % tau) + tau) % tau) - Math.PI;
  return cur + dA * k;
}

/**
 * Convert a #rrggbb hex color + alpha into a CSS `rgba(r,g,b,a)` string.
 * @param {string} hex  '#RRGGBB'
 * @param {number} a    alpha 0..1
 * @returns {string}
 */
function hexWithAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ============================================================================
// Catmull-Rom (centripetal, alpha 0.5) point sampler.
// Feeds the smooth stroke path -- pushSample() in index.html accumulates a
// rolling 4-sample window and this function paints the segment between p1
// and p2 as a curve rather than a straight line.
// ============================================================================

const KNOT_EPSILON = 1e-4;

/**
 * Return a centripetal knot interval. The fourth root is intentional:
 * distance is sqrt(dx²+dy²), then alpha=0.5 applies another square root.
 * A small floor keeps repeated/coalesced pointer samples numerically stable.
 *
 * @param {[number,number]} a
 * @param {[number,number]} b
 * @returns {number}
 */
function knotInterval(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.max(KNOT_EPSILON, Math.pow(dx * dx + dy * dy, 0.25));
}

/**
 * Linear interpolation evaluated on an arbitrary knot interval.
 *
 * @param {[number,number]} a
 * @param {[number,number]} b
 * @param {number} ta
 * @param {number} tb
 * @param {number} u
 * @returns {[number,number]}
 */
function interpolateAt(a, b, ta, tb, u) {
  const span = tb - ta;
  if (Math.abs(span) < KNOT_EPSILON) return [a[0], a[1]];
  const wa = (tb - u) / span;
  const wb = (u - ta) / span;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
}

/**
 * Evaluate the Catmull-Rom segment through (p1, p2) using true centripetal
 * parameterization. Unlike the old uniform polynomial basis, this respects
 * the physical distance between stylus samples, preventing loops, hooks, and
 * corner overshoot when Android delivers events at uneven spacing.
 *
 * The signature remains unchanged so the paint engine and fallback path keep
 * working without profile migrations or UI changes.
 *
 * @param {number} t   0..1 within the (p1, p2) segment
 * @param {[number,number]} p0
 * @param {[number,number]} p1
 * @param {[number,number]} p2
 * @param {[number,number]} p3
 * @returns {[number, number]}
 */
function catmullRom(t, p0, p1, p2, p3) {
  const clampedT = Math.max(0, Math.min(1, t));
  const t0 = 0;
  const t1 = t0 + knotInterval(p0, p1);
  const t2 = t1 + knotInterval(p1, p2);
  const t3 = t2 + knotInterval(p2, p3);
  const u = t1 + (t2 - t1) * clampedT;

  // Barry-Goldman evaluation of the non-uniform Catmull-Rom spline.
  const a1 = interpolateAt(p0, p1, t0, t1, u);
  const a2 = interpolateAt(p1, p2, t1, t2, u);
  const a3 = interpolateAt(p2, p3, t2, t3, u);
  const b1 = interpolateAt(a1, a2, t0, t2, u);
  const b2 = interpolateAt(a2, a3, t1, t3, u);
  return interpolateAt(b1, b2, t1, t2, u);
}

// ---- UMD-lite export ------------------------------------------------------
// Block-scoped so multiple modules inlined into one <script> (e.g. the CI
// boot smoke test) don't collide on top-level `const _api`.
{
  const _api = { GRAIN_SIZE, buildGrain, sampleGrain, easeAngle, hexWithAlpha, catmullRom };
  if (typeof window !== 'undefined') window.InkFrameBrushMath = _api;
  if (typeof module !== 'undefined' && module.exports) module.exports = _api;
}
