// Boots the generated Android A/B index with every sibling module inlined.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { ({ JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || '/tmp/jsdom/node_modules/jsdom')); }

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const webDir = resolve(root, 'web');
const temp = mkdtempSync(resolve(tmpdir(), 'inkframe-v2-boot-'));
const generated = resolve(temp, 'index.html');

try {
  execFileSync(process.execPath, [resolve(root, 'tools/inject-brush-v2-index.mjs'), resolve(webDir, 'index.html'), generated], { cwd: root });
  let html = readFileSync(generated, 'utf8');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (tag, src) => {
    const file = resolve(webDir, src);
    assert.ok(existsSync(file), `generated index references missing script: ${src}`);
    return `<script>${readFileSync(file, 'utf8')}</script>`;
  });

  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.detail?.stack || error.message));
  vc.on('error', (...args) => errors.push(args.join(' ')));

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = function(type) {
        if (type !== '2d') return null;
        const canvas = this;
        const state = { fillStyle:'#000', globalAlpha:1, globalCompositeOperation:'source-over' };
        return new Proxy(state, {
          get(target, prop) {
            if (prop === 'canvas') return canvas;
            if (prop === 'getImageData') return () => ({ data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4), width:canvas.width||1, height:canvas.height||1 });
            if (prop === 'putImageData') return () => {};
            if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop:() => {} });
            if (typeof prop === 'string' && !prop.startsWith('__') && prop !== 'then' && prop !== 'constructor') {
              if (prop in target) return target[prop];
              return () => {};
            }
            return undefined;
          },
          set(target, prop, value) { target[prop] = value; return true; },
        });
      };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
      w.HTMLCanvasElement.prototype.toBlob = cb => cb(null);
      w.HTMLCanvasElement.prototype.captureStream = () => ({ getVideoTracks:() => [] });
      w.HTMLCanvasElement.prototype.setPointerCapture = () => {};
      w.MediaRecorder = function() {};
      w.MediaRecorder.isTypeSupported = () => false;
      w.requestAnimationFrame = cb => setTimeout(cb, 16);
      w.cancelAnimationFrame = id => clearTimeout(id);
      w.URL.createObjectURL = () => 'blob:test';
      w.URL.revokeObjectURL = () => {};
    },
  });

  await new Promise(resolveWait => setTimeout(resolveWait, 900));
  assert.deepEqual(errors, [], errors.join('\n'));
  const d = dom.window.document;
  const panel = d.getElementById('inkframe-v2-ab');
  assert.ok(panel, 'V2 A/B panel did not install');
  const buttons = panel.querySelectorAll('button');
  assert.equal(buttons.length, 2);
  assert.match(buttons[0].textContent, /Original/);
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentMode(), 'original');
  buttons[0].click();
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentMode(), 'v2');
  assert.match(buttons[0].textContent, /V2/);
  assert.equal(typeof dom.window.InkFrameBrushV2.createBrushEngine, 'function');

  console.log('✅ generated Brush V2 A/B APK index booted');
} finally {
  rmSync(temp, { recursive:true, force:true });
}
