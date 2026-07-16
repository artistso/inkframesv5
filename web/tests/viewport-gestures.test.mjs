// InkFrame viewport gestures — anchored pinch, event ownership, hand tool, compact UI, and modal isolation
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}

const here=dirname(fileURLToPath(import.meta.url));
const web=resolve(here,'..');
const source=readFileSync(resolve(web,'viewport-gestures.js'),'utf8');

function pureApi(){
  const sandbox={console,Math,Date,Number,Object,Map,Set,WeakMap,Error,module:{exports:{}},exports:{}};
  sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'viewport-gestures.js'});
  return sandbox.InkFrameViewportGestures;
}

{
  const api=pureApi();
  const base={scale:1,panX:0,panY:0,minScale:.35,maxScale:2.2,centerX:500,centerY:400};
  const next=api.anchoredViewport(base,{x:150,y:200},{x:180,y:230},100,160);
  assert.equal(next.scale,1.6);
  assert.equal(next.panX,240);
  assert.equal(next.panY,150);
  const translated=api.translatedViewport(base,{x:20,y:30},{x:55,y:12});
  assert.equal(translated.scale,1);
  assert.equal(translated.panX,35);
  assert.equal(translated.panY,-18);
  const capped=api.zoomAt(base,10,500,400);
  assert.equal(capped.scale,2.2,'button and wheel zoom must obey the host maximum');
}

function pointer(window,type,id,x,y,pointerType='touch'){
  const event=new window.Event(type,{bubbles:true,cancelable:true});
  Object.defineProperties(event,{
    pointerId:{value:id},pointerType:{value:pointerType},clientX:{value:x},clientY:{value:y},
    pressure:{value:.5},buttons:{value:type==='pointerup'?0:1},button:{value:type==='pointerup'?0:-1},
  });
  return event;
}

{
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="stage"><div id="frameGlass"><canvas id="c"></canvas></div></div></body></html>',{
    runScripts:'outside-only',url:'http://localhost/'
  });
  const {window}=dom;const {document}=window;
  let viewport={scale:1,panX:0,panY:0,fitScale:1,minScale:.35,maxScale:2.2,viewportWidth:1000,viewportHeight:800,centerX:500,centerY:400,canvasWidth:800,canvasHeight:600};
  let cancelCalls=0,undoCalls=0,redoCalls=0;const flashes=[];const raf=[];
  window.requestAnimationFrame=callback=>{raf.push(callback);return raf.length;};
  window.cancelAnimationFrame=()=>{};
  window.InkFrameViewportEnvironment=()=>({
    stage:document.getElementById('stage'),canvas:document.getElementById('c'),frameGlass:document.getElementById('frameGlass'),
    getState:()=>Object.assign({},viewport),
    setState:next=>(viewport=Object.assign({},viewport,next)),
    fit:()=>(viewport=Object.assign({},viewport,{scale:1,panX:0,panY:0})),
    center:()=>(viewport=Object.assign({},viewport,{panX:0,panY:0})),
    canGesture:()=>true,
    cancelTouchStroke:()=>{cancelCalls++;return true;},
    undo:()=>{undoCalls++;},redo:()=>{redoCalls++;},flash:value=>flashes.push(value),
  });
  window.eval(source);
  const api=window.InkFrameViewportGestures;
  assert.equal(api.install(),true);
  const canvas=document.getElementById('c');
  let canvasDowns=0;canvas.addEventListener('pointerdown',()=>{canvasDowns++;});

  canvas.dispatchEvent(pointer(window,'pointerdown',1,100,200));
  assert.equal(canvasDowns,1,'one-finger touch remains available to drawing');
  canvas.dispatchEvent(pointer(window,'pointerdown',2,200,200));
  assert.equal(canvasDowns,1,'the second touch must be consumed before the drawing listener');
  assert.equal(cancelCalls,1,'joining a second finger rolls back the provisional touch stroke');
  assert.equal(document.body.classList.contains('inkframe-viewport-gesture'),true);

  const hud=document.getElementById('inkframe-viewport-hud');
  assert.ok(hud,'gesture HUD must install');
  assert.equal(hud.classList.contains('show'),true);
  assert.match(hud.textContent,/^Zoom · 100%$/);

  canvas.dispatchEvent(pointer(window,'pointermove',2,260,200));
  assert.equal(raf.length,1,'pinch writes are coalesced into one animation frame');
  raf.shift()(16);
  assert.equal(viewport.scale,1.6);
  assert.equal(viewport.panX,240,'pinch centroid movement pans while preserving the anchored canvas point');
  assert.equal(viewport.panY,120);
  assert.match(hud.textContent,/^Zoom · 160%$/);

  canvas.dispatchEvent(pointer(window,'pointerup',2,260,200));
  canvas.dispatchEvent(pointer(window,'pointerup',1,100,200));
  assert.equal(document.body.classList.contains('inkframe-viewport-gesture'),false);
  assert.equal(hud.classList.contains('show'),false);
  assert.match(flashes.at(-1),/^Canvas 160%$/);

  const dock=document.getElementById('inkframe-viewport-dock');
  assert.ok(dock,'tablet zoom dock must install');
  assert.equal(dock.querySelectorAll('button').length,7);
  assert.equal(dock.querySelector('.inkframe-viewport-percent').textContent,'160%');
  assert.equal(api.dockOccluded,false);
  assert.equal(dock.getAttribute('aria-hidden'),'false');
  assert.equal(dock.hasAttribute('inert'),false);

  // The dock can collapse without hiding the two controls needed during drawing:
  // live zoom/Fit and the Hand tool.
  const dockControls=document.getElementById('inkframe-viewport-controls');
  const dockToggle=dock.querySelector('.inkframe-viewport-collapse');
  assert.ok(dockControls);
  assert.ok(dockToggle);
  assert.equal(api.dockCollapsed,false);
  assert.equal(dockToggle.getAttribute('aria-expanded'),'true');
  dockToggle.click();
  assert.equal(api.dockCollapsed,true);
  assert.equal(dock.classList.contains('collapsed'),true);
  assert.equal(dock.dataset.collapsed,'true');
  assert.equal(dockToggle.getAttribute('aria-expanded'),'false');
  assert.equal(dockControls.getAttribute('aria-hidden'),'true');
  assert.ok(dock.querySelector('.inkframe-viewport-percent'));
  assert.ok(dock.querySelector('.inkframe-viewport-pan'));
  dockToggle.click();
  assert.equal(api.dockCollapsed,false);
  assert.equal(dockToggle.getAttribute('aria-expanded'),'true');
  assert.equal(dockControls.getAttribute('aria-hidden'),'false');

  // N toggles compact navigation without affecting artwork or viewport state.
  const beforeKeyboardCollapse=Object.assign({},viewport);
  window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}));
  assert.equal(api.dockCollapsed,true);
  assert.deepEqual(viewport,beforeKeyboardCollapse);
  window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'N',bubbles:true,cancelable:true}));
  assert.equal(api.dockCollapsed,false);

  // Modal surfaces suspend the dock and its shortcuts without mutating Hand,
  // compact, artwork, or viewport state. Closing restores the prior presentation.
  const projectPanel=document.createElement('section');projectPanel.id='projectPanel';document.body.appendChild(projectPanel);
  projectPanel.classList.add('show');
  await Promise.resolve();
  assert.equal(api.blockingSurfaceOpen(),true);
  assert.equal(api.dockOccluded,true);
  assert.equal(dock.classList.contains('occluded'),true);
  assert.equal(dock.dataset.occluded,'true');
  assert.equal(dock.getAttribute('aria-hidden'),'true');
  assert.equal(dock.hasAttribute('inert'),true);
  const beforeModalShortcuts={collapsed:api.dockCollapsed,pan:api.panMode,viewport:Object.assign({},viewport)};
  window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'h',bubbles:true,cancelable:true}));
  window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}));
  assert.equal(api.panMode,beforeModalShortcuts.pan);
  assert.equal(api.dockCollapsed,beforeModalShortcuts.collapsed);
  assert.deepEqual(viewport,beforeModalShortcuts.viewport);
  projectPanel.classList.remove('show');
  await Promise.resolve();
  assert.equal(api.dockOccluded,false);
  assert.equal(dock.classList.contains('occluded'),false);
  assert.equal(dock.getAttribute('aria-hidden'),'false');
  assert.equal(dock.hasAttribute('inert'),false);
  assert.equal(api.dockCollapsed,beforeModalShortcuts.collapsed);

  // Brush Lab and the generated offline Feedback panel are injected later and
  // use hidden-state visibility rather than the host .show convention.
  const brushLab=document.createElement('section');brushLab.id='inkframe-v2-tuning';brushLab.hidden=true;document.body.appendChild(brushLab);
  brushLab.hidden=false;
  await Promise.resolve();
  assert.equal(api.dockOccluded,true);
  brushLab.hidden=true;
  await Promise.resolve();
  assert.equal(api.dockOccluded,false);
  const feedback=document.createElement('section');feedback.className='inkframe-feedback';feedback.hidden=true;document.body.appendChild(feedback);
  feedback.hidden=false;
  await Promise.resolve();
  assert.equal(api.dockOccluded,true);
  feedback.hidden=true;
  await Promise.resolve();
  assert.equal(api.dockOccluded,false);

  // Hand mode consumes the first touch before drawing and turns it into
  // one-finger canvas navigation. Pen input remains untouched.
  const panButton=dock.querySelector('.inkframe-viewport-pan');
  assert.ok(panButton,'hand tool must be available from the viewport dock');
  panButton.click();
  assert.equal(api.panMode,true);
  assert.equal(panButton.getAttribute('aria-pressed'),'true');
  assert.equal(document.body.classList.contains('inkframe-viewport-pan-mode'),true);
  const beforePan=Object.assign({},viewport);
  canvas.dispatchEvent(pointer(window,'pointerdown',10,300,300));
  assert.equal(canvasDowns,1,'hand mode must consume the first touch before drawing');
  assert.equal(hud.classList.contains('show'),true);
  canvas.dispatchEvent(pointer(window,'pointermove',10,340,325));
  assert.equal(raf.length,1,'one-finger pan is frame-coalesced');
  raf.shift()(32);
  assert.equal(viewport.scale,beforePan.scale);
  assert.equal(viewport.panX,beforePan.panX+40);
  assert.equal(viewport.panY,beforePan.panY+25);
  assert.match(hud.textContent,/^Pan · 160%$/);
  canvas.dispatchEvent(pointer(window,'pointerup',10,340,325));
  assert.equal(undoCalls,0,'hand-tool release never performs history actions');
  assert.equal(hud.classList.contains('show'),false);

  canvas.dispatchEvent(pointer(window,'pointerdown',11,320,320,'pen'));
  assert.equal(canvasDowns,2,'S Pen still reaches the drawing engine while hand mode is enabled');
  canvas.dispatchEvent(pointer(window,'pointerup',11,320,320,'pen'));

  panButton.click();
  assert.equal(api.panMode,false);
  assert.equal(panButton.getAttribute('aria-pressed'),'false');

  // Natural tap jitter remains inside the dead zone: it performs Undo without
  // also shifting or scaling the viewport.
  const beforeTap=Object.assign({},viewport);
  canvas.dispatchEvent(pointer(window,'pointerdown',3,120,220));
  canvas.dispatchEvent(pointer(window,'pointerdown',4,220,220));
  canvas.dispatchEvent(pointer(window,'pointermove',4,221,221));
  assert.equal(raf.length,0,'sub-threshold tap jitter must not schedule a viewport write');
  canvas.dispatchEvent(pointer(window,'pointerup',4,221,221));
  canvas.dispatchEvent(pointer(window,'pointerup',3,120,220));
  assert.equal(undoCalls,1);
  assert.equal(viewport.scale,beforeTap.scale);
  assert.equal(viewport.panX,beforeTap.panX);
  assert.equal(viewport.panY,beforeTap.panY);

  // Quick three-finger tap keeps the established Redo gesture.
  canvas.dispatchEvent(pointer(window,'pointerdown',5,120,220));
  canvas.dispatchEvent(pointer(window,'pointerdown',6,220,220));
  canvas.dispatchEvent(pointer(window,'pointerdown',7,170,280));
  canvas.dispatchEvent(pointer(window,'pointerup',7,170,280));
  canvas.dispatchEvent(pointer(window,'pointerup',6,220,220));
  canvas.dispatchEvent(pointer(window,'pointerup',5,120,220));
  assert.equal(redoCalls,1);

  // Android/system cancellation clears ownership but never mutates artwork history.
  const historyBeforeCancel={undo:undoCalls,redo:redoCalls};
  canvas.dispatchEvent(pointer(window,'pointerdown',8,130,230));
  canvas.dispatchEvent(pointer(window,'pointerdown',9,230,230));
  canvas.dispatchEvent(pointer(window,'pointercancel',9,230,230));
  canvas.dispatchEvent(pointer(window,'pointercancel',8,130,230));
  assert.equal(undoCalls,historyBeforeCancel.undo);
  assert.equal(redoCalls,historyBeforeCancel.redo);
  assert.equal(document.body.classList.contains('inkframe-viewport-gesture'),false);
  assert.equal(hud.classList.contains('show'),false);

  // Entering Zen mode compacts the dock event-by-event rather than through polling.
  document.body.classList.add('zen');
  await Promise.resolve();
  assert.equal(api.dockCollapsed,true);
  assert.equal(dock.classList.contains('collapsed'),true);

  dom.window.close();
}

assert.match(source,/inkframe-viewport-dock/);
assert.match(source,/inkframe-viewport-hud/);
assert.match(source,/inkframe-viewport-pan-mode/);
assert.match(source,/inkframe-viewport-collapse/);
assert.match(source,/inkframe-viewport-dock\.occluded/);
assert.match(source,/blockingSurfaceOpen/);
assert.match(source,/MutationObserver/);
assert.match(source,/aria-expanded/);
assert.match(source,/aria-pressed/);
assert.match(source,/translatedViewport/);
assert.match(source,/stopImmediatePropagation/);
assert.match(source,/requestAnimationFrame/);
assert.match(source,/pointercancel/);
assert.doesNotMatch(source,/setInterval/);
assert.doesNotMatch(source,/touchstart|touchmove/,'Pointer Events remain the single gesture input model');

console.log('✅ anchored pinch, hand pan, compact dock, modal isolation, gesture HUD, ownership, cancellation, Undo/Redo, and zoom UI tests passed');
