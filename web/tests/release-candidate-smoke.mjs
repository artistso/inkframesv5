// InkFrame -- release candidate stability smoke
// -----------------------------------------------------------------------------
// Validates the final APK guardrails: drawing canvas accepts input, the
// square/circle toggle can be repaired, retired scrubber overlays stay
// non-blocking, and passive engine modules are available.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  ({ JSDOM } = require(process.env.JSDOM_PATH || '/tmp/jsdom/node_modules/jsdom'));
}

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');

let failed = 0;
function check(condition, message) {
  if (!condition) {
    console.error('❌ ' + message);
    failed++;
  }
}

const brushMath = readFileSync(resolve(webDir, 'brush-math.js'), 'utf8');
const bootOrder = [
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
let lastIndex = -1;
for (const moduleName of bootOrder) {
  const index = brushMath.indexOf(`loadScript('${moduleName}'`);
  check(index > lastIndex, `${moduleName} missing or out of order`);
  lastIndex = index;
}
check(!brushMath.includes("loadScript('circular-scrubber.js'"), 'circular scrubber must not load in release candidate');

const dom = new JSDOM(`<!doctype html><html><head></head><body>
  <div id="frameGlass"><canvas id="c"></canvas></div>
  <div id="inkframe-timeline-scrubber-zone" style="pointer-events:auto"></div>
</body></html>`, {
  pretendToBeVisual: true,
  runScripts: 'outside-only',
  url: 'https://inkframe.local/',
});

const { window } = dom;
window.console = console;
window.requestAnimationFrame = fn => window.setTimeout(fn, 0);
window.InkFrameBrushEngine = { VERSION: 'test-brush' };
window.InkFrameBrushDynamics = { VERSION: 'test-dynamics' };
window.InkFrameVectorEngine = { VERSION: 'test-vector' };
window.InkFrameUIFlatControls = { VERSION: 'test-flat' };
window.InkFrameCircularCanvas = { reportLines: () => ['Circular Canvas: test'] };
window.InkFrameCircularTransformSafe = {
  apply() {
    let button = window.document.getElementById('inkframe-circle-toggle');
    if (!button) {
      button = window.document.createElement('button');
      button.id = 'inkframe-circle-toggle';
      window.document.body.appendChild(button);
    }
    button.textContent = window.document.body.classList.contains('circular-canvas') ? 'SQUARE' : 'CIRCLE';
  }
};

window.eval(readFileSync(resolve(webDir, 'release-candidate.js'), 'utf8'));
window.InkFrameReleaseCandidate.apply();
const metrics = window.InkFrameReleaseCandidate.metrics();

check(metrics.active === true, 'release candidate guard not active');
check(metrics.canvasPresent === true, 'canvas missing');
check(metrics.framePresent === true, 'frame shell missing');
check(metrics.canvasPointerEvents === 'auto', 'canvas pointer events not open');
check(metrics.framePointerEvents === 'auto', 'frame pointer events not open');
check(metrics.circleTogglePresent === true, 'circle toggle not repaired');
check(metrics.circleToggleLabel === 'CIRCLE', 'circle toggle label should target circle in square mode');
check(metrics.scrubberLoaded === false, 'scrubber should not be loaded');
check(metrics.scrubberOverlayPointerEvents === 'none', 'scrubber overlay must be non-blocking');
check(metrics.brushEngine === true, 'brush engine not detected');
check(metrics.brushDynamics === true, 'brush dynamics not detected');
check(metrics.vectorEngine === true, 'vector engine not detected');
check(metrics.flatControls === true, 'flat controls not detected');

const report = window.InkFrameReleaseCandidate.reportLines();
check(report.some(line => line.includes('Release Candidate: stable guard active')), 'release candidate report lines missing stable guard');
check(report.some(line => line.includes('Release Candidate scrubber loaded: no')), 'release report should confirm scrubber disabled');

if (failed) {
  console.error(`\nRelease candidate smoke FAILED (${failed} check${failed > 1 ? 's' : ''}).`);
  window.close();
  process.exit(1);
}

console.log(`✅ Release candidate smoke passed. toggle=${metrics.circleToggleLabel} canvas=${metrics.canvasPointerEvents} scrubber=${metrics.scrubberOverlayPointerEvents}`);
window.close();
process.exit(0);
