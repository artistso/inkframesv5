import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'..','canvas-shape.js'),'utf8');
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,performance:{now:()=>1234}};
box.globalThis=box;vm.createContext(box);vm.runInContext(source,box,{filename:'canvas-shape.js'});
const api=box.InkFrameCanvasShape;

assert.deepEqual(Array.from(api.SHAPES),['square','circle']);
assert.equal(api.normalizeShape('circle'),'circle');
assert.equal(api.normalizeShape('ellipse'),'square');

const wide=api.circleGeometry(1280,720);
assert.deepEqual({...wide},{cx:640,cy:360,r:360});
assert.equal(Object.isFrozen(wide),true);
assert.equal(api.containsPoint(640,360,1280,720,'circle'),true);
assert.equal(api.containsPoint(100,100,1280,720,'circle'),false);
assert.equal(api.containsPoint(100,100,1280,720,'square'),true);

const edge=api.clampPoint(1280,360,1280,720,'circle');
assert.equal(edge.inside,false);
assert.ok(Math.abs(edge.x-1000)<1e-8);
assert.ok(Math.abs(edge.y-360)<1e-8);
assert.ok(Math.abs(Math.hypot(edge.x-wide.cx,edge.y-wide.cy)-wide.r)<1e-8);
const middle=api.clampPoint(640,360,1280,720,'circle');
assert.deepEqual({...middle},{x:640,y:360,inside:true});

const canvas={getBoundingClientRect:()=>({left:20,top:10,width:640,height:360})};
const mapped=api.mapEventPoint({clientX:660,clientY:190},canvas,1280,720,'circle');
assert.equal(mapped.inside,false);
assert.ok(Math.abs(mapped.x-1000)<1e-8);
assert.ok(Math.abs(mapped.y-360)<1e-8);
assert.equal(api.acceptsPointerDown({clientX:340,clientY:190},canvas,1280,720,'circle'),true);
assert.equal(api.acceptsPointerDown({clientX:25,clientY:15},canvas,1280,720,'circle'),false);

const boundary=api.boundaryEvent({pointerId:7,pointerType:'pen',clientX:660,clientY:190,pressure:.8,timeStamp:44},canvas,1280,720,'circle');
assert.equal(boundary.type,'pointerup');
assert.equal(boundary.pointerId,7);
assert.equal(boundary.buttons,0);
const boundaryMapped=api.mapEventPoint(boundary,canvas,1280,720,'circle');
assert.equal(boundaryMapped.inside,true);
assert.ok(Math.abs(boundaryMapped.x-1000)<1e-8);
assert.equal(api.boundaryEvent({clientX:340,clientY:190},canvas,1280,720,'circle'),null);

function contextRecorder(){
  const ops=[];
  const ctx={ops,globalAlpha:1,globalCompositeOperation:'source-over',fillStyle:'',save(){ops.push(['save']);},restore(){ops.push(['restore']);},beginPath(){ops.push(['beginPath']);},arc(...args){ops.push(['arc',...args]);},fill(){ops.push(['fill',this.globalCompositeOperation]);},clip(){ops.push(['clip']);},clearRect(...args){ops.push(['clearRect',...args]);},fillRect(...args){ops.push(['fillRect',...args]);}};
  return ctx;
}
const maskCtx=contextRecorder(),maskedCanvas={width:1280,height:720,getContext:()=>maskCtx};
assert.equal(api.maskComposite(maskedCanvas,1280,720,'circle'),maskedCanvas);
assert.ok(maskCtx.ops.some(op=>op[0]==='arc'&&op[1]===640&&op[2]===360&&op[3]===360));
assert.ok(maskCtx.ops.some(op=>op[0]==='fill'&&op[1]==='destination-in'));
assert.equal(maskCtx.globalCompositeOperation,'source-over');

const exportCtx=contextRecorder();
assert.equal(api.paintExportPaper(exportCtx,1280,720,'circle','#123456'),true);
assert.ok(exportCtx.ops.some(op=>op[0]==='clearRect'));
assert.ok(exportCtx.ops.some(op=>op[0]==='clip'));
assert.ok(exportCtx.ops.some(op=>op[0]==='fillRect'));
const squareCtx=contextRecorder();api.paintExportPaper(squareCtx,1280,720,'square','#123456');
assert.equal(squareCtx.ops.some(op=>op[0]==='clip'),false);

assert.equal(api.projectCanvasWrites,0);
assert.equal(api.undoWrites,0);
console.log('✅ Circular Canvas geometry, rim projection, masking, and export paper passed');
