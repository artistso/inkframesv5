// InkFrame Brush Engine V2 — coalesced pointer batch and input bridge tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const batchFile = resolve(root, 'brush-engine-v2/batch.js');
const inputFile = resolve(root, 'brush-engine-v2/input.js');

const raw = (x, y, timeStamp, extra = {}) => Object.assign({
  type: 'pointermove',
  pointerId: 7,
  pointerType: 'pen',
  clientX: x,
  clientY: y,
  pressure: 0.5,
  tiltX: 0,
  tiltY: 0,
  timeStamp,
  buttons: 1,
  button: -1,
  preventDefault() {},
}, extra);

// Raw coalesced batches are sorted chronologically, exact duplicates are removed,
// foreign pointers/types are rejected, and a distinct parent event is appended.
{
  const sandbox = { console, Math, Number, Object, Array, String, Boolean, Date, JSON, Map, Set, WeakMap, Error };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(batchFile, 'utf8'), sandbox, { filename:'batch.js' });
  const V2 = sandbox.InkFrameBrushV2;
  const normalizer = V2.createInputBatchNormalizer({ pointerId:7, pointerType:'pen' });
  normalizer.seed(raw(0, 0, 0));
  let prevented = 0;
  const parent = raw(40, 4, 32, {
    preventDefault() { prevented++; },
    getCoalescedEvents() {
      return [
        raw(30, 3, 24),
        raw(10, 1, 8),
        raw(20, 2, 16),
        raw(20, 2, 16),
        raw(999, 999, 12, { pointerId:99 }),
        raw(888, 888, 14, { pointerType:'touch' }),
      ];
    },
  });
  const output = normalizer.normalize(parent);
  assert.deepEqual(Array.from(output, event => event.timeStamp), [8, 16, 24, 32]);
  assert.deepEqual(Array.from(output, event => event.clientX), [10, 20, 30, 40]);
  assert.ok(Array.from(output).every(event => event.getCoalescedEvents().length === 0));
  output[0].preventDefault();
  assert.equal(prevented, 1);
  const stats = normalizer.stats();
  assert.equal(stats.reorderedBatches, 1);
  assert.equal(stats.duplicates, 1);
  assert.equal(stats.foreignPointer, 1);
  assert.equal(stats.foreignType, 1);
  assert.equal(stats.parentAppended, 1);
}

// Overlap from a previous Android delivery is not processed twice. Older samples
// are stale; an exact repeat of the last emitted coordinate is a duplicate.
{
  const sandbox = { console, Math, Number, Object, Array, String, Boolean, Date, JSON, Map, Set, WeakMap, Error };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(batchFile, 'utf8'), sandbox, { filename:'batch.js' });
  const normalizer = sandbox.InkFrameBrushV2.createInputBatchNormalizer({ pointerId:7 });
  normalizer.seed(raw(10, 0, 10));
  const first = raw(30, 0, 30, { getCoalescedEvents:() => [raw(20, 0, 20), raw(30, 0, 30)] });
  assert.deepEqual(Array.from(normalizer.normalize(first), event => event.timeStamp), [20, 30]);
  const second = raw(50, 0, 50, { getCoalescedEvents:() => [raw(20, 0, 20), raw(30, 0, 30), raw(40, 0, 40)] });
  assert.deepEqual(Array.from(normalizer.normalize(second), event => event.timeStamp), [40, 50]);
  const stats = normalizer.stats();
  assert.equal(stats.stale, 1);
  assert.equal(stats.duplicates, 1);
}

// The generated input bridge feeds the existing adapter one sanitized event at a
// time, so the adapter's own coalesced-event reader can never re-expand a batch.
{
  const calls = [];
  let adapterActive = false;
  const adapter = {
    begin(event, env) { calls.push(['begin', event.timeStamp, env]); adapterActive = true; return true; },
    move(event) { calls.push(['move', event.timeStamp, event.clientX, event.getCoalescedEvents().length]); return true; },
    end(event) { calls.push(['end', event.timeStamp]); adapterActive = false; return true; },
    isActive() { return adapterActive; },
  };
  const sandbox = {
    console, Math, Number, Object, Array, String, Boolean, Date, JSON, Map, Set, WeakMap, Error,
    InkFrameBrushV2Adapter: adapter,
    addEventListener() {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(batchFile, 'utf8'), sandbox, { filename:'batch.js' });
  sandbox.module = { exports:{} };
  sandbox.exports = sandbox.module.exports;
  vm.runInContext(readFileSync(inputFile, 'utf8'), sandbox, { filename:'input.js' });
  const bridge = sandbox.InkFrameBrushV2InputBridge;
  assert.ok(bridge);
  bridge.begin(raw(0, 0, 0), { name:'env' });
  bridge.move(raw(30, 0, 30, {
    getCoalescedEvents:() => [raw(20, 0, 20), raw(10, 0, 10), raw(20, 0, 20)],
  }));
  assert.deepEqual(calls.filter(call => call[0] === 'move').map(call => call.slice(1)), [
    [10, 10, 0],
    [20, 20, 0],
    [30, 30, 0],
  ]);
  assert.equal(bridge.stats().reorderedBatches, 1);
  assert.equal(bridge.stats().duplicates, 1);
  bridge.end(raw(30, 0, 40, { type:'pointerup', pressure:0 }));
  assert.equal(bridge.stats().active, false);
}

console.log('✅ Brush Engine V2 coalesced input tests passed');
