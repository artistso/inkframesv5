// InkFrame — calibrated active brush input quality smoke
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '..', 'brush-input-quality-v2.js'), 'utf8');
const sandbox = { console, module:{exports:{}}, exports:{}, globalThis:null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename:'brush-input-quality-v2.js' });
const api = sandbox.module.exports;

let failed = 0;
function check(condition, message){
  if (!condition) { console.error('❌ ' + message); failed++; }
}

const sample = (x, y, pressure, timeStamp, extra = {}) => ({
  clientX:x, clientY:y, pressure, timeStamp,
  pointerType:'pen', pointerId:7, buttons:1,
  tiltX:12, tiltY:-8, ...extra,
});

check(api.VERSION === 'v5-hover-floor-calibration', 'version mismatch');
check(typeof api.normalizePressure === 'function', 'normalizePressure export missing');
check(typeof api.learnHoverPressure === 'function', 'learnHoverPressure export missing');

check(api.normalizePressure(0.5,0) === 0.5, 'zero floor must preserve pressure');
check(api.normalizePressure(0.04,0.05) === 0, 'pressure below floor should normalize to zero');
const calibratedHalf = api.normalizePressure(0.5,0.05);
check(calibratedHalf > 0.47 && calibratedHalf < 0.48, 'pressure floor normalization incorrect');

for (let i=0; i<8; i++) api.learnHoverPressure(0.04);
const hoverMetrics = api.metrics();
check(hoverMetrics.hoverFloorSamples === 8, 'hover sample count incorrect');
check(hoverMetrics.hoverFloor > 0.03 && hoverMetrics.hoverFloor < 0.05, 'hover floor should converge conservatively');

const state = api.createState();
const noisy = [
  sample(10,10,0.20,1),
  sample(10.03,10.02,0.201,2),
  sample(10.05,10.04,0.202,3),
  sample(13,11,0.80,10),
];
const cleaned = api.qualityBatch(noisy, state);
check(cleaned.samples.length < noisy.length, 'duplicate micro-samples should be removed');
check(cleaned.samples.at(-1).clientX === 13, 'physical endpoint must be preserved');
check(cleaned.samples.at(-1).pressure < 0.80, 'pressure must not overshoot input');
check(cleaned.stats.intentionalBoosts >= 1, 'intentional pressure boost metric missing');

const calibrated = api.qualityBatch([
  sample(1,1,0.05,1),
  sample(2,1,0.50,2),
], api.createState(), { pressureFloor:0.04 });
check(calibrated.stats.calibrated >= 1, 'calibrated sample metric missing');
check(calibrated.samples[0].pressure < 0.02, 'near-floor contact should start near zero');
check(calibrated.samples.at(-1).pressure > 0.35, 'calibrated pressure should remain responsive');
check(calibrated.samples.at(-1).clientX === 2, 'calibration must not alter coordinates');

const stable = api.qualityBatch([
  sample(20,20,0.50,1),
  sample(20.01,20.01,0.505,2),
  sample(20.02,20.01,0.498,3),
], api.createState());
check(stable.stats.intentionalBoosts === 0, 'tiny jitter must not trigger intentional boost');

const orientation = api.qualityBatch([
  sample(30,30,0.5,1,{tiltX:2,azimuthAngle:0.4,buttons:1}),
  sample(30.01,30.01,0.501,2,{tiltX:18,azimuthAngle:0.7,buttons:3}),
], api.createState());
check(orientation.samples.length === 2, 'stationary orientation change must survive');
check(orientation.samples[1].buttons === 3, 'barrel state must survive');

const scrambled = api.qualityBatch([
  sample(9,0,0.5,9),
  sample(3,0,0.3,3),
  sample(6,0,0.4,6),
], api.createState());
check(scrambled.samples[0].timeStamp === 3, 'out-of-order batch should sort');
check(scrambled.samples.at(-1).timeStamp === 9, 'newest endpoint should remain last');

const huge = Array.from({length:160}, (_,i) => sample(i,i*0.25,0.3+i/400,i+1));
const capped = api.qualityBatch(huge, api.createState(), {maxBatch:24});
check(capped.samples.length <= 24, 'oversized batch should cap');
check(capped.samples.at(-1).clientX === 159, 'capped batch must preserve endpoint');

if (failed) {
  console.error(`\nBrush input quality smoke FAILED (${failed} check${failed>1?'s':''}).`);
  process.exit(1);
}
console.log(`✅ Brush input quality smoke passed. floor=${hoverMetrics.hoverFloor.toFixed(4)} calibrated=${calibrated.stats.calibrated}`);
