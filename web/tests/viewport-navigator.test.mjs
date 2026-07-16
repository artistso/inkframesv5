// InkFrame viewport navigator — geometry, input isolation, and generated asset contract
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}

const here=dirname(fileURLToPath(import.meta.url));
const web=resolve(here,'..');
const source=readFileSync(resolve(web,'viewport-navigator.js'),'utf8');
const injector=readFileSync(resolve(web,'../tools/inject-viewport-gestures.mjs'),'utf8');

const dom=new JSDOM('<!doctype html><html><head></head><body data-canvas-shape="circle"></body></html>',{
  runScripts:'outside-only',url:'http://localhost/'
});
const {window}=dom;const {document}=window;
Object.defineProperty(window,'innerWidth',{value:1000,writable:true});
Object.defineProperty(window,'innerHeight',{value:600,writable:true});
let modal=false,gestureAllowed=true,dismissCalls=0;
let viewport={
  scale:2,panX:0,panY:0,fitScale:.5,minScale:.175,maxScale:2,
  viewportWidth:1000,viewportHeight:600,centerX:500,centerY:300,
  canvasWidth:1000,canvasHeight:800,
};
window.InkFrameViewportGestures={
  blockingSurfaceOpen:()=>modal,
  dismissGuidance:()=>{dismissCalls++;return true;},
};
window.InkFrameViewportEnvironment=()=>({
  getState:()=>({...viewport}),
  setState:next=>{
    viewport={...viewport,...next};
    window.dispatchEvent(new window.CustomEvent('inkframe:viewportchange',{detail:{...viewport}}));
    return {...viewport};
  },
  canGesture:()=>gestureAllowed,
});
window.eval(source);
const api=window.InkFrameViewportNavigator;
assert.equal(api.install(),true);

const geometry=api.geometry(viewport);
assert.equal(geometry.left,250);
assert.equal(geometry.top,250);
assert.equal(geometry.right,750);
assert.equal(geometry.bottom,550);
assert.equal(geometry.widthFraction,.5);
assert.equal(geometry.heightFraction,.375);
assert.equal(geometry.fullVisible,false);

const navigator=document.getElementById('inkframe-viewport-navigator');
const visible=navigator.querySelector('.inkframe-navigator-viewport');
assert.ok(navigator&&!navigator.hidden,'navigator must appear only when the canvas is clipped');
assert.ok(navigator.classList.contains('circle'),'navigator must mirror the circular canvas shape');
assert.equal(navigator.getAttribute('role'),'group');
assert.match(navigator.getAttribute('aria-keyshortcuts'),/ArrowLeft/);
assert.equal(visible.style.left,'25%');
assert.equal(visible.style.top,'31.25%');
assert.equal(visible.style.width,'50%');
assert.equal(visible.style.height,'37.5%');
assert.match(navigator.getAttribute('aria-label'),/19% visible/);

document.body.dataset.canvasShape='square';api.render(viewport);
assert.ok(!navigator.classList.contains('circle'),'navigator must return to rectangular project geometry');
navigator.getBoundingClientRect=()=>({left:100,top:100,width:150,height:104,right:250,bottom:204});
function pointer(type,x,y,pointerType='touch',pointerId=7){
  const event=new window.MouseEvent(type,{clientX:x,clientY:y,bubbles:true,cancelable:true});
  Object.defineProperty(event,'pointerType',{value:pointerType});
  Object.defineProperty(event,'pointerId',{value:pointerId});
  return event;
}
navigator.dispatchEvent(pointer('pointerdown',100,100));
assert.equal(viewport.panX,1000,'navigator left edge must recenter the canvas on its left edge');
assert.equal(viewport.panY,800,'navigator top edge must recenter the canvas on its top edge');
assert.equal(dismissCalls,1);
navigator.dispatchEvent(pointer('pointerup',100,100));

const beforePen={panX:viewport.panX,panY:viewport.panY};
navigator.dispatchEvent(pointer('pointerdown',250,204,'pen',12));
assert.deepEqual({panX:viewport.panX,panY:viewport.panY},beforePen,'S Pen must remain reserved for drawing');

navigator.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
assert.equal(viewport.panX,beforePen.panX-120,'keyboard navigation uses a bounded viewport-relative step');
navigator.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
assert.equal(viewport.panX,0);assert.equal(viewport.panY,0);

modal=true;const beforeModal={panX:viewport.panX,panY:viewport.panY};
navigator.dispatchEvent(pointer('pointerdown',100,100));
assert.deepEqual({panX:viewport.panX,panY:viewport.panY},beforeModal,'navigator must be inert behind blocking surfaces');
modal=false;gestureAllowed=false;
assert.equal(api.recenterAt(100,100),false,'navigator must not steal an owned pen/gesture context');
gestureAllowed=true;

viewport={...viewport,scale:.5,panX:0,panY:0};
window.dispatchEvent(new window.CustomEvent('inkframe:viewportchange',{detail:{...viewport}}));
assert.equal(navigator.hidden,true,'navigator hides when the complete canvas is visible');
viewport={...viewport,scale:2};document.body.classList.add('zen');api.render(viewport);
assert.equal(navigator.hidden,true,'navigator stays out of Zen mode');
document.body.classList.remove('zen');api.render(viewport);
assert.equal(navigator.hidden,false);

assert.match(injector,/viewport-actual-pixels\.js[\s\S]*viewport-navigator\.js/);
for(const forbidden of [/getContext\(/,/drawImage\(/,/toDataURL\(/,/setInterval/,/setTimeout/,/localStorage|sessionStorage/,/fetch\(/]){
  assert.doesNotMatch(source,forbidden,'navigator must remain geometry-only, event-driven, local, and non-persistent');
}

console.log('✅ geometry-only canvas navigator, keyboard/touch recentering, pen isolation, and modal/Zen suppression passed');
