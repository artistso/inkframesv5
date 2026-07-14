import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const memory=new Map();
const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
const sources=['radial-timeline.js','radial-timing-editor.js','radial-timing-patterns.js','radial-timing-recipes.js'];
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Symbol,localStorage};
box.globalThis=box;vm.createContext(box);
for(const file of sources)vm.runInContext(readFileSync(resolve(here,'..',file),'utf8'),box,{filename:file});
const radial=box.InkFrameRadialTimeline,patterns=box.InkFrameRadialPatterns,recipes=box.InkFrameRadialRecipes;

assert.ok(radial&&patterns&&recipes,'radial recipe runtime did not install');
assert.equal(radial.__radialRecipesPatched,true);
assert.deepEqual(Array.from(recipes.minimalPeriod([1,2,1,2,1,2])),[1,2]);
assert.deepEqual(Array.from(recipes.minimalPeriod([3,3,3])),[3]);
assert.deepEqual(Array.from(recipes.minimalPeriod([1,2,3,1])),[1,2,3,1]);
assert.deepEqual(Array.from(recipes.rotateValues([1,2,3],1)),[2,3,1]);
assert.deepEqual(Array.from(recipes.rotateValues([1,2,3],-1)),[3,1,2]);
assert.deepEqual(Array.from(recipes.transformValues([1,2,3],1,true)),[1,3,2]);
assert.equal(recipes.valuesSignature([1,2,3]),'1,2,3');

const dirty={schema:99,recipes:[
  {id:'bad id!',name:'  Pulse   Loop  ',values:[0,9,2,0,9,2]},
  {id:'bad id!',name:'pulse loop',values:['3','3','3']},
  {id:'third',name:'',values:[]},
]};
const clean=recipes.sanitizeLibrary(dirty,100);
assert.equal(clean.schema,1);assert.equal(clean.recipes.length,3);
assert.deepEqual(Array.from(clean.recipes,item=>item.id),['badid','badid-2','third']);
assert.deepEqual(Array.from(clean.recipes,item=>item.name),['Pulse Loop','pulse loop 2','Recipe 3']);
assert.deepEqual(Array.from(clean.recipes,item=>Array.from(item.values)),[[1,8,2],[3],[1]]);

const writes=[];const storage={getItem:()=>null,setItem:(key,value)=>writes.push([key,value])};let sequence=0;
const store=recipes.createRecipeStore(storage,{now:()=>1000+sequence,makeId:()=>`custom-${++sequence}`});
const first=store.save('Bounce',[1,2,1,2]);assert.equal(first.name,'Bounce');assert.deepEqual(Array.from(first.values),[1,2]);
const updated=store.save('bounce',[3,3,3]);assert.equal(updated.id,first.id);assert.deepEqual(Array.from(updated.values),[3]);assert.equal(store.snapshot().recipes.length,1);
const second=store.save('Ease',[1,1,2,2,3,3]);assert.equal(store.snapshot().recipes.length,2);assert.equal(store.rename(second.id,'Ease Out'),true);
assert.equal(store.rename(second.id,'Bounce'),false);assert.equal(store.remove(first.id),true);assert.equal(store.find(first.id),null);
assert.ok(writes.length>=4);assert.equal(JSON.parse(store.exportJson()).schema,1);
const imported=store.importJson(JSON.stringify({recipes:[{id:'x',name:'Imported',values:[2,1,2,1]}]}));
assert.deepEqual(Array.from(imported.recipes[0].values),[2,1]);

const recipe=store.find('x');const pattern=recipes.recipePattern(recipe,{phase:1,reverse:true});
assert.equal(pattern.id,'recipe:x');assert.equal(pattern.label,'Imported');assert.deepEqual(Array.from(pattern.values),[2,1]);
const scope=recipes.scopeValues({framesLength:4,selectedFrames:new Set([1,3]),loopOn:false,holdAt:index=>[1,2,3,4][index]});
assert.equal(scope.scope.kind,'selection');assert.deepEqual(Array.from(scope.values),[2,4]);

const project={};assert.deepEqual({...recipes.viewSnapshot(project)},{open:false,selectedId:null,preview:false,phase:0,reverse:false,name:'',recipeCount:0});
assert.equal(recipes.projectCanvasWrites,0);assert.equal(recipes.artworkUndoWrites,0);assert.equal(recipes.timelineTimingWrites,true);
assert.equal(recipes.projectSchemaWrites,0);assert.equal(recipes.deviceLibraryWrites,true);
console.log('✅ radial timing recipe reduction, transforms, bounded library, persistence contract, and isolation policy passed');
