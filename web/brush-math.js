// InkFrame — brush-engine math helpers
// -----------------------------------------------------------------------------
// Pure math used by the paint engine. No DOM, no canvas, no globals required for
// the exported math API -- safe to unit-test in Node and safe to move to WASM
// later without dragging the app state along.
'use strict';

const GRAIN_SIZE = 256;

function buildGrain(size, rand) {
  const N = size || GRAIN_SIZE;
  const r = rand || Math.random;
  const raw = new Float32Array(N * N);
  for (let i = 0; i < raw.length; i++) raw[i] = r();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          s += raw[(((y + dy) + N) % N) * N + (((x + dx) + N) % N)];
      out[y * N + x] = (s / 9) * 0.6 + raw[y * N + x] * 0.4;
    }
  }
  return out;
}

function sampleGrain(grain, x, y, size) {
  const N = size || GRAIN_SIZE;
  const ix = (((x | 0) % N) + N) % N;
  const iy = (((y | 0) % N) + N) % N;
  return grain[iy * N + ix];
}

function easeAngle(cur, tgt, k) {
  let dA = ((tgt - cur + Math.PI) % (2 * Math.PI)) - Math.PI;
  return cur + dA * k;
}

function hexWithAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function catmullRom(t, p0, p1, p2, p3) {
  const tt = t * t, ttt = tt * t;
  const b0 = -0.5 * ttt + tt - 0.5 * t;
  const b1 = 1.5 * ttt - 2.5 * tt + 1;
  const b2 = -1.5 * ttt + 2.0 * tt + 0.5 * t;
  const b3 = 0.5 * ttt - 0.5 * tt;
  return [
    b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
    b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
  ];
}

{
  const _api = { GRAIN_SIZE, buildGrain, sampleGrain, easeAngle, hexWithAlpha, catmullRom };
  if (typeof window !== 'undefined') window.InkFrameBrushMath = _api;
  if (typeof module !== 'undefined' && module.exports) module.exports = _api;
}

// Browser/WebView bootstrap for optional UI modules. Kept separate from the math
// API above so Node tests still import only deterministic brush primitives.
(function loadInkFrameBrowserModules(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeBrowserModulesRequested) return;
  window.__inkframeBrowserModulesRequested = true;

  function loadScript(src, name) {
    const alreadyLoaded = Array.from(document.scripts || []).some(script => {
      const attr = script.getAttribute('src') || '';
      return attr.endsWith(src);
    });
    if (alreadyLoaded) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset.inkframeModule = name || src.replace(/\.js$/, '');
    document.head.appendChild(script);
  }

  loadScript('brush-engine.js', 'brush-engine');
  loadScript('vector-engine.js', 'vector-engine');
  loadScript('brush-dynamics.js', 'brush-dynamics');
  // Circular canvas modules remain in the repo as backend/future work, but are
  // not loaded in the stable square-canvas APK path.
  loadScript('ui-layout.js', 'ui-layout');
  loadScript('ui-icon-polish.js', 'ui-icon-polish');
  loadScript('ui-glass.js', 'ui-glass');
  loadScript('ui-flat-controls.js', 'ui-flat-controls');
  loadScript('release-candidate.js', 'release-candidate');
})();
