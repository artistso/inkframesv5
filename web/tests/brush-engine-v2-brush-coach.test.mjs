import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'..','brush-engine-v2','brush-coach.js'),'utf8');
const sessionSource=readFileSync(resolve(here,'..','brush-engine-v2','coach-session.js'),'utf8');
const reportSource=readFileSync(resolve(here,'..','brush-engine-v2','calibration-report.js'),'utf8');
const recoverySource=readFileSync(resolve(here,'..','brush-engine-v2','profile-recovery.js'),'utf8');
function load(){
  const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,InkFrameBrushV2:{normalizeTuning:value=>Object.freeze({...value})}};
  box.globalThis=box;vm.createContext(box);vm.runInContext(source,box,{filename:'brush-coach.js'});vm.runInContext(sessionSource,box,{filename:'coach-session.js'});vm.runInContext(reportSource,box,{filename:'calibration-report.js'});vm.runInContext(recoverySource,box,{filename:'profile-recovery.js'});return box.InkFrameBrushV2;
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

const baseline={stabilizerStrength:55,cornerStrength:70,ghostMode:'comet',ghostIntensity:65,ghostLengthMs:340,coverageMode:'ribbon',radiusMode:'guarded',contactMode:'strict'};
const session=ns.createCoachSession({current:()=>baseline});
assert.equal(session.capture(cases[0].ref),true);
assert.equal(session.capture(cases[2].ref),true);
assert.equal(session.capture(cases[1].ref),true);
assert.equal(session.capture(cases[3].ref),true);
const combined=session.suggestion();assert.equal(combined.valid,true);assert.equal(session.snapshot().completed,4);
assert.ok(combined.tuning.stabilizerStrength>=25&&combined.tuning.stabilizerStrength<=200);
assert.ok(combined.tuning.cornerStrength>=0&&combined.tuning.cornerStrength<=100);
assert.equal(combined.tuning.coverageMode,'ribbon');assert.equal(combined.tuning.radiusMode,'guarded');assert.equal(combined.tuning.contactMode,'strict');
assert.equal(JSON.stringify(session.suggestion()),JSON.stringify(session.suggestion()),'same session must remain deterministic');

const quick=ns.recommendationFromAnalysis(ns.analyzeReferenceStroke(cases[0].ref),baseline);
const report=ns.createCalibrationReport(baseline,quick,combined);
assert.equal(report.ready,3);assert.equal(report.rows.length,8);assert.equal(report.profiles.current.valid,true);assert.equal(report.profiles.quick.valid,true);assert.equal(report.profiles.session.valid,true);
assert.equal(report.rows.find(row=>row.key==='stabilizerStrength').current,'55%');
const quickDiff=Array.from(ns.differenceRows(report.profiles.current,report.profiles.quick));
assert.ok(quickDiff.some(row=>row.key==='stabilizerStrength'));assert.ok(quickDiff.every(row=>!('winner' in row)));
assert.equal(JSON.stringify(ns.differenceRows(report.profiles.current,report.profiles.session)),JSON.stringify(ns.differenceRows(report.profiles.current,report.profiles.session)),'report differences must be deterministic');
const incomplete=ns.createCalibrationReport(baseline,{valid:false},{valid:false});assert.equal(incomplete.ready,1);assert.equal(incomplete.profiles.quick.valid,false);assert.equal(incomplete.profiles.session.valid,false);

{
  const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};let clock=1000;
  const history=ns.createProfileHistory({storage,limit:3,coalesceMs:500,now:()=>clock});
  const first={...baseline,stabilizerStrength:100},second={...baseline,stabilizerStrength:150},third={...second,ghostMode:'echo'},fourth={...third,cornerStrength:90},fifth={...fourth,ghostIntensity:82};
  assert.equal(history.lock(baseline).stabilizerStrength,55);assert.equal(history.snapshot().locked.ghostMode,'comet');
  assert.equal(history.capture(baseline,{...baseline,preset:'custom'},'Preset label only'),false,'preset labels must not create functional history');
  assert.equal(history.capture(baseline,first,'Adjust Stabilizer'),true);clock+=100;
  assert.equal(history.capture(first,second,'Adjust Stabilizer'),true);assert.equal(history.snapshot().entries.length,1,'rapid slider changes must coalesce');
  assert.equal(history.snapshot().entries[0].before.stabilizerStrength,55);assert.equal(history.snapshot().entries[0].after.stabilizerStrength,150);
  clock+=700;history.capture(second,third,'Adjust Trail');clock+=700;history.capture(third,fourth,'Adjust Corners');clock+=700;history.capture(fourth,fifth,'Adjust Trail intensity');
  assert.equal(history.snapshot().entries.length,3,'history must remain bounded');assert.equal(history.snapshot().entries[0].after.ghostIntensity,82);
  assert.ok(history.snapshot().entries[0].summary.some(value=>value.includes('Trail intensity')));
  const restored=ns.createProfileHistory({storage,limit:3,now:()=>clock});assert.equal(restored.snapshot().entries.length,3);assert.equal(restored.snapshot().locked.stabilizerStrength,55);
  const removed=restored.removeLatest();assert.equal(removed.after.ghostIntensity,82);assert.equal(restored.snapshot().entries.length,2);
  assert.equal(restored.unlock(),true);assert.equal(restored.snapshot().locked,null);assert.equal(restored.clear(),true);assert.equal(restored.snapshot().entries.length,0);
  assert.equal(ns.PROFILE_RECOVERY_LIMIT,24);assert.ok(ns.changeSummary(baseline,third).length>=2);
}

session.reset();assert.equal(session.snapshot().completed,0);assert.equal(session.suggestion().valid,false);
console.log('✅ Brush Coach, guided session, calibration report, profile lock, and recent changes are deterministic');