import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..');
const source=readFileSync(resolve(root,'brush-engine-v2/coach-session.js'),'utf8');
const analyses={
  detail:{valid:true,intent:'precision'},
  corners:{valid:true,intent:'angular'},
  gesture:{valid:true,intent:'gesture'},
  pressure:{valid:true,intent:'expressive'},
};
const recs={
  detail:{valid:true,confidence:.8,tuning:{stabilizerStrength:180,cornerStrength:60,ghostIntensity:50,ghostLengthMs:250}},
  corners:{valid:true,confidence:.82,tuning:{stabilizerStrength:100,cornerStrength:95,ghostIntensity:60,ghostLengthMs:300}},
  gesture:{valid:true,confidence:.86,tuning:{stabilizerStrength:40,cornerStrength:80,ghostIntensity:80,ghostLengthMs:500}},
  pressure:{valid:true,confidence:.84,tuning:{stabilizerStrength:120,cornerStrength:70,ghostIntensity:70,ghostLengthMs:450}},
};
const sandbox={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,InkFrameBrushV2:{normalizeTuning:value=>Object.freeze({...value}),analyzeReferenceStroke:reference=>analyses[reference.kind]||{valid:false},recommendationFromAnalysis:analysis=>recs[Object.keys(analyses).find(key=>analyses[key]===analysis)]}};
sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'coach-session.js'});
const ns=sandbox.InkFrameBrushV2;
assert.deepEqual(Array.from(ns.COACH_SESSION_STEPS,item=>item.id),['detail','corners','gesture','pressure']);
const model=ns.createCoachSession({current:()=>({ghostMode:'off'})});
assert.equal(model.snapshot().completed,0);assert.equal(model.suggestion().valid,false);
for(const kind of ['detail','corners','gesture','pressure']){
  assert.equal(model.selected,kind);
  assert.equal(model.capture(Object.freeze({kind,id:kind})),true);
}
const state=model.snapshot(),suggestion=state.suggestion;
assert.equal(state.completed,4);assert.equal(suggestion.valid,true);
assert.equal(suggestion.tuning.stabilizerStrength,124);
assert.equal(suggestion.tuning.cornerStrength,84);
assert.equal(suggestion.tuning.ghostIntensity,71);
assert.equal(suggestion.tuning.ghostLengthMs,430);
assert.equal(suggestion.tuning.ghostMode,'echo');
assert.equal(suggestion.tuning.coverageMode,'ribbon');
assert.equal(suggestion.tuning.radiusMode,'guarded');
assert.equal(suggestion.tuning.contactMode,'strict');
assert.ok(suggestion.confidence>=.72&&suggestion.confidence<=.96);
assert.equal(model.remove('corners'),true);assert.equal(model.selected,'corners');assert.equal(model.suggestion().valid,false);
assert.equal(model.capture(Object.freeze({kind:'corners',id:'corners-2'})),true);assert.equal(model.suggestion().valid,true);
const first=JSON.stringify(model.suggestion());const second=JSON.stringify(model.suggestion());assert.equal(first,second,'same session must produce identical suggestion');
assert.equal(model.reset(),true);assert.equal(model.snapshot().completed,0);assert.equal(model.selected,'detail');
assert.equal(model.select('missing'),false);assert.equal(model.capture({kind:'missing'}),false);
console.log('✅ four-stroke Brush Coach Session is bounded and deterministic');
