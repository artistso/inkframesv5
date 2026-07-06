// InkFrame -- web boot smoke test
// -----------------------------------------------------------------------------
// Loads web/index.html in jsdom with the three sibling modules inlined and
// asserts:
//   * No uncaught JS errors during boot (this is the class of bug that hid
//     for weeks as commit `hookAutosave` reassigning const, presenting on the
//     tablet as a blank pink screen).
//   * Core structural nodes are in the DOM after the app IIFE completes:
//     the canvas + at least 9 .node orbs.
//
// Exits with code 0 on success, 1 on any boot error. Wired into Android CI so
// the pink-screen regression class is caught before any APK is built.
//
// Requires: `npm i --no-save jsdom` (installed on the fly in CI).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

// jsdom is installed by CI into /tmp/jsdom-install (see .github/workflows).
// ESM imports don't honour NODE_PATH so we resolve it through a plain require.
const require = createRequire(import.meta.url);
let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch {
  // Fall back to the CI install location.
  ({ JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || '/tmp/jsdom-install/node_modules/jsdom'));
}

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');

const html   = readFileSync(resolve(webDir, 'index.html'), 'utf8');
const gifSrc = readFileSync(resolve(webDir, 'gif-encoder.js'), 'utf8');
const asSrc  = readFileSync(resolve(webDir, 'autosave.js'), 'utf8');
const bmSrc  = readFileSync(resolve(webDir, 'brush-math.js'), 'utf8');

// Inline the sibling modules so jsdom doesn't need network access to fetch them.
const inlined = html
  .replace('<script src="gif-encoder.js"></script>', `<script>${gifSrc}</script>`)
  .replace('<script src="autosave.js"></script>',    `<script>${asSrc}</script>`)
  .replace('<script src="brush-math.js"></script>',  `<script>${bmSrc}</script>`);

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push({ kind: 'jsdomError', msg: (e.detail?.stack || e.message) }));
vc.on('error', (...args) => errors.push({ kind: 'consoleError', msg: args.join(' ') }));

// Install a window-level error hook so we see the exact file:line of any uncaught
// throw. This is the difference between "the app is broken" and "the app is
// broken at index.html:2345 -- assignment to constant variable".
const errorHook = `<script>
  window.addEventListener('error', function(e){
    console.error('WINDOW_ERROR:', e.message, '@', e.filename + ':' + e.lineno + ':' + e.colno);
    if(e.error && e.error.stack) console.error('STACK:', e.error.stack);
  });
</script>`;

const dom = new JSDOM(inlined.replace('</head>', errorHook + '</head>'), {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) {
    // jsdom has no Canvas 2D, MediaRecorder, or captureStream. Stub the minimum
    // so init doesn't crash chasing them (real behaviour is verified by the
    // Android APK build later in the workflow).
    w.HTMLCanvasElement.prototype.getContext = function(type) {
      if (type !== '2d') return null;
      const self = this;
      const state = { fillStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over' };
      return new Proxy(state, {
        get: (t, p) => {
          if (p === 'canvas') return self;
          if (p === 'getImageData') return () => ({
            data: new Uint8ClampedArray((self.width||1) * (self.height||1) * 4),
            width: self.width || 1, height: self.height || 1,
          });
          if (p === 'putImageData') return () => {};
          if (p === 'createRadialGradient' || p === 'createLinearGradient')
            return () => ({ addColorStop: () => {} });
          // Every other 2D API becomes a no-op function.
          if (typeof p === 'string' && !p.startsWith('__') && p !== 'then' && p !== 'constructor') {
            if (p in t) return t[p];
            return () => {};
          }
          return undefined;
        },
        set: (t, p, v) => { t[p] = v; return true; },
      });
    };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
    w.HTMLCanvasElement.prototype.toBlob = (cb) => cb(null);
    w.HTMLCanvasElement.prototype.captureStream = () => ({ getVideoTracks: () => [] });
    w.MediaRecorder = function() {}; w.MediaRecorder.isTypeSupported = () => false;
    w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    w.cancelAnimationFrame = (id) => clearTimeout(id);
  }
});

// Give the app a beat to run the IIFE + first rAF.
await new Promise(r => setTimeout(r, 800));

// ---- Report ----
let failed = 0;
if (errors.length) {
  console.error('❌ Boot produced errors:');
  for (const e of errors) console.error('   [' + e.kind + '] ' + e.msg);
  failed++;
}

const d = dom.window.document;
const nodeCount = d.querySelectorAll('.node').length;
const canvasEl = d.getElementById('c');
if (!canvasEl) { console.error('❌ #c (main canvas) missing'); failed++; }
if (nodeCount < 9) { console.error(`❌ expected >=9 .node orbs, got ${nodeCount}`); failed++; }

if (failed) {
  console.error(`\nBoot smoke FAILED (${failed} check${failed>1?'s':''}).`);
  process.exit(1);
}

console.log(`✅ Boot smoke passed. canvas=1  nodes=${nodeCount}  kids=${d.querySelectorAll('.kid').length}`);
