import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const memory=new Map();
const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
const sources=['radial-timeline.js','radial-timing-editor.js','radial-timing-patterns.js','radial-timing-recipes.js','radial-timing-variations.js','radial-timing-morph.js','radial-timing-phrases.js','radial-timing-phrase-library.js'];
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Symbol,localStorage};
box.globalThis=box;vm.createContext(box);
for(const file of sources)vm.runInContext(readFileSync(resolve(here,'..',file),'utf8'),box,{filename:file});
const radial=box.InkFrameRadialTimeline,recipes=box.InkFrameRadialRecipes,phrases=box.InkFrameRadialPhrases,libraryApi=box.InkFrameRadialPhraseLibrary;

assert.ok(radial&&recipes&&phrases&&libraryApi,'timing phrase library runtime did not install');
assert.equal(radial.__radialPhraseLibraryPatched,true);
assert.equal(libraryApi.STORAGE_KEY,'inkframe.radialTiming.phraseLibrary.v1');
assert.equal(libraryApi.SCHEMA,1);assert.equal(libraryApi.MAX_PHRASES,16);assert.equal(libraryApi.MAX_SEGMENTS,8);

const recipeLibrary=[
  {id:'alpha',name:'Alpha',values:[1,2]},
  {id:'beta',name:'Beta',values:[3,4]},
  {id:'gamma',name:'Gamma',values:[5]},
];
const snapshot=libraryApi.snapshotSegments([{recipeId:'alpha',repeat:2},{recipeId:'beta',repeat:9},{recipeId:'missing',repeat:1}],recipeLibrary);
assert.deepEqual(Array.from(snapshot,item=>({...item})),[
  {recipeId:'alpha',recipeName:'Alpha',recipeSignature:'1,2',repeat:2},
  {recipeId:'beta',recipeName:'Beta',recipeSignature:'3,4',repeat:4},
]);
assert.equal(Object.isFrozen(snapshot),true);assert.equal(Object.isFrozen(snapshot[0]),true);

const dirty={schema:99,phrases:[
  {id:'bad id!',name:'  Main   Phrase ',segments:[{recipeId:'alpha',recipeName:'Alpha',recipeSignature:'1,2',repeat:0}]},
  {id:'bad id!',name:'main phrase',segments:[{recipeId:'beta',recipeName:'Beta',recipeSignature:'3,4',repeat:99}]},
  {id:'empty',name:'Empty',segments:[]},
  ...Array.from({length:20},(_,index)=>({id:`p${index}`,name:`Phrase ${index}`,segments:[{recipeId:'gamma',repeat:1}]})),
]};
const clean=libraryApi.sanitizeLibrary(dirty,100);
assert.equal(clean.schema,1);assert.equal(clean.phrases.length,16,'phrase arrangement library must remain bounded');
assert.deepEqual(Array.from(clean.phrases.slice(0,2),item=>item.id),['badid','badid-2']);
assert.deepEqual(Array.from(clean.phrases.slice(0,2),item=>item.name),['Main Phrase','main phrase 2']);
assert.deepEqual(Array.from(clean.phrases.slice(0,2),item=>item.segments[0].repeat),[1,4]);

const writes=[],storage={getItem:()=>null,setItem:(key,value)=>writes.push([key,value])};let sequence=0;
const store=libraryApi.createPhraseLibraryStore(storage,{now:()=>1000+sequence,makeId:()=>`arr-${++sequence}`});
const first=store.save('Opening Phrase',[{recipeId:'alpha',repeat:2},{recipeId:'beta',repeat:1}],recipeLibrary);
assert.equal(first.name,'Opening Phrase');assert.equal(first.segments.length,2);assert.equal(store.snapshot().phrases.length,1);
const updated=store.save('opening phrase',[{recipeId:'gamma',repeat:3}],recipeLibrary);
assert.equal(updated.id,first.id);assert.equal(store.snapshot().phrases.length,1);assert.equal(updated.segments[0].recipeId,'gamma');
const second=store.save('Middle Phrase',[{recipeId:'alpha',repeat:1}],recipeLibrary);
const duplicate=store.duplicate(second.id);assert.ok(duplicate);assert.notEqual(duplicate.id,second.id);assert.equal(duplicate.name,'Middle Phrase Copy');
assert.equal(store.rename(duplicate.id,'Final Phrase'),true);assert.equal(store.rename(duplicate.id,'Opening Phrase'),false);
assert.equal(store.remove(second.id),true);assert.equal(store.find(second.id),null);assert.ok(writes.length>=6);

const finalRecord=store.find(duplicate.id);
const ready=libraryApi.resolveRecord(finalRecord,recipeLibrary);assert.equal(ready.loadable,true);assert.equal(ready.missing.length,0);assert.equal(ready.changed.length,0);
const changedRecipes=recipeLibrary.map(item=>item.id==='alpha'?{...item,values:[8]}:item);
const changed=libraryApi.resolveRecord(finalRecord,changedRecipes);assert.equal(changed.loadable,true);assert.deepEqual(Array.from(changed.changed),['alpha']);
const missing=libraryApi.resolveRecord(finalRecord,recipeLibrary.filter(item=>item.id!=='alpha'));assert.equal(missing.loadable,false);assert.deepEqual(Array.from(missing.missing),['alpha']);

assert.equal(JSON.parse(store.exportJson()).schema,1);
const imported=store.importJson(JSON.stringify({phrases:[{id:'imported',name:'Imported',segments:[{recipeId:'beta',recipeName:'Beta',recipeSignature:'3,4',repeat:2}]}]}));
assert.equal(imported.phrases.length,1);assert.equal(imported.phrases[0].name,'Imported');assert.equal(imported.phrases[0].segments[0].repeat,2);

const project={};assert.deepEqual({...libraryApi.viewSnapshot(project)},{open:false,selectedId:null,name:'',phraseCount:0,missingCount:0,changedCount:0,loadable:false});
assert.equal(libraryApi.projectCanvasWrites,0);assert.equal(libraryApi.artworkUndoWrites,0);assert.equal(libraryApi.timelineTimingWrites,0);
assert.equal(libraryApi.projectSchemaWrites,0);assert.equal(libraryApi.deviceLibraryWrites,true);assert.equal(libraryApi.sourceRecipeWrites,0);assert.equal(libraryApi.randomWrites,0);assert.equal(libraryApi.transientPhraseWrites,true);
console.log('✅ phrase arrangement library sanitation, bounds, updates, provenance, persistence, and isolation passed');
