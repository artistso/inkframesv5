import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const memory=new Map();
const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
const sources=['radial-timeline.js','radial-timing-editor.js','radial-timing-patterns.js','radial-timing-recipes.js','radial-timing-variations.js','radial-timing-morph.js'];
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Symbol,localStorage};
box.globalThis=box;vm.createContext(box);
for(const file of sources)vm.runInContext(readFileSync(resolve(here,'..',file),'utf8'),box,{filename:file});
const radial=box.InkFrameRadialTimeline,morph=box.InkFrameRadialMorph;

assert.ok(radial&&morph,'radial timing morph runtime did not install');
assert.equal(radial.__radialMorphPatched,true);
assert.equal(morph.greatestCommonDivisor(6,4),2);
assert.equal(morph.alignmentLength(2,3),6);
assert.equal(morph.alignmentLength(13,17),120,'alignment must remain bounded when exact LCM exceeds the device limit');
assert.equal(morph.MAX_ALIGNED_VALUES,120);
assert.deepEqual(Array.from(morph.expandValues([1,2],6)),[1,2,1,2,1,2]);
assert.deepEqual(Array.from(morph.expandValues([],6)),[]);

const sourceA=[1,3],sourceB=[5,7,2];
assert.deepEqual(Array.from(morph.blendValues(sourceA,sourceB,0)),sourceA,'zero percent must reproduce source A');
assert.deepEqual(Array.from(morph.blendValues(sourceA,sourceB,100)),sourceB,'one hundred percent must reproduce source B');
assert.deepEqual(Array.from(morph.blendValues(sourceA,sourceB,50)),[3,5,2,4,4,3]);
assert.deepEqual(Array.from(morph.blendValues(sourceA,sourceB,25)),[2,4,1,4,3,3]);
assert.deepEqual(Array.from(morph.blendValues(sourceA,sourceB,25)),Array.from(morph.blendValues(sourceB,sourceA,75)),'swapping sources with complementary mix must preserve output');
assert.deepEqual(Array.from(morph.blendValues([1,1],[3,3],50)),[2],'blends must reduce to their smallest exact period');
assert.deepEqual(Array.from(morph.blendValues([1],[8],50)),[5]);
assert.deepEqual(Array.from(morph.blendValues([],sourceB,50)),[]);
assert.equal(morph.clampMix(-10),0);assert.equal(morph.clampMix(111),100);assert.equal(morph.clampMix(49.6),50);
assert.deepEqual(Array.from(morph.SNAP_POINTS),[0,25,50,75,100]);

const recipeA={id:'a',name:'A very long timing source alpha',values:sourceA};
const recipeB={id:'b',name:'A second extremely long source beta',values:sourceB};
const blend=morph.createBlend(recipeA,recipeB,25);
assert.ok(blend);assert.equal(blend.mix,25);assert.equal(blend.sourceAId,'a');assert.equal(blend.sourceBId,'b');assert.equal(blend.alignmentLength,6);
assert.deepEqual(Array.from(blend.values),[2,4,1,4,3,3]);assert.equal(Object.isFrozen(blend),true);assert.equal(Object.isFrozen(blend.values),true);
assert.ok(blend.label.includes('↔'));assert.match(blend.label,/· 25%$/);assert.ok(blend.label.length<=32);
assert.equal(morph.createBlend(null,recipeB,50),null);

const project={};assert.deepEqual({...morph.viewSnapshot(project)},{open:false,sourceAId:null,sourceBId:null,mix:50,preview:false,recipeCount:0});
assert.equal(morph.projectCanvasWrites,0);assert.equal(morph.artworkUndoWrites,0);assert.equal(morph.timelineTimingWrites,true);
assert.equal(morph.projectSchemaWrites,0);assert.equal(morph.deviceLibraryWrites,true);assert.equal(morph.sourceRecipeWrites,0);assert.equal(morph.randomWrites,0);
console.log('✅ deterministic timing morph alignment, interpolation, symmetry, naming, bounds, and isolation policy passed');
