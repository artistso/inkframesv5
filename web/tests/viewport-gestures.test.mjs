// InkFrame viewport gestures — anchored pinch, event ownership, and zoom UI
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
  const capped=api.zoomAt(base,10,500,400);
  assert.equal(capped.scale,2.2,'button and wheel zoom must obey the host maximum');
}

function pointer(window,type,id,x,y){
  const event=new window.Event(type,{bubbles:true,cancelable:true});
  Object.defineProperties(event,{
    pointerId:{value:id},pointerType:{value:'touch'},clientX:{value:x},clientY:{value:y},
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

  canvas.dispatchEvent(pointer(window,'pointermove',2,260,260));
  assert.equal(raf.length,1,'pinch writes are coalesced into one animation frame');
  raf.shift()(16);
  assert.equal(viewport.scale,1.6);
  assert.equal(viewport.panX,240,'pinch centroid movement pans while preserving the anchored canvas point');
  assert.equal(viewport.panY,150);

  canvas.dispatchEvent(pointer(window,'pointerup',2,260,260));
  canvas.dispatchEvent(pointer(window,'pointerup',1,100,200));
  assert.equal(document.body.classList.contains('inkframe-viewport-gesture'),false);
  assert.match(flashes.at(-1),/^Canvas 160%$/);

  // Quick two-finger tap keeps the established Undo gesture.
  canvas.dispatchEvent(pointer(window,'pointerdown',3,120,220));
  canvas.dispatchEvent(pointer(window,'pointerdown',4,220,220));
  canvas.dispatchEvent(pointer(window,'pointerup',4,220,220));
  canvas.dispatchEvent(pointer(window,'pointerup',3,120,220));
  assert.equal(undoCalls,1);

  // Quick three-finger tap keeps the established Redo gesture.
  canvas.dispatchEvent(pointer(window,'pointerdown',5,120,220));
  canvas.dispatchEvent(pointer(window,'pointerdown',6,220,220));
  canvas.dispatchEvent(pointer(window,'pointerdown',7,170,280));
  canvas.dispatchEvent(pointer(window,'pointerup',7,170,280));
  canvas.dispatchEvent(pointer(window,'pointerup',6,220,220));
  canvas.dispatchEvent(pointer(window,'pointerup',5,120,220));
  assert.equal(redoCalls,1);

  const dock=document.getElementById('inkframe-viewport-dock');
  assert.ok(dock,'tablet zoom dock must install');
  assert.equal(dock.querySelectorAll('button').length,5);
  assert.equal(dock.querySelector('.inkframe-viewport-percent').textContent,'160%');
  dom.window.close();
}

assert.match(source,/inkframe-viewport-dock/);
assert.match(source,/stopImmediatePropagation/);
assert.match(source,/requestAnimationFrame/);
assert.doesNotMatch(source,/setInterval/);
assert.doesNotMatch(source,/touchstart|touchmove/,'Pointer Events remain the single gesture input model');

console.log('✅ anchored pinch, two-finger pan, gesture ownership, Undo\/Redo taps, and zoom UI tests passed');
