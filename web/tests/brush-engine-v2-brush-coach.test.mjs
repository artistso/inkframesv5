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
const identitySource=readFileSync(resolve(here,'..','brush-engine-v2','profile-identities.js'),'utf8');
const mixerSource=readFileSync(resolve(here,'..','brush-engine-v2','identity-mixer.js'),'utf8');
const matchSource=readFileSync(resolve(here,'..','brush-engine-v2','brush-match.js'),'utf8');
const signatureSource=readFileSync(resolve(here,'..','brush-engine-v2','brush-signature.js'),'utf8');
function load(){
  const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,InkFrameBrushV2:{normalizeTuning:value=>Object.freeze({...value})}};
  box.globalThis=box;vm.createContext(box);vm.runInContext(source,box,{filename:'brush-coach.js'});vm.runInContext(sessionSource,box,{filename:'coach-session.js'});vm.runInContext(reportSource,box,{filename:'calibration-report.js'});vm.runInContext(recoverySource,box,{filename:'profile-recovery.js'});vm.runInContext(identitySource,box,{filename:'profile-identities.js'});vm.runInContext(mixerSource,box,{filename:'identity-mixer.js'});vm.runInContext(matchSource,box,{filename:'brush-match.js'});vm.runInContext(signatureSource,box,{filename:'brush-signature.js'});return box.InkFrameBrushV2;
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
  const match=ns.matchBrushIdentities(first,{stabilizerStrength:55,cornerStrength:70,ghostMode:'comet'}),again=ns.matchBrushIdentities(first,{stabilizerStrength:55,cornerStrength:70,ghostMode:'comet'});
  assert.equal(match.valid,true);assert.equal(JSON.stringify(match),JSON.stringify(again),`${item.name} identity match must be deterministic`);assert.equal(match.ranking.length,3);assert.ok(match.score>=0&&match.score<=1);assert.ok(match.confidence>=.5&&match.confidence<=.97);assert.ok(match.mix.percent>=0&&match.mix.percent<=100);assert.ok(match.distance<=match.ranking[0].distance+1e-8,'pair search must be at least as close as the best single identity endpoint');assert.equal(match.tuning.coverageMode,'ribbon');assert.equal(match.tuning.radiusMode,'guarded');assert.equal(match.tuning.contactMode,'strict');assert.equal(ns.brushMatchChips(match).length,4);
}

const invalid=ns.analyzeReferenceStroke(reference([{x:0,y:0,timeStamp:0},{x:1,y:1,timeStamp:1}]));
assert.equal(invalid.valid,false);assert.equal(ns.recommendationFromAnalysis(invalid,{}).valid,false);assert.equal(ns.matchBrushIdentities(invalid,{}).valid,false);assert.equal(ns.createBrushSignature({valid:false,completed:2,required:4}).valid,false);

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
const directSessionMatch=ns.matchTuningToIdentities(combined.tuning,{confidence:combined.confidence});assert.equal(directSessionMatch.valid,true);assert.ok(directSessionMatch.distance<=directSessionMatch.ranking[0].distance+1e-8);
const signature=ns.createBrushSignature(combined),signatureAgain=ns.createBrushSignature(combined);assert.equal(signature.valid,true);assert.equal(JSON.stringify(signature),JSON.stringify(signatureAgain),'same completed session must produce a byte-equivalent signature');assert.equal(signature.samples.length,4);assert.ok(signature.samples.every(item=>Object.isFrozen(item)));assert.ok(signature.stability>=0&&signature.stability<=1);assert.ok(signature.confidence>=.5&&signature.confidence<=.98);assert.ok(signature.distance<=signature.ranking[0].distance+1e-8);assert.equal(signature.tuning.coverageMode,'ribbon');assert.equal(signature.tuning.radiusMode,'guarded');assert.equal(signature.tuning.contactMode,'strict');assert.equal(ns.brushSignatureChips(signature).length,5);assert.equal(ns.signatureStabilityLabel(.95),'Highly consistent');assert.equal(ns.signatureStabilityLabel(.8),'Consistent');assert.equal(ns.signatureStabilityLabel(.7),'Versatile');assert.equal(ns.signatureStabilityLabel(.5),'Wide-ranging');

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

{
  const identities=Array.from(ns.listBrushIdentities());
  assert.deepEqual(identities.map(identity=>identity.name),['Lovely Comet','Precision Ink','Expressive Echo','Animation Cleanup','Fast Gesture','Maximum Stabilized']);
  assert.equal(new Set(identities.map(identity=>identity.id)).size,6);assert.ok(identities.every(identity=>Object.isFrozen(identity)&&Object.isFrozen(identity.tuning)));
  assert.ok(identities.every(identity=>identity.tuning.coverageMode==='ribbon'&&identity.tuning.radiusMode==='guarded'&&identity.tuning.contactMode==='strict'));
  assert.equal(ns.resolveBrushIdentity('lovely-comet').tuning.ghostMode,'comet');assert.equal(ns.resolveBrushIdentity('expressive-echo').tuning.ghostMode,'echo');assert.equal(ns.resolveBrushIdentity('maximum-stabilized').tuning.stabilizerStrength,200);
  assert.equal(ns.resolveBrushIdentity('missing'),null);assert.equal(ns.brushIdentityChips('precision-ink').length,5);

  const lovely=ns.resolveBrushIdentity('lovely-comet'),precision=ns.resolveBrushIdentity('precision-ink'),expressive=ns.resolveBrushIdentity('expressive-echo');
  assert.equal(ns.tuningDistance(lovely.tuning,lovely.tuning),0);assert.ok(ns.tuningDistance(lovely.tuning,precision.tuning)>0);
  const ranked=Array.from(ns.rankBrushIdentities(lovely.tuning));assert.equal(ranked[0].identity.id,'lovely-comet');assert.equal(ranked[0].score,1);
  const exactMatch=ns.matchTuningToIdentities(lovely.tuning,{confidence:.9});assert.equal(exactMatch.valid,true);assert.equal(exactMatch.distance,0);assert.equal(exactMatch.score,1);
  assert.deepEqual({...ns.mixBrushTunings(lovely.tuning,precision.tuning,0)},{...lovely.tuning},'zero mix must equal A exactly');
  assert.deepEqual({...ns.mixBrushTunings(lovely.tuning,precision.tuning,1)},{...precision.tuning},'full mix must equal B exactly');
  const midpoint=ns.mixBrushIdentities('lovely-comet','precision-ink',50);assert.equal(midpoint.tuning.stabilizerStrength,101);assert.equal(midpoint.tuning.cornerStrength,84);assert.equal(midpoint.tuning.ghostIntensity,43);assert.equal(midpoint.tuning.ghostMode,'comet','non-off trail must fade continuously toward an off endpoint');
  assert.equal(midpoint.presetName,'Mix 50 · Lovely/Precision');assert.equal(ns.identityMixChips(midpoint).length,5);
  const trailTie=ns.mixBrushIdentities('lovely-comet','expressive-echo',50);assert.equal(trailTie.tuning.ghostMode,'comet','50/50 non-off mode selection must be order-stable');
  const reverseTie=ns.mixBrushIdentities('expressive-echo','lovely-comet',50);assert.equal(reverseTie.tuning.ghostMode,'comet');
  assert.deepEqual({...trailTie.tuning},{...reverseTie.tuning},'swapped 50/50 mixes must remain identical');
  assert.equal(ns.mixBrushIdentities('lovely-comet','precision-ink',150).percent,100);assert.equal(ns.mixBrushIdentities('lovely-comet','precision-ink',-20).percent,0);assert.equal(ns.mixBrushIdentities('missing','precision-ink',50),null);
}

session.reset();assert.equal(session.snapshot().completed,0);assert.equal(session.suggestion().valid,false);assert.equal(ns.createBrushSignature(session.suggestion()).valid,false);
console.log('✅ Brush Coach, calibration, recovery, identities, mixer, Brush Match, and Brush Signature passed');