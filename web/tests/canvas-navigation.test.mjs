import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url)),rootDir=resolve(here,'..','..');
const source=readFileSync(resolve(rootDir,'web/canvas-navigation.js'),'utf8');

class FakeEvent{
  constructor(type,init={}){this.type=type;this.bubbles=init.bubbles!==false;this.cancelable=init.cancelable!==false;Object.assign(this,init);this.defaultPrevented=false;this._stopped=false;this._immediate=false;}
  preventDefault(){if(this.cancelable)this.defaultPrevented=true;}
  stopPropagation(){this._stopped=true;}
  stopImmediatePropagation(){this._immediate=true;this._stopped=true;}
}

class FakeTarget{
  constructor(parent=null){this.parent=parent;this.listeners=new Map();}
  addEventListener(type,listener,options={}){const capture=options===true||!!options.capture;const list=this.listeners.get(type)||[];list.push({listener,capture});this.listeners.set(type,list);}
  removeEventListener(type,listener,options={}){const capture=options===true||!!options.capture;const list=this.listeners.get(type)||[];this.listeners.set(type,list.filter(value=>value.listener!==listener||value.capture!==capture));}
  _invoke(event,capture){event.currentTarget=this;for(const value of this.listeners.get(event.type)||[]){if(value.capture!==capture)continue;value.listener.call(this,event);if(event._immediate)break;}}
  dispatchEvent(event){
    if(!event.target)event.target=this;
    const path=[];for(let value=this;value;value=value.parent)path.unshift(value);
    for(const value of path){value._invoke(event,true);if(event._stopped)return !event.defaultPrevented;}
    if(event.bubbles){for(let i=path.length-1;i>=0;i--){path[i]._invoke(event,false);if(event._stopped)break;}}
    return !event.defaultPrevented;
  }
}

const context={module:{exports:{}},exports:{},console,setTimeout,clearTimeout,performance:{now:()=>Date.now()},Event:FakeEvent,PointerEvent:FakeEvent};
vm.createContext(context);
vm.runInContext(source,context,{filename:'canvas-navigation.js'});
const api=context.module.exports;
assert.ok(api&&typeof api.nextTransform==='function','canvas navigation API did not load');

// Pure transform contract: pinch uses span + centroid only. Turning the finger vector
// ninety degrees with equal span must not rotate or move the canvas.
const bounds={baseLeft:0,baseTop:0,baseWidth:400,baseHeight:300,viewportWidth:1000,viewportHeight:800,minZoom:.35,maxZoom:8,minVisiblePx:72};
const angleNoise=api.nextTransform({zoom:1,x:0,y:0},[{x:-10,y:0},{x:10,y:0}],[{x:0,y:-10},{x:0,y:10}],bounds);
assert.equal(angleNoise.zoom,1);
assert.equal(angleNoise.x,0);
assert.equal(angleNoise.y,0);
const doubled=api.nextTransform({zoom:1,x:0,y:0},[{x:100,y:100},{x:200,y:100}],[{x:50,y:120},{x:250,y:120}],bounds);
assert.equal(doubled.zoom,2);
assert.equal(0+doubled.x+doubled.zoom*150,150,'zoom pivot drifted on x');
assert.equal(0+doubled.y+doubled.zoom*100,120,'zoom pivot drifted on y');

const windowTarget=new FakeTarget();
Object.assign(windowTarget,{
  Event:FakeEvent,PointerEvent:FakeEvent,
  setTimeout,clearTimeout,performance:{now:()=>Date.now()},
  innerWidth:1000,innerHeight:800,
});
const canvas=new FakeTarget(windowTarget);
canvas.style={};canvas.dataset={};canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
const frame={style:{},dataset:{},offsetWidth:400,offsetHeight:300};
frame.getBoundingClientRect=()=>{
  const match=/matrix\(([^)]+)\)/.exec(frame.style.transform||'');
  const values=match?match[1].split(',').map(Number):[1,0,0,1,0,0];
  const zoom=Number.isFinite(values[0])?values[0]:1,x=Number.isFinite(values[4])?values[4]:0,y=Number.isFinite(values[5])?values[5]:0;
  return {left:300+x,top:250+y,width:400*zoom,height:300*zoom,right:300+x+400*zoom,bottom:250+y+300*zoom};
};
const document={documentElement:{clientWidth:1000,clientHeight:800},getElementById(id){return id==='c'?canvas:id==='frameGlass'?frame:null;}};
windowTarget.document=document;
const controller=api.createController({root:windowTarget,document,canvas,frameGlass:frame,settings:{touchDrawDelayMs:20,minZoom:.35,maxZoom:8,minVisiblePx:72}});
assert.ok(controller,'canvas navigation controller did not install');

const observed={down:[],move:[],up:[]};
canvas.addEventListener('pointerdown',event=>observed.down.push({id:event.pointerId,type:event.pointerType,x:event.clientX,y:event.clientY}));
canvas.addEventListener('pointermove',event=>observed.move.push({id:event.pointerId,x:event.clientX,y:event.clientY}));
windowTarget.addEventListener('pointerup',event=>observed.up.push({id:event.pointerId,type:event.pointerType}));

function pointer(type,{id,x,y,pointerType='touch',pressure=.5,buttons=type==='pointerup'?0:1}){
  const event=new FakeEvent(type,{bubbles:true,cancelable:true,composed:true,pointerId:id,pointerType,clientX:x,clientY:y,pressure,width:8,height:8,button:type==='pointerdown'?0:-1,buttons,isPrimary:id===1,getCoalescedEvents:()=>[]});
  canvas.dispatchEvent(event);return event;
}

// S Pen remains immediate because the navigation layer arbitrates touch only.
pointer('pointerdown',{id:90,x:420,y:340,pointerType:'pen'});
assert.equal(observed.down.length,1);
assert.equal(observed.down[0].type,'pen');
pointer('pointerup',{id:90,x:420,y:340,pointerType:'pen'});

// One finger is delayed just long enough to distinguish drawing from a pinch, then is
// forwarded with the original pointer identity and receives its real pointerup.
pointer('pointerdown',{id:1,x:400,y:350});
assert.equal(observed.down.length,1,'touch drawing began before pinch arbitration');
await new Promise(resolve=>setTimeout(resolve,35));
assert.equal(observed.down.length,2,'single touch was not forwarded after arbitration delay');
assert.equal(observed.down[1].id,1);
pointer('pointerup',{id:1,x:405,y:355});
await new Promise(resolve=>setTimeout(resolve,5));
assert.ok(observed.up.some(value=>value.id===1),'forwarded touch did not receive pointerup');

// Two fingers are consumed by navigation and never leak into the drawing listeners.
const downBeforePinch=observed.down.length,upBeforePinch=observed.up.length;
controller.reset();
pointer('pointerdown',{id:2,x:400,y:400});
pointer('pointerdown',{id:3,x:500,y:400});
pointer('pointermove',{id:2,x:350,y:420});
pointer('pointermove',{id:3,x:550,y:420});
const pinch=controller.snapshot();
assert.ok(Math.abs(pinch.zoom-2)<1e-6,`expected 2x zoom, received ${pinch.zoom}`);
assert.ok(Math.abs((300+pinch.x+pinch.zoom*150)-450)<1e-6,'pinch pivot drifted on x');
assert.ok(Math.abs((250+pinch.y+pinch.zoom*150)-420)<1e-6,'pinch pivot drifted on y');
assert.equal(observed.down.length,downBeforePinch,'pinch contacts leaked into drawing');
pointer('pointerup',{id:2,x:350,y:420});
pointer('pointerup',{id:3,x:550,y:420});
assert.equal(observed.up.length,upBeforePinch,'pinch releases leaked into drawing');

// A late second contact cancels the just-started touch stroke through the injected app
// hook, then immediately takes over as pinch navigation instead of leaving a first dab.
const cancelled=[];
windowTarget.InkFrameCanvasNavigationEnvironment=()=>({cancelTouchStroke(pointerId){cancelled.push(pointerId);return true;}});
controller.reset();
pointer('pointerdown',{id:4,x:410,y:390});
await new Promise(resolve=>setTimeout(resolve,35));
assert.ok(observed.down.some(value=>value.id===4),'late-takeover setup did not forward first touch');
pointer('pointerdown',{id:5,x:510,y:390});
assert.deepEqual(cancelled,[4]);
pointer('pointermove',{id:4,x:360,y:390});
pointer('pointermove',{id:5,x:560,y:390});
assert.ok(controller.snapshot().zoom>1.9,'late second finger did not take over as pinch navigation');
pointer('pointerup',{id:4,x:360,y:390});
pointer('pointerup',{id:5,x:560,y:390});

controller.destroy();
console.log('✅ canvas navigation keeps S Pen immediate, arbitrates touch drawing, and provides stable pan/pinch zoom');
