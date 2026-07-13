// InkFrame Brush Engine V2 — build-variant runtime policy tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const sampleSource = readFileSync(resolve(web, 'brush-engine-v2/sample.js'), 'utf8');
const traceSource = readFileSync(resolve(web, 'brush-engine-v2/trace.js'), 'utf8');
const runtimeSource = readFileSync(resolve(web, 'brush-engine-v2/runtime.js'), 'utf8');

function sandbox(config, storedMode = null) {
  const storage = new Map();
  if (storedMode) storage.set('inkframe.brushEngine.abMode.v1', storedMode);
  const value = {
    console, Math, Date, JSON, Object, Array, Number, String, Boolean, Error,
    setTimeout:fn => { fn(); return 1; },
    localStorage:{
      getItem:key => storage.has(key) ? storage.get(key) : null,
      setItem:(key, next) => storage.set(key, String(next)),
    },
    InkFrameBuild:config,
  };
  value.globalThis = value;
  vm.createContext(value);
  vm.runInContext(sampleSource, value, { filename:'sample.js' });
  vm.runInContext(traceSource, value, { filename:'trace.js' });
  vm.runInContext(runtimeSource, value, { filename:'runtime.js' });
  return value;
}

{
  const root = sandbox({ variant:'release', diagnostics:false, traceTools:false, defaultBrushEngine:'v2' });
  const recorder = root.InkFrameBrushV2.createTraceRecorder({ brushId:'ink' });
  recorder.begin({ x:1, y:2, time:1, pressure:0.4, pointerType:'pen' });
  recorder.move({ x:3, y:4, time:2, pressure:0.5, pointerType:'pen' });
  recorder.end({ x:5, y:6, time:3, pressure:0, pointerType:'pen' });
  const trace = recorder.snapshot();
  assert.equal(recorder.__compact, true);
  assert.equal(trace.samples.length, 0);
  assert.equal(trace.metadata.diagnostics, false);
  assert.equal(root.InkFrameBrushV2.buildConfig.variant, 'release');
}

{
  const root = sandbox({ variant:'debug', diagnostics:true, traceTools:true, defaultBrushEngine:'v2' });
  const recorder = root.InkFrameBrushV2.createTraceRecorder({ brushId:'ink' });
  recorder.begin({ x:1, y:2, time:1, pressure:0.4, pointerType:'pen' });
  recorder.end({ x:2, y:3, time:2, pressure:0, pointerType:'pen' });
  assert.equal(recorder.__compact, undefined);
  assert.equal(recorder.snapshot().samples.length, 2);
}

{
  const root = sandbox({ variant:'release', diagnostics:false, traceTools:false, defaultBrushEngine:'v2' });
  const calls = [];
  root.InkFrameBrushV2.applyDefaultEngine({ setMode:value => calls.push(value) });
  assert.deepEqual(Array.from(calls), ['v2']);
}

{
  const root = sandbox({ variant:'release', diagnostics:false, traceTools:false, defaultBrushEngine:'v2' }, 'original');
  const calls = [];
  root.InkFrameBrushV2.applyDefaultEngine({ setMode:value => calls.push(value) });
  assert.equal(calls.length, 0, 'an explicit saved fallback choice must be preserved');
}

console.log('✅ Brush Engine V2 production runtime policy tests passed');
