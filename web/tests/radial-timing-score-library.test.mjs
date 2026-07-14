import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const memory=new Map();
const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
const sources=['radial-timeline.js','radial-timing-editor.js','radial-timing-patterns.js','radial-timing-recipes.js','radial-timing-variations.js','radial-timing-morph.js','radial-timing-phrases.js','radial-timing-phrase-library.js','radial-timing-score.js','radial-timing-score-library.js'];
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Symbol,localStorage};
box.globalThis=box;vm.createContext(box);
for(const file of sources)vm.runInContext(readFileSync(resolve(here,'..',file),'utf8'),box,{filename:file});
const radial=box.InkFrameRadialTimeline,score=box.InkFrameRadialScore,libraryApi=box.InkFrameRadialScoreLibrary;

assert.ok(radial&&score&&libraryApi,'timing score library runtime did not install');
assert.equal(radial.__radialScoreLibraryPatched,true);
assert.equal(libraryApi.STORAGE_KEY,'inkframe.radialTiming.scoreLibrary.v1');
assert.equal(libraryApi.SCHEMA,1);assert.equal(libraryApi.MAX_SCORES,12);assert.equal(libraryApi.MAX_SECTIONS,8);

const recipes=[
  {id:'alpha',name:'Alpha',values:[1,2]},
  {id:'beta',name:'Beta',values:[3]},
  {id:'gamma',name:'Gamma',values:[4,5]},
];
const arrangements=[
  {id:'opening',name:'Opening',segments:[
    {recipeId:'alpha',recipeName:'Alpha',recipeSignature:'1,2',repeat:1},
    {recipeId:'beta',recipeName:'Beta',recipeSignature:'3',repeat:2},
  ]},
  {id:'closing',name:'Closing',segments:[
    {recipeId:'gamma',recipeName:'Gamma',recipeSignature:'4,5',repeat:1},
  ]},
];
assert.equal(libraryApi.arrangementSignature(arrangements[0]),'alpha:1,2x1|beta:3x2');
const snapshot=libraryApi.snapshotSections([{arrangementId:'opening',repeat:2},{arrangementId:'closing',repeat:9},{arrangementId:'missing',repeat:1}],arrangements);
assert.deepEqual(Array.from(snapshot,item=>({...item})),[
  {arrangementId:'opening',arrangementName:'Opening',arrangementSignature:'alpha:1,2x1|beta:3x2',repeat:2},
  {arrangementId:'closing',arrangementName:'Closing',arrangementSignature:'gamma:4,5x1',repeat:4},
]);
assert.equal(Object.isFrozen(snapshot),true);assert.equal(Object.isFrozen(snapshot[0]),true);

const dirty={schema:99,scores:[
  {id:'bad id!',name:'  Main   Score ',sections:[{arrangementId:'opening',arrangementName:'Opening',arrangementSignature:'alpha:1,2x1',repeat:0}]},
  {id:'bad id!',name:'main score',sections:[{arrangementId:'closing',arrangementName:'Closing',arrangementSignature:'gamma:4,5x1',repeat:99}]},
  {id:'empty',name:'Empty',sections:[]},
  ...Array.from({length:20},(_,index)=>({id:`s${index}`,name:`Score ${index}`,sections:[{arrangementId:'opening',repeat:1}]})),
]};
const clean=libraryApi.sanitizeLibrary(dirty,100);
assert.equal(clean.schema,1);assert.equal(clean.scores.length,12,'timing score library must remain bounded');
assert.deepEqual(Array.from(clean.scores.slice(0,2),item=>item.id),['badid','badid-2']);
assert.deepEqual(Array.from(clean.scores.slice(0,2),item=>item.name),['Main Score','main score 2']);
assert.deepEqual(Array.from(clean.scores.slice(0,2),item=>item.sections[0].repeat),[1,4]);

const writes=[],storage={getItem:()=>null,setItem:(key,value)=>writes.push([key,value])};let sequence=0;
const store=libraryApi.createScoreLibraryStore(storage,{now:()=>1000+sequence,makeId:()=>`score-${++sequence}`});
const first=store.save('Scene Score',[{arrangementId:'opening',repeat:2},{arrangementId:'closing',repeat:1}],arrangements);
assert.equal(first.name,'Scene Score');assert.equal(first.sections.length,2);assert.equal(store.snapshot().scores.length,1);
const updated=store.save('scene score',[{arrangementId:'closing',repeat:3}],arrangements);
assert.equal(updated.id,first.id);assert.equal(store.snapshot().scores.length,1);assert.equal(updated.sections[0].arrangementId,'closing');
const second=store.save('Middle Score',[{arrangementId:'opening',repeat:1}],arrangements);
const duplicate=store.duplicate(second.id);assert.ok(duplicate);assert.notEqual(duplicate.id,second.id);assert.equal(duplicate.name,'Middle Score Copy');
assert.equal(store.rename(duplicate.id,'Final Score'),true);assert.equal(store.rename(duplicate.id,'Scene Score'),false);
assert.equal(store.remove(second.id),true);assert.equal(store.find(second.id),null);assert.ok(writes.length>=6);

const finalRecord=store.find(duplicate.id);
const ready=libraryApi.resolveRecord(finalRecord,arrangements,recipes);assert.equal(ready.loadable,true);assert.equal(ready.missingArrangements.length,0);assert.equal(ready.changedArrangements.length,0);assert.equal(ready.missingSources.length,0);assert.equal(ready.changedSources.length,0);
const changedArrangementRecords=arrangements.map(item=>item.id==='opening'?{...item,segments:[...item.segments,{recipeId:'gamma',recipeName:'Gamma',recipeSignature:'4,5',repeat:1}]}:item);
const changedArrangement=libraryApi.resolveRecord(finalRecord,changedArrangementRecords,recipes);assert.equal(changedArrangement.loadable,true);assert.deepEqual(Array.from(changedArrangement.changedArrangements),['opening']);
const changedRecipes=recipes.map(item=>item.id==='alpha'?{...item,values:[8]}:item);
const changedSource=libraryApi.resolveRecord(finalRecord,arrangements,changedRecipes);assert.equal(changedSource.loadable,true);assert.deepEqual(Array.from(changedSource.changedSources),['alpha']);
const missingArrangement=libraryApi.resolveRecord(finalRecord,arrangements.filter(item=>item.id!=='opening'),recipes);assert.equal(missingArrangement.loadable,false);assert.deepEqual(Array.from(missingArrangement.missingArrangements),['opening']);
const missingSource=libraryApi.resolveRecord(finalRecord,arrangements,recipes.filter(item=>item.id!=='alpha'));assert.equal(missingSource.loadable,false);assert.deepEqual(Array.from(missingSource.missingSources),['alpha']);

assert.equal(JSON.parse(store.exportJson()).schema,1);
const imported=store.importJson(JSON.stringify({scores:[{id:'imported',name:'Imported',sections:[{arrangementId:'closing',arrangementName:'Closing',arrangementSignature:'gamma:4,5x1',repeat:2}]}]}));
assert.equal(imported.scores.length,1);assert.equal(imported.scores[0].name,'Imported');assert.equal(imported.scores[0].sections[0].repeat,2);

const project={};assert.deepEqual({...libraryApi.viewSnapshot(project)},{open:false,selectedId:null,name:'',scoreCount:0,missingArrangementCount:0,changedArrangementCount:0,missingSourceCount:0,changedSourceCount:0,loadable:false});
assert.equal(libraryApi.projectCanvasWrites,0);assert.equal(libraryApi.artworkUndoWrites,0);assert.equal(libraryApi.timelineTimingWrites,0);
assert.equal(libraryApi.projectSchemaWrites,0);assert.equal(libraryApi.deviceLibraryWrites,true);assert.equal(libraryApi.sourceScoreWrites,0);assert.equal(libraryApi.sourceArrangementWrites,0);assert.equal(libraryApi.sourceRecipeWrites,0);assert.equal(libraryApi.randomWrites,0);assert.equal(libraryApi.transientScoreWrites,true);
console.log('✅ score structure library sanitation, bounds, updates, nested provenance, persistence, and isolation passed');
