import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'..','radial-timeline.js'),'utf8');
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error};
box.globalThis=box;vm.createContext(box);vm.runInContext(source,box,{filename:'radial-timeline.js'});
const api=box.InkFrameRadialTimeline;

assert.equal(api.normalizeShape('circle'),'circle');
assert.equal(api.normalizeShape('ellipse'),'square');
assert.ok(Math.abs(api.normalizeAngle(Math.PI*3)-Math.PI)<1e-9);
assert.ok(Math.abs(api.normalizeAngle(-Math.PI*3)-Math.PI)<1e-9);
assert.ok(api.ellipseCircumference(100,100)>620&&api.ellipseCircumference(100,100)<630);

const metrics={width:760,height:580,canvasWidth:720,canvasHeight:540,canvasLeft:20,canvasTop:20};
const circle=api.layout(12,metrics,'circle');
assert.equal(circle.slots.length,12);
assert.equal(circle.rings.length,1);
assert.equal(circle.shape,'circle');
assert.equal(circle.rotation,0);
for(const slot of circle.slots){
  const d=Math.hypot(slot.x-circle.metrics.centerX,slot.y-circle.metrics.centerY);
  assert.ok(Math.abs(d-circle.rings[0].rx)<1e-7,'circle slot escaped its true orbit');
  assert.equal(slot.rx,slot.ry);
  assert.ok(Number.isFinite(slot.x)&&Number.isFinite(slot.y)&&Number.isFinite(slot.tangent));
}

const rotated=api.layout(12,metrics,'circle',{rotation:Math.PI/2});
assert.ok(Math.abs(rotated.rotation-Math.PI/2)<1e-9);
assert.ok(Math.abs(rotated.slots[0].x-(rotated.metrics.centerX-rotated.rings[0].rx))<1e-7);
assert.ok(Math.abs(rotated.slots[0].y-rotated.metrics.centerY)<1e-7);
const focusRotation=api.rotationForFocus(circle,5);
const focused=api.layout(12,metrics,'circle',{rotation:focusRotation});
assert.ok(Math.abs(api.normalizeAngle(focused.slots[5].angle+Math.PI/2))<1e-7,'focused frame must land at twelve o’clock');
assert.equal(api.ringForIndex(focused,5),0);
assert.equal(api.ringForIndex(focused,99),-1);

const ellipse=api.layout(12,metrics,'square');
assert.equal(ellipse.slots.length,12);
assert.notEqual(ellipse.rings[0].rx,ellipse.rings[0].ry);
for(const slot of ellipse.slots){
  const unit=Math.pow((slot.x-ellipse.metrics.centerX)/slot.rx,2)+Math.pow((slot.y-ellipse.metrics.centerY)/slot.ry,2);
  assert.ok(Math.abs(unit-1)<1e-7,'rectangular project slot escaped its ellipse');
}

const long=api.layout(120,{...metrics,canvasWidth:420,canvasHeight:300,canvasLeft:170,canvasTop:140},'square');
assert.equal(long.slots.length,120);
assert.ok(long.rings.length>=3,'120-frame tablet timeline must expand to multiple rings');
assert.deepEqual(Array.from(long.slots,slot=>slot.index),Array.from({length:120},(_,i)=>i));
assert.equal(new Set(Array.from(long.slots,slot=>`${slot.x.toFixed(5)}:${slot.y.toFixed(5)}`)).size,120);
for(let i=1;i<long.rings.length;i++){
  assert.ok(long.rings[i].rx>long.rings[i-1].rx);
  assert.ok(long.rings[i].ry>long.rings[i-1].ry);
}
assert.ok(api.ringForIndex(long,119)>=2);

const repeat=api.layout(120,{...metrics,canvasWidth:420,canvasHeight:300,canvasLeft:170,canvasTop:140},'square');
assert.equal(JSON.stringify(long),JSON.stringify(repeat),'radial layout must be deterministic');
assert.equal(Object.isFrozen(long.rings),true);
assert.equal(Object.isFrozen(long.slots),true);

assert.equal(api.stepIndex(0,-1,12),0);
assert.equal(api.stepIndex(0,1,12),1);
assert.equal(api.stepIndex(5,10,12),11);
assert.equal(api.stepIndex(5,-10,12),0);
assert.equal(api.stepIndex(0,1,0),-1);

const selected=new Set([2,4]);
assert.deepEqual({...api.stateFor(2,{framesLength:6,current:2,selectedFrames:selected,holdAt:i=>i===2?3:1})},{filled:true,current:true,selected:true,hold:3,next:false});
assert.deepEqual({...api.stateFor(6,{framesLength:6,current:2,selectedFrames:selected,holdAt:()=>1})},{filled:false,current:false,selected:false,hold:1,next:true});
assert.deepEqual({...api.stateFor(7,{framesLength:6,current:2,selectedFrames:selected,holdAt:()=>1})},{filled:false,current:false,selected:false,hold:1,next:false});

const safe=api.layout(4,{width:NaN,height:0,canvasWidth:Infinity,canvasHeight:-1},'bad-shape',{rotation:Infinity});
assert.equal(safe.shape,'square');
assert.equal(safe.rotation,0);
assert.equal(safe.slots.length,4);
assert.ok(safe.slots.every(slot=>Number.isFinite(slot.x)&&Number.isFinite(slot.y)));
assert.deepEqual({...api.viewSnapshot({})},{rotation:0,focusCurrentRing:false});
assert.equal(api.projectCanvasWrites,0);
assert.equal(api.undoWrites,0);
console.log('✅ radial timeline geometry, rotation, focus, stepping, and deterministic state policy passed');
