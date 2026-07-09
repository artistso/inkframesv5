// InkFrame -- release-candidate smoke test
// -----------------------------------------------------------------------------
// Validates the stable APK boot contract: passive brush/vector/dynamics engines
// are loaded, risky scrubber is not loaded, flat controls and RC guard load last.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const brushMath = readFileSync(resolve(webDir, 'brush-math.js'), 'utf8');
const rcGuard = readFileSync(resolve(webDir, 'release-candidate.js'), 'utf8');

let failed = 0;
function check(condition, message) {
  if (!condition) {
    console.error('❌ ' + message);
    failed++;
  }
}

function loadIndex(name) {
  const re = new RegExp(`loadScript\\('${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}'`);
  const match = brushMath.match(re);
  return match ? match.index : -1;
}

const requiredOrder = [
  'brush-engine.js',
  'vector-engine.js',
  'brush-dynamics.js',
  'circular-canvas.js',
  'circular-transform-safe.js',
  'ui-layout.js',
  'ui-icon-polish.js',
  'ui-glass.js',
  'ui-flat-controls.js',
  'release-candidate.js',
];

for (const moduleName of requiredOrder) {
  check(loadIndex(moduleName) >= 0, `${moduleName} is not loaded by brush-math.js`);
}

for (let i = 1; i < requiredOrder.length; i++) {
  const prev = loadIndex(requiredOrder[i - 1]);
  const cur = loadIndex(requiredOrder[i]);
  check(prev >= 0 && cur > prev, `${requiredOrder[i]} should load after ${requiredOrder[i - 1]}`);
}

check(!/loadScript\('circular-scrubber\.js'/.test(brushMath), 'circular-scrubber.js must stay unloaded for RC stability');
check(/canvas#c\{pointer-events:auto!important;touch-action:none!important\}/.test(rcGuard), 'RC guard must force canvas pointer path open');
check(/#inkframe-timeline-scrubber-zone\{pointer-events:none!important\}/.test(rcGuard), 'RC guard must keep scrubber overlay non-blocking');
check(/InkFrameReleaseCandidate/.test(rcGuard), 'RC guard API missing');
check(/Release Candidate scrubber loaded/.test(rcGuard), 'RC report lines missing scrubber status');
check(/Release Candidate brush dynamics/.test(rcGuard), 'RC report lines missing brush dynamics status');

if (failed) {
  console.error(`\nRelease candidate smoke FAILED (${failed} check${failed > 1 ? 's' : ''}).`);
  process.exit(1);
}

console.log(`✅ Release candidate smoke passed. modules=${requiredOrder.length} scrubber=disabled guard=loaded-last`);
