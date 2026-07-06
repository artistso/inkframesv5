// InkFrame — scanline flood fill
// -----------------------------------------------------------------------------
// Pure algorithm, no DOM. A 1:1 port of core-common/src/main/kotlin/com/inkframe/
// core/common/FloodFill.kt so bug fixes port back trivially in either direction
// (same pattern established by gif-encoder.js).
//
// Uses the classic span-based (scanline) algorithm: for each seed, fill the
// contiguous horizontal run, then queue the rows above and below. This is far
// cheaper than a naive 4-way recursion and won't blow the JS call stack on
// large regions (2048x2048 fills stay comfortably under a few ms typical).
//
// Matching uses a per-channel tolerance against the ORIGINAL colour at the
// seed, so anti-aliased edges can be included by raising `tolerance`. Already-
// target pixels are treated as a no-op to avoid infinite loops when
// fill === target.
//
// The important pixel-format detail: on little-endian machines (which is every
// browser + Android WebView), a canvas ImageData's Uint32Array view stores
// pixels as 0xAABBGGRR (native byte order). This module doesn't care about the
// channel order -- it just compares integers -- so both callers and this file
// stay format-agnostic. Pack your fill colour the same way you read pixels.
'use strict';

/**
 * @typedef {Object} FillResult
 * @property {boolean} changed       true iff any pixel was written
 * @property {number}  minX          inclusive left of the dirty rect
 * @property {number}  minY          inclusive top of the dirty rect
 * @property {number}  maxX          inclusive right of the dirty rect
 * @property {number}  maxY          inclusive bottom of the dirty rect
 * @property {number}  pixelsFilled  number of pixels actually written
 */

/**
 * Flood-fill `argb` (modified IN PLACE) starting at (seedX, seedY) with
 * `fillArgb`, replacing the connected region whose colour matches the seed's
 * within `tolerance` (0..255 per channel).
 *
 * @param {Uint32Array} argb    row-major width*height buffer
 * @param {number} width
 * @param {number} height
 * @param {number} seedX
 * @param {number} seedY
 * @param {number} fillArgb     packed replacement colour (same byte order as argb)
 * @param {number} [tolerance]  0..255; 0 = exact match
 * @returns {FillResult}
 */
function floodFill(argb, width, height, seedX, seedY, fillArgb, tolerance) {
  if (argb.length < width * height) {
    throw new Error(`argb too small for ${width}x${height}`);
  }
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) {
    return { changed: false, minX: 0, minY: 0, maxX: 0, maxY: 0, pixelsFilled: 0 };
  }
  // CRITICAL: coerce fillArgb to Uint32 so it round-trips through the
  // Uint32Array unchanged. JS bit-ops return SIGNED 32-bit ints; the typed
  // array stores UNSIGNED. Without `>>> 0` here, `c === fillArgb` reads from
  // the array (unsigned) vs. the caller's raw value (signed) and never
  // matches for high-bit-set colours -- which was a beautiful infinite loop
  // waiting for anyone to fill with pure red (0xFFFF0000).
  fillArgb = fillArgb >>> 0;
  const target = argb[seedY * width + seedX];   // Uint32Array read: already unsigned
  // No-op if the seed already equals the fill (avoids spinning forever).
  if (target === fillArgb) {
    return { changed: false, minX: 0, minY: 0, maxX: 0, maxY: 0, pixelsFilled: 0 };
  }
  const tol = Math.max(0, Math.min(255, tolerance | 0));

  // Inlined matches() -- called millions of times on large fills, and V8
  // won't inline a closure that captures `target` and `tol` from the outer
  // scope reliably. Two versions: exact and tolerant, chosen once up front.
  let matches;
  if (tol === 0) {
    matches = (c) => c !== fillArgb && c === target;
  } else {
    const ta = (target >>> 24) & 0xFF, tr = (target >>> 16) & 0xFF,
          tg = (target >>>  8) & 0xFF, tb = (target       ) & 0xFF;
    matches = (c) => {
      if (c === fillArgb) return false;
      const da = ((c >>> 24) & 0xFF) - ta;
      const dr = ((c >>> 16) & 0xFF) - tr;
      const dg = ((c >>>  8) & 0xFF) - tg;
      const db = ( c         & 0xFF) - tb;
      return (da < 0 ? -da : da) <= tol
          && (dr < 0 ? -dr : dr) <= tol
          && (dg < 0 ? -dg : dg) <= tol
          && (db < 0 ? -db : db) <= tol;
    };
  }

  let minX = seedX, minY = seedY, maxX = seedX, maxY = seedY, filled = 0;

  // Stack of seed points; each expands into a horizontal span.
  const sx = [seedX], sy = [seedY];

  while (sx.length) {
    const px = sx.pop();
    const py = sy.pop();
    const rowBase = py * width;
    if (!matches(argb[rowBase + px])) continue;

    // Expand left + right to find the span bounds.
    let left = px;
    while (left - 1 >= 0 && matches(argb[rowBase + left - 1])) left--;
    let right = px;
    while (right + 1 < width && matches(argb[rowBase + right + 1])) right++;

    // Fill the span and record dirty bounds.
    for (let x = left; x <= right; x++) {
      argb[rowBase + x] = fillArgb;
      filled++;
    }
    if (left  < minX) minX = left;
    if (right > maxX) maxX = right;
    if (py    < minY) minY = py;
    if (py    > maxY) maxY = py;

    // Queue matching runs on the rows above and below.
    queueRow(argb, width, left, right, py - 1, matches, sx, sy);
    queueRow(argb, width, left, right, py + 1, matches, sx, sy);
  }

  return {
    changed: filled > 0,
    minX, minY, maxX, maxY, pixelsFilled: filled,
  };
}

/** Adds one seed per contiguous matching run in row `y` within [left, right]. */
function queueRow(argb, width, left, right, y, matches, sx, sy) {
  if (y < 0) return;
  const rowBase = y * width;
  if (rowBase >= argb.length) return;
  let x = left;
  while (x <= right) {
    while (x <= right && !matches(argb[rowBase + x])) x++;
    if (x > right) break;
    sx.push(x); sy.push(y);
    while (x <= right && matches(argb[rowBase + x])) x++;
  }
}

// UMD-lite: expose on window for the WebView, module.exports for Node tests.
const _api = { floodFill };
if (typeof window !== 'undefined') window.InkFrameFloodFill = _api;
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
