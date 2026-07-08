// InkFrame -- brush-engine JS smoke test
// -----------------------------------------------------------------------------
// Loads web/brush-engine.js in an isolated VM context and validates the portable
// contract that mirrors the Kotlin BrushEngine core.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const src = readFileSync(resolve(webDir, 'brush-engine.js'), 'utf8');

const context = {
  console,
  Math,
  Number,
  Object,
  Array,
  Float32Array,
  module: { exports: {} },
  exports: {},
  globalThis: {},
};
vm.createContext(context);
vm.runInContext(src, context, { filename: 'brush-engine.js' });

const engine = context.module.exports;
let failed = 0;
function check(condition, message) {
  if (!condition) {
    console.error('❌ ' + message);
    failed++;
  }
}

check(engine && typeof engine.planStroke === 'function', 'planStroke export missing');
check(engine.VERSION === 'v0.2.0-kotlin-ready-core', 'brush-engine version mismatch');
check(engine.PRESETS && engine.PRESETS['lovely-ink'], 'lovely-ink preset missing');
check(engine.PRESETS && engine.PRESETS['glass-pencil'], 'glass-pencil preset missing');
check(engine.PRESETS && engine.PRESETS['rose-brush'], 'rose-brush preset missing');
check(engine.PRESETS && engine.PRESETS['vector-ink'], 'vector-ink preset missing');

const plan = engine.planStroke([
  { x: 0, y: 0, t: 0, pressure: 0.2 },
  { x: 20, y: 0, t: 16, pressure: 0.8 },
  { x: 42, y: 8, t: 32, pressure: 1.0 },
], 'vector-ink');

check(plan.samples.length > 3, 'stroke did not produce enough samples');
check(plan.stamps.length === plan.samples.length, 'stamp/sample count mismatch');
check(plan.distance > 0, 'stroke distance not advanced');
check(plan.stamps.every(s => s.radius > 0 && s.feather > 0), 'invalid stamp geometry');
check(plan.samples.every(s => s.opacity >= 0 && s.opacity <= 1), 'sample opacity out of range');

const low = engine.planStroke([
  { x: 0, y: 0, t: 0, pressure: 0.1 },
  { x: 16, y: 0, t: 16, pressure: 0.1 },
], { ...engine.DEFAULT_PROFILE, taperStart: 0, taperEnd: 0 });
const high = engine.planStroke([
  { x: 0, y: 0, t: 0, pressure: 1.0 },
  { x: 16, y: 0, t: 16, pressure: 1.0 },
], { ...engine.DEFAULT_PROFILE, taperStart: 0, taperEnd: 0 });
const avg = items => items.reduce((sum, item) => sum + item.radius, 0) / items.length;
check(avg(high.stamps) > avg(low.stamps), 'pressure does not increase stamp radius');

const signature = engine.makeKotlinSignature();
check(signature.BrushProfile.includes('spacing:Float'), 'BrushProfile signature missing spacing');
check(signature.StylusPoint.includes('pressure:Float'), 'StylusPoint signature missing pressure');
check(signature.StampPlan.includes('blendMode:String'), 'StampPlan signature missing blendMode');

if (failed) {
  console.error(`\nBrush engine smoke FAILED (${failed} check${failed > 1 ? 's' : ''}).`);
  process.exit(1);
}

console.log(`✅ Brush engine smoke passed. samples=${plan.samples.length} stamps=${plan.stamps.length} distance=${plan.distance.toFixed(2)}`);
