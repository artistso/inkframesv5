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
  let dA = ((tgt - cur + Math.PI) % (2 * Math.PI)) - Math.PI;
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
// Catmull-Rom (centripetal, tension 0.5) point sampler.
// Feeds the smooth stroke path -- pushSample() in index.html accumulates a
// rolling 4-sample window and this function paints the segment between p1
// and p2 as a curve rather than a straight line.
// ============================================================================

/**
 * Evaluate a Catmull-Rom segment through (p1, p2) using p0 and p3 as tangent
 * hints. Standard tension-0.5 basis; adequate for the sample density the
 * paint engine emits (StreamLine already smooths inputs).
 * @param {number} t   0..1 within the (p1, p2) segment
 * @param {[number,number]} p0
 * @param {[number,number]} p1
 * @param {[number,number]} p2
 * @param {[number,number]} p3
 * @returns {[number, number]}
 */
function catmullRom(t, p0, p1, p2, p3) {
  const tt = t * t, ttt = tt * t;
  const b0 = -0.5 * ttt +     tt - 0.5 * t;
  const b1 =  1.5 * ttt - 2.5 * tt         + 1;
  const b2 = -1.5 * ttt + 2.0 * tt + 0.5 * t;
  const b3 =  0.5 * ttt - 0.5 * tt;
  return [
    b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
    b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
  ];
}

// ---- UMD-lite export ------------------------------------------------------
const _api = { GRAIN_SIZE, buildGrain, sampleGrain, easeAngle, hexWithAlpha, catmullRom };
if (typeof window !== 'undefined') window.InkFrameBrushMath = _api;
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
