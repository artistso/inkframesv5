import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),here=dirname(fileURLToPath(import.meta.url));
const {createAutosave}=require(resolve(here,'..','autosave.js'));

const fakeCanvas=(w=64,h=64)=>({width:w,height:h,getContext:()=>({drawImage(){}}),toBlob:cb=>cb({kind:'png'})});
const fakeLayer=(w=64,h=64,name='Layer 1')=>({id:1,name,visible:true,opacity:1,blend:'source-over',canvas:fakeCanvas(w,h)});
const fakeFrame=(w=64,h=64)=>({layers:[fakeLayer(w,h)],active:0,_comp:null,_compV:-1,_v:0});

globalThis.document={createElement:tag=>tag==='canvas'?fakeCanvas():{},addEventListener(){}};
globalThis.URL={createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}};
globalThis.Image=class{};
let stored=null;
globalThis.indexedDB={open(){
  const req={};
  setTimeout(()=>{
    req.result={objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},transaction(){
      const tx={objectStore:()=>({put:value=>{stored=value;setTimeout(()=>tx.oncomplete&&tx.oncomplete(),0);},get:()=>({}),delete:()=>{setTimeout(()=>tx.oncomplete&&tx.oncomplete(),0);}})};return tx;
    }};
    req.onsuccess&&req.onsuccess();
  },0);
  return req;
}};

let projects=[{name:'Circle Project',w:128,h:96,cur:0,fps:12,paper:'#fff0f3',canvasShape:'circle',holds:[1],frames:[fakeFrame(128,96)]}];
let active=null,id=10;
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
assert.equal(await autosave.flushNow(),true);
assert.ok(stored&&stored.projects&&stored.projects.length===1);
assert.equal(stored.projects[0].canvasShape,'circle');

const circlePayload={v:2,pi:0,projects:[{name:'Restored Circle',w:80,h:80,cur:0,fps:10,paper:'#fff',canvasShape:'circle',holds:[1],frames:[{active:0,layers:[{name:'Ink',visible:true,opacity:1,blend:'source-over',blob:null}]}]}]};
assert.equal(await autosave.restore(circlePayload),true);
assert.equal(projects[0].canvasShape,'circle');
assert.deepEqual(active,{pi:0,W:80,H:80});

const legacyPayload={v:2,pi:0,projects:[{name:'Legacy',w:80,h:60,cur:0,fps:12,paper:'#fff',holds:[1],frames:[{active:0,layers:[{name:'Ink',visible:true,opacity:1,blend:'source-over',blob:null}]}]}]};
assert.equal(await autosave.restore(legacyPayload),true);
assert.equal(projects[0].canvasShape,'square','legacy recovery must default to Square');
console.log('✅ Circular Canvas shape persists through autosave and legacy restore');
