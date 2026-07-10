// InkFrame — persistent stylus-safe canvas navigation smoke
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
check(api.VERSION === 'v3-fluid-touch-navigation', 'navigation version mismatch');
check(typeof api.anchorCoordinates === 'function', 'anchorCoordinates export missing');
check(typeof api.anchorCorrection === 'function', 'anchorCorrection export missing');
check(typeof api.gestureScale === 'function', 'gestureScale export missing');
check(typeof api.gestureExceeded === 'function', 'gestureExceeded export missing');

const anchor = api.anchorCoordinates({ left:100, top:50, width:400, height:200 }, { x:300, y:150 });
check(Math.abs(anchor.u-0.5)<1e-9 && Math.abs(anchor.v-0.5)<1e-9, 'anchor coordinates incorrect');
const correction = api.anchorCorrection({ left:120, top:70, width:500, height:250 }, anchor, { x:300, y:150 });
check(Math.abs(correction.x+70)<1e-9, 'anchor correction x incorrect');
check(Math.abs(correction.y+45)<1e-9, 'anchor correction y incorrect');

check(api.gestureScale(0,0) === 1, 'single-pointer gesture must not look like a pinch');
check(api.gestureScale(100,125) === 1.25, 'pinch scale incorrect');
check(api.gestureExceeded({x:10,y:10},{x:12,y:12},0,0) === false, 'small one-pointer move should stay inside dead zone');
check(api.gestureExceeded({x:10,y:10},{x:15,y:10},0,0) === true, 'one-pointer pan beyond dead zone should activate');
check(api.gestureExceeded({x:10,y:10},{x:11,y:10},100,104) === true, 'pinch beyond dead zone should activate');

api.install();
let metrics = api.metrics();
check(metrics.active === true, 'navigation should be active');
check(metrics.wrapperPresent === true, 'viewport wrapper missing');
check(window.document.getElementById('frameGlass').parentElement.id === 'inkframe-canvas-viewport', 'frame should be wrapped by viewport');
check(metrics.navTogglePresent === true, 'Hand button missing');
check(metrics.fitPresent === true, 'Fit button missing');
check(metrics.zoomDisplayPresent === true, 'zoom display missing');
check(metrics.dimensionWatch === true, 'canvas dimension observer missing');
check(metrics.restored === true, 'saved viewport should restore');
check(metrics.navMode === true, 'saved Hand mode should restore');
check(Math.abs(metrics.zoom-1.6)<1e-9, 'saved zoom should restore');
check(metrics.panX === 37 && metrics.panY === -19, 'saved pan should restore');
check(window.document.body.classList.contains('inkframe-canvas-hand'), 'restored Hand body class missing');

api.setNavMode(false);
api.setView({ panX:0, panY:0, zoom:1 });

function pointer(type, id, x, y, pointerType='touch', button=0, buttons=1){
  const event = new window.MouseEvent(type, {
    bubbles:true,
    cancelable:true,
    clientX:x,
    clientY:y,
    button,
    buttons,
  });
  Object.defineProperty(event, 'pointerId', { configurable:true, value:id });
  Object.defineProperty(event, 'pointerType', { configurable:true, value:pointerType });
  canvas.dispatchEvent(event);
  return event;
}

// Two touch points should not navigate until the dead zone is crossed. Once it
// activates, the move is intercepted so the painter cannot continue that touch
// as a stroke, and the gesture applies real pinch zoom.
pointer('pointerdown', 1, 420, 360);
pointer('pointerdown', 2, 580, 360);
const tiny = pointer('pointermove', 2, 581, 360);
check(tiny.defaultPrevented === false, 'tiny two-finger movement should not activate navigation');
const pinchMove = pointer('pointermove', 2, 630, 360);
check(pinchMove.defaultPrevented === true, 'activated two-finger navigation should suppress painting');
await new Promise(resolve => window.setTimeout(resolve, 20));
metrics = api.metrics();
check(metrics.touchGestureActivations >= 1, 'two-finger gesture activation metric missing');
check(metrics.touchPinchFrames >= 1, 'two-finger pinch should update zoom');
check(metrics.suppressedTouchMoves >= 1, 'touch suppression metric missing');
check(metrics.zoom > 1, 'two-finger pinch should increase viewport zoom');
pointer('pointerup', 2, 630, 360, 'touch', 0, 0);
pointer('pointerup', 1, 420, 360, 'touch', 0, 0);

// Hand mode should respect the one-pointer dead zone instead of activating from
// a fake zero-distance pinch calculation.
api.resetView();
api.setNavMode(true);
pointer('pointerdown', 3, 500, 400);
const beforeHand = api.metrics();
pointer('pointermove', 3, 502, 401);
check(api.metrics().handPans === beforeHand.handPans, 'small Hand movement should stay inside dead zone');
pointer('pointermove', 3, 512, 400);
check(api.metrics().handPans > beforeHand.handPans, 'Hand pan should activate beyond dead zone');
pointer('pointerup', 3, 512, 400, 'touch', 0, 0);
api.setNavMode(false);

api.setView({ panX:25, panY:-12, zoom:2.25 });
metrics = api.metrics();
check(Math.abs(metrics.zoom-2.25)<1e-9, 'setView zoom incorrect');
check(metrics.panX === 25 && metrics.panY === -12, 'setView pan incorrect');
check(window.document.getElementById('inkframe-canvas-zoom-display').textContent === '225%', 'zoom display should update');
check(api.persistNow() === true, 'navigation state should persist');
const stored = JSON.parse(window.localStorage.getItem(api.STORAGE_KEY));
check(stored.panX === 25 && stored.panY === -12, 'persisted pan incorrect');
check(Math.abs(stored.zoom-2.25)<1e-9, 'persisted zoom incorrect');
check(stored.navMode === false, 'persisted Hand mode incorrect');

api.setView({ zoom:99 });
check(api.metrics().zoom === api.MAX_ZOOM, 'zoom should clamp to maximum');
api.setView({ zoom:-99 });
check(api.metrics().zoom === api.MIN_ZOOM, 'zoom should clamp to minimum');
api.resetView();
metrics = api.metrics();
check(metrics.zoom === 1 && metrics.panX === 0 && metrics.panY === 0, 'resetView should restore neutral view');
api.fitView();
check(api.metrics().fitCount >= 1, 'fitView metric missing');

canvas.setAttribute('width', '1024');
await new Promise(resolve => window.setTimeout(resolve, 30));
check(api.metrics().dimensionWatch === true, 'dimension observer should survive canvas resize');
check(api.metrics().projectFitCount >= 1, 'project-size change should fit the new canvas');

const report = api.reportLines();
check(report.some(line => line.includes('Canvas Navigation: active')), 'navigation report missing active state');
check(report.some(line => line.includes('Canvas Navigation version: v3-fluid-touch-navigation')), 'navigation report missing v3 version');
check(report.some(line => line.includes('Canvas Navigation persistence: yes')), 'navigation report missing persistence');
check(report.some(line => line.includes('Canvas Navigation touch pinch frames:')), 'navigation report missing touch pinch metric');
check(report.some(line => line.includes('Canvas Navigation suppressed touch moves:')), 'navigation report missing suppression metric');
check(report.some(line => line.includes('Canvas Navigation dimension watch: yes')), 'navigation report missing dimension watch');

if (failed) {
  console.error(`\nCanvas navigation smoke FAILED (${failed} check${failed>1?'s':''}).`);
  window.close();
  process.exit(1);
}
console.log(`✅ Canvas navigation smoke passed. zoom=${Math.round(api.metrics().zoom*100)} pinchFrames=${api.metrics().touchPinchFrames} suppressed=${api.metrics().suppressedTouchMoves}`);
window.close();
process.exit(0);
