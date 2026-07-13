import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const radialSource=readFileSync(resolve(here,'..','radial-timeline.js'),'utf8');
const timingSource=readFileSync(resolve(here,'..','radial-timing-editor.js'),'utf8');
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error};
box.globalThis=box;vm.createContext(box);vm.runInContext(radialSource,box,{filename:'radial-timeline.js'});vm.runInContext(timingSource,box,{filename:'radial-timing-editor.js'});
const radial=box.InkFrameRadialTimeline,timing=box.InkFrameRadialTiming;

assert.ok(radial&&timing,'radial timing runtime did not install');
assert.equal(radial.__radialTimingPatched,true);
assert.equal(timing.normalizeHold(-4),1);
assert.equal(timing.normalizeHold(4.6),5);
assert.equal(timing.normalizeHold(99),8);
assert.equal(timing.holdFromRadialDrag(3,100,100),3);
assert.equal(timing.holdFromRadialDrag(3,100,138),5);
assert.equal(timing.holdFromRadialDrag(3,100,61),1);
assert.equal(timing.holdFromRadialDrag(7,100,160),8);

const metrics={width:760,height:580,canvasWidth:720,canvasHeight:540,canvasLeft:20,canvasTop:20};
const circle=radial.layout(12,metrics,'circle');
const one=timing.holdArcGeometry(circle,circle.slots[0],1),eight=timing.holdArcGeometry(circle,circle.slots[0],8);
assert.ok(one&&eight);
assert.equal(one.hold,1);assert.equal(eight.hold,8);
assert.ok(eight.span>one.span,'larger holds must occupy longer timing arcs');
assert.ok(eight.span<=Math.PI*2/circle.rings[0].size*.82+1e-9,'hold arc must stay within its frame slot');
assert.ok(one.rx>circle.slots[0].rx&&one.ry>circle.slots[0].ry,'hold arcs must sit outside thumbnail orbit');
assert.match(timing.holdArcPath(circle,circle.slots[0],4),/^M[-\d.]+,[-\d.]+ A[-\d.]+,[-\d.]+ 0 [01] 0 [-\d.]+,[-\d.]+$/);
assert.equal(timing.holdArcPath(circle,null,2),'');
assert.equal(timing.holdArcPath(circle,circle.slots[3],5),timing.holdArcPath(circle,circle.slots[3],5),'hold geometry must be deterministic');

const ellipse=radial.layout(18,metrics,'square');
const handle=timing.loopHandlePoint(ellipse,4);
assert.ok(handle&&Number.isFinite(handle.x)&&Number.isFinite(handle.y));
const slot=ellipse.slots[4];
assert.equal(handle.index,4);assert.equal(handle.ring,slot.ring);
assert.ok(Math.hypot(handle.x-ellipse.metrics.centerX,handle.y-ellipse.metrics.centerY)>Math.hypot(slot.x-ellipse.metrics.centerX,slot.y-ellipse.metrics.centerY));
assert.equal(timing.loopHandlePoint(ellipse,99),null);

assert.deepEqual({...timing.clampLoopRange(8,2,12)},{loopIn:2,loopOut:8});
assert.deepEqual({...timing.clampLoopRange(-5,99,12)},{loopIn:0,loopOut:11});
assert.deepEqual({...timing.clampLoopRange(2,4,0)},{loopIn:0,loopOut:0});
assert.equal(timing.nearestFilledIndex(circle,circle.slots[6].x,circle.slots[6].y,12),6);
assert.equal(timing.nearestFilledIndex(circle,circle.slots[11].x,circle.slots[11].y,5),4,'nearest search must stay inside filled frame count');

const projectA={},projectB={};
assert.deepEqual({...timing.viewSnapshot(projectA)},{timingMode:false});
assert.deepEqual({...timing.viewSnapshot(projectB)},{timingMode:false});
assert.equal(timing.projectCanvasWrites,0);
assert.equal(timing.artworkUndoWrites,0);
assert.equal(timing.timelineTimingWrites,true);
console.log('✅ radial timing hold arcs, radial drag quantization, loop handles, clamping, and isolation policy passed');
