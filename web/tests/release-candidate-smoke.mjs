// InkFrame -- release candidate stability smoke
// -----------------------------------------------------------------------------
// Validates the final APK guardrails for the stable square-canvas path: drawing
// canvas accepts input, circular frontend modules are not loaded, experimental UI
// override modules are not loaded, retired scrubber overlays stay non-blocking,
// and passive engine modules are available.

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
  'release-candidate.js',
];
let lastIndex = -1;
for (const moduleName of bootOrder) {
  const index = brushMath.indexOf(`loadScript('${moduleName}'`);
  check(index > lastIndex, `${moduleName} missing or out of order`);
  lastIndex = index;
}
check(!brushMath.includes("loadScript('circular-canvas.js'"), 'circular canvas frontend must not load in stable APK');
check(!brushMath.includes("loadScript('circular-transform-safe.js'"), 'circular transform frontend must not load in stable APK');
check(!brushMath.includes("loadScript('circular-scrubber.js'"), 'circular scrubber must not load in stable APK');
check(!brushMath.includes("loadScript('ui-layout.js'"), 'experimental UI layout override must not load in restored original UI path');
check(!brushMath.includes("loadScript('ui-icon-polish.js'"), 'experimental UI icon polish must not load in restored original UI path');
check(!brushMath.includes("loadScript('ui-glass.js'"), 'experimental glass UI must not load in restored original UI path');
check(!brushMath.includes("loadScript('ui-flat-controls.js'"), 'experimental flat controls must not load in restored original UI path');

const dom = new JSDOM(`<!doctype html><html><head></head><body class="circular-canvas scrubbing-timeline inkframe-flat-controls">
  <button id="inkframe-circle-toggle">SQUARE</button>
  <div id="frameGlass" style="pointer-events:none;clip-path:circle(50%);transform:scale(.9)"><canvas id="c" style="pointer-events:none;border-radius:50%;clip-path:circle(50%)"></canvas></div>
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

window.eval(readFileSync(resolve(webDir, 'release-candidate.js'), 'utf8'));
window.InkFrameReleaseCandidate.apply();
const metrics = window.InkFrameReleaseCandidate.metrics();

check(metrics.active === true, 'release candidate guard not active');
check(metrics.version === 'v2-square-canvas-stable-guard', 'release candidate guard version mismatch');
check(metrics.canvasMode === 'square', 'release path must be square canvas');
check(metrics.canvasPresent === true, 'canvas missing');
check(metrics.framePresent === true, 'frame shell missing');
check(metrics.canvasPointerEvents === 'auto', 'canvas pointer events not open');
check(metrics.framePointerEvents === 'auto', 'frame pointer events not open');
check(metrics.circularMode === false, 'circular-canvas class should be removed');
check(metrics.circleFrontendLoaded === false, 'circular frontend modules should not be loaded');
check(metrics.circleToggleVisible === false, 'circle toggle should be hidden in stable square path');
check(metrics.scrubberLoaded === false, 'scrubber should not be loaded');
check(metrics.scrubberOverlayPointerEvents === 'none', 'scrubber overlay must be non-blocking');
check(metrics.brushEngine === true, 'brush engine not detected');
check(metrics.brushDynamics === true, 'brush dynamics not detected');
check(metrics.vectorEngine === true, 'vector engine not detected');
check(metrics.flatControls === false, 'flat controls override should not be loaded in restored original UI path');

const report = window.InkFrameReleaseCandidate.reportLines();
check(report.some(line => line.includes('Release Candidate: stable guard active')), 'release candidate report lines missing stable guard');
check(report.some(line => line.includes('Release Candidate canvas mode: square')), 'release report should confirm square canvas mode');
check(report.some(line => line.includes('Release Candidate circular frontend loaded: no')), 'release report should confirm circular frontend disabled');
check(report.some(line => line.includes('Release Candidate scrubber loaded: no')), 'release report should confirm scrubber disabled');
check(report.some(line => line.includes('Release Candidate flat controls: no')), 'release report should confirm original UI controls restored');

if (failed) {
  console.error(`\nRelease candidate smoke FAILED (${failed} check${failed > 1 ? 's' : ''}).`);
  window.close();
  process.exit(1);
}

console.log(`✅ Release candidate smoke passed. mode=${metrics.canvasMode} originalUI=${metrics.flatControls ? 'no' : 'yes'} circularFrontend=${metrics.circleFrontendLoaded ? 'yes' : 'no'}`);
window.close();
process.exit(0);
