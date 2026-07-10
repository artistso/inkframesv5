// InkFrame — active brush input quality smoke
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '..', 'brush-input-quality.js'), 'utf8');
const sandbox = {
  console,
  module: { exports: {} },
  exports: {},
  globalThis: null,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'brush-input-quality.js' });
const api = sandbox.module.exports;

let failed = 0;
function check(condition, message){
  if (!condition) { console.error('❌ ' + message); failed++; }
}

const sample = (x, y, pressure, timeStamp, extra = {}) => ({
  clientX: x,
  clientY: y,
  pressure,
  timeStamp,
  pointerType: 'pen',
  pointerId: 7,
  buttons: 1,
  tiltX: 12,
  tiltY: -8,
  ...extra,
});

check(api.VERSION === 'v1-coalesced-pressure-quality', 'version mismatch');
check(typeof api.qualityBatch === 'function', 'qualityBatch export missing');
check(typeof api.createState === 'function', 'createState export missing');

const state = api.createState();
const noisy = [
  sample(10, 10, 0.20, 1),
  sample(10.03, 10.02, 0.201, 2),
  sample(10.05, 10.04, 0.202, 3),
  sample(13, 11, 0.80, 10),
];
const cleaned = api.qualityBatch(noisy, state);
check(cleaned.samples.length < noisy.length, 'duplicate micro-samples should be removed');
check(cleaned.stats.dropped >= 1, 'dropped sample count missing');
check(cleaned.samples.at(-1).clientX === 13, 'physical endpoint must be preserved');
check(cleaned.samples.at(-1).pressure < 0.80, 'pressure spike should be smoothed');
check(cleaned.samples.at(-1).pressure > 0.20, 'pressure smoothing should still follow the pen');
check(cleaned.samples.at(-1).tiltX === 12, 'tilt data should survive filtering');

const huge = Array.from({ length: 160 }, (_, i) => sample(i, i * 0.25, 0.3 + i / 400, i + 1));
const capped = api.qualityBatch(huge, api.createState(), { maxBatch: 24 });
check(capped.samples.length <= 24, 'oversized coalesced batch should be capped');
check(capped.stats.capped >= 136, 'capped sample metric incorrect');
check(capped.samples.at(-1).clientX === 159, 'capped batch must preserve newest endpoint');

const single = api.qualityBatch([sample(4, 5, 0.4, 1)], api.createState());
check(single.samples.length === 1, 'single sample should never be starved');
check(single.samples[0].pressure === 0.4, 'first pressure sample should remain exact');

if (failed) {
  console.error(`\nBrush input quality smoke FAILED (${failed} check${failed > 1 ? 's' : ''}).`);
  process.exit(1);
}
console.log(`✅ Brush input quality smoke passed. noisy=${noisy.length}->${cleaned.samples.length} capped=${huge.length}->${capped.samples.length}`);
