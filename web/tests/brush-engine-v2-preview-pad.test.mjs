// InkFrame Brush Engine V2 — non-destructive preview pad tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const source=readFileSync(resolve(root,'brush-engine-v2/preview-pad.js'),'utf8');

function load(stubs={}){
  const sandbox={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,...stubs};
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source,sandbox,{filename:'preview-pad.js'});
  return sandbox;
}

{
  const sandbox=load();
  const api=sandbox.InkFrameBrushV2PreviewPad;
  const transform=api.previewTransform({left:100,top:50,width:360,height:120},720,240);
  assert.equal(transform.scaleX,2);
  assert.equal(transform.scaleY,2);
  const sample=api.previewSampleFromEvent({clientX:190,clientY:80,pressure:0.6,tiltX:10,tiltY:-5,timeStamp:12,pointerId:7,pointerType:'pen'},transform);
  assert.equal(sample.x,180);
  assert.equal(sample.y,60);
  assert.equal(sample.pressure,0.6);
  assert.equal(sample.pointerId,7);
  assert.equal(sample.pointerType,'pen');

  const terminal=api.previewSampleFromEvent({clientX:190,clientY:80,pressure:0,timeStamp:20,pointerType:'pen'},transform);
  assert.equal(terminal.pressure,0,'pen-up pressure must remain zero');
  const mouse=api.previewSampleFromEvent({clientX:190,clientY:80,buttons:1,timeStamp:20,pointerType:'mouse'},transform);
  assert.equal(mouse.pressure,0.5,'pressed mouse preview should receive the canonical pressure fallback');
}

{
  const previewContext={name:'preview'};
  const projectContext={name:'project'};
  const painted=[];
  const ghostPushes=[];
  let ghostEnded=0;
  let ghostCleared=0;
  const engineOptions=[];
  const sandbox=load({
    InkFrameBrushV2:{
      normalizeTuning:value=>Object.freeze({...value,stabilizerStrength:150,ghostMode:'echo'}),
      applyTuningToProfile:(profile,tuning)=>({...profile,coverage:'ribbon',stabilizerStrength:tuning.stabilizerStrength}),
      tuningFilterOptions:tuning=>({strength:tuning.stabilizerStrength}),
      tuningValidatorOptions:()=>({minimumJump:20}),
      tuningGhostOptions:tuning=>({mode:tuning.ghostMode,intensity:0.8,durationMs:700,widthScale:1.5}),
      createBrushEngine:options=>{
        engineOptions.push(options);
        let index=0;
        const dab=sample=>({x:sample.x,y:sample.y,radius:5,strokeId:1,strokeIndex:index,strokeStart:index++===0,coverage:'ribbon'});
        return {begin:sample=>[dab(sample)],move:sample=>[dab(sample)],end:sample=>sample?[dab(sample)]:[],reset:()=>{},stats:()=>({active:false})};
      },
      paintRoundDab:(context,dab,color)=>{painted.push({context,dab,color});return true;},
      createGhostTrailSession:(canvas,options,metadata)=>({
        push:dabs=>{ghostPushes.push({canvas,options,metadata,dabs:[...dabs]});return dabs.length;},
        end:()=>{ghostEnded++;return true;},
        clear:()=>{ghostCleared++;},
      }),
    },
  });
  const api=sandbox.InkFrameBrushV2PreviewPad;
  const canvas={width:720,height:240};
  const session=api.createPreviewSession({
    canvas,
    context:previewContext,
    tuning:{stabilizerStrength:150,ghostMode:'echo'},
    source:{brushId:'ink',color:'#ff3366',profile:{size:18,spacing:0.05}},
  });
  assert.equal(session.begin({x:10,y:20,pressure:0.5,timeStamp:0}),1);
  assert.equal(session.move({x:30,y:40,pressure:0.7,timeStamp:8}),1);
  assert.equal(session.end({x:40,y:45,pressure:0,timeStamp:16}),1);
  assert.equal(painted.length,3);
  assert.ok(painted.every(entry=>entry.context===previewContext),'all dabs must target the isolated preview context');
  assert.ok(painted.every(entry=>entry.context!==projectContext),'project context must never receive a preview dab');
  assert.ok(ghostPushes.every(entry=>entry.canvas===canvas),'Ghost Trail must target the preview canvas');
  assert.equal(ghostEnded,1);
  assert.equal(ghostCleared,0);
  assert.equal(engineOptions[0].width,720);
  assert.equal(engineOptions[0].height,240);
  assert.equal(engineOptions[0].filter.strength,150);
  assert.equal(session.stats().paintedDabs,3);
  assert.equal(session.stats().ended,true);
  assert.equal(session.move({x:50,y:50,pressure:0.5,timeStamp:20}),0,'ended preview session must reject later movement');
}

{
  let reset=0;
  let clear=0;
  let end=0;
  const sandbox=load({
    InkFrameBrushV2:{
      normalizeTuning:value=>value,
      applyTuningToProfile:profile=>profile,
      createBrushEngine:()=>({begin:()=>[],move:()=>[],end:()=>[],reset:()=>{reset++;},stats:()=>({})}),
      paintRoundDab:()=>true,
      createGhostTrailSession:()=>({push:()=>0,end:()=>{end++;},clear:()=>{clear++;}}),
    },
  });
  const session=sandbox.InkFrameBrushV2PreviewPad.createPreviewSession({canvas:{width:10,height:10},context:{},tuning:{},source:{brushId:'ink',color:'#fff',profile:{}}});
  assert.equal(session.abort(),true);
  assert.equal(reset,1);
  assert.equal(clear,1);
  assert.equal(end,1);
  assert.equal(session.abort(),false);
}

console.log('✅ Brush Engine V2 non-destructive preview pad tests passed');
