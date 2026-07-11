import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const tuningPath = resolve(here, '..', 'brush-engine-v2', 'tuning.js');
const tuning = require(tuningPath);

const balanced = tuning.presetValue('balanced');
assert.equal(balanced.preset, 'balanced');
assert.equal(balanced.positionTimeConstantMs, 8);
assert.equal(tuning.presetValue('missing').preset, 'balanced');

const bounded = tuning.normalizeTuning({
  preset: 'custom',
  positionTimeConstantMs: -10,
  pressureTimeConstantMs: 999,
  spacingScale: 0,
  minimumJump: 9999,
  speedLimitPxPerMs: 0,
});
assert.equal(bounded.positionTimeConstantMs, 0.5);
assert.equal(bounded.pressureTimeConstantMs, 50);
assert.equal(bounded.spacingScale, 0.35);
assert.equal(bounded.minimumJump, 220);
assert.equal(bounded.speedLimitPxPerMs, 1);

const memory = new Map();
const storage = {
  getItem: key => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, value),
};
const store = tuning.createTuningStore(storage);
store.applyPreset('smooth');
assert.equal(store.snapshot().preset, 'smooth');
store.set({ spacingScale: 1.2 });
assert.equal(store.snapshot().preset, 'custom');
assert.equal(store.snapshot().spacingScale, 1.2);
assert.ok(memory.has(tuning.STORAGE_KEY));

const profile = tuning.applyTuningToProfile({ spacing: 0.1, size: 12 }, { spacingScale: 1.5 });
assert.ok(Math.abs(profile.spacing - 0.15) < 1e-12);
assert.equal(tuning.tuningFilterOptions({ positionTimeConstantMs: 9 }).positionTimeConstantMs, 9);
assert.equal(tuning.tuningValidatorOptions({ minimumJump: 88 }).minimumJump, 88);

// Adapter API and deterministic replay against a mock active canvas.
globalThis.InkFrameBrushV2 = Object.assign(globalThis.InkFrameBrushV2 || {}, {
  parseTrace(value) {
    const trace = typeof value === 'string' ? JSON.parse(value) : value;
    if (!trace || trace.format !== 'inkframe-brush-trace') throw new Error('bad trace');
    return trace;
  },
  createBrushEngine(options) {
    return { options };
  },
  replayTrace(engine, trace) {
    assert.equal(engine.options.brushId, trace.metadata.brushId);
    return [{ x:10, y:20, radius:2, opacity:1, hardness:1, composite:'source-over' }];
  },
  paintRoundDab(context, dab, color) {
    context.painted.push({ dab, color });
  },
});

let committed = 0;
const layerCtx = { painted: [] };
const mainCtx = { painted: [] };
globalThis.InkFrameBrushV2Environment = () => ({
  layerCtx, mainCtx, width:100, height:100, brushId:'ink', color:'#123456',
  profile:{ size:12, minSize:0.1, opacity:1, spacing:0.1, hardness:1, response:0 },
  snapshot:() => ({ before:true }),
  commit:() => { committed++; },
  abort:() => {},
});

const adapterPath = resolve(here, '..', 'brush-engine-v2', 'adapter.js');
const adapter = require(adapterPath);
assert.equal(adapter.currentMode(), 'original');
assert.equal(adapter.setMode('v2'), true);
assert.equal(adapter.setTuningPreset('direct'), true);
assert.equal(adapter.currentTuning().preset, 'direct');

const trace = {
  format:'inkframe-brush-trace', version:1,
  metadata:{
    brushId:'ink', color:'#abcdef', canvas:{ width:100, height:100 },
    profile:{ size:12, minSize:0.1, opacity:1, spacing:0.09, hardness:1, response:0, composite:'source-over' },
    tuning:tuning.presetValue('balanced'),
  },
  samples:[{ phase:'begin', x:0, y:0, pressure:0.5, time:0 }],
};
assert.equal(adapter.loadTrace(trace), true);
assert.equal(adapter.replayLastTrace(), true);
assert.equal(committed, 1);
assert.equal(layerCtx.painted.length, 1);
assert.equal(mainCtx.painted.length, 1);
assert.equal(layerCtx.painted[0].color, '#abcdef');

console.log('✅ brush-engine-v2 tuning and replay tests passed');
