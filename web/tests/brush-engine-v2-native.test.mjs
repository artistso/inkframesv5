// InkFrame Brush Engine V2 — native Android trace attachment tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const files = [
  'brush-engine-v2/sample.js',
  'brush-engine-v2/trace.js',
  'brush-engine-v2/native.js',
];

function buildSandbox(nativeJson) {
  const sandbox = {
    console, Math, Date, JSON, Object, Array, Number, String, Boolean, Map, Set, WeakMap, Error,
    innerWidth:1200,
    innerHeight:800,
    devicePixelRatio:2,
    InkFrameNativePenBridge:{ snapshotJson:() => nativeJson },
    InkFrameBrushV2InputBridge:{
      traceSnapshot:() => ({
        active:true,
        pointerId:7,
        events:[{ kind:'move', timeStamp:12, clientX:20, clientY:30 }],
        stats:{ emitted:1, duplicates:0 },
      }),
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of files) {
    vm.runInContext(readFileSync(resolve(root, file), 'utf8'), sandbox, { filename:file });
  }
  return sandbox;
}

{
  const nativeTrace = {
    schema:1,
    strokeId:4,
    active:false,
    storedSamples:3,
    nativeDispatches:[{ dispatchSequence:1, samples:[{ x:10, y:20 }] }],
  };
  const sandbox = buildSandbox(JSON.stringify(nativeTrace));
  const recorder = sandbox.InkFrameBrushV2.createTraceRecorder({ brushId:'ink' });
  recorder.begin({ x:1, y:2, time:0, pressure:0.5, pointerType:'pen' });
  recorder.end({ x:3, y:4, time:8, pressure:0, pointerType:'pen' });
  const trace = recorder.snapshot();

  assert.equal(trace.metadata.nativePen.available, true);
  assert.equal(trace.metadata.nativePen.strokeId, 4);
  assert.equal(trace.metadata.nativePen.storedSamples, 3);
  assert.equal(trace.metadata.sanitizedWebInput.available, true);
  assert.equal(trace.metadata.sanitizedWebInput.events.length, 1);
  assert.equal(trace.metadata.sanitizedWebInput.events[0].clientX, 20);
  assert.equal(trace.metadata.inputComparison.schema, 1);
  assert.equal(trace.metadata.inputComparison.webViewport.width, 1200);
  assert.equal(trace.metadata.inputComparison.webViewport.devicePixelRatio, 2);
}

{
  const sandbox = buildSandbox('{not-json');
  const trace = { metadata:{} };
  sandbox.InkFrameBrushV2.attachNativeDiagnostics(trace);
  assert.equal(trace.metadata.nativePen.available, true);
  assert.match(trace.metadata.nativePen.parseError, /JSON/);
}

{
  const sandbox = buildSandbox('{}');
  delete sandbox.InkFrameNativePenBridge;
  const trace = { metadata:{} };
  sandbox.InkFrameBrushV2.attachNativeDiagnostics(trace);
  assert.equal(trace.metadata.nativePen.available, false);
  assert.equal(trace.metadata.nativePen.reason, 'native-bridge-unavailable');
}

console.log('✅ Brush Engine V2 native trace attachment tests passed');
