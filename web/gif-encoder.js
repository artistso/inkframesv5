// InkFrame GIF89a encoder — pure JS port of core-common/gif/*.kt
// -----------------------------------------------------------------------------
// This file is a straight 1:1 port of the Kotlin reference implementation in
// `core-common/src/main/kotlin/com/inkframe/core/common/gif/` (GifEncoder,
// MedianCutQuantizer, LzwEncoder). The Kotlin version is unit-tested; this JS
// version keeps the same structure and variable names so bug fixes port back
// trivially in either direction.
//
// Design notes:
//   * ZERO dependencies — no npm packages, no worker frameworks, no polyfills.
//   * Streaming API: `GifEncoder(width, height, {loop, maxColors})` -> chunks[].
//   * Frames are appended one at a time; each frame carries its own Local Color
//     Table (independently quantized) so per-frame palette shifts are handled.
//   * Written to run inside a Web Worker: the module `postMessage`s progress
//     back to the main thread and yields via `await Promise.resolve()` between
//     frames so the worker's message queue stays responsive.
//   * All heavy math uses typed arrays (Uint8Array/Int32Array) — 5-10x faster
//     than regular JS arrays for what we're doing.
//
// Public API (see the worker wrapper at the bottom for message shape):
//   const enc = new GifEncoder(w, h, { loop:true, maxColors:256 });
//   enc.addFrame(argbInt32Array, delayCs);   // may be called N times
//   const bytes = enc.finish();              // Uint8Array of the .gif file

'use strict';

// ============================================================================
//  LzwEncoder — GIF variable-length LZW compressor
//  Direct port of LzwEncoder.kt. Encodes a stream of color indices (each
//  < 2^minCodeSize) into the packed, sub-blocked bitstream a GIF image-data
//  section expects.
// ============================================================================

const LZW_MAX_CODE_SIZE = 12;
const LZW_MAX_TABLE = 1 << 12; // 4096

/**
 * LSB-first bit packer, as GIF requires.
 * @param {number} initialCapacity  starting bytes buffer size
 */
class BitWriter {
  constructor(initialCapacity = 1024) {
    this.buf = new Uint8Array(initialCapacity);
    this.len = 0;
    this.cur = 0;
    this.nbits = 0;
  }
  _grow(min) {
    let cap = this.buf.length;
    while (cap < min) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }
  /** @param {number} code @param {number} size */
  write(code, size) {
    this.cur |= (code << this.nbits) >>> 0;
    this.nbits += size;
    while (this.nbits >= 8) {
      if (this.len >= this.buf.length) this._grow(this.len + 1);
      this.buf[this.len++] = this.cur & 0xFF;
      this.cur >>>= 8;
      this.nbits -= 8;
    }
  }
  toByteArray() {
    if (this.nbits > 0) {
      if (this.len >= this.buf.length) this._grow(this.len + 1);
      this.buf[this.len++] = this.cur & 0xFF;
      this.cur = 0; this.nbits = 0;
    }
    return this.buf.subarray(0, this.len);
  }
}

/**
 * @param {number} minCodeSize bits per index for the initial code size (2..8).
 *                             For an N-color palette this is max(2, ceil(log2(N))).
 * @param {Uint8Array} indices palette indices for each pixel (each < 2^minCodeSize)
 * @returns {Uint8Array} full GIF image-data section (leading minCodeSize byte + sub-blocked LZW)
 */
function lzwEncodeImageData(minCodeSize, indices) {
  if (minCodeSize < 2 || minCodeSize > 8) {
    throw new Error(`minCodeSize must be 2..8, was ${minCodeSize}`);
  }
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  const bits = new BitWriter(Math.max(1024, indices.length >> 1));
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  // Hash table keyed by (prefix<<8 | k) -> code. Map is slower than a plain
  // object here on V8 for tight int-int lookups, but a raw Int32Array indexed
  // by the key would need 2^20 slots — Map is the memory/speed sweet spot.
  const table = new Map();

  const resetTable = () => {
    table.clear();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  bits.write(clearCode, codeSize);
  resetTable();

  if (indices.length === 0) {
    bits.write(eoiCode, codeSize);
  } else {
    let prefix = indices[0] & 0xFF;
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i] & 0xFF;
      const key = (prefix << 8) | k;
      const existing = table.get(key);
      if (existing !== undefined) {
        prefix = existing;
      } else {
        bits.write(prefix, codeSize);
        table.set(key, nextCode);
        nextCode++;
        if (nextCode > (1 << codeSize) && codeSize < LZW_MAX_CODE_SIZE) {
          codeSize++;
        }
        if (nextCode > LZW_MAX_TABLE) {
          bits.write(clearCode, codeSize);
          resetTable();
        }
        prefix = k;
      }
    }
    bits.write(prefix, codeSize);
    bits.write(eoiCode, codeSize);
  }

  const data = bits.toByteArray();

  // Frame: leading minCodeSize byte, then sub-blocks (<=255 bytes each,
  // length-prefixed), terminated by a 0-length block.
  let outLen = 1 + data.length + Math.ceil(data.length / 255) + 1;
  const out = new Uint8Array(outLen);
  let o = 0;
  out[o++] = minCodeSize;
  let off = 0;
  while (off < data.length) {
    const len = Math.min(255, data.length - off);
    out[o++] = len;
    out.set(data.subarray(off, off + len), o);
    o += len;
    off += len;
  }
  out[o++] = 0;
  return out.subarray(0, o);
}

// ============================================================================
//  MedianCutQuantizer — reduces ARGB pixels to <=256 palette + indices
//  Direct port of MedianCutQuantizer.kt. Fully-transparent pixels are routed to
//  a reserved transparent slot; partially-transparent become opaque (GIF has no
//  partial alpha).
// ============================================================================

/**
 * @typedef {Object} QuantResult
 * @property {Int32Array} palette      each entry 0xRRGGBB
 * @property {Uint8Array} indices      one palette index per input pixel
 * @property {number}     transparentIndex  -1 if no transparency present
 * @property {number}     bitsPerPixel bits needed for the largest index (min 1)
 */

/**
 * @param {Int32Array} argb    input pixels 0xAARRGGBB, length = W*H
 * @param {number} maxColors   maximum palette size including transparent slot (2..256)
 * @param {number} alphaThreshold pixels with alpha <= this become transparent
 * @returns {QuantResult}
 */
function medianCutQuantize(argb, maxColors = 256, alphaThreshold = 8) {
  if (maxColors < 2 || maxColors > 256) throw new Error('maxColors must be 2..256');

  const N = argb.length;
  const isTransparent = new Uint8Array(N);
  const opaque = new Int32Array(N);
  let opaqueN = 0;
  let anyTransparent = false;
  for (let i = 0; i < N; i++) {
    const a = (argb[i] >>> 24) & 0xFF;
    if (a <= alphaThreshold) {
      isTransparent[i] = 1;
      anyTransparent = true;
    } else {
      opaque[opaqueN++] = argb[i] & 0xFFFFFF;
    }
  }

  const reserved = anyTransparent ? 1 : 0;
  const colorBudget = Math.max(1, maxColors - reserved);

  // Working buffer: we sort *within* boxes in place. Take a copy so callers
  // aren't surprised by mutation of their input.
  const work = opaque.slice(0, opaqueN);

  /** @typedef {{start:number,end:number,rMin:number,rMax:number,gMin:number,gMax:number,bMin:number,bMax:number}} Box */
  const boxes = [];

  const shrink = (box) => {
    let rMin = 255, gMin = 255, bMin = 255, rMax = 0, gMax = 0, bMax = 0;
    for (let i = box.start; i < box.end; i++) {
      const c = work[i];
      const r = (c >> 16) & 0xFF, g = (c >> 8) & 0xFF, b = c & 0xFF;
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      if (g < gMin) gMin = g; if (g > gMax) gMax = g;
      if (b < bMin) bMin = b; if (b > bMax) bMax = b;
    }
    box.rMin = rMin; box.rMax = rMax; box.gMin = gMin; box.gMax = gMax; box.bMin = bMin; box.bMax = bMax;
  };
  const longestAxis = (box) => {
    const dr = box.rMax - box.rMin, dg = box.gMax - box.gMin, db = box.bMax - box.bMin;
    if (dr >= dg && dr >= db) return 0;
    if (dg >= db) return 1;
    return 2;
  };

  if (opaqueN > 0) {
    const b0 = { start: 0, end: opaqueN };
    shrink(b0);
    boxes.push(b0);
    while (boxes.length < colorBudget) {
      // Split the box with the largest pixel population along its longest axis.
      let target = null, best = 1;
      for (const bx of boxes) {
        const sz = bx.end - bx.start;
        if (sz > best) { target = bx; best = sz; }
      }
      if (!target) break;
      const axis = longestAxis(target);
      sortRangeByChannel(work, target.start, target.end, axis);
      const mid = target.start + ((target.end - target.start) >> 1);
      const left = { start: target.start, end: mid };
      const right = { start: mid, end: target.end };
      shrink(left); shrink(right);
      // remove target from boxes
      const idx = boxes.indexOf(target);
      boxes.splice(idx, 1, left, right);
    }
  }

  // Average each box into a palette color.
  const paletteList = [];
  let transparentIndex = -1;
  if (anyTransparent) {
    transparentIndex = 0;
    paletteList.push(0x000000); // transparent slot color is irrelevant
  }
  for (const box of boxes) {
    let rs = 0, gs = 0, bs = 0;
    for (let i = box.start; i < box.end; i++) {
      const c = work[i];
      rs += (c >> 16) & 0xFF;
      gs += (c >> 8) & 0xFF;
      bs += c & 0xFF;
    }
    const cnt = Math.max(1, box.end - box.start);
    const r = (rs / cnt) | 0, g = (gs / cnt) | 0, b = (bs / cnt) | 0;
    paletteList.push((r << 16) | (g << 8) | b);
  }
  if (paletteList.length === 0) paletteList.push(0x000000);
  const palette = Int32Array.from(paletteList);

  // Map every original pixel to its nearest palette entry (or the transparent slot).
  const indices = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    indices[i] = isTransparent[i]
      ? transparentIndex
      : nearestPaletteIndex(palette, reserved, argb[i] & 0xFFFFFF);
  }

  let colorCount = Math.max(2, palette.length);
  let bitsPerPixel = 0;
  while ((1 << bitsPerPixel) < colorCount) bitsPerPixel++;
  bitsPerPixel = Math.max(1, bitsPerPixel);

  return { palette, indices, transparentIndex, bitsPerPixel };
}

/** In-place sort of a sub-range of typed array `a` by an RGB channel. */
function sortRangeByChannel(a, start, end, axis) {
  const shift = axis === 0 ? 16 : axis === 1 ? 8 : 0;
  // Copy out -> sort -> copy back. For ranges up to a few tens of thousands
  // this comfortably beats an in-place quicksort in JS because typed-array
  // Array.from + native sort is highly optimized.
  const sub = Array.from(a.subarray(start, end));
  sub.sort((x, y) => ((x >> shift) & 0xFF) - ((y >> shift) & 0xFF));
  for (let i = 0; i < sub.length; i++) a[start + i] = sub[i];
}

/** Nearest palette index by squared Euclidean RGB distance, skipping reserved slots. */
function nearestPaletteIndex(palette, fromIndex, rgb) {
  const r = (rgb >> 16) & 0xFF, g = (rgb >> 8) & 0xFF, b = rgb & 0xFF;
  let best = fromIndex, bestD = 0x7fffffff;
  for (let i = fromIndex; i < palette.length; i++) {
    const c = palette[i];
    const dr = ((c >> 16) & 0xFF) - r;
    const dg = ((c >> 8) & 0xFF) - g;
    const db = (c & 0xFF) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; if (d === 0) break; }
  }
  return best;
}

// ============================================================================
//  GifEncoder — assembles the streaming GIF89a file
//  Direct port of GifEncoder.kt (streaming APIs adapted to JS chunk buffering).
// ============================================================================

class GifEncoder {
  /**
   * @param {number} width
   * @param {number} height
   * @param {{loop?:boolean, maxColorsPerFrame?:number}} [opts]
   */
  constructor(width, height, opts = {}) {
    this.width = width;
    this.height = height;
    this.loop = opts.loop !== false;
    this.maxColorsPerFrame = opts.maxColorsPerFrame || 256;
    /** @type {Uint8Array[]} */
    this.chunks = [];
    this.headerWritten = false;
    this.finished = false;
  }

  _pushBytes(...bytes) {
    this.chunks.push(new Uint8Array(bytes));
  }
  _pushShort(v) {
    this.chunks.push(new Uint8Array([v & 0xFF, (v >> 8) & 0xFF]));
  }
  _pushAscii(s) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    this.chunks.push(b);
  }
  _pushArray(u8) {
    this.chunks.push(u8);
  }

  _ensureHeader() {
    if (this.headerWritten) return;
    this.headerWritten = true;
    // --- Header ---
    this._pushAscii('GIF89a');
    // --- Logical Screen Descriptor (no global color table) ---
    this._pushShort(this.width);
    this._pushShort(this.height);
    this._pushBytes(0x00, 0x00, 0x00);   // packed=noGCT, bgIdx=0, aspect=0
    // --- NETSCAPE2.0 looping application extension ---
    if (this.loop) {
      this._pushBytes(0x21, 0xFF, 0x0B);
      this._pushAscii('NETSCAPE2.0');
      this._pushBytes(0x03, 0x01);
      this._pushShort(0);                // 0 = loop forever
      this._pushBytes(0x00);
    }
  }

  /**
   * @param {Int32Array} argb   row-major 0xAARRGGBB pixels, length = W*H
   * @param {number} delayCs    display time in centiseconds (1/100 s)
   */
  addFrame(argb, delayCs) {
    if (this.finished) throw new Error('GIF already finished');
    if (argb.length !== this.width * this.height) {
      throw new Error(`Pixel count ${argb.length} != ${this.width}x${this.height}`);
    }
    this._ensureHeader();

    const q = medianCutQuantize(argb, this.maxColorsPerFrame);
    const bpp = q.bitsPerPixel;
    const tableSize = 1 << bpp;

    // --- Graphic Control Extension ---
    this._pushBytes(0x21, 0xF9, 0x04);
    const hasTransparency = q.transparentIndex >= 0;
    // Disposal method 2 (restore to background) so transparent frames don't ghost.
    const packed = (2 << 2) | (hasTransparency ? 1 : 0);
    this._pushBytes(packed);
    this._pushShort(Math.max(0, delayCs | 0));
    this._pushBytes(hasTransparency ? q.transparentIndex : 0, 0x00);

    // --- Image Descriptor ---
    this._pushBytes(0x2C);
    this._pushShort(0); this._pushShort(0);
    this._pushShort(this.width); this._pushShort(this.height);
    this._pushBytes(0x80 | (bpp - 1));    // LCT present, size = bpp-1

    // --- Local Color Table (padded to tableSize entries) ---
    const lct = new Uint8Array(tableSize * 3);
    for (let i = 0; i < tableSize; i++) {
      const c = i < q.palette.length ? q.palette[i] : 0;
      lct[i * 3 + 0] = (c >> 16) & 0xFF;
      lct[i * 3 + 1] = (c >> 8) & 0xFF;
      lct[i * 3 + 2] = c & 0xFF;
    }
    this._pushArray(lct);

    // --- Image Data (LZW) ---
    const minCodeSize = Math.max(2, bpp);
    this._pushArray(lzwEncodeImageData(minCodeSize, q.indices));
  }

  /** Finalize and return the assembled .gif bytes. Idempotent. */
  finish() {
    if (!this.finished) {
      this._ensureHeader();
      this._pushBytes(0x3B);            // GIF trailer
      this.finished = true;
    }
    // Concatenate all chunks into a single Uint8Array
    let total = 0;
    for (const c of this.chunks) total += c.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

// ============================================================================
//  Web Worker message protocol
//  Wraps the encoder for use as a background task.
//
//  Two protocols are supported:
//    1. Legacy batch: {cmd:'encode', frames:[...]} for older callers/tests.
//    2. Streaming: {cmd:'start'} then one {cmd:'frame'} at a time, then
//       {cmd:'finish'}. The streaming path keeps Android tablet exports from
//       holding every raw frame buffer in memory at once.
// ============================================================================

if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  let streamEnc = null;
  let streamTotal = 0;
  let streamDone = 0;

  self.addEventListener('message', async (e) => {
    const msg = e.data;
    try {
      if (msg && msg.cmd === 'encode') {
        const { width, height, frames, loop = true, maxColors = 256 } = msg;
        const enc = new GifEncoder(width, height, { loop, maxColorsPerFrame: maxColors });
        for (let i = 0; i < frames.length; i++) {
          const { pixels, delayCs } = frames[i];
          // pixels arrives as ArrayBuffer (transferred) — wrap as Int32Array
          const px = pixels instanceof ArrayBuffer ? new Int32Array(pixels) : pixels;
          enc.addFrame(px, delayCs);
          self.postMessage({ type: 'progress', frame: i + 1, total: frames.length });
          // Yield so any pending messages (e.g. a cancel) can flow through.
          await Promise.resolve();
        }
        const bytes = enc.finish();
        // Transfer the buffer to avoid a copy back to the main thread.
        self.postMessage({ type: 'done', bytes }, [bytes.buffer]);
      } else if (msg && msg.cmd === 'start') {
        const { width, height, loop = true, maxColors = 256, total = 0 } = msg;
        streamEnc = new GifEncoder(width, height, { loop, maxColorsPerFrame: maxColors });
        streamTotal = total | 0;
        streamDone = 0;
        self.postMessage({ type: 'ready' });
      } else if (msg && msg.cmd === 'frame') {
        if (!streamEnc) throw new Error('GIF stream not started');
        const px = msg.pixels instanceof ArrayBuffer ? new Int32Array(msg.pixels) : msg.pixels;
        streamEnc.addFrame(px, msg.delayCs);
        streamDone++;
        self.postMessage({ type: 'progress', frame: msg.index != null ? msg.index + 1 : streamDone,
          total: msg.total || streamTotal || streamDone });
        await Promise.resolve();
      } else if (msg && msg.cmd === 'finish') {
        if (!streamEnc) throw new Error('GIF stream not started');
        const bytes = streamEnc.finish();
        streamEnc = null; streamTotal = 0; streamDone = 0;
        self.postMessage({ type: 'done', bytes }, [bytes.buffer]);
      }
    } catch (err) {
      streamEnc = null; streamTotal = 0; streamDone = 0;
      self.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
  });
}

// Global export (Android WebView main-thread fallback).
// When Worker() is blocked (as it often is on file:// origins in the WebView),
// the main-thread encoder can find the classes on window and call them directly.
if (typeof window !== 'undefined') {
  window.GifEncoder = GifEncoder;
  window.medianCutQuantize = medianCutQuantize;
  window.lzwEncodeImageData = lzwEncodeImageData;
}

// Non-worker exports (useful for testing in Node/main thread)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GifEncoder, medianCutQuantize, lzwEncodeImageData };
}
