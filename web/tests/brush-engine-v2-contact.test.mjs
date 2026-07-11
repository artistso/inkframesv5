// InkFrame Brush Engine V2 — pen contact boundary regression tests
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
  'brush-engine-v2/contact.js',
  'brush-engine-v2/filters.js',
  'brush-engine-v2/path.js',
  'brush-engine-v2/arc-sampler.js',
  'brush-engine-v2/radius.js',
  'brush-engine-v2/rasterizer.js',
  'brush-engine-v2/engine.js',
  'brush-engine-v2/tuning.js',
];
const sandbox = { console, Math, Date, JSON, Object, Array, Number, String, Boolean, Map, Set, WeakMap, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of files) vm.runInContext(readFileSync(resolve(root, file), 'utf8'), sandbox, { filename: file });
const V2 = sandbox.InkFrameBrushV2;
const sample = (x, y, time, pressure = 0.5) => V2.normalizeSample({ x, y, time, pressure, pointerType:'pen' });

// Strict mode holds the down sample until two movement samples establish whether
// the contact anchor belongs to the real trajectory.
{
  const guard = V2.createContactBoundaryGuard({ mode:'strict' });
  assert.deepEqual(guard.begin(sample(0, 0, 0)), []);
  assert.deepEqual(guard.move(sample(24, 0, 8)), []);
  const released = guard.move(sample(48, 0, 16));
  assert.equal(released.length, 3);
  assert.equal(released[0].x, 0);
  assert.equal(released[2].x, 48);
  assert.equal(guard.snapshot().displacedStarts, 0);
}

// A down coordinate far from two clustered movement samples is discarded instead
// of becoming a visible hook into the stroke.
{
  const guard = V2.createContactBoundaryGuard({ mode:'strict' });
  guard.begin(sample(0, 0, 0));
  guard.move(sample(40, 40, 8));
  const released = guard.move(sample(43, 42, 16));
  assert.equal(released.length, 2);
  assert.equal(released[0].x, 40);
  assert.equal(released[0].y, 40);
  assert.equal(guard.snapshot().displacedStarts, 1);
}

// Taps and one-move strokes remain drawable even though the pointerup coordinate
// itself is excluded from strict committed geometry.
{
  const tap = V2.createContactBoundaryGuard({ mode:'strict' });
  const down = sample(12, 14, 0);
  tap.begin(down);
  const tapOut = tap.end(sample(200, 200, 12, 0));
  assert.equal(tapOut.length, 1);
  assert.equal(tapOut[0].x, 12);
  assert.equal(tap.snapshot().taps, 1);
  assert.equal(tap.snapshot().terminalSamplesIgnored, 1);

  const short = V2.createContactBoundaryGuard({ mode:'strict' });
  short.begin(sample(10, 10, 0));
  short.move(sample(22, 12, 8));
  const shortOut = short.end(sample(300, 300, 16, 0));
  assert.equal(shortOut.length, 2);
  assert.equal(shortOut[1].x, 22);
  assert.equal(short.snapshot().shortStrokes, 1);
}

// Raw mode preserves the historical behavior and forwards the terminal sample.
{
  const guard = V2.createContactBoundaryGuard({ mode:'raw' });
  assert.equal(guard.begin(sample(0, 0, 0)).length, 1);
  assert.equal(guard.move(sample(10, 0, 8)).length, 1);
  const terminal = guard.end(sample(20, 0, 16));
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0].x, 20);
  assert.equal(guard.snapshot().rawTerminalSamples, 1);
}

// Strict engine output cannot be pulled toward a displaced pointerup coordinate.
{
  const profile = {
    size:12, minSize:0.1, opacity:1, spacing:0.08, hardness:1,
    response:0, coverage:'dabs', radiusMode:'raw', contactMode:'strict',
  };
  const engine = V2.createBrushEngine({
    width:1000, height:800, profile,
    filter:{ positionTimeConstantMs:0.5, pressureTimeConstantMs:0.5 },
  });
  const commands = [
    ...engine.begin(sample(10, 10, 0)),
    ...engine.move(sample(20, 10, 8)),
    ...engine.move(sample(30, 10, 16)),
    ...engine.end(sample(120, 90, 24, 0)),
  ];
  assert.ok(commands.length > 0);
  assert.ok(Math.max(...commands.map(command => command.x)) < 45);
  assert.equal(engine.stats().contact.terminalSamplesIgnored, 1);
}

// New presets opt into Strict, while profiles recorded before the contact field
// existed still resolve to Raw for byte-stable historical replay.
{
  assert.equal(V2.presetValue('balanced').contactMode, 'strict');
  assert.equal(V2.applyTuningToProfile({ spacing:0.1 }, V2.presetValue('balanced')).contactMode, 'strict');
  assert.equal(V2.resolveProfile('ink', { size:12 }).contactMode, 'raw');
}

console.log('✅ Brush Engine V2 contact boundary tests passed');
