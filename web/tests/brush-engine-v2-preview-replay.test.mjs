import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'..','brush-engine-v2','preview-replay.js'),'utf8');
function load(stubs={}){
  const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,...stubs};
  box.globalThis=box;vm.createContext(box);vm.runInContext(source,box);return box;
}

{
  const api=load().InkFrameBrushV2ReferenceReplay;
  const recorder=api.createReferenceStrokeRecorder({maxSamples:8});
  const first={x:10,y:20,pressure:.4,timeStamp:100,pointerId:7,pointerType:'pen'};
  recorder.start(first);first.x=999;
  recorder.move({x:20,y:22,pressure:.5,timeStamp:108,pointerId:7,pointerType:'pen'});
  const ref=recorder.finish({x:30,y:24,pressure:0,timeStamp:116,pointerId:7,pointerType:'pen'});
  assert.equal(ref.sampleCount,3);assert.equal(ref.durationMs,16);assert.equal(ref.events[0].sample.x,10);
  assert.equal(Object.isFrozen(ref),true);assert.equal(Object.isFrozen(ref.events[0].sample),true);
  const calls=[];
  const target={begin:s=>{calls.push(['begin',s]);return{a:1,b:2}},move:s=>{calls.push(['move',s]);return{a:3,b:4}},end:s=>{calls.push(['end',s]);return{a:5,b:6}}};
  const result=api.replayReferenceStroke(ref,target);
  assert.deepEqual(Array.from(calls,x=>x[0]),['begin','move','end']);
  assert.equal(calls[0][1],ref.events[0].sample);assert.equal(calls[2][1],ref.events[2].sample);
  assert.deepEqual({...result},{events:3,a:9,b:12});
}

{
  const api=load().InkFrameBrushV2ReferenceReplay;
  const recorder=api.createReferenceStrokeRecorder({maxSamples:3});
  recorder.start({x:0,y:0,timeStamp:0});recorder.move({x:1,y:0,timeStamp:1});recorder.move({x:2,y:0,timeStamp:2});
  assert.equal(recorder.finish({x:3,y:0,timeStamp:3}),null);assert.equal(recorder.stats().rejected,1);
  recorder.start({x:0,y:0,timeStamp:0});assert.equal(recorder.cancel(),true);assert.equal(recorder.stats().rejected,2);
}

{
  const box=load({InkFrameBrushV2:{normalizeTuning:v=>({stabilizerMode:'adaptive',stabilizerStrength:55,cornerMode:'preserve',cornerStrength:70,ghostMode:'comet',ghostIntensity:65,coverageMode:'ribbon',radiusMode:'guarded',contactMode:'strict',...v})}});
  const summary=box.InkFrameBrushV2ReferenceReplay.tuningDifferenceSummary({},{stabilizerStrength:150,cornerStrength:50,ghostMode:'echo'},4);
  assert.deepEqual(Array.from(summary,x=>`${x.label}:${x.value}`),['Stabilizer:+95%','Corners:-20%','Trail:comet → echo']);
  assert.equal(box.InkFrameBrushV2ReferenceReplay.tuningDifferenceSummary({},{} )[0].value,'No differences');
}

console.log('✅ Brush Engine V2 reference replay tests passed');
