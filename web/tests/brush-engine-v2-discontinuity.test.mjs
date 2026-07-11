// InkFrame Brush Engine V2 — mid-stroke discontinuity segmentation tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const files = [
  'brush-engine-v2/sample.js',
  'brush-engine-v2/validator.js',
  'brush-engine-v2/filters.js',
  'brush-engine-v2/path.js',
  'brush-engine-v2/arc-sampler.js',
  'brush-engine-v2/rasterizer.js',
  'brush-engine-v2/engine.js',
];
const sandbox = { console, Math, Date, JSON, Object, Array, Number, String, Boolean, Map, Set, WeakMap, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of files) vm.runInContext(readFileSync(resolve(root, file), 'utf8'), sandbox, { filename:file });
const V2 = sandbox.InkFrameBrushV2;
const sample = (x, y, time, pressure = 0.5) => V2.normalizeSample({ x, y, time, pressure, pointerType:'pen' });

// A confirmed relocation emits a subpath break instead of releasing a bridge.
{
  const validator = V2.createSampleValidator({ width:1000, height:800 });
  validator.beginDetailed(sample(100, 100, 0));
  validator.pushDetailed(sample(112, 102, 8));
  const held = validator.pushDetailed(sample(610, 510, 16));
  assert.equal(held.samples.length, 0);
  assert.equal(held.breakBefore, false);
  const confirmed = validator.pushDetailed(sample(620, 514, 24));
  assert.equal(confirmed.breakBefore, true);
  assert.equal(confirmed.breakReason, 'confirmed-discontinuity');
  assert.equal(confirmed.samples.length, 2);
  assert.equal(confirmed.samples[0].x, 610);
  assert.equal(validator.snapshot().breaks, 1);
  assert.equal(validator.snapshot().dropped, 0);
}

// A single out-and-back excursion is discarded and does not split the path.
{
  const validator = V2.createSampleValidator({ width:1000, height:800 });
  validator.beginDetailed(sample(100, 100, 0));
  validator.pushDetailed(sample(110, 103, 8));
  validator.pushDetailed(sample(620, 500, 16));
  const returned = validator.pushDetailed(sample(118, 106, 24));
  assert.equal(returned.breakBefore, false);
  assert.equal(returned.samples.length, 1);
  assert.equal(returned.samples[0].x, 118);
  assert.equal(validator.snapshot().breaks, 0);
  assert.equal(validator.snapshot().reasons['isolated-spike'], 1);
}

// A large displacement over a realistic event stall remains continuous because
// the break threshold scales with elapsed time.
{
  const validator = V2.createSampleValidator({ width:1400, height:900 });
  validator.beginDetailed(sample(100, 100, 0));
  const moved = validator.pushDetailed(sample(400, 100, 40));
  assert.equal(moved.breakBefore, false);
  assert.equal(moved.samples.length, 1);
  assert.equal(validator.snapshot().breaks, 0);
}

// Engine output contains two independent raster subpaths and no commands across
// the empty region between them.
{
  const engine = V2.createBrushEngine({
    width:1000,
    height:800,
    profile:{ size:12, spacing:0.08, coverage:'ribbon' },
    filter:{ positionTimeConstantMs:0.5, pressureTimeConstantMs:0.5 },
  });
  const commands = [
    ...engine.begin(sample(100, 100, 0)),
    ...engine.move(sample(112, 102, 8)),
    ...engine.move(sample(610, 510, 16)),
    ...engine.move(sample(620, 514, 24)),
    ...engine.move(sample(632, 518, 32)),
    ...engine.end(sample(632, 518, 40, 0)),
  ];
  assert.ok(commands.length > 0);
  const ids = [...new Set(commands.map(command => command.strokeId))];
  assert.equal(ids.length, 2, `expected two raster subpaths, got ${ids.length}`);
  const first = commands.filter(command => command.strokeId === ids[0]);
  const second = commands.filter(command => command.strokeId === ids[1]);
  assert.ok(Math.max(...first.map(command => command.x)) < 150);
  assert.ok(Math.min(...second.map(command => command.x)) > 580);
  assert.equal(commands.some(command => command.x > 180 && command.x < 560), false);
  assert.equal(second[0].strokeStart, true);
  assert.equal(engine.stats().discontinuities, 1);
  assert.equal(engine.stats().subpaths, 2);
  assert.equal(engine.stats().validator.breaks, 1);
}

// An unconfirmed terminal relocation remains quarantined and cannot paint. No
// terminal sample is supplied here; supplying the same relocated coordinate again
// would correctly confirm a new region in Raw contact mode.
{
  const engine = V2.createBrushEngine({ width:1000, height:800 });
  const commands = [
    ...engine.begin(sample(80, 80, 0)),
    ...engine.move(sample(92, 84, 8)),
    ...engine.move(sample(700, 620, 16)),
    ...engine.end(),
  ];
  assert.ok(Math.max(...commands.map(command => command.x)) < 130);
  assert.equal(engine.stats().discontinuities, 0);
  assert.equal(engine.stats().validator.reasons['unconfirmed-terminal-jump'], 1);
}

console.log('✅ Brush Engine V2 discontinuity segmentation tests passed');
