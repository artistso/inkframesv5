import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),here=dirname(fileURLToPath(import.meta.url));
const autosavePath=resolve(here,'..','autosave.js');
const autosaveSource=readFileSync(autosavePath,'utf8');
const {createAutosave}=require(autosavePath);

assert.ok(autosaveSource.includes("canvasShape: P.canvasShape === 'circle' ? 'circle' : 'square'"),'autosave serialization must persist project canvas shape');
assert.ok(autosaveSource.includes("canvasShape: P.canvasShape === 'circle' ? 'circle' : 'square',"),'autosave restore must normalize Circle and legacy Square');

const fakeCanvas=(w=64,h=64)=>({width:w,height:h,getContext:()=>({drawImage(){}})});
const fakeLayer=(w=64,h=64,name='Layer 1')=>({id:1,name,visible:true,opacity:1,blend:'source-over',canvas:fakeCanvas(w,h)});
const fakeFrame=(w=64,h=64)=>({layers:[fakeLayer(w,h)],active:0,_comp:null,_compV:-1,_v:0});

globalThis.document={createElement:tag=>tag==='canvas'?fakeCanvas():{},addEventListener(){}};
globalThis.URL={createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}};
globalThis.Image=class{};

let projects=[],active=null,id=10;
const env={
  getProjects:()=>projects,
  getActive:()=>({pi:0,cur:0,fps:12,W:128,H:96}),
  setActive:value=>{active=value;},
  replaceProjects:list=>{projects=list;},
  newLayer:(w,h,name)=>fakeLayer(w,h,name),
  newFrame:(w,h)=>fakeFrame(w,h),
  upgradeFrame:value=>value,
  nextLayerId:()=>id++,W0:1024,H0:768,
};
const autosave=createAutosave(env);

const circlePayload={v:2,pi:0,projects:[{name:'Restored Circle',w:80,h:80,cur:0,fps:10,paper:'#fff',canvasShape:'circle',holds:[1],frames:[{active:0,layers:[{name:'Ink',visible:true,opacity:1,blend:'source-over',blob:null}]}]}]};
assert.equal(await autosave.restore(circlePayload),true);
assert.equal(projects[0].canvasShape,'circle');
assert.deepEqual(active,{pi:0,W:80,H:80});

const legacyPayload={v:2,pi:0,projects:[{name:'Legacy',w:80,h:60,cur:0,fps:12,paper:'#fff',holds:[1],frames:[{active:0,layers:[{name:'Ink',visible:true,opacity:1,blend:'source-over',blob:null}]}]}]};
assert.equal(await autosave.restore(legacyPayload),true);
assert.equal(projects[0].canvasShape,'square','legacy recovery must default to Square');
console.log('✅ Circular Canvas shape serialization contract and recovery normalization passed');
