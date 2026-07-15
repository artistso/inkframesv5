import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const source=readFileSync(resolve(root,'web/canvas-navigation.js'),'utf8');
const dom=new JSDOM(`<!doctype html><html><body><div id="frameGlass"><canvas id="c"></canvas></div><script>${source}</script></body></html>`,{
  url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,
  beforeParse(window){
    Object.defineProperty(window,'innerWidth',{configurable:true,value:1000});
    Object.defineProperty(window,'innerHeight',{configurable:true,value:800});
    window.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
    window.HTMLCanvasElement.prototype.releasePointerCapture=()=>{};
  },
});

try{
  await new Promise(resolve=>setTimeout(resolve,30));
  const window=dom.window,document=window.document,canvas=document.getElementById('c'),frame=document.getElementById('frameGlass');
  const api=window.InkFrameCanvasNavigation;
  assert.ok(api&&api.installed,'canvas navigation did not install');

  Object.defineProperty(frame,'offsetWidth',{configurable:true,value:400});
  Object.defineProperty(frame,'offsetHeight',{configurable:true,value:300});
  frame.getBoundingClientRect=()=>{
    const match=/matrix\(([^)]+)\)/.exec(frame.style.transform||'');
    const values=match?match[1].split(',').map(Number):[1,0,0,1,0,0];
    const zoom=Number.isFinite(values[0])?values[0]:1,x=Number.isFinite(values[4])?values[4]:0,y=Number.isFinite(values[5])?values[5]:0;
    return {left:300+x,top:250+y,width:400*zoom,height:300*zoom,right:300+x+400*zoom,bottom:250+y+300*zoom};
  };

  const observed={down:[],move:[],up:[]};
  canvas.addEventListener('pointerdown',event=>observed.down.push({id:event.pointerId,type:event.pointerType,x:event.clientX,y:event.clientY}));
  canvas.addEventListener('pointermove',event=>observed.move.push({id:event.pointerId,x:event.clientX,y:event.clientY}));
  window.addEventListener('pointerup',event=>observed.up.push({id:event.pointerId,type:event.pointerType}));

  function pointer(type,{id,x,y,pointerType='touch',pressure=.5,buttons=type==='pointerup'?0:1}){
    const event=new window.Event(type,{bubbles:true,cancelable:true,composed:true});
    const values={pointerId:id,pointerType,clientX:x,clientY:y,pressure,width:8,height:8,button:type==='pointerdown'?0:-1,buttons,isPrimary:id===1,getCoalescedEvents:()=>[]};
    for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});
    canvas.dispatchEvent(event);return event;
  }

  // S Pen remains zero-delay: navigation ignores non-touch pointers entirely.
  pointer('pointerdown',{id:90,x:420,y:340,pointerType:'pen'});
  assert.equal(observed.down.length,1);
  assert.equal(observed.down[0].type,'pen');
  pointer('pointerup',{id:90,x:420,y:340,pointerType:'pen'});

  // A single finger is withheld briefly, then forwarded as normal drawing input.
  pointer('pointerdown',{id:1,x:400,y:350});
  assert.equal(observed.down.length,1,'touch drawing should not begin before pinch arbitration');
  await new Promise(resolve=>setTimeout(resolve,175));
  assert.equal(observed.down.length,2,'single touch was not forwarded after arbitration delay');
  assert.equal(observed.down[1].id,1);
  pointer('pointerup',{id:1,x:405,y:355});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(observed.up.some(value=>value.id===1),'forwarded touch did not receive pointerup');

  // Two near-simultaneous fingers never reach the drawing engine. Their span change
  // becomes zoom and their centroid change becomes pan.
  const downBeforePinch=observed.down.length,upBeforePinch=observed.up.length;
  api.reset();
  pointer('pointerdown',{id:2,x:400,y:400});
  pointer('pointerdown',{id:3,x:500,y:400});
  pointer('pointermove',{id:2,x:350,y:420});
  pointer('pointermove',{id:3,x:550,y:420});
  const pinch=api.snapshot();
  assert.ok(Math.abs(pinch.zoom-2)<1e-6,`expected 2x zoom, received ${pinch.zoom}`);
  // The original local point under the 450,400 centroid stays under the moved
  // 450,420 centroid after zooming, proving pan and pivot-preserving scale compose.
  assert.ok(Math.abs((300+pinch.x+pinch.zoom*150)-450)<1e-6,'pinch pivot drifted on x');
  assert.ok(Math.abs((250+pinch.y+pinch.zoom*150)-420)<1e-6,'pinch pivot drifted on y');
  assert.equal(observed.down.length,downBeforePinch,'pinch contacts leaked into drawing');
  pointer('pointerup',{id:2,x:350,y:420});
  pointer('pointerup',{id:3,x:550,y:420});
  assert.equal(observed.up.length,upBeforePinch,'pinch releases leaked into drawing');

  // Angle noise must not create rotation. The controller exposes only uniform scale and
  // translation, and equal spans at the same centroid are a strict no-op.
  const angleNoise=api.nextTransform(
    {zoom:1,x:0,y:0},
    [{x:-10,y:0},{x:10,y:0}],
    [{x:0,y:-10},{x:0,y:10}],
    {baseLeft:0,baseTop:0,baseWidth:400,baseHeight:300,viewportWidth:1000,viewportHeight:800,minZoom:.35,maxZoom:8,minVisiblePx:72},
  );
  assert.deepEqual(angleNoise,{zoom:1,x:0,y:0});

  // If a second finger lands just after delayed touch drawing began, the generated app
  // rollback hook is called and navigation takes over without retaining the first dab.
  const cancelled=[];
  window.InkFrameCanvasNavigationEnvironment=()=>({cancelTouchStroke(pointerId){cancelled.push(pointerId);return true;}});
  api.reset();
  pointer('pointerdown',{id:4,x:410,y:390});
  await new Promise(resolve=>setTimeout(resolve,175));
  assert.ok(observed.down.some(value=>value.id===4),'late-takeover setup did not forward first touch');
  pointer('pointerdown',{id:5,x:510,y:390});
  assert.deepEqual(cancelled,[4]);
  pointer('pointermove',{id:4,x:360,y:390});
  pointer('pointermove',{id:5,x:560,y:390});
  assert.ok(api.snapshot().zoom>1.9,'late second finger did not take over as pinch navigation');
  pointer('pointerup',{id:4,x:360,y:390});
  pointer('pointerup',{id:5,x:560,y:390});

  console.log('✅ canvas navigation keeps S Pen immediate, arbitrates touch drawing, and provides stable pan/pinch zoom');
}finally{
  dom.window.close();
}
