import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const sources=['radial-timeline.js','radial-timing-editor.js','radial-timing-patterns.js'];
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Symbol};
box.globalThis=box;vm.createContext(box);
for(const file of sources)vm.runInContext(readFileSync(resolve(here,'..',file),'utf8'),box,{filename:file});
const radial=box.InkFrameRadialTimeline,timing=box.InkFrameRadialTiming,patterns=box.InkFrameRadialPatterns;

assert.ok(radial&&timing&&patterns,'radial rhythm runtime did not install');
assert.equal(radial.__radialTimingPatched,true);assert.equal(radial.__radialPatternsPatched,true);
assert.equal(patterns.HISTORY_LIMIT,25,'timing Undo and Redo must retain exactly 25 transactions');
assert.deepEqual(Array.from(patterns.patterns,pattern=>pattern.id),['ones','twos','threes','snap','ease-in','ease-out']);
assert.deepEqual(Array.from(patterns.patternById('snap').values),[1,1,2,1]);
assert.equal(patterns.patternById('missing'),null);

let scope=patterns.resolveTargetIndices({framesLength:6,selectedFrames:new Set([4,2,99]),loopOn:true,loopIn:1,loopOut:5});
assert.equal(scope.kind,'selection');assert.deepEqual(Array.from(scope.indices),[2,4]);
scope=patterns.resolveTargetIndices({framesLength:6,selectedFrames:new Set(),loopOn:true,loopIn:4,loopOut:1});
assert.equal(scope.kind,'loop');assert.deepEqual(Array.from(scope.indices),[1,2,3,4]);
scope=patterns.resolveTargetIndices({framesLength:4,selectedFrames:new Set(),loopOn:false});
assert.equal(scope.kind,'all');assert.deepEqual(Array.from(scope.indices),[0,1,2,3]);
scope=patterns.resolveTargetIndices({framesLength:0});assert.equal(scope.kind,'none');assert.equal(scope.indices.length,0);

const assignments=patterns.assignmentsForPattern(patterns.patternById('snap'),[2,4,7,9,10],()=>8);
assert.deepEqual(Array.from(assignments,entry=>[entry.index,entry.before,entry.after]),[[2,8,1],[4,8,1],[7,8,2],[9,8,1],[10,8,1]]);
const phased=patterns.assignmentsForPattern(patterns.patternById('snap'),[0,1,2,3],()=>1,2);
assert.deepEqual(Array.from(phased,entry=>entry.after),[2,1,1,1]);
const changed=patterns.changedAssignments([{index:0,before:1,after:1},{index:1,before:1,after:2}]);
assert.deepEqual(Array.from(changed,entry=>entry.index),[1]);
const inverted=patterns.invertAssignments(assignments.slice(0,2));
assert.deepEqual(Array.from(inverted,entry=>[entry.index,entry.before,entry.after]),[[2,1,8],[4,1,8]]);

const project={};
assert.deepEqual({...patterns.viewSnapshot(project)},{open:false,preview:false,previewPatternId:null,undoDepth:0,redoDepth:0});
assert.equal(patterns.projectCanvasWrites,0);assert.equal(patterns.artworkUndoWrites,0);
assert.equal(patterns.timelineTimingWrites,true);assert.equal(patterns.projectSchemaWrites,0);
console.log('✅ radial timing patterns, 25-step history, automatic scopes, deterministic assignments, inversion, and isolation policy passed');
