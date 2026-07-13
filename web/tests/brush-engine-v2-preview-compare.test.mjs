// InkFrame Brush Engine V2 — deterministic A/B preview comparison tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const source=readFileSync(resolve(root,'brush-engine-v2/preview-compare.js'),'utf8');

function load(stubs={}){
  const sandbox={
    console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,
    InkFrameBrushV2:{
      presetValue:name=>({preset:name,stabilizerStrength:name==='direct'?25:name==='smooth'?80:55,ghostMode:name==='smooth'?'echo':'comet'}),
      normalizeTuning:value=>Object.freeze({...value}),
    },
    ...stubs,
  };
  sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'preview-compare.js'});return sandbox;
}

{
  const sandbox=load();const ns=sandbox.InkFrameBrushV2;
  const library={presets:[{id:'fine-line',name:'Fine Line',tuning:{preset:'custom',stabilizerStrength:140,ghostMode:'off'}}],pinned:['fine-line']};
  const choices=Array.from(ns.compareChoices(library));
  assert.deepEqual(choices.map(choice=>choice.id),['studio:direct','studio:balanced','studio:smooth','saved:fine-line']);
  assert.equal(choices[3].label,'Saved · Fine Line');
  assert.equal(ns.resolveCompareChoice('saved:fine-line',library).tuning.stabilizerStrength,140);
  assert.equal(ns.resolveCompareChoice('saved:missing',library).id,'studio:balanced','missing saved preset must fall back safely');
  const transient=ns.resolveCompareChoice('transient',library,{label:'Previous A',tuning:{stabilizerStrength:175,ghostMode:'echo'}});
  assert.equal(transient.label,'Previous A');
  assert.equal(transient.tuning.stabilizerStrength,175);
}

{
  const sandbox=load();const ns=sandbox.InkFrameBrushV2;
  const calls=[];
  const factory=options=>{
    const side=options.side;
    return {
      begin:sample=>{calls.push({side,method:'begin',sample});return side==='A'?2:3;},
      move:sample=>{calls.push({side,method:'move',sample});return side==='A'?4:5;},
      end:sample=>{calls.push({side,method:'end',sample});return side==='A'?6:7;},
      abort:()=>{calls.push({side,method:'abort'});return true;},
      stats:()=>({side}),
    };
  };
  const pair=ns.createPairedPreviewSession({createSession:factory,a:{side:'A'},b:{side:'B'}});
  const beginSample=Object.freeze({x:10,y:20,pressure:0.4,timeStamp:0});
  const moveSample=Object.freeze({x:30,y:40,pressure:0.6,timeStamp:8});
  const endSample=Object.freeze({x:50,y:60,pressure:0,timeStamp:16});
  assert.deepEqual({...pair.begin(beginSample)},{a:2,b:3});
  assert.deepEqual({...pair.move(moveSample)},{a:4,b:5});
  assert.deepEqual({...pair.end(endSample)},{a:6,b:7});
  for(const method of ['begin','move','end']){
    const entries=calls.filter(call=>call.method===method);
    assert.equal(entries.length,2);
    assert.equal(entries[0].sample,entries[1].sample,`${method} must pass the exact same sample object to A and B`);
  }
  assert.equal(pair.stats().inputSamples,3);
  assert.equal(pair.stats().ended,true);
  assert.deepEqual({...pair.move(moveSample)},{a:0,b:0},'ended pair must reject later movement');
}

{
  const sandbox=load();const ns=sandbox.InkFrameBrushV2;
  let aborts=0;
  const pair=ns.createPairedPreviewSession({createSession:()=>({begin:()=>0,move:()=>0,end:()=>0,abort:()=>{aborts++;return true;},stats:()=>({})}),a:{},b:{}});
  assert.equal(pair.abort(),true);
  assert.equal(aborts,2);
  assert.equal(pair.abort(),false);
}

{
  const appended=[];
  const document={
    querySelector:selector=>appended.find(node=>(selector==='script[data-inkframe-reference-replay]'&&node.dataset.inkframeReferenceReplay)||(selector==='script[data-inkframe-brush-coach]'&&node.dataset.inkframeBrushCoach)||(selector==='script[data-inkframe-coach-session]'&&node.dataset.inkframeCoachSession)||(selector==='script[data-inkframe-calibration-report]'&&node.dataset.inkframeCalibrationReport)||(selector==='script[data-inkframe-profile-history]'&&node.dataset.inkframeProfileHistory))||null,
    createElement:tag=>({tag,dataset:{},src:'',async:true,listeners:{},addEventListener(type,handler){this.listeners[type]=handler;}}),
    head:{appendChild:node=>appended.push(node)},
  };
  const sandbox=load({document,setTimeout:callback=>{callback();return 1;}});
  assert.equal(appended.length,1);
  assert.equal(appended[0].src,'brush-engine-v2/preview-replay.js');
  assert.equal(appended[0].async,false);
  appended[0].listeners.load();
  assert.equal(appended.length,2);
  assert.equal(appended[1].src,'brush-engine-v2/brush-coach.js');
  assert.equal(appended[1].async,false);
  appended[1].listeners.load();
  assert.equal(appended.length,3);
  assert.equal(appended[2].src,'brush-engine-v2/coach-session.js');
  assert.equal(appended[2].async,false);
  appended[2].listeners.load();
  assert.equal(appended.length,4);
  assert.equal(appended[3].src,'brush-engine-v2/calibration-report.js');
  assert.equal(appended[3].async,false);
  appended[3].listeners.load();
  assert.equal(appended.length,5);
  assert.equal(appended[4].src,'brush-engine-v2/profile-history.js');
  assert.equal(appended[4].async,false);
  assert.equal(sandbox.InkFrameBrushV2.loadReferenceReplay(),true);
  assert.equal(sandbox.InkFrameBrushV2.loadBrushCoach(),true);
  assert.equal(sandbox.InkFrameBrushV2.loadCoachSession(),true);
  assert.equal(sandbox.InkFrameBrushV2.loadCalibrationReport(),true);
  assert.equal(sandbox.InkFrameBrushV2.loadProfileHistory(),true);
  assert.equal(appended.length,5,'loader chain must not append duplicate scripts');
}

console.log('✅ Brush Engine V2 deterministic A/B preview and Profile History loader chain passed');
