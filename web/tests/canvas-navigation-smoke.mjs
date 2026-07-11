// InkFrame — frame-coalesced persistent canvas navigation smoke
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
const source = readFileSync(resolve(here, '..', 'canvas-navigation.js'), 'utf8');
let failed = 0;
function check(condition, message){
  if (!condition) { console.error('❌ ' + message); failed++; }
}

const dom = new JSDOM(`<!doctype html><html><head></head><body>
  <div id="stage"><div id="frameGlass"><canvas id="c" width="800" height="600"></canvas></div></div>
  <div id="inkframe-ui-classic-plus-dock"></div>
</body></html>`, {
  pretendToBeVisual:true,
  runScripts:'outside-only',
  url:'https://inkframe.local/',
});
const { window } = dom;
window.console = console;
window.requestAnimationFrame = fn => window.setTimeout(fn, 0);
window.cancelAnimationFrame = id => window.clearTimeout(id);
Object.defineProperty(window, 'innerWidth', { configurable:true, value:1200 });
Object.defineProperty(window, 'innerHeight', { configurable:true, value:800 });

const stage = window.document.getElementById('stage');
const canvas = window.document.getElementById('c');
stage.getBoundingClientRect = () => ({ left:0, top:0, right:1200, bottom:800, width:1200, height:800 });
canvas.getBoundingClientRect = () => ({ left:300, top:120, right:900, bottom:720, width:600, height:600 });

window.localStorage.setItem('inkframe.canvas.navigation.v2', JSON.stringify({
  panX:37,
  panY:-19,
  zoom:1.6,
  navMode:true,
  savedAt:1,
}));

window.eval(source);
const api = window.InkFrameCanvasNavigation;
check(!!api, 'navigation API missing');
check(api.VERSION === 'v4-frame-coalesced-navigation', 'navigation version mismatch');
check(typeof api.queueTransform === 'function', 'queueTransform export missing');
check(typeof api.flushTransform === 'function', 'flushTransform export missing');

const anchor = api.anchorCoordinates({ left:100, top:50, width:400, height:200 }, { x:300, y:150 });
check(Math.abs(anchor.u-0.5)<1e-9 && Math.abs(anchor.v-0.5)<1e-9, 'anchor coordinates incorrect');
check(api.gestureScale(0,30) === 1, 'single-pointer gesture scale must stay neutral');
check(api.gestureExceeded({x:10,y:10}, {x:12,y:12}, 0, 0) === false, 'single-pointer micro move should stay in dead zone');
check(api.gestureExceeded({x:10,y:10}, {x:15,y:10}, 0, 0) === true, 'single-pointer pan should activate');

api.install();
let metrics = api.metrics();
check(metrics.active === true, 'navigation should be active');
check(metrics.wrapperPresent === true, 'viewport wrapper missing');
check(window.document.getElementById('frameGlass').parentElement.id === 'inkframe-canvas-viewport', 'frame should be wrapped');
check(metrics.restored === true, 'saved viewport should restore');
check(metrics.navMode === true, 'saved Hand mode should restore');
check(Math.abs(metrics.zoom-1.6)<1e-9, 'saved zoom should restore');

api.setNavMode(false);
api.setView({ panX:25, panY:-12, zoom:2.25 });
metrics = api.metrics();
check(metrics.panX === 25 && metrics.panY === -12, 'setView pan incorrect');
check(Math.abs(metrics.zoom-2.25)<1e-9, 'setView zoom incorrect');

const beforeFrames = metrics.transformFrames;
api.queueTransform({ persist:false });
api.queueTransform({ persist:false });
api.queueTransform({ persist:false });
await new Promise(resolve => window.setTimeout(resolve, 10));
metrics = api.metrics();
check(metrics.transformFrames === beforeFrames+1, 'queued transforms should commit once per animation frame');
check(metrics.coalescedTransformRequests >= 2, 'coalesced transform metric missing');

const savesBefore = metrics.saveCount;
api.queueTransform({ persist:false });
api.flushTransform({ persist:false });
check(api.metrics().saveCount === savesBefore, 'gesture transform should not persist until requested');
api.queueTransform({ persist:true });
api.flushTransform({ persist:true });
check(api.metrics().saveCount > savesBefore, 'explicit flush should persist');

api.setView({ zoom:99 });
check(api.metrics().zoom === api.MAX_ZOOM, 'zoom should clamp maximum');
api.setView({ zoom:-99 });
check(api.metrics().zoom === api.MIN_ZOOM, 'zoom should clamp minimum');
api.resetView();
check(api.metrics().zoom === 1, 'resetView should restore 100%');

canvas.setAttribute('width', '1024');
await new Promise(resolve => window.setTimeout(resolve, 20));
check(api.metrics().projectFitCount >= 1, 'canvas dimension change should trigger project fit');

const report = api.reportLines();
check(report.some(line => line.includes('Canvas Navigation version: v4-frame-coalesced-navigation')), 'report missing v4 version');
check(report.some(line => line.includes('Canvas Navigation transform frames:')), 'report missing transform frames');
check(report.some(line => line.includes('Canvas Navigation coalesced requests:')), 'report missing coalesced requests');

if (failed) {
  console.error(`\nCanvas navigation smoke FAILED (${failed} check${failed>1?'s':''}).`);
  window.close();
  process.exit(1);
}
console.log(`✅ Canvas navigation smoke passed. frames=${metrics.transformFrames} coalesced=${metrics.coalescedTransformRequests}`);
window.close();
process.exit(0);
