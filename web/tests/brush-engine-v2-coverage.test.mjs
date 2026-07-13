// InkFrame Brush Engine V2 — continuous ribbon coverage tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const files = [
  'brush-engine-v2/sample.js',
  'brush-engine-v2/validator.js',
  'brush-engine-v2/filters.js',
  'brush-engine-v2/path.js',
  'brush-engine-v2/arc-sampler.js',
  'brush-engine-v2/rasterizer.js',
  'brush-engine-v2/trace.js',
  'brush-engine-v2/engine.js',
  'brush-engine-v2/tuning.js',
];
const sandbox = { console, Math, Date, JSON, Object, Array, Number, String, Boolean, Map, Set, WeakMap, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of files) vm.runInContext(readFileSync(resolve(web, file), 'utf8'), sandbox, { filename:file });
const V2 = sandbox.InkFrameBrushV2;

function makeContext() {
  const calls = [];
  return {
    calls,
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    beginPath() { calls.push(['beginPath']); },
    arc(x, y, radius) { calls.push(['arc', x, y, radius]); },
    fill() { calls.push(['fill']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    stroke() { calls.push(['stroke', this.lineWidth, this.globalAlpha, this.globalCompositeOperation]); },
    createRadialGradient() { return { addColorStop() {} }; },
  };
}

const baseProfile = { size:14, minSize:0.08, opacity:1, spacing:0.055, hardness:0.92, response:0 };

// V2 presets default to continuous coverage, while the legacy dab renderer remains selectable.
{
  const balanced = V2.presetValue('balanced');
  assert.equal(balanced.coverageMode, 'ribbon');
  assert.equal(V2.normalizeTuning({ coverageMode:'dabs' }).coverageMode, 'dabs');
  assert.equal(V2.normalizeTuning({ coverageMode:'invalid' }).coverageMode, 'ribbon');
  assert.equal(V2.applyTuningToProfile(baseProfile, balanced).coverage, 'ribbon');
}

// Engine commands identify the first dab of every stroke so renderer state cannot
// accidentally bridge two separate pen-down gestures.
{
  const profile = V2.applyTuningToProfile(baseProfile, V2.presetValue('balanced'));
  const engine = V2.createBrushEngine({ width:500, height:300, profile });
  const commands = [
    ...engine.begin({ x:10, y:20, time:0, pressure:0.4 }),
    ...engine.move({ x:30, y:20, time:8, pressure:0.5 }),
    ...engine.move({ x:60, y:25, time:16, pressure:0.6 }),
    ...engine.end({ x:90, y:30, time:24, pressure:0.7 }),
  ];
  assert.ok(commands.length > 2);
  assert.equal(commands[0].coverage, 'ribbon');
  assert.equal(commands[0].strokeStart, true);
  assert.equal(commands[0].strokeIndex, 0);
  for (let i = 1; i < commands.length; i++) {
    assert.equal(commands[i].strokeStart, false);
    assert.equal(commands[i].strokeIndex, i);
  }
}

// The first ribbon command paints a cap; later commands paint anti-aliased line
// coverage plus the variable-radius endpoint.
{
  const ctx = makeContext();
  const profile = V2.resolveProfile('ink', { ...baseProfile, coverage:'ribbon' });
  const a = V2.dabFromSample({ x:10, y:10, pressure:0.4, time:0, tiltX:0, tiltY:0, azimuth:0 }, 'ink', profile, { strokeId:1, strokeIndex:0, strokeStart:true });
  const b = V2.dabFromSample({ x:20, y:12, pressure:0.6, time:8, tiltX:0, tiltY:0, azimuth:0 }, 'ink', profile, { strokeId:1, strokeIndex:1, strokeStart:false });
  V2.paintRoundDab(ctx, a, '#123456');
  assert.equal(ctx.calls.filter(call => call[0] === 'stroke').length, 0);
  V2.paintRoundDab(ctx, b, '#123456');
  assert.ok(ctx.calls.filter(call => call[0] === 'stroke').length >= 1);
  assert.ok(ctx.calls.filter(call => call[0] === 'arc').length >= 2);
  const geometry = V2.ribbonGeometry(a, b);
  assert.ok(geometry.distance > 0);
  assert.ok(geometry.coreRadius <= geometry.radius);
  assert.ok(geometry.opacity >= 0 && geometry.opacity <= 1);
}

// A new stroke start resets context-local ribbon history rather than connecting
// the new mark to the prior stroke endpoint.
{
  const ctx = makeContext();
  const profile = V2.resolveProfile('ink', { ...baseProfile, coverage:'ribbon' });
  const make = (x, index, start, id, time=index * 8) => V2.dabFromSample(
    { x, y:10, pressure:0.5, time, tiltX:0, tiltY:0, azimuth:0 },
    'ink', profile, { strokeId:id, strokeIndex:index, strokeStart:start }
  );
  V2.paintRoundDab(ctx, make(0, 0, true, 1), '#000');
  V2.paintRoundDab(ctx, make(10, 1, false, 1), '#000');
  const before = ctx.calls.filter(call => call[0] === 'stroke').length;
  V2.paintRoundDab(ctx, make(100, 0, true, 2), '#000');
  const after = ctx.calls.filter(call => call[0] === 'stroke').length;
  assert.equal(after, before);
}

// A changed stroke ID is itself a hard boundary, even if upstream metadata loses
// the strokeStart flag or fails to reset the index.
{
  const ctx = makeContext();
  const profile = V2.resolveProfile('ink', { ...baseProfile, coverage:'ribbon' });
  const make = (x, index, id) => V2.dabFromSample(
    { x, y:20, pressure:0.5, time:index * 8, tiltX:0, tiltY:0, azimuth:0 },
    'ink', profile, { strokeId:id, strokeIndex:index, strokeStart:false }
  );
  V2.paintRoundDab(ctx, make(0, 0, 10), '#000');
  V2.paintRoundDab(ctx, make(10, 1, 10), '#000');
  const before = ctx.calls.filter(call => call[0] === 'stroke').length;
  V2.paintRoundDab(ctx, make(300, 2, 11), '#000');
  assert.equal(ctx.calls.filter(call => call[0] === 'stroke').length, before);
}

// Final pixel-stage failsafe: a huge adjacent-command relocation within the same
// stroke paints a new cap but never emits a connecting line.
{
  const ctx = makeContext();
  const profile = V2.resolveProfile('ink', { ...baseProfile, coverage:'ribbon' });
  const make = (x, index, time) => V2.dabFromSample(
    { x, y:30, pressure:0.5, time, tiltX:0, tiltY:0, azimuth:0 },
    'ink', profile, { strokeId:20, strokeIndex:index, strokeStart:index === 0 }
  );
  const a = make(0, 0, 0);
  const b = make(10, 1, 8);
  const teleported = make(600, 2, 16);
  V2.paintRoundDab(ctx, a, '#000');
  V2.paintRoundDab(ctx, b, '#000');
  const before = ctx.calls.filter(call => call[0] === 'stroke').length;
  assert.ok(V2.ribbonGeometry(b, teleported).distance > V2.ribbonGapLimit(b, teleported));
  V2.paintRoundDab(ctx, teleported, '#000');
  assert.equal(ctx.calls.filter(call => call[0] === 'stroke').length, before);
  assert.equal(ctx.calls.filter(call => call[0] === 'arc').length, 3);
}

// Dabs mode remains discrete and does not emit connecting line coverage.
{
  const ctx = makeContext();
  const profile = V2.resolveProfile('ink', { ...baseProfile, coverage:'dabs' });
  const a = V2.dabFromSample({ x:0, y:0, pressure:0.5, time:0, tiltX:0, tiltY:0, azimuth:0 }, 'ink', profile, { strokeIndex:0, strokeStart:true });
  const b = V2.dabFromSample({ x:10, y:0, pressure:0.5, time:8, tiltX:0, tiltY:0, azimuth:0 }, 'ink', profile, { strokeIndex:1 });
  V2.paintRoundDab(ctx, a, '#000');
  V2.paintRoundDab(ctx, b, '#000');
  assert.equal(ctx.calls.filter(call => call[0] === 'stroke').length, 0);
  assert.equal(ctx.calls.filter(call => call[0] === 'arc').length, 2);
}

console.log('✅ Brush Engine V2 ribbon coverage and final continuity failsafe tests passed');
