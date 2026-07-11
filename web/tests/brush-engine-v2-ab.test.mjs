// InkFrame Brush Engine V2 — Android A/B integration tests

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const sourceIndex = resolve(root, 'web/index.html');
const injector = resolve(root, 'tools/inject-brush-v2-index.mjs');
const tuningFile = resolve(root, 'web/brush-engine-v2/tuning.js');
const adapterFile = resolve(root, 'web/brush-engine-v2/adapter.js');
const sessionFile = resolve(root, 'web/brush-engine-v2/session.js');
const temp = mkdtempSync(resolve(tmpdir(), 'inkframe-v2-ab-'));
const generated = resolve(temp, 'index.html');

try {
  execFileSync(process.execPath, [injector, sourceIndex, generated], { cwd: root, stdio: 'pipe' });
  const source = readFileSync(sourceIndex, 'utf8');
  const html = readFileSync(generated, 'utf8');

  assert.equal(source.includes('INKFRAME_BRUSH_V2_AB'), false, 'browser fallback must stay uninstrumented');
  assert.equal((html.match(/INKFRAME_BRUSH_V2_AB/g) || []).length, 1);
  assert.equal((html.match(/InkFrameBrushV2Adapter\.begin/g) || []).length, 1);
  assert.equal((html.match(/InkFrameBrushV2Adapter\.move/g) || []).length, 1);
  assert.equal((html.match(/InkFrameBrushV2Adapter\.end/g) || []).length, 1);
  assert.equal((html.match(/function makeBrushV2Env\(/g) || []).length, 1);
  assert.equal((html.match(/InkFrameBrushV2Environment/g) || []).length, 1);

  const expectedScripts = [
    'brush-engine-v2/sample.js',
    'brush-engine-v2/validator.js',
    'brush-engine-v2/contact.js',
    'brush-engine-v2/filters.js',
    'brush-engine-v2/path.js',
    'brush-engine-v2/arc-sampler.js',
    'brush-engine-v2/radius.js',
    'brush-engine-v2/rasterizer.js',
    'brush-engine-v2/trace.js',
    'brush-engine-v2/engine.js',
    'brush-engine-v2/tuning.js',
    'brush-engine-v2/adapter.js',
    'brush-engine-v2/session.js',
    'brush-engine-v2/coverage-ui.js',
  ];
  for (const src of expectedScripts) {
    assert.ok(html.includes(`<script src="${src}"></script>`), `missing generated script tag: ${src}`);
    assert.ok(existsSync(resolve(root, 'web', src)), `missing runtime file: ${src}`);
  }
  assert.ok(html.indexOf('brush-engine-v2/adapter.js') < html.indexOf('brush-engine-v2/session.js'), 'session guard must load after adapter');

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    setTimeout,
    clearTimeout,
    Blob,
    URL,
  };
  vm.runInNewContext(readFileSync(tuningFile, 'utf8'), sandbox, { filename: 'tuning.js' });
  const tuning = sandbox.module.exports;
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(readFileSync(adapterFile, 'utf8'), sandbox, { filename: 'adapter.js' });
  const adapter = sandbox.module.exports;
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(readFileSync(sessionFile, 'utf8'), sandbox, { filename: 'session.js' });

  assert.equal(adapter.currentMode(), 'original');
  assert.equal(adapter.currentTuning().preset, 'balanced');
  assert.equal(adapter.currentTuning().coverageMode, 'ribbon');
  assert.equal(adapter.currentTuning().radiusMode, 'guarded');
  assert.equal(adapter.currentTuning().contactMode, 'strict');
  assert.equal(adapter.isSupportedBrush('ink'), true);
  assert.equal(adapter.isSupportedBrush('eraser'), true);
  assert.equal(adapter.isSupportedBrush('pencil'), false);
  assert.equal(adapter.setMode('v2'), true);
  assert.equal(adapter.shouldHandle('ink', { pointerType: 'pen' }), true);
  assert.equal(adapter.shouldHandle('ink', { pointerType: 'touch' }), false);
  assert.equal(adapter.shouldHandle('pencil', { pointerType: 'pen' }), false);
  assert.equal(adapter.setTuning({ coverageMode:'dabs', radiusMode:'raw', contactMode:'raw' }), true);
  assert.equal(adapter.currentTuning().coverageMode, 'dabs');
  assert.equal(adapter.currentTuning().radiusMode, 'raw');
  assert.equal(adapter.currentTuning().contactMode, 'raw');
  assert.equal(adapter.setTuningPreset('smooth'), true);
  assert.equal(adapter.currentTuning().preset, 'smooth');
  assert.equal(adapter.currentTuning().coverageMode, 'ribbon');
  assert.equal(adapter.currentTuning().radiusMode, 'guarded');
  assert.equal(adapter.currentTuning().contactMode, 'strict');
  assert.equal(adapter.setMode('original'), true);
  assert.equal(adapter.__sessionContinuityInstalled, true);
  assert.equal(typeof adapter.finishStaleSession, 'function');
  assert.equal(typeof adapter.sessionStats, 'function');

  const profile = adapter.makeProfile({
    brushId: 'ink',
    profile: { size:22, minSize:0.1, opacity:0.8, spacing:0.06, hardness:0.9, response:-0.2 },
  });
  assert.equal(profile.size, 22);
  assert.equal(profile.composite, 'source-over');
  assert.equal(adapter.makeProfile({ brushId:'eraser', profile:{} }).composite, 'destination-out');
  assert.equal(tuning.presetValue('direct').positionTimeConstantMs, 4);
  assert.equal(tuning.presetValue('direct').coverageMode, 'ribbon');
  assert.equal(tuning.presetValue('direct').radiusMode, 'guarded');
  assert.equal(tuning.presetValue('direct').contactMode, 'strict');

  console.log('✅ brush-engine-v2 A/B session integration tests passed');
} finally {
  rmSync(temp, { recursive:true, force:true });
}
