// InkFrame -- brush-dynamics JS smoke test
// -----------------------------------------------------------------------------
// Loads brush-engine, vector-engine, and brush-dynamics in one VM context and
// validates pressure curves, dynamic dab planning, jitter, symmetry, quality
// metrics, and replay descriptors.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');

const context = { console, Math, Number, Object, Array, Float32Array, module: { exports: {} }, exports: {} };
context.globalThis = context;
vm.createContext(context);

for (const file of ['brush-engine.js', 'vector-engine.js']) {
  context.module = { exports: {} };
  context.exports = context.module.exports;
  vm.runInContext(readFileSync(resolve(webDir, file), 'utf8'), context, { filename: file });
}
context.module = { exports: {} };
context.exports = context.module.exports;
vm.runInContext(readFileSync(resolve(webDir, 'brush-dynamics.js'), 'utf8'), context, { filename: 'brush-dynamics.js' });

const dynamics = context.module.exports;
let failed = 0;
function check(condition, message) {
  if (!condition) {
    console.error('❌ ' + message);
    failed++;
  }
}

check(dynamics && typeof dynamics.planDynamicStroke === 'function', 'planDynamicStroke export missing');
check(dynamics.VERSION === 'v0.2.0-brush-dynamics-quality', 'version mismatch');
check(context.InkFrameBrushEngine, 'BrushEngine not attached');
check(context.InkFrameVectorEngine, 'VectorEngine not attached');
check(dynamics.PRESETS['smooth-ink'], 'smooth-ink preset missing');
check(dynamics.PRESETS['pencil-texture'], 'pencil-texture preset missing');
check(dynamics.PRESETS['vector-clean'], 'vector-clean preset missing');
check(dynamics.PRESETS['marker-flow'], 'marker-flow preset missing');

const curve = dynamics.curve([{ input: 0, output: 0 }, { input: 0.5, output: 0.25 }, { input: 1, output: 1 }]);
check(curve.evaluate(-1) === 0, 'curve lower clamp failed');
check(curve.evaluate(2) === 1, 'curve upper clamp failed');
check(curve.evaluate(0.75) > curve.evaluate(0.5), 'curve interpolation failed');

const preset = { ...dynamics.PRESETS['smooth-ink'], pressureDeadZone: 0.2, pressureGain: 2 };
check(dynamics.normalizePressure(0.1, preset) === 0, 'pressure dead zone failed');
check(dynamics.normalizePressure(1, preset) === 1, 'pressure max clamp failed');
check(dynamics.velocityUnit(1, dynamics.PRESETS['smooth-ink']) === 1, 'velocity clamp failed');

const points = [
  { x: 0, y: 0, t: 0, pressure: 0.2 },
  { x: 20, y: 4, t: 16, pressure: 0.7 },
  { x: 42, y: 0, t: 32, pressure: 1.0 },
];
const single = dynamics.planDynamicStroke(points, { dynamics: dynamics.PRESETS['vector-clean'], brushProfile: context.InkFrameBrushEngine.DEFAULT_PROFILE });
check(single.baseStroke.stamps.length > 0, 'base stroke stamps missing');
check(single.dabCount === single.baseStroke.stamps.length, 'single dab count mismatch');
check(single.dabs.every(d => d.radius > 0 && d.feather > 0), 'invalid dab geometry');
check(single.dabs.every(d => d.opacity >= 0 && d.opacity <= 1), 'dab opacity out of range');
check(single.quality.rawPointCount === points.length, 'quality raw point count mismatch');
check(single.quality.sampleCount === single.baseStroke.samples.length, 'quality sample count mismatch');
check(single.quality.dabCount === single.dabCount, 'quality dab count mismatch');
check(single.quality.averageRadius > 0, 'quality average radius invalid');
check(single.quality.averageOpacity > 0, 'quality average opacity invalid');
check(single.quality.smoothnessScore >= 0 && single.quality.smoothnessScore <= 1, 'quality smoothness invalid');
check(single.quality.replayCost >= 0 && single.quality.replayCost <= 1, 'quality replay cost invalid');

const quad = dynamics.planDynamicStroke(points, {
  dynamics: dynamics.PRESETS['smooth-ink'],
  symmetryMode: 'quad',
  symmetryCenter: { x: 20, y: 20 },
});
check(quad.dabCount === single.dabCount * 4, 'quad symmetry dab count mismatch');
check(new Set(quad.dabs.map(d => d.symmetryIndex)).size === 4, 'quad symmetry indexes missing');
check(quad.quality.symmetryCopies === 4, 'quality symmetry copy count mismatch');

const pencilA = dynamics.planDynamicStroke(points, { dynamics: dynamics.PRESETS['pencil-texture'] });
const pencilB = dynamics.planDynamicStroke(points, { dynamics: dynamics.PRESETS['pencil-texture'] });
check(pencilA.dabCount === pencilB.dabCount, 'deterministic jitter count mismatch');
check(pencilA.dabs.every((dab, i) => Math.abs(dab.x - pencilB.dabs[i].x) < 0.0001 && Math.abs(dab.y - pencilB.dabs[i].y) < 0.0001), 'jitter is not deterministic');
check(pencilA.dabs.some((dab, i) => Math.abs(dab.x - pencilA.baseStroke.samples[i].x) > 0.0001 || Math.abs(dab.y - pencilA.baseStroke.samples[i].y) > 0.0001), 'pencil jitter did not move any dabs');

const marker = dynamics.planDynamicStroke(points, { dynamics: dynamics.PRESETS['marker-flow'] });
const descriptor = dynamics.replayDescriptor(marker);
check(descriptor.version === dynamics.VERSION, 'replay version mismatch');
check(descriptor.preset === 'marker-flow', 'replay preset mismatch');
check(Object.prototype.hasOwnProperty.call(descriptor, 'smoothness'), 'replay smoothness missing');
check(Object.prototype.hasOwnProperty.call(descriptor, 'replayCost'), 'replay cost missing');

if (failed) {
  console.error(`\nBrush dynamics smoke FAILED (${failed} check${failed > 1 ? 's' : ''}).`);
  process.exit(1);
}

console.log(`✅ Brush dynamics smoke passed. dabs=${single.dabCount} quad=${quad.dabCount} smoothness=${single.quality.smoothnessScore.toFixed(3)}`);
