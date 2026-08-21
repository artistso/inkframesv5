// InkFrame viewport actual-pixel control — exact scale, accessibility, and shortcut isolation
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}

const here=dirname(fileURLToPath(import.meta.url));
const web=resolve(here,'..');
const source=readFileSync(resolve(web,'viewport-actual-pixels.js'),'utf8');
const injectorSource=readFileSync(resolve(web,'../tools/inject-viewport-gestures.mjs'),'utf8');

const dom=new JSDOM(`<!doctype html><html><head></head><body>
  <nav id="inkframe-viewport-dock"><span id="inkframe-viewport-controls"></span></nav>
  <canvas id="c" width="800" height="600"></canvas>
</body></html>`,{runScripts:'outside-only',url:'http://localhost/'});
const {window}=dom;const {document}=window;
let viewport={scale:.4,panX:32,panY:-18,fitScale:.4,minScale:.14,maxScale:1};
let modal=false,gestureAllowed=true,dismissCalls=0;const flashes=[];
window.InkFrameViewportGestures={
  blockingSurfaceOpen:()=>modal,
  dismissGuidance:()=>{dismissCalls++;return true;},
};
window.InkFrameViewportEnvironment=()=>({
  getState:()=>Object.assign({},viewport),
  setState:next=>{
    viewport=Object.assign({},viewport,next);
    window.dispatchEvent(new window.CustomEvent('inkframe:viewportchange',{detail:Object.assign({},viewport)}));
    return Object.assign({},viewport);
  },
  canGesture:()=>gestureAllowed,
  flash:value=>flashes.push(value),
});
window.eval(source);
const api=window.InkFrameActualPixels;
assert.equal(api.install(),true);
const button=document.querySelector('.inkframe-viewport-actual');
assert.ok(button,'1:1 control must install inside the secondary viewport controls');
assert.equal(button.textContent,'1:1');
assert.equal(button.getAttribute('aria-pressed'),'false');
assert.match(button.getAttribute('aria-label'),/one canvas pixel per CSS pixel/);

button.click();
assert.equal(viewport.scale,1,'actual-pixel action must request exact display scale 1');
assert.equal(viewport.panX,32,'actual-pixel inspection preserves the current viewport anchor');
assert.equal(viewport.panY,-18);
assert.equal(button.getAttribute('aria-pressed'),'true');
assert.equal(dismissCalls,1,'successful explicit navigation dismisses first-use guidance');
assert.equal(flashes.at(-1),'Actual pixels · 1:1');

viewport=Object.assign({},viewport,{scale:.6});
window.dispatchEvent(new window.CustomEvent('inkframe:viewportchange',{detail:Object.assign({},viewport)}));
assert.equal(button.getAttribute('aria-pressed'),'false');
const keyboard=new window.KeyboardEvent('keydown',{key:'1',ctrlKey:true,bubbles:true,cancelable:true});
window.dispatchEvent(keyboard);
assert.equal(keyboard.defaultPrevented,true);
assert.equal(viewport.scale,1,'Ctrl/⌘+1 must activate actual pixels');

viewport=Object.assign({},viewport,{scale:.5});modal=true;
window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'1',ctrlKey:true,bubbles:true,cancelable:true}));
assert.equal(viewport.scale,.5,'actual-pixel shortcut is blocked behind modal surfaces');
modal=false;gestureAllowed=false;button.click();
assert.equal(viewport.scale,.5,'actual-pixel control must not steal input from an owned pen gesture');

assert.match(injectorSource,/viewport-actual-pixels\.js/);
assert.match(injectorSource,/Math\.min\(f\*0\.35,1\)/,'host minimum must include exact scale 1 for small canvases');
assert.match(injectorSource,/Math\.max\(f\*2\.2,1\)/,'host maximum must include exact scale 1 for large canvases');
assert.doesNotMatch(source,/setInterval|setTimeout/,'actual-pixel installation is event-driven without polling');
assert.doesNotMatch(source,/localStorage|sessionStorage/);

dom.window.close();
console.log('✅ exact 1:1 viewport scale, accessible control, shortcut isolation, and host bounds tests passed');
