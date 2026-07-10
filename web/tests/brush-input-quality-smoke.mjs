// InkFrame — active brush input quality smoke
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '..', 'brush-input-quality-v2.js'), 'utf8');
const sandbox = {
  console,
  module: { exports: {} },
  exports: {},
  globalThis: null,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'brush-input-quality-v2.js' });
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

check(api.VERSION === 'v3-orientation-responsive', 'version mismatch');
check(typeof api.qualityBatch === 'function', 'qualityBatch export missing');
check(typeof api.createState === 'function', 'createState export missing');
check(typeof api.copyNativeSample === 'function', 'copyNativeSample export missing');
check(typeof api.orderedBatch === 'function', 'orderedBatch export missing');
check(typeof api.nativeChanged === 'function', 'nativeChanged export missing');

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
check(cleaned.samples.at(-1).pressure < 0.80, 'pressure spike should still be smoothed');
check(cleaned.samples.at(-1).pressure > 0.45, 'endpoint pressure should catch up responsively');
check(cleaned.samples.at(-1).tiltX === 12, 'tilt data should survive filtering');

// A stationary pen may rotate or change barrel state. Those samples must survive
// dedupe because nib angle and side-button behavior can change without travel.
const orientationState = api.createState();
const orientation = api.qualityBatch([
  sample(30, 30, 0.5, 1, { tiltX:2, tiltY:3, azimuthAngle:0.4, buttons:1 }),
  sample(30.01, 30.01, 0.501, 2, { tiltX:18, tiltY:3, azimuthAngle:0.7, buttons:3 }),
  sample(31, 30, 0.52, 3, { tiltX:18, tiltY:3, azimuthAngle:0.7, buttons:3 }),
], orientationState);
check(orientation.samples.length === 3, 'stationary orientation/barrel change must not be deduped');
check(orientation.stats.nativeChangesKept >= 1, 'native-change retention metric missing');
check(orientation.samples[1].buttons === 3 && orientation.samples[1].tiltX === 18, 'orientation/barrel sample should be preserved');

// Coalesced events should be chronological even if a browser returns a scrambled
// batch. Coordinates are not interpolated or altered; only ordering is repaired.
const scrambled = [
  sample(9, 0, 0.5, 9),
  sample(3, 0, 0.3, 3),
  sample(6, 0, 0.4, 6),
];
const ordered = api.qualityBatch(scrambled, api.createState());
check(ordered.samples[0].timeStamp === 3, 'out-of-order batch should be sorted by timestamp');
check(ordered.samples.at(-1).timeStamp === 9, 'newest timestamp should remain the endpoint');
check(ordered.stats.reordered >= 2, 'reordered sample metric missing');

// A timestamp restart means a new native stream reused the same pointer id. The
// smoother must drop stale pressure state instead of blending across streams.
const reused = api.createState();
api.qualityBatch([sample(1,1,0.9,100)], reused);
const restarted = api.qualityBatch([sample(2,2,0.2,5)], reused);
check(restarted.stats.streamResets === 1, 'timestamp rollback should reset stream state');
check(Math.abs(restarted.samples[0].pressure - 0.2) < 1e-9, 'new stream pressure should start exact');

// Browser PointerEvent fields live on the prototype and are not enumerable.
// This native-like object catches regressions caused by object spread/copying.
const nativePrototype = {
  tiltX: 27,
  tiltY: -19,
  altitudeAngle: 0.72,
  azimuthAngle: 1.43,
  pointerType: 'pen',
  pointerId: 91,
  buttons: 3,
  button: -1,
  width: 2.5,
  height: 3.5,
  tangentialPressure: 0.18,
  twist: 44,
  isPrimary: true,
};
const nativeLike = Object.create(nativePrototype);
Object.assign(nativeLike, { clientX:88, clientY:99, pressure:0.61, timeStamp:42 });
const nativeResult = api.qualityBatch([nativeLike], api.createState());
const nativeOut = nativeResult.samples[0];
check(nativeOut.tiltX === 27 && nativeOut.tiltY === -19, 'inherited tilt fields must be preserved');
check(nativeOut.altitudeAngle === 0.72 && nativeOut.azimuthAngle === 1.43, 'inherited pen angles must be preserved');
check(nativeOut.buttons === 3 && nativeOut.pointerId === 91, 'barrel/pointer identity must be preserved');
check(nativeOut.width === 2.5 && nativeOut.height === 3.5, 'contact geometry must be preserved');
check(nativeResult.stats.nativeFieldsPreserved === 1, 'native field preservation metric missing');

const huge = Array.from({ length:160 }, (_, i) => sample(i, i*0.25, 0.3+i/400, i+1));
const capped = api.qualityBatch(huge, api.createState(), { maxBatch:24 });
check(capped.samples.length <= 24, 'oversized coalesced batch should be capped');
check(capped.stats.capped >= 136, 'capped sample metric incorrect');
check(capped.samples.at(-1).clientX === 159, 'capped batch must preserve newest endpoint');

const single = api.qualityBatch([sample(4,5,0.4,1)], api.createState());
check(single.samples.length === 1, 'single sample should never be starved');
check(single.samples[0].pressure === 0.4, 'first pressure sample should remain exact');

if (failed) {
  console.error(`\nBrush input quality smoke FAILED (${failed} check${failed > 1 ? 's' : ''}).`);
  process.exit(1);
}
console.log(`✅ Brush input quality smoke passed. noisy=${noisy.length}->${cleaned.samples.length} orientation=${orientation.samples.length} reordered=${ordered.stats.reordered} native=preserved`);