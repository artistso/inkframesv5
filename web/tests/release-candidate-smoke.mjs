// InkFrame -- release candidate stability smoke
// -----------------------------------------------------------------------------
// Validates the final APK guardrails for the stable square-canvas path: drawing
// canvas accepts input, circular frontend modules are not loaded, experimental UI
// override modules are not loaded, retired scrubber overlays stay non-blocking,
// polished classic draggable UI is restored, Classic Plus dock/lock/reset/corner
// and size controls work, and passive engine modules are available.

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
  'ui-classic-restore.js',
  'ui-classic-plus.js',
  'ui-classic-dock-corners.js',
  'ui-classic-size.js',
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

const dom = new JSDOM(`<!doctype html><html><head></head><body class="circular-canvas scrubbing-timeline inkframe-flat-controls inkframe-glass-ui inkframe-icon-polish inkframe-ui-layout">
  <button id="inkframe-circle-toggle">SQUARE</button>
  <div class="node"><button class="orb"><span class="glyph">✒</span><span class="lbl">Draw</span></button><div class="kids"><button class="kid"><span class="glyph">•</span></button></div></div>
  <div id="frameGlass" style="pointer-events:none;clip-path:circle(50%);transform:scale(.9)"><canvas id="c" style="pointer-events:none;border-radius:50%;clip-path:circle(50%)"></canvas></div>
  <div id="inkframe-ui-map" style="pointer-events:auto"></div>
  <div id="inkframe-ui-context" style="pointer-events:auto"></div>
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

window.eval(readFileSync(resolve(webDir, 'ui-classic-restore.js'), 'utf8'));
window.InkFrameUIClassicRestore.apply();
window.eval(readFileSync(resolve(webDir, 'ui-classic-plus.js'), 'utf8'));
window.InkFrameUIClassicPlus.apply();
window.eval(readFileSync(resolve(webDir, 'ui-classic-dock-corners.js'), 'utf8'));
window.InkFrameUIClassicDockCorners.apply();
window.eval(readFileSync(resolve(webDir, 'ui-classic-size.js'), 'utf8'));
window.InkFrameUIClassicSize.apply();
window.eval(readFileSync(resolve(webDir, 'release-candidate.js'), 'utf8'));
window.InkFrameReleaseCandidate.apply();
let metrics = window.InkFrameReleaseCandidate.metrics();
const classic = window.InkFrameUIClassicRestore.metrics();
let plus = window.InkFrameUIClassicPlus.metrics();
let corners = window.InkFrameUIClassicDockCorners.metrics();
let size = window.InkFrameUIClassicSize.metrics();

check(metrics.active === true, 'release candidate guard not active');
check(metrics.version === 'v7-square-classic-size-guard', 'release candidate guard version mismatch');
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
check(metrics.classicUI === true, 'classic draggable UI restore should be active');
check(metrics.classicPlus === true, 'Classic Plus should be active');
check(metrics.uiDockToggle === true, 'Classic Plus dock toggle missing');
check(metrics.uiDockCornerModule === true, 'Classic Plus dock corner module missing');
check(metrics.uiDockCornerButton === true, 'Classic Plus dock corner button missing');
check(metrics.uiDockCorner === 'bottom-left', 'Classic Plus dock should start bottom-left');
check(metrics.uiSizeModule === true, 'Classic UI size module missing');
check(metrics.uiSizeButton === true, 'Classic UI size button missing');
check(metrics.uiSize === 'normal', 'Classic UI size should start normal');
check(metrics.uiLockToggle === true, 'Classic Plus UI lock toggle missing');
check(metrics.uiReset === true, 'Classic Plus UI reset missing');
check(metrics.uiStatus === true, 'Classic Plus status pill missing');
check(metrics.uiLockGate === true, 'Classic Plus lock gate missing');
check(classic && classic.active === true, 'classic UI metrics missing');
check(classic.version === 'v2-original-orb-ui-polish', 'classic UI version mismatch');
check(classic.rootButtons === 1, 'classic UI should detect root orb');
check(classic.childButtons === 1, 'classic UI should detect child button');
check(classic.classicMarkedRoots === 1, 'classic UI should mark root controls');
check(classic.pointerWatch === true, 'classic UI pointer watch should be installed');
check(plus && plus.active === true, 'Classic Plus metrics missing');
check(plus.version === 'v3-collapsible-dock', 'Classic Plus version mismatch');
check(plus.dockPresent === true, 'Classic Plus dock missing');
check(plus.dockTogglePresent === true, 'Classic Plus dock toggle missing');
check(plus.dockCollapsed === false, 'Classic Plus dock should start expanded by default');
check(plus.lockTogglePresent === true, 'Classic Plus lock toggle missing');
check(plus.resetPresent === true, 'Classic Plus reset missing');
check(plus.statusPresent === true, 'Classic Plus status missing');
check(plus.lockGate === true, 'Classic Plus lock gate should be installed');
check(plus.rootButtons === 1, 'Classic Plus should detect root orb');
check(plus.childButtons === 1, 'Classic Plus should detect child button');
check(corners && corners.active === true, 'dock corner metrics missing');
check(corners.version === 'v1-corner-dock', 'dock corner version mismatch');
check(corners.dockPresent === true, 'dock corner module should see dock');
check(corners.cornerButtonPresent === true, 'dock corner button missing');
check(corners.corner === 'bottom-left', 'dock corner should default bottom-left');
check(size && size.active === true, 'UI size metrics missing');
check(size.version === 'v1-classic-ui-size-cycle', 'UI size version mismatch');
check(size.buttonPresent === true, 'UI size button missing');
check(size.size === 'normal', 'UI size should default normal');
check(size.normalClass === true, 'UI size normal class missing');
check(metrics.flatControls === false, 'flat controls override should not be loaded in restored original UI path');
check(metrics.glassControls === false, 'glass UI override should not be loaded in restored original UI path');
check(metrics.layoutOverride === false, 'layout override should not be loaded in restored original UI path');
check(metrics.iconPolish === false, 'icon polish override should not be loaded in restored original UI path');
check(window.document.body.classList.contains('inkframe-classic-ui'), 'classic UI body class should be present');
check(window.document.body.classList.contains('inkframe-classic-plus'), 'Classic Plus body class should be present');
check(window.document.body.classList.contains('inkframe-dock-corners'), 'dock corner body class should be present');
check(window.document.body.classList.contains('inkframe-ui-size-normal'), 'UI size normal class should be present');
check(!window.document.body.classList.contains('inkframe-flat-controls'), 'flat controls body class should be cleared');
check(!window.document.body.classList.contains('inkframe-glass-ui'), 'glass UI body class should be cleared');
check(!window.document.body.classList.contains('inkframe-icon-polish'), 'icon polish body class should be cleared');
check(!window.document.body.classList.contains('inkframe-ui-layout'), 'layout override body class should be cleared');

window.InkFrameUIClassicSize.cycleSize();
size = window.InkFrameUIClassicSize.metrics();
check(size.size === 'large', 'UI size should cycle to large');
check(window.document.body.classList.contains('inkframe-ui-size-large'), 'UI size large class should be present');
window.InkFrameUIClassicSize.cycleSize();
size = window.InkFrameUIClassicSize.metrics();
check(size.size === 'compact', 'UI size should cycle to compact');
check(window.document.body.classList.contains('inkframe-ui-size-compact'), 'UI size compact class should be present');
window.InkFrameUIClassicSize.setSize('normal');
size = window.InkFrameUIClassicSize.metrics();
check(size.size === 'normal', 'UI size should reset to normal');

window.InkFrameUIClassicPlus.setDockCollapsed(true);
plus = window.InkFrameUIClassicPlus.metrics();
check(plus.dockCollapsed === true, 'Classic Plus dock should collapse');
check(window.document.body.classList.contains('inkframe-ui-dock-collapsed'), 'dock collapsed body class should be present');
window.InkFrameReleaseCandidate.apply();
metrics = window.InkFrameReleaseCandidate.metrics();
check(metrics.uiDockCollapsed === true, 'release metrics should see collapsed dock');
window.InkFrameUIClassicPlus.setDockCollapsed(false);
plus = window.InkFrameUIClassicPlus.metrics();
check(plus.dockCollapsed === false, 'Classic Plus dock should expand');
check(!window.document.body.classList.contains('inkframe-ui-dock-collapsed'), 'dock collapsed body class should clear');

window.InkFrameUIClassicDockCorners.cycleCorner();
corners = window.InkFrameUIClassicDockCorners.metrics();
check(corners.corner === 'bottom-right', 'dock corner should cycle to bottom-right');
check(window.document.getElementById('inkframe-ui-classic-plus-dock').dataset.corner === 'bottom-right', 'dock dataset corner should update to bottom-right');
window.InkFrameUIClassicDockCorners.cycleCorner();
corners = window.InkFrameUIClassicDockCorners.metrics();
check(corners.corner === 'top-right', 'dock corner should cycle to top-right');
check(window.document.body.classList.contains('inkframe-dock-top'), 'top dock body class should be present');
window.InkFrameUIClassicDockCorners.resetCorner();
corners = window.InkFrameUIClassicDockCorners.metrics();
check(corners.corner === 'bottom-left', 'dock corner reset should return bottom-left');

window.InkFrameUIClassicPlus.setLocked(true);
check(window.InkFrameUIClassicPlus.metrics().locked === true, 'Classic Plus lock should turn on');
check(window.document.body.classList.contains('inkframe-ui-locked'), 'UI locked body class should be present');
window.InkFrameUIClassicPlus.requestResetUI();
check(window.InkFrameUIClassicPlus.metrics().resetConfirming === true, 'Classic Plus reset should require confirmation');
window.InkFrameUIClassicPlus.requestResetUI();
check(window.InkFrameUIClassicPlus.metrics().locked === false, 'Classic Plus confirmed reset should unlock UI');
check(window.InkFrameUIClassicPlus.metrics().dockCollapsed === false, 'Classic Plus confirmed reset should expand dock');
check(!window.document.body.classList.contains('inkframe-ui-locked'), 'UI locked body class should clear after reset');

window.InkFrameReleaseCandidate.apply();
metrics = window.InkFrameReleaseCandidate.metrics();
const report = window.InkFrameReleaseCandidate.reportLines();
const classicReport = window.InkFrameUIClassicRestore.reportLines();
const plusReport = window.InkFrameUIClassicPlus.reportLines();
const cornerReport = window.InkFrameUIClassicDockCorners.reportLines();
const sizeReport = window.InkFrameUIClassicSize.reportLines();
check(report.some(line => line.includes('Release Candidate: stable guard active')), 'release candidate report lines missing stable guard');
check(report.some(line => line.includes('Release Candidate canvas mode: square')), 'release report should confirm square canvas mode');
check(report.some(line => line.includes('Release Candidate circular frontend loaded: no')), 'release report should confirm circular frontend disabled');
check(report.some(line => line.includes('Release Candidate scrubber loaded: no')), 'release report should confirm scrubber disabled');
check(report.some(line => line.includes('Release Candidate classic UI: yes')), 'release report should confirm classic UI restored');
check(report.some(line => line.includes('Release Candidate classic plus: yes')), 'release report should confirm Classic Plus');
check(report.some(line => line.includes('Release Candidate UI dock toggle: yes')), 'release report should confirm dock toggle');
check(report.some(line => line.includes('Release Candidate UI dock collapsed: no')), 'release report should confirm expanded dock after reset');
check(report.some(line => line.includes('Release Candidate UI dock corners: yes')), 'release report should confirm dock corners');
check(report.some(line => line.includes('Release Candidate UI dock corner button: yes')), 'release report should confirm dock corner button');
check(report.some(line => line.includes('Release Candidate UI dock corner: bottom-left')), 'release report should confirm bottom-left dock corner after reset');
check(report.some(line => line.includes('Release Candidate UI size module: yes')), 'release report should confirm UI size module');
check(report.some(line => line.includes('Release Candidate UI size button: yes')), 'release report should confirm UI size button');
check(report.some(line => line.includes('Release Candidate UI size: normal')), 'release report should confirm normal UI size');
check(report.some(line => line.includes('Release Candidate UI lock toggle: yes')), 'release report should confirm UI lock toggle');
check(report.some(line => line.includes('Release Candidate UI reset: yes')), 'release report should confirm UI reset');
check(report.some(line => line.includes('Release Candidate UI status: yes')), 'release report should confirm UI status');
check(report.some(line => line.includes('Release Candidate UI lock gate: yes')), 'release report should confirm lock gate');
check(report.some(line => line.includes('Release Candidate flat controls: no')), 'release report should confirm flat override disabled');
check(report.some(line => line.includes('Release Candidate glass controls: no')), 'release report should confirm glass override disabled');
check(report.some(line => line.includes('Release Candidate layout override: no')), 'release report should confirm layout override disabled');
check(report.some(line => line.includes('Release Candidate icon polish: no')), 'release report should confirm icon polish disabled');
check(classicReport.some(line => line.includes('UI Classic Restore version: v2-original-orb-ui-polish')), 'classic UI report should include polished version');
check(classicReport.some(line => line.includes('UI Classic pointer watch: yes')), 'classic UI report should confirm pointer watch');
check(plusReport.some(line => line.includes('UI Classic Plus version: v3-collapsible-dock')), 'Classic Plus report should include v3 version');
check(plusReport.some(line => line.includes('UI Classic Plus dock toggle: yes')), 'Classic Plus report should confirm dock toggle');
check(plusReport.some(line => line.includes('UI Classic Plus reset: yes')), 'Classic Plus report should confirm reset control');
check(cornerReport.some(line => line.includes('UI Classic Dock Corners version: v1-corner-dock')), 'dock corner report should include version');
check(cornerReport.some(line => line.includes('UI Classic Dock corner: bottom-left')), 'dock corner report should include reset corner');
check(cornerReport.some(line => line.includes('UI Classic Dock button: yes')), 'dock corner report should confirm button');
check(sizeReport.some(line => line.includes('UI Classic Size version: v1-classic-ui-size-cycle')), 'UI size report should include version');
check(sizeReport.some(line => line.includes('UI Classic Size value: normal')), 'UI size report should include normal value');
check(sizeReport.some(line => line.includes('UI Classic Size button: yes')), 'UI size report should confirm button');

if (failed) {
  console.error(`\nRelease candidate smoke FAILED (${failed} check${failed > 1 ? 's' : ''}).`);
  window.close();
  process.exit(1);
}

console.log(`✅ Release candidate smoke passed. mode=${metrics.canvasMode} uiSize=${metrics.uiSize} dockCorner=${metrics.uiDockCorner} circularFrontend=${metrics.circleFrontendLoaded ? 'yes' : 'no'}`);
window.close();
process.exit(0);
