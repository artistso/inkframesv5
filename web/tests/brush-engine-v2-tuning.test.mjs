import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const tuningPath = resolve(here, '..', 'brush-engine-v2', 'tuning.js');
const adapterPath = resolve(here, '..', 'brush-engine-v2', 'adapter.js');
const sandbox = { module:{exports:{}}, exports:{}, console, setTimeout, clearTimeout, Blob, URL };
vm.createContext(sandbox);
vm.runInContext(readFileSync(tuningPath, 'utf8'), sandbox, { filename: 'tuning.js' });
const tuning = sandbox.module.exports;

const balanced = tuning.presetValue('balanced');
assert.equal(balanced.preset, 'balanced');
assert.equal(balanced.positionTimeConstantMs, 8);
assert.equal(balanced.stabilizerMode, 'adaptive');
assert.equal(balanced.stabilizerStrength, 55);
assert.equal(balanced.ghostMode, 'comet');
assert.equal(balanced.ghostIntensity, 65);
assert.equal(balanced.ghostDurationMs, 380);
assert.equal(balanced.ghostWidthPercent, 130);
assert.equal(tuning.presetValue('missing').preset, 'balanced');

const bounded = tuning.normalizeTuning({
  preset:'custom', stabilizerMode:'adaptive', stabilizerStrength:999,
  ghostMode:'echo',ghostIntensity:999,ghostDurationMs:9999,ghostWidthPercent:999,
  positionTimeConstantMs:-10, pressureTimeConstantMs:999,
  spacingScale:0, minimumJump:9999, speedLimitPxPerMs:0,
});
assert.equal(bounded.stabilizerMode, 'adaptive');
assert.equal(bounded.stabilizerStrength, 200);
assert.equal(bounded.ghostMode, 'echo');
assert.equal(bounded.ghostIntensity, 100);
assert.equal(bounded.ghostDurationMs, 1200);
assert.equal(bounded.ghostWidthPercent, 250);
assert.equal(bounded.positionTimeConstantMs, 0.5);
assert.equal(bounded.pressureTimeConstantMs, 50);
assert.equal(bounded.spacingScale, 0.35);
assert.equal(bounded.minimumJump, 220);
assert.equal(bounded.speedLimitPxPerMs, 1);
assert.equal(tuning.normalizeTuning({positionTimeConstantMs:9}).stabilizerMode, 'fixed');
assert.equal(tuning.normalizeTuning({positionTimeConstantMs:9}).ghostMode, 'off');

const memory = new Map();
const storage = { getItem:key=>memory.has(key)?memory.get(key):null, setItem:(key,value)=>memory.set(key,value) };
const store = tuning.createTuningStore(storage);
assert.equal(store.snapshot().stabilizerMode, 'adaptive');
assert.equal(store.snapshot().ghostMode, 'comet');
store.applyPreset('smooth');
assert.equal(store.snapshot().preset, 'smooth');
assert.equal(store.snapshot().stabilizerStrength, 80);
assert.equal(store.snapshot().ghostMode, 'echo');
store.set({ spacingScale:1.2, stabilizerMode:'fixed',stabilizerStrength:175,ghostMode:'off' });
assert.equal(store.snapshot().preset, 'custom');
assert.equal(store.snapshot().spacingScale, 1.2);
assert.equal(store.snapshot().stabilizerMode, 'fixed');
assert.equal(store.snapshot().stabilizerStrength,175);
assert.equal(store.snapshot().ghostMode,'off');
assert.ok(memory.has(tuning.STORAGE_KEY));

const previousMemory = new Map([[tuning.PREVIOUS_STORAGE_KEY, JSON.stringify({
  preset:'custom',stabilizerMode:'adaptive',stabilizerStrength:72,cornerMode:'preserve',cornerStrength:66,
})]]);
const previousStore=tuning.createTuningStore({
  getItem:key=>previousMemory.has(key)?previousMemory.get(key):null,
  setItem:(key,value)=>previousMemory.set(key,value),
});
assert.equal(previousStore.snapshot().stabilizerStrength,72);
assert.equal(previousStore.snapshot().cornerMode,'preserve');
assert.equal(previousStore.snapshot().ghostMode,'off');
assert.ok(previousMemory.has(tuning.STORAGE_KEY));

const legacyMemory = new Map([[tuning.LEGACY_STORAGE_KEY, JSON.stringify({preset:'balanced',positionTimeConstantMs:11})]]);
const legacyStore = tuning.createTuningStore({
  getItem:key=>legacyMemory.has(key)?legacyMemory.get(key):null,
  setItem:(key,value)=>legacyMemory.set(key,value),
});
assert.equal(legacyStore.snapshot().stabilizerMode, 'fixed');
assert.equal(legacyStore.snapshot().positionTimeConstantMs, 11);
assert.equal(legacyStore.snapshot().ghostMode,'off');
assert.ok(legacyMemory.has(tuning.STORAGE_KEY));

const profile = tuning.applyTuningToProfile({ spacing:0.1, size:12 }, { spacingScale:1.5 });
assert.ok(Math.abs(profile.spacing - 0.15) < 1e-12);
const filterOptions = tuning.tuningFilterOptions(balanced);
assert.equal(filterOptions.stabilizerMode, 'adaptive');
assert.ok(filterOptions.positionSlowTimeConstantMs > filterOptions.positionFastTimeConstantMs);
assert.equal(tuning.tuningFilterOptions({ positionTimeConstantMs:9 }).positionTimeConstantMs, 9);
assert.equal(tuning.tuningFilterOptions({ positionTimeConstantMs:9 }).stabilizerMode, 'fixed');
assert.equal(tuning.tuningValidatorOptions({ minimumJump:88 }).minimumJump, 88);
const ghostOptions=tuning.tuningGhostOptions(balanced);
assert.equal(ghostOptions.mode,'comet');
assert.equal(ghostOptions.intensity,0.65);
assert.equal(ghostOptions.durationMs,380);
assert.equal(ghostOptions.widthScale,1.3);

// Adapter API and deterministic replay against an explicit mock canvas context.
Object.assign(sandbox.InkFrameBrushV2, {
  parseTrace(value) {
    const trace = typeof value === 'string' ? JSON.parse(value) : value;
    if (!trace || trace.format !== 'inkframe-brush-trace') throw new Error('bad trace');
    return trace;
  },
  createBrushEngine(options) { return { options }; },
  replayTrace(engine, trace) {
    assert.equal(engine.options.brushId, trace.metadata.brushId);
    return [{ x:10, y:20, radius:2, opacity:1, hardness:1, composite:'source-over' }];
  },
  paintRoundDab(context, dab, color) { context.painted.push({ dab, color }); },
});

let committed = 0;
const layerCtx = { painted: [] };
const mainCtx = { painted: [] };
sandbox.InkFrameBrushV2Environment = () => ({
  layerCtx, mainCtx, width:100, height:100, brushId:'ink', color:'#123456',
  profile:{ size:12, minSize:0.1, opacity:1, spacing:0.1, hardness:1, response:0 },
  snapshot:() => ({ before:true }), commit:() => { committed++; }, abort:() => {},
});

sandbox.module = { exports: {} };
sandbox.exports = sandbox.module.exports;
vm.runInContext(readFileSync(adapterPath, 'utf8'), sandbox, { filename: 'adapter.js' });
const adapter = sandbox.module.exports;
assert.equal(adapter.currentMode(), 'original');
assert.equal(adapter.currentTuning().stabilizerMode, 'adaptive');
assert.equal(adapter.currentTuning().ghostMode,'comet');
assert.equal(adapter.setMode('v2'), true);
assert.equal(adapter.setTuningPreset('direct'), true);
assert.equal(adapter.currentTuning().preset, 'direct');
assert.equal(adapter.currentTuning().stabilizerStrength, 25);
assert.equal(adapter.currentTuning().ghostMode,'comet');

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
