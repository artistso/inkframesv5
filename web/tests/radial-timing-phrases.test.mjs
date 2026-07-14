import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const memory=new Map();
const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
const sources=['radial-timeline.js','radial-timing-editor.js','radial-timing-patterns.js','radial-timing-recipes.js','radial-timing-variations.js','radial-timing-morph.js','radial-timing-phrases.js'];
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Symbol,localStorage};
box.globalThis=box;vm.createContext(box);
for(const file of sources)vm.runInContext(readFileSync(resolve(here,'..',file),'utf8'),box,{filename:file});
const radial=box.InkFrameRadialTimeline,phrases=box.InkFrameRadialPhrases;

assert.ok(radial&&phrases,'radial timing phrase runtime did not install');
assert.equal(radial.__radialPhrasesPatched,true);
assert.equal(phrases.MAX_SEGMENTS,8);assert.equal(phrases.MAX_REPEAT,4);assert.equal(phrases.MAX_VALUES,120);
assert.equal(phrases.clampRepeat(-2),1);assert.equal(phrases.clampRepeat(9),4);assert.equal(phrases.clampRepeat(2.6),3);

const library=[
  {id:'alpha',name:'Alpha',values:[1,2]},
  {id:'beta',name:'Beta',values:[3]},
  {id:'gamma',name:'Gamma',values:[4,5,6]},
];
const dirty=[
  {recipeId:'alpha',repeat:2},
  {recipeId:'missing',repeat:3},
  {recipeId:'beta',repeat:99},
  ...Array.from({length:10},()=>({recipeId:'gamma',repeat:1})),
];
const safe=phrases.sanitizeSegments(dirty,library);
assert.equal(safe.length,8,'phrase segments must be visibly bounded');
assert.deepEqual(Array.from(safe.slice(0,2),item=>({...item})),[{recipeId:'alpha',repeat:2},{recipeId:'beta',repeat:4}]);
assert.equal(Object.isFrozen(safe),true);assert.equal(Object.isFrozen(safe[0]),true);

const segments=[{recipeId:'alpha',repeat:2},{recipeId:'beta',repeat:1},{recipeId:'gamma',repeat:1}];
assert.deepEqual(Array.from(phrases.compileSegments(segments,library)),[1,2,1,2,3,4,5,6]);
assert.deepEqual(Array.from(phrases.compileSegments([{recipeId:'alpha',repeat:4}],library)),[1,2],'whole-phrase exact repetitions must reduce to the smallest period');
assert.deepEqual(Array.from(phrases.compileSegments([],library)),[]);
assert.deepEqual(Array.from(phrases.compileSegments([{recipeId:'missing',repeat:1}],library)),[]);

const source120=Array(119).fill(1).concat(2),longLibrary=[{id:'long',name:'Long Source',values:source120}];
const capped=phrases.createPhrase([{recipeId:'long',repeat:4}],longLibrary);
assert.ok(capped);assert.equal(capped.rawLength,480);assert.equal(capped.values.length,120);assert.equal(capped.truncated,true);
assert.deepEqual(Array.from(capped.values),source120,'the first 120 deterministic values must be preserved at the safety cap');

const phrase=phrases.createPhrase(segments,library);
assert.ok(phrase);assert.equal(phrase.label,'Alpha ×2 → Beta → Gamma');assert.ok(phrase.id.startsWith('phrase:'));
assert.deepEqual(Array.from(phrase.values),[1,2,1,2,3,4,5,6]);assert.equal(phrase.signature,'1,2,1,2,3,4,5,6');
assert.equal(phrase.rawLength,8);assert.equal(phrase.truncated,false);assert.equal(Object.isFrozen(phrase),true);assert.equal(Object.isFrozen(phrase.segments),true);assert.equal(Object.isFrozen(phrase.values),true);
assert.equal(phrases.createPhrase([],library),null);

const longNames=[{id:'a',name:'An exceptionally long first recipe',values:[1]},{id:'b',name:'Another exceptionally long second recipe',values:[2]}];
const name=phrases.phraseName([{recipeId:'a',repeat:1},{recipeId:'b',repeat:1}],longNames);
assert.ok(name.length<=32);assert.match(name,/→ \+1$/);

const sourceSnapshot=JSON.stringify(library);phrases.createPhrase(segments,library);phrases.compileSegments(segments,library);
assert.equal(JSON.stringify(library),sourceSnapshot,'phrase compilation must never mutate source recipes');
const project={};assert.deepEqual({...phrases.viewSnapshot(project),segments:Array.from(phrases.viewSnapshot(project).segments)}, {open:false,selectedRecipeId:null,segments:[],preview:false,name:'',recipeCount:0,phraseLength:0,truncated:false});
assert.equal(phrases.projectCanvasWrites,0);assert.equal(phrases.artworkUndoWrites,0);assert.equal(phrases.timelineTimingWrites,true);
assert.equal(phrases.projectSchemaWrites,0);assert.equal(phrases.deviceLibraryWrites,true);assert.equal(phrases.sourceRecipeWrites,0);assert.equal(phrases.randomWrites,0);
console.log('✅ deterministic timing phrase ordering, repeats, capping, period reduction, naming, source preservation, and isolation passed');
