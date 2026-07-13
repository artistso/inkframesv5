// InkFrame Brush Engine V2 — Ghost Trail regression tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const source=file=>readFileSync(resolve(root,file),'utf8');

{
  const sandbox={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error};
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source('brush-engine-v2/tuning.js'),sandbox,{filename:'tuning.js'});
  vm.runInContext(source('brush-engine-v2/ghost-trail.js'),sandbox,{filename:'ghost-trail.js'});
  const V2=sandbox.InkFrameBrushV2;

  const bounded=V2.normalizeGhostOptions({mode:'echo',intensity:4,durationMs:9999,widthScale:9,maxPoints:1});
  assert.equal(bounded.mode,'echo');
  assert.equal(bounded.intensity,1);
  assert.equal(bounded.durationMs,1200);
  assert.equal(bounded.widthScale,2.5);
  assert.equal(bounded.maxPoints,64);
  assert.equal(V2.normalizeGhostOptions({mode:'unknown'}).mode,'off');

  const options=V2.normalizeGhostOptions({mode:'comet',intensity:0.8,durationMs:400,widthScale:1.4});
  const point=(x,time,extra={})=>Object.freeze({
    sessionId:1,strokeId:4,strokeStart:false,x,y:20,radius:3,time,born:time,
    color:'#f00',brushId:'ink',options,...extra,
  });
  const connected=V2.buildGhostSegments([point(10,0,{strokeStart:true}),point(20,10)],100);
  assert.equal(connected.length,1);
  assert.equal(connected[0].from.x,10);
  assert.equal(connected[0].to.x,20);
  assert.ok(connected[0].alpha>0);

  assert.equal(V2.buildGhostSegments([
    point(10,0,{strokeStart:true}),point(20,10,{strokeId:5,strokeStart:true}),
  ],100).length,0,'different raster subpaths must never be connected');
  assert.equal(V2.buildGhostSegments([
    point(10,0,{strokeStart:true}),point(600,10),
  ],20).length,0,'an implausible coordinate gap must never become a ghost bridge');
  assert.equal(V2.buildGhostSegments([
    point(10,0,{strokeStart:true}),point(20,10),
  ],1000).length,0,'expired trail segments must disappear');

  assert.equal(V2.presetValue('balanced').ghostMode,'comet');
  assert.equal(V2.presetValue('smooth').ghostMode,'echo');
  const ghost=V2.tuningGhostOptions(V2.presetValue('balanced'));
  assert.equal(ghost.mode,'comet');
  assert.equal(ghost.intensity,0.65);
  assert.equal(ghost.durationMs,380);
  assert.equal(ghost.widthScale,1.3);

  const memory=new Map([[V2.PREVIOUS_STORAGE_KEY,JSON.stringify({
    preset:'custom',stabilizerMode:'adaptive',stabilizerStrength:72,cornerMode:'preserve',cornerStrength:60,
  })]]);
  const store=V2.createTuningStore({getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)});
  assert.equal(store.snapshot().ghostMode,'off','pre-trail saved settings must not gain a visual effect silently');
  assert.equal(store.snapshot().stabilizerStrength,72);
  assert.ok(memory.has(V2.STORAGE_KEY));
}

// Runtime attachment observes engine-approved dabs only. It never receives raw
// pointer coordinates or a layer/main canvas context.
{
  let engineActive=false;
  let adapterActive=false;
  const pushed=[];
  let ended=0,cleared=0;
  const sandbox={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,module:{exports:{}},exports:{}};
  sandbox.globalThis=sandbox;
  sandbox.InkFrameBrushV2={
    tuningGhostOptions:()=>({mode:'comet',intensity:0.6,durationMs:300,widthScale:1.2}),
    createGhostTrailSession:(target,options,metadata)=>({
      push(dabs){pushed.push(...dabs);return dabs.length;},
      end(){ended++;},clear(){cleared++;},target,options,metadata,
    }),
    createBrushEngine(options){
      return {
        begin(){engineActive=true;options.onDab({x:5,y:6,radius:2,strokeId:1,strokeStart:true});return[];},
        move(){options.onDab({x:8,y:9,radius:2,strokeId:1,strokeStart:false});return[];},
        end(){engineActive=false;options.onDab({x:10,y:11,radius:2,strokeId:1,strokeStart:false});return[];},
      };
    },
  };
  const adapter={
    currentTuning:()=>({ghostMode:'comet'}),isActive:()=>adapterActive,
    begin(){adapterActive=true;this.engine=sandbox.InkFrameBrushV2.createBrushEngine({});this.engine.begin();return true;},
    move(){this.engine.move();return true;},
    end(){this.engine.end();adapterActive=false;return true;},
  };
  sandbox.InkFrameBrushV2Adapter=adapter;
  vm.createContext(sandbox);
  vm.runInContext(source('brush-engine-v2/ghost-runtime.js'),sandbox,{filename:'ghost-runtime.js'});
  const canvas={id:'canvas'};
  adapter.begin({pointerId:7},{canvas,color:'#123456',brushId:'ink'});
  adapter.move({pointerId:7});
  adapter.end({pointerId:7});
  assert.deepEqual(pushed.map(dab=>[dab.x,dab.y]),[[5,6],[8,9],[10,11]]);
  assert.equal(ended,1);
  assert.equal(cleared,0);
  assert.equal(adapter.ghostTrailStats().emittedDabs,3);
  assert.equal(adapter.ghostTrailStats().active,false);
  assert.equal(engineActive,false);
  assert.equal(adapter.__ghostTrailInstalled,true);
}

console.log('✅ Brush Engine V2 Ghost Trail tests passed');
