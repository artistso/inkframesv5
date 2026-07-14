import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const memory=new Map();
const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
const sources=['radial-timeline.js','radial-timing-editor.js','radial-timing-patterns.js','radial-timing-recipes.js','radial-timing-variations.js'];
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Symbol,localStorage};
box.globalThis=box;vm.createContext(box);
for(const file of sources)vm.runInContext(readFileSync(resolve(here,'..',file),'utf8'),box,{filename:file});
const radial=box.InkFrameRadialTimeline,variations=box.InkFrameRadialVariations;

assert.ok(radial&&variations,'radial variation runtime did not install');
assert.equal(radial.__radialVariationsPatched,true);
assert.deepEqual(Array.from(variations.reverseValues([1,2,3])),[3,2,1]);
assert.deepEqual(Array.from(variations.palindromeValues([1,2,3])),[1,2,3,2,1]);
assert.deepEqual(Array.from(variations.pulseValues([1,2,3])),[2,1,4]);
assert.deepEqual(Array.from(variations.pulseValues([4])),[5,3]);
assert.deepEqual(Array.from(variations.compressValues([1,2,8])),[1,1,7]);
assert.deepEqual(Array.from(variations.expandValues([1,7,8])),[2,8,8]);

const generated=variations.generateVariations([1,2,3]);
assert.deepEqual(Array.from(generated,item=>item.id),['phase-0','phase-1','phase-2','reverse','palindrome','pulse','compress','expand']);
assert.deepEqual(Array.from(generated,item=>Array.from(item.values)),[
  [1,2,3],[2,3,1],[3,1,2],[3,2,1],[1,2,3,2,1],[2,1,4],[1,1,2],[2,3,4],
]);
assert.equal(new Set(Array.from(generated,item=>item.signature)).size,generated.length,'variation signatures must be unique');
assert.equal(Object.isFrozen(generated),true);assert.ok(generated.every(Object.isFrozen));

const flat=variations.generateVariations([2,2,2]);
assert.deepEqual(Array.from(flat,item=>item.id),['phase-0','pulse','compress','expand']);
assert.deepEqual(Array.from(flat,item=>Array.from(item.values)),[[2],[3,1],[1],[3]]);

const long=[1,1,2,1,3,1,4,1,5,1,6,1,7,1,8,2,3,4,5,6];
const longVariations=variations.generateVariations(long);
assert.equal(longVariations.filter(item=>item.kind==='phase').length,12,'phase family must remain visibly bounded');
assert.equal(variations.MAX_PHASE_VARIANTS,12);
assert.equal(variations.generateVariations([]).length,0);

const name=variations.variationName({name:'A very long timing recipe title'},{label:'Palindrome'});
assert.ok(name.includes('·'));assert.ok(name.length<=32);
const project={};assert.deepEqual({...variations.viewSnapshot(project)},{open:false,baseId:null,selectedVariationId:null,preview:false});
assert.equal(variations.projectCanvasWrites,0);assert.equal(variations.artworkUndoWrites,0);assert.equal(variations.timelineTimingWrites,true);
assert.equal(variations.projectSchemaWrites,0);assert.equal(variations.deviceLibraryWrites,true);assert.equal(variations.randomWrites,0);
console.log('✅ deterministic timing variation families, transforms, deduplication, bounds, naming, and isolation policy passed');
