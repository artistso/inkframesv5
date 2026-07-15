// InkFrame Brush Engine V2 — Android debug integration tests

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
const userPresetsFile = resolve(root, 'web/brush-engine-v2/user-presets.js');
const batchFile = resolve(root, 'web/brush-engine-v2/batch.js');
const ghostTrailFile = resolve(root, 'web/brush-engine-v2/ghost-trail.js');
const adapterFile = resolve(root, 'web/brush-engine-v2/adapter.js');
const sessionFile = resolve(root, 'web/brush-engine-v2/session.js');
const ghostRuntimeFile = resolve(root, 'web/brush-engine-v2/ghost-runtime.js');
const performanceFile = resolve(root, 'web/brush-engine-v2/performance.js');
const inputFile = resolve(root, 'web/brush-engine-v2/input.js');
const temp = mkdtempSync(resolve(tmpdir(), 'inkframe-v2-ab-'));
const generated = resolve(temp, 'index.html');

try {
  execFileSync(process.execPath, [
    injector, sourceIndex, generated,
    '--variant=debug', '--diagnostics=true', '--default-engine=v2',
  ], { cwd: root, stdio: 'pipe' });
  const source = readFileSync(sourceIndex, 'utf8');
  const html = readFileSync(generated, 'utf8');

  assert.equal(source.includes('INKFRAME_BRUSH_V2_RUNTIME'), false, 'browser fallback must stay uninstrumented');
  assert.equal((html.match(/INKFRAME_BRUSH_V2_RUNTIME/g) || []).length, 1);
  assert.ok(html.includes('"variant":"debug"'));
  assert.ok(html.includes('"diagnostics":true'));
  assert.ok(html.includes('"defaultBrushEngine":"v2"'));
  assert.equal((html.match(/InkFrameBrushV2Adapter\.begin/g) || []).length, 1);
  assert.equal((html.match(/InkFrameBrushV2Adapter\.move/g) || []).length, 1);
  assert.equal((html.match(/InkFrameBrushV2Adapter\.end/g) || []).length, 1);
  assert.equal((html.match(/InkFrameBrushV2InputBridge\.begin/g) || []).length, 1);
  assert.equal((html.match(/InkFrameBrushV2InputBridge\.move/g) || []).length, 1);
  assert.equal((html.match(/InkFrameBrushV2InputBridge\.end/g) || []).length, 1);
  assert.equal((html.match(/function makeBrushV2Env\(/g) || []).length, 1);
  assert.equal((html.match(/InkFrameBrushV2Environment/g) || []).length, 1);
  assert.ok(html.includes('coordinateTransform:inputTransform'));
  assert.ok(html.includes('const inputRect=canvas.getBoundingClientRect()'));

  const expectedScripts = [
    'brush-engine-v2/sample.js','brush-engine-v2/batch.js','brush-engine-v2/validator.js',
    'brush-engine-v2/contact.js','brush-engine-v2/stabilizer.js','brush-engine-v2/filters.js',
    'brush-engine-v2/path.js','brush-engine-v2/arc-sampler.js','brush-engine-v2/radius.js',
    'brush-engine-v2/rasterizer.js','brush-engine-v2/ghost-trail.js','brush-engine-v2/trace.js',
    'brush-engine-v2/runtime.js','brush-engine-v2/native.js','brush-engine-v2/engine.js',
    'brush-engine-v2/tuning.js','brush-engine-v2/user-presets.js','brush-engine-v2/adapter.js',
    'brush-engine-v2/session.js','brush-engine-v2/ghost-runtime.js','brush-engine-v2/performance.js',
    'brush-engine-v2/input.js','brush-engine-v2/coverage-ui.js','brush-engine-v2/stabilizer-ui.js',
    'brush-engine-v2/ghost-ui.js','brush-engine-v2/lab-ui.js','brush-engine-v2/preset-ui.js',
    'brush-engine-v2/preview-pad.js',
  ];
  for (const src of expectedScripts) {
    assert.ok(html.includes(`<script src="${src}"></script>`), `missing generated script tag: ${src}`);
    assert.ok(existsSync(resolve(root, 'web', src)), `missing runtime file: ${src}`);
  }
  assert.ok(html.indexOf('brush-engine-v2/stabilizer.js') < html.indexOf('brush-engine-v2/filters.js'));
  assert.ok(html.indexOf('brush-engine-v2/rasterizer.js') < html.indexOf('brush-engine-v2/ghost-trail.js'));
  assert.ok(html.indexOf('brush-engine-v2/batch.js') < html.indexOf('brush-engine-v2/adapter.js'));
  assert.ok(html.indexOf('brush-engine-v2/trace.js') < html.indexOf('brush-engine-v2/runtime.js'));
  assert.ok(html.indexOf('brush-engine-v2/runtime.js') < html.indexOf('brush-engine-v2/native.js'));
  assert.ok(html.indexOf('brush-engine-v2/tuning.js') < html.indexOf('brush-engine-v2/user-presets.js'));
  assert.ok(html.indexOf('brush-engine-v2/user-presets.js') < html.indexOf('brush-engine-v2/adapter.js'));
  assert.ok(html.indexOf('brush-engine-v2/native.js') < html.indexOf('brush-engine-v2/adapter.js'));
  assert.ok(html.indexOf('brush-engine-v2/adapter.js') < html.indexOf('brush-engine-v2/session.js'));
  assert.ok(html.indexOf('brush-engine-v2/session.js') < html.indexOf('brush-engine-v2/ghost-runtime.js'));
  assert.ok(html.indexOf('brush-engine-v2/ghost-runtime.js') < html.indexOf('brush-engine-v2/performance.js'));
  assert.ok(html.indexOf('brush-engine-v2/performance.js') < html.indexOf('brush-engine-v2/input.js'));
  assert.ok(html.indexOf('brush-engine-v2/coverage-ui.js') < html.indexOf('brush-engine-v2/stabilizer-ui.js'));
  assert.ok(html.indexOf('brush-engine-v2/stabilizer-ui.js') < html.indexOf('brush-engine-v2/ghost-ui.js'));
  assert.ok(html.indexOf('brush-engine-v2/ghost-ui.js') < html.indexOf('brush-engine-v2/lab-ui.js'));
  assert.ok(html.indexOf('brush-engine-v2/lab-ui.js') < html.indexOf('brush-engine-v2/preset-ui.js'));
  assert.ok(html.indexOf('brush-engine-v2/preset-ui.js') < html.indexOf('brush-engine-v2/preview-pad.js'));

  const sandbox = {
    module: { exports: {} }, exports: {}, console, setTimeout, clearTimeout, Blob, URL,
    InkFrameBuild:{ variant:'debug', diagnostics:true, traceTools:true, defaultBrushEngine:'v2' },
  };
  vm.runInNewContext(readFileSync(tuningFile, 'utf8'), sandbox, { filename: 'tuning.js' });
  const tuning = sandbox.module.exports;
  sandbox.module = { exports: {} }; sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(readFileSync(userPresetsFile, 'utf8'), sandbox, { filename: 'user-presets.js' });
  assert.equal(typeof sandbox.InkFrameBrushV2.createUserPresetStore,'function');
  assert.equal(sandbox.InkFrameBrushV2.MAX_PINNED_PRESETS,4);
  sandbox.module = { exports: {} }; sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(readFileSync(batchFile, 'utf8'), sandbox, { filename: 'batch.js' });
  assert.equal(typeof sandbox.InkFrameBrushV2.createInputBatchNormalizer, 'function');
  sandbox.module = { exports: {} }; sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(readFileSync(ghostTrailFile, 'utf8'), sandbox, { filename: 'ghost-trail.js' });
  sandbox.InkFrameBrushV2.createBrushEngine = options => ({ options });
  sandbox.module = { exports: {} }; sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(readFileSync(adapterFile, 'utf8'), sandbox, { filename: 'adapter.js' });
  const adapter = sandbox.module.exports;
  sandbox.module = { exports: {} }; sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(readFileSync(sessionFile, 'utf8'), sandbox, { filename: 'session.js' });
  sandbox.module = { exports: {} }; sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(readFileSync(ghostRuntimeFile, 'utf8'), sandbox, { filename: 'ghost-runtime.js' });
  sandbox.module = { exports: {} }; sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(readFileSync(inputFile, 'utf8'), sandbox, { filename: 'input.js' });

  assert.equal(adapter.currentMode(), 'original');
  assert.equal(adapter.currentTuning().preset, 'balanced');
  assert.equal(adapter.currentTuning().stabilizerMode, 'adaptive');
  assert.equal(adapter.currentTuning().stabilizerStrength, 55);
  assert.equal(adapter.currentTuning().cornerMode, 'preserve');
  assert.equal(adapter.currentTuning().cornerStrength, 70);
  assert.equal(adapter.currentTuning().ghostMode, 'comet');
  assert.equal(adapter.currentTuning().ghostIntensity, 65);
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
  assert.equal(adapter.setTuning({ stabilizerMode:'fixed',stabilizerStrength:200,cornerMode:'smooth',ghostMode:'off',coverageMode:'dabs',radiusMode:'raw',contactMode:'raw' }), true);
  assert.equal(adapter.currentTuning().stabilizerMode, 'fixed');
  assert.equal(adapter.currentTuning().stabilizerStrength,200);
  assert.equal(adapter.currentTuning().cornerMode, 'smooth');
  assert.equal(adapter.currentTuning().ghostMode,'off');
  assert.equal(adapter.currentTuning().coverageMode, 'dabs');
  assert.equal(adapter.currentTuning().radiusMode, 'raw');
  assert.equal(adapter.currentTuning().contactMode, 'raw');
  assert.equal(adapter.setTuningPreset('smooth'), true);
  assert.equal(adapter.currentTuning().preset, 'smooth');
  assert.equal(adapter.currentTuning().stabilizerMode, 'adaptive');
  assert.equal(adapter.currentTuning().stabilizerStrength, 80);
  assert.equal(adapter.currentTuning().cornerMode, 'preserve');
  assert.equal(adapter.currentTuning().cornerStrength, 55);
  assert.equal(adapter.currentTuning().ghostMode,'echo');
  assert.equal(adapter.currentTuning().coverageMode, 'ribbon');
  assert.equal(adapter.currentTuning().radiusMode, 'guarded');
  assert.equal(adapter.currentTuning().contactMode, 'strict');
  assert.equal(adapter.setMode('original'), true);
  assert.equal(adapter.__sessionContinuityInstalled, true);
  assert.equal(adapter.__ghostTrailInstalled, true);
  assert.equal(typeof adapter.ghostTrailStats, 'function');
  assert.equal(typeof adapter.finishStaleSession, 'function');
  assert.equal(typeof adapter.sessionStats, 'function');
  assert.equal(typeof sandbox.InkFrameBrushV2InputBridge.begin, 'function');
  assert.equal(typeof sandbox.InkFrameBrushV2InputBridge.move, 'function');
  assert.equal(typeof sandbox.InkFrameBrushV2InputBridge.end, 'function');
  assert.equal(typeof sandbox.InkFrameBrushV2InputBridge.traceSnapshot, 'function');

  const profile = adapter.makeProfile({
    brushId: 'ink',
    profile: { size:22, minSize:0.1, opacity:0.8, spacing:0.06, hardness:0.9, response:-0.2 },
  });
  assert.equal(profile.size, 22);
  assert.equal(profile.composite, 'source-over');
  assert.equal(adapter.makeProfile({ brushId:'eraser', profile:{} }).composite, 'destination-out');
  assert.equal(tuning.presetValue('direct').positionTimeConstantMs, 4);
  assert.equal(tuning.presetValue('direct').stabilizerMode, 'adaptive');
  assert.equal(tuning.presetValue('direct').cornerMode, 'preserve');
  assert.equal(tuning.presetValue('direct').ghostMode,'comet');
  assert.equal(tuning.presetValue('direct').coverageMode, 'ribbon');
  assert.equal(tuning.presetValue('direct').radiusMode, 'guarded');
  assert.equal(tuning.presetValue('direct').contactMode, 'strict');

  const frameCallbacks = [];
  let performanceActive = false, performanceMoves = 0, performanceEnds = 0;
  let liveRenders = 0, commits = 0, gradients = 0, stampDraws = 0;
  const makeGradient = () => { gradients++; return { addColorStop() {} }; };
  const makeContext = canvas => ({
    canvas, save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {},
    drawImage() { stampDraws++; }, createRadialGradient: makeGradient,
  });
  const ownerDocument = { createElement() {
    const canvas = { width:0, height:0, ownerDocument };
    canvas.getContext = () => makeContext(canvas);
    return canvas;
  } };
  const targetCanvas = { ownerDocument };
  const targetContext = makeContext(targetCanvas);
  let performanceEnv = null;
  const performanceAdapter = {
    begin(event, env) { performanceActive = true; performanceEnv = env; env.renderLive(); return true; },
    move() { performanceMoves++; performanceEnv.renderLive(); return true; },
    end() { performanceEnds++; performanceActive = false; performanceEnv.renderLive(); performanceEnv.commit(); return true; },
    isActive: () => performanceActive,
  };
  const performanceSandbox = {
    module:{exports:{}}, exports:{}, console,
    performance:{now:()=>0},
    requestAnimationFrame(callback) { frameCallbacks.push(callback); return frameCallbacks.length; },
    cancelAnimationFrame() {},
    InkFrameBrushV2:{
      paintRoundDab() {},
      ribbonGeometry(from,to) { return { distance:Math.hypot(to.x-from.x,to.y-from.y),radius:2,coreRadius:1,opacity:1,edgeAlpha:0 }; },
      ribbonGapLimit() { return 100; },
    },
    InkFrameBrushV2Adapter:performanceAdapter,
  };
  vm.runInNewContext(readFileSync(performanceFile, 'utf8'), performanceSandbox, { filename:'performance.js' });
  assert.equal(performanceAdapter.__performanceBudgetInstalled, true);
  const dab = { x:10,y:10,radius:4,opacity:1,hardness:.9,composite:'source-over',coverage:'dabs',strokeStart:true,strokeIndex:0,strokeId:1,brushId:'ink' };
  performanceSandbox.InkFrameBrushV2.paintRoundDab(targetContext, dab, '#123456');
  performanceSandbox.InkFrameBrushV2.paintRoundDab(targetContext, Object.assign({}, dab, { x:12,strokeStart:false,strokeIndex:1 }), '#123456');
  assert.equal(stampDraws, 2, 'soft dabs should draw cached stamp canvases');
  assert.equal(gradients, 1, 'equal soft dabs must reuse one radial-gradient stamp');

  const env = { renderLive() { liveRenders++; }, commit() { commits++; } };
  performanceAdapter.begin({ preventDefault() {} }, env);
  assert.equal(liveRenders, 1, 'stroke begin must render once');
  for (let index=0; index<12; index++) performanceAdapter.move({ preventDefault() {} });
  assert.equal(performanceMoves, 0, 'pointer moves must wait for the frame budget');
  performanceAdapter.flushPerformanceQueue();
  assert.equal(performanceMoves, 12, 'frame flush must preserve every queued move');
  assert.equal(liveRenders, 2, 'multiple eraser invalidations must collapse to one live render');
  for (let index=0; index<5; index++) performanceAdapter.move({ preventDefault() {} });
  performanceAdapter.end({ preventDefault() {} });
  assert.equal(performanceMoves, 17, 'pointer end must flush pending input before commit');
  assert.equal(performanceEnds, 1);
  assert.equal(commits, 1);
  assert.equal(liveRenders, 2, 'final commit must replace a redundant scheduled live render');
  const performanceStats = performanceAdapter.performanceStats();
  assert.equal(performanceStats.queuedEvents, 17);
  assert.equal(performanceStats.liveRenders, 2);
  assert.equal(performanceStats.stampMisses, 1);
  assert.equal(performanceStats.stampHits, 1);

  console.log('✅ Brush Engine V2 debug assets, frame budget, eraser coalescing, and soft-dab cache passed');
} finally {
  rmSync(temp, { recursive:true, force:true });
}
