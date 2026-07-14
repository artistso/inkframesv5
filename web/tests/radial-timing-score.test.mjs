import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const memory=new Map();
const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
const sources=['radial-timeline.js','radial-timing-editor.js','radial-timing-patterns.js','radial-timing-recipes.js','radial-timing-variations.js','radial-timing-morph.js','radial-timing-phrases.js','radial-timing-phrase-library.js','radial-timing-score.js'];
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Symbol,localStorage};
box.globalThis=box;vm.createContext(box);
for(const file of sources)vm.runInContext(readFileSync(resolve(here,'..',file),'utf8'),box,{filename:file});
const radial=box.InkFrameRadialTimeline,score=box.InkFrameRadialScore;

assert.ok(radial&&score,'timing score runtime did not install');
assert.equal(radial.__radialScorePatched,true);
assert.equal(score.MAX_SECTIONS,8);assert.equal(score.MAX_REPEAT,4);assert.equal(score.MAX_VALUES,120);
assert.equal(score.clampRepeat(-5),1);assert.equal(score.clampRepeat(9),4);assert.equal(score.clampRepeat(2.6),3);

const safe=score.sanitizeSections([
  {arrangementId:'opening',repeat:2},
  {arrangementId:'',repeat:3},
  {arrangementId:'closing',repeat:99},
  ...Array.from({length:10},(_,index)=>({arrangementId:`extra-${index}`,repeat:1})),
]);
assert.equal(safe.length,8,'score sections must remain bounded');
assert.deepEqual(Array.from(safe.slice(0,2),item=>({...item})),[{arrangementId:'opening',repeat:2},{arrangementId:'closing',repeat:4}]);
assert.equal(Object.isFrozen(safe),true);assert.equal(Object.isFrozen(safe[0]),true);

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
const composed=score.createScore([{arrangementId:'opening',repeat:2},{arrangementId:'closing',repeat:1}],arrangements,recipes);
assert.ok(composed);assert.equal(composed.valid,true);assert.equal(composed.label,'Opening ×2 ⇒ Closing');
assert.deepEqual(Array.from(composed.values),[1,2,3,3,1,2,3,3,4,5]);assert.equal(composed.rawLength,10);assert.equal(composed.truncated,false);
assert.equal(composed.signature,'1,2,3,3,1,2,3,3,4,5');assert.equal(Object.isFrozen(composed),true);assert.equal(Object.isFrozen(composed.sections),true);assert.equal(Object.isFrozen(composed.values),true);
assert.equal(score.createScore([],arrangements,recipes),null);

const repeated=score.createScore([{arrangementId:'closing',repeat:4}],arrangements,recipes);
assert.equal(repeated.valid,true);assert.deepEqual(Array.from(repeated.values),[4,5],'whole-score exact repetition must reduce to its smallest period');

const missingArrangement=score.createScore([{arrangementId:'missing',repeat:1}],arrangements,recipes);
assert.equal(missingArrangement.valid,false);assert.deepEqual(Array.from(missingArrangement.missingArrangements),['missing']);assert.deepEqual(Array.from(missingArrangement.values),[]);
const missingSourceArrangements=[...arrangements,{id:'broken',name:'Broken',segments:[{recipeId:'gone',recipeName:'Gone',recipeSignature:'2',repeat:1}]}];
const missingSource=score.createScore([{arrangementId:'broken',repeat:1}],missingSourceArrangements,recipes);
assert.equal(missingSource.valid,false);assert.deepEqual(Array.from(missingSource.missingSources),['gone']);assert.deepEqual(Array.from(missingSource.values),[]);

const changedRecipes=recipes.map(item=>item.id==='alpha'?{...item,values:[8]}:item);
const changed=score.createScore([{arrangementId:'opening',repeat:1}],arrangements,changedRecipes);
assert.equal(changed.valid,true);assert.deepEqual(Array.from(changed.changedSources),['alpha']);assert.deepEqual(Array.from(changed.values),[8,3,3]);

const source120=Array(119).fill(1).concat(2),longRecipes=[{id:'long',name:'Long',values:source120}],longArrangements=[{id:'long-phrase',name:'Long Phrase',segments:[{recipeId:'long',recipeName:'Long',recipeSignature:source120.join(','),repeat:1}]}];
const capped=score.createScore([{arrangementId:'long-phrase',repeat:4}],longArrangements,longRecipes);
assert.equal(capped.valid,true);assert.equal(capped.rawLength,480);assert.equal(capped.values.length,120);assert.equal(capped.truncated,true);assert.deepEqual(Array.from(capped.values),source120);

const verboseArrangements=[
  {id:'a',name:'An exceptionally long opening arrangement',segments:arrangements[0].segments},
  {id:'b',name:'Another exceptionally long closing arrangement',segments:arrangements[1].segments},
];
const longName=score.scoreName([{arrangementId:'a',repeat:1},{arrangementId:'b',repeat:1}],verboseArrangements);
assert.ok(longName.length<=32);assert.match(longName,/⇒ \+1$/);

const recipeSnapshot=JSON.stringify(recipes),arrangementSnapshot=JSON.stringify(arrangements);
score.createScore([{arrangementId:'opening',repeat:2}],arrangements,recipes);score.resolveArrangement(arrangements[0],recipes);
assert.equal(JSON.stringify(recipes),recipeSnapshot,'score composition must not mutate source recipes');
assert.equal(JSON.stringify(arrangements),arrangementSnapshot,'score composition must not mutate source arrangements');
assert.equal(score.loadStructure({sections:[{arrangementId:'opening',repeat:1}]}),false,'structural loading requires an installed score environment');
const project={};assert.deepEqual({...score.viewSnapshot(project),sections:Array.from(score.viewSnapshot(project).sections)},{open:false,selectedArrangementId:null,sections:[],preview:false,name:'',arrangementCount:0,scoreLength:0,valid:false,truncated:false,unresolvedCount:0,changedCount:0});
assert.equal(score.projectCanvasWrites,0);assert.equal(score.artworkUndoWrites,0);assert.equal(score.timelineTimingWrites,true);assert.equal(score.projectSchemaWrites,0);assert.equal(score.deviceLibraryWrites,true);assert.equal(score.sourceArrangementWrites,0);assert.equal(score.sourceRecipeWrites,0);assert.equal(score.randomWrites,0);
console.log('✅ deterministic timing score ordering, repeats, provenance resolution, capping, reduction, naming, and isolation passed');

await import('./radial-timing-score-library.test.mjs');
