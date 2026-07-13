// Boots the generated Android debug index with every sibling module inlined.

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
  execFileSync(process.execPath, [
    resolve(root, 'tools/inject-brush-v2-index.mjs'),
    resolve(webDir, 'index.html'),
    generated,
    '--variant=debug',
    '--diagnostics=true',
    '--default-engine=v2',
  ], { cwd: root });
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
        const state = { fillStyle:'#000', strokeStyle:'#000', globalAlpha:1, globalCompositeOperation:'source-over', lineWidth:1, lineCap:'butt', lineJoin:'miter' };
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
      w.alert = () => {};
      w.confirm = () => true;
    },
  });

  await new Promise(resolveWait => setTimeout(resolveWait, 1000));
  assert.deepEqual(errors, [], errors.join('\n'));
  const d = dom.window.document;
  const panel = d.getElementById('inkframe-v2-ab');
  const tuningPanel = d.getElementById('inkframe-v2-tuning');
  const coverage = d.getElementById('inkframe-v2-coverage-mode');
  const radius = d.getElementById('inkframe-v2-radius-mode');
  const contact = d.getElementById('inkframe-v2-contact-mode');
  const stabilizerMode = d.getElementById('inkframe-v2-stabilizer-mode');
  const stabilizerStrength = d.getElementById('inkframe-v2-stabilizer-strength');
  const cornerMode = d.getElementById('inkframe-v2-corner-mode');
  const cornerStrength = d.getElementById('inkframe-v2-corner-strength');
  const ghostMode=d.getElementById('inkframe-v2-ghost-mode');
  const ghostIntensity=d.getElementById('inkframe-v2-ghost-intensity');
  const ghostDuration=d.getElementById('inkframe-v2-ghost-duration');
  const ghostWidth=d.getElementById('inkframe-v2-ghost-width');
  const labTabs=d.getElementById('inkframe-v2-lab-tabs');
  const userPresets=d.querySelector('.inkframe-v2-user-presets');
  const quick=d.querySelector('.inkframe-v2-preset-quick');
  assert.ok(panel, 'V2 panel did not install');
  assert.ok(tuningPanel, 'V2 tuning panel did not install');
  assert.ok(coverage, 'V2 coverage selector did not install');
  assert.ok(radius, 'V2 radius selector did not install');
  assert.ok(contact, 'V2 contact selector did not install');
  assert.ok(stabilizerMode, 'V2 stabilizer selector did not install');
  assert.ok(stabilizerStrength, 'V2 stabilizer strength did not install');
  assert.ok(cornerMode, 'V2 corner selector did not install');
  assert.ok(cornerStrength, 'V2 corner response did not install');
  assert.ok(ghostMode,'Ghost Trail mode did not install');
  assert.ok(ghostIntensity,'Ghost Trail intensity did not install');
  assert.ok(ghostDuration,'Ghost Trail length did not install');
  assert.ok(ghostWidth,'Ghost Trail width did not install');
  assert.ok(labTabs,'Brush Lab tabs did not install');
  assert.ok(userPresets,'custom preset card did not install');
  assert.ok(quick,'Quick Access strip did not install');
  assert.equal(quick.querySelectorAll('button').length,4);
  assert.equal(userPresets.querySelector('.inkframe-v2-preset-library').open,false,'preset management must begin collapsed');
  assert.equal(labTabs.querySelectorAll('button').length,5);
  assert.deepEqual(
    Array.from(labTabs.querySelectorAll('button')).map(button=>button.lastElementChild.textContent),
    ['Stabilizer','Ghost Trail','Stroke','Safety','Diagnostics']
  );
  assert.equal(labTabs.querySelectorAll('.inkframe-v2-tab-icon').length,5);
  assert.equal(d.querySelectorAll('.inkframe-v2-lab-section').length,5);
  assert.equal(d.querySelectorAll('.inkframe-v2-lab-advanced').length,3);
  assert.equal(d.querySelectorAll('.inkframe-v2-lab-advanced[open]').length,0,'advanced groups must begin collapsed');
  assert.equal(dom.window.InkFrameBuild.variant, 'debug');
  assert.equal(dom.window.InkFrameBuild.diagnostics, true);
  assert.equal(dom.window.InkFrameBuild.defaultBrushEngine, 'v2');

  const topButtons = panel.querySelectorAll('button');
  assert.equal(topButtons.length, 2,'trace controls should live in the Diagnostics category');
  assert.match(topButtons[0].textContent, /V2/);
  assert.equal(topButtons[1].textContent, 'Brush Lab');
  assert.equal(topButtons[1].getAttribute('aria-label'),'Open Brush Lab');
  const diagButtons=d.querySelectorAll('[data-lab-section="diagnostics"] .inkframe-v2-diag-tools button');
  assert.deepEqual(Array.from(diagButtons).map(button=>button.textContent),['Import trace','Replay','Export trace']);

  const tuning=dom.window.InkFrameBrushV2Adapter.currentTuning();
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentMode(), 'v2');
  assert.equal(tuning.preset, 'balanced');
  assert.equal(tuning.stabilizerMode, 'adaptive');
  assert.equal(tuning.stabilizerStrength, 55);
  assert.equal(tuning.cornerMode, 'preserve');
  assert.equal(tuning.cornerStrength, 70);
  assert.equal(tuning.ghostMode,'comet');
  assert.equal(tuning.ghostIntensity,65);
  assert.equal(tuning.ghostDurationMs,380);
  assert.equal(tuning.ghostWidthPercent,130);
  assert.equal(tuning.coverageMode, 'ribbon');
  assert.equal(tuning.radiusMode, 'guarded');
  assert.equal(tuning.contactMode, 'strict');
  assert.equal(dom.window.InkFrameBrushV2Adapter.__sessionContinuityInstalled, true);
  assert.equal(dom.window.InkFrameBrushV2Adapter.__ghostTrailInstalled,true);
  assert.equal(typeof dom.window.InkFrameBrushV2Adapter.ghostTrailStats,'function');
  assert.equal(typeof dom.window.InkFrameBrushV2.createGhostTrailSession,'function');
  assert.equal(typeof dom.window.InkFrameBrushV2.buildGhostSegments,'function');
  assert.equal(typeof dom.window.InkFrameBrushV2.createInputBatchNormalizer, 'function');
  assert.equal(typeof dom.window.InkFrameBrushV2.createPositionStabilizer, 'function');
  assert.equal(typeof dom.window.InkFrameBrushV2.createUserPresetStore,'function');
  assert.equal(typeof dom.window.InkFrameBrushV2PresetUI.store.save,'function');
  assert.equal(typeof dom.window.InkFrameBrushV2.segmentTurnRadians, 'function');
  assert.equal(typeof dom.window.InkFrameBrushV2InputBridge.begin, 'function');
  assert.equal(typeof dom.window.InkFrameBrushV2InputBridge.move, 'function');
  assert.equal(typeof dom.window.InkFrameBrushV2InputBridge.end, 'function');
  assert.equal(coverage.value, 'ribbon');
  assert.equal(radius.value, 'guarded');
  assert.equal(contact.value, 'strict');
  assert.equal(stabilizerMode.value, 'adaptive');
  assert.equal(stabilizerStrength.max,'200');
  assert.equal(stabilizerStrength.value, '55');
  assert.equal(cornerMode.value, 'preserve');
  assert.equal(cornerStrength.value, '70');
  assert.equal(ghostMode.value,'comet');
  assert.equal(ghostIntensity.value,'65');
  assert.equal(ghostDuration.value,'380');
  assert.equal(ghostWidth.value,'130');
  assert.equal(tuningPanel.hidden, true);

  topButtons[0].click();
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentMode(), 'original');
  topButtons[0].click();
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentMode(), 'v2');
  topButtons[1].click();
  assert.equal(tuningPanel.hidden, false);
  assert.equal(tuningPanel.querySelectorAll('input[type="range"]').length, 9);

  stabilizerStrength.value = '200';
  stabilizerStrength.dispatchEvent(new dom.window.Event('input', { bubbles:true }));
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().stabilizerStrength, 200);
  assert.equal(stabilizerStrength.nextElementSibling.dataset.studio,'true');
  cornerMode.value = 'smooth';
  cornerMode.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  assert.equal(cornerStrength.disabled, true);
  cornerMode.value = 'preserve';
  cornerMode.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  ghostMode.value='echo';
  ghostMode.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  ghostIntensity.value='88';ghostIntensity.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  ghostDuration.value='760';ghostDuration.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  ghostWidth.value='175';ghostWidth.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  const changed=dom.window.InkFrameBrushV2Adapter.currentTuning();
  assert.equal(changed.ghostMode,'echo');
  assert.equal(changed.ghostIntensity,88);
  assert.equal(changed.ghostDurationMs,760);
  assert.equal(changed.ghostWidthPercent,175);

  const presetName=userPresets.querySelector('input[type="text"]');
  const saveCurrent=Array.from(userPresets.querySelectorAll('button')).find(button=>button.textContent==='Save Current');
  presetName.value='Studio Favorite';
  saveCurrent.click();
  assert.equal(dom.window.InkFrameBrushV2PresetUI.store.snapshot().presets.length,1);
  assert.equal(dom.window.InkFrameBrushV2PresetUI.store.snapshot().pinned.length,1);
  assert.equal(quick.querySelectorAll('button')[0].textContent,'Studio Favorite');
  assert.equal(quick.querySelectorAll('button')[0].classList.contains('active'),true);
  assert.ok(dom.window.localStorage.getItem(dom.window.InkFrameBrushV2.USER_PRESET_STORAGE_KEY));

  stabilizerStrength.value='25';stabilizerStrength.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  ghostMode.value='off';ghostMode.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  await new Promise(resolveWait=>setTimeout(resolveWait,0));
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().stabilizerStrength,25);
  quick.querySelectorAll('button')[0].click();
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().stabilizerStrength,200);
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().ghostMode,'echo');
  assert.equal(quick.querySelectorAll('button')[0].classList.contains('active'),true);

  dom.window.InkFrameBrushV2LabUI.openTab('trail');
  assert.equal(d.querySelector('[data-lab-section="trail"]').hidden,false);
  assert.equal(d.querySelector('[data-lab-section="stabilizer"]').hidden,true);
  dom.window.InkFrameBrushV2LabUI.openTab('stabilizer');
  const maxButton=Array.from(d.querySelectorAll('.inkframe-v2-lab-presets button')).find(button=>button.textContent==='Maximum 200%');
  assert.ok(maxButton);maxButton.click();
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().stabilizerStrength,200);
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().ghostMode,'echo');

  coverage.value = 'dabs';coverage.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  radius.value = 'raw';radius.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  contact.value = 'raw';contact.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().coverageMode, 'dabs');
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().radiusMode, 'raw');
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().contactMode, 'raw');

  assert.equal(typeof dom.window.InkFrameBrushV2.createBrushEngine, 'function');
  assert.equal(typeof dom.window.InkFrameBrushV2.createRadiusContinuityGuard, 'function');
  assert.equal(typeof dom.window.InkFrameBrushV2.createContactBoundaryGuard, 'function');
  assert.equal(typeof dom.window.InkFrameBrushV2Environment, 'function');

  const canvas = d.getElementById('c');
  let rect = { left:100, top:50, width:512, height:384, right:612, bottom:434 };
  canvas.getBoundingClientRect = () => rect;
  const env = dom.window.InkFrameBrushV2Environment();
  assert.equal(env.coordinateTransform.left, 100);
  assert.equal(env.coordinateTransform.scaleX, 2);
  assert.equal(env.coordinateTransform.scaleY, 2);
  rect = { left:0, top:0, width:1024, height:768, right:1024, bottom:768 };
  const converted = env.toSample({
    clientX:356, clientY:242, pressure:0.5, pointerId:7, pointerType:'pen', timeStamp:10,
    tiltX:0, tiltY:0, width:1, height:1,
  });
  assert.equal(converted.x, 512);
  assert.equal(converted.y, 384);

  console.log('✅ generated Brush V2 debug APK index booted with tablet-first custom presets');
} finally {
  rmSync(temp, { recursive:true, force:true });
}
