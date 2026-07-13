import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'..','brush-engine-v2','brush-coach.js'),'utf8');
function load(){
  const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,InkFrameBrushV2:{normalizeTuning:value=>Object.freeze({...value})}};
  box.globalThis=box;vm.createContext(box);vm.runInContext(source,box,{filename:'brush-coach.js'});return box.InkFrameBrushV2;
}
function reference(points){
  return {events:points.map((point,index)=>({phase:index===0?'begin':index===points.length-1?'end':'move',sample:{pointerType:'pen',pointerId:1,...point}}))};
}

const ns=load();
const cases=[
  {
    name:'precision',
    ref:reference(Array.from({length:14},(_,i)=>({x:i*3,y:60+Math.sin(i/2)*2,timeStamp:i*24,pressure:.45}))),
    expect:a=>{assert.equal(a.intent,'precision');},
    tuning:t=>{assert.ok(t.stabilizerStrength>=120&&t.stabilizerStrength<=190);assert.equal(t.ghostMode,'comet');},
  },
  {
    name:'gesture',
    ref:reference([{x:0,y:0,timeStamp:0,pressure:.25},{x:80,y:10,timeStamp:12,pressure:.4},{x:190,y:40,timeStamp:24,pressure:.65},{x:330,y:5,timeStamp:36,pressure:0}]),
    expect:a=>assert.equal(a.intent,'gesture'),
    tuning:t=>{assert.ok(t.stabilizerStrength>=25&&t.stabilizerStrength<=70);assert.equal(t.ghostMode,'echo');},
  },
  {
    name:'angular',
    ref:reference([{x:0,y:0,timeStamp:0,pressure:.5},{x:24,y:0,timeStamp:48,pressure:.5},{x:24,y:24,timeStamp:96,pressure:.5},{x:48,y:24,timeStamp:144,pressure:.5},{x:48,y:48,timeStamp:192,pressure:0}]),
    expect:a=>{assert.equal(a.intent,'angular');assert.ok(a.cornerCount>=3);},
    tuning:t=>{assert.equal(t.cornerMode,'preserve');assert.ok(t.cornerStrength>=75);},
  },
  {
    name:'expressive',
    ref:reference([{x:0,y:0,timeStamp:0,pressure:.1},{x:15,y:2,timeStamp:24,pressure:.35},{x:30,y:4,timeStamp:48,pressure:.7},{x:45,y:6,timeStamp:72,pressure:.95},{x:60,y:8,timeStamp:96,pressure:0}]),
    expect:a=>{assert.equal(a.intent,'expressive');assert.ok(a.pressureRange>=.8);},
    tuning:t=>{assert.ok(t.stabilizerStrength>=70&&t.stabilizerStrength<=120);assert.equal(t.ghostMode,'echo');},
  },
];

for(const item of cases){
  const first=ns.analyzeReferenceStroke(item.ref),second=ns.analyzeReferenceStroke(item.ref);
  assert.deepEqual({...first},{...second},`${item.name} analysis must be deterministic`);item.expect(first);
  const suggestion=ns.recommendationFromAnalysis(first,{stabilizerStrength:55,cornerStrength:70,ghostMode:'comet'});
  assert.equal(suggestion.valid,true);assert.ok(suggestion.confidence>=.55&&suggestion.confidence<=.95);item.tuning(suggestion.tuning);
  assert.equal(suggestion.tuning.coverageMode,'ribbon');assert.equal(suggestion.tuning.radiusMode,'guarded');assert.equal(suggestion.tuning.contactMode,'strict');
  assert.deepEqual({...ns.recommendationFromAnalysis(first,{stabilizerStrength:55})},{...ns.recommendationFromAnalysis(first,{stabilizerStrength:55})});
  assert.equal(ns.analysisChips(first).length,4);
}

const invalid=ns.analyzeReferenceStroke(reference([{x:0,y:0,timeStamp:0},{x:1,y:1,timeStamp:1}]));
assert.equal(invalid.valid,false);assert.equal(ns.recommendationFromAnalysis(invalid,{}).valid,false);
console.log('✅ Brush Coach analysis is deterministic, bounded, and explainable');
