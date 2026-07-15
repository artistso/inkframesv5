import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const box={console,Math,Number,String,Object,Array,Map,Set,WeakMap,JSON,setTimeout:()=>1,addEventListener:()=>{},module:{exports:{}}};
box.globalThis=box;vm.createContext(box);
vm.runInContext(readFileSync(resolve(here,'..','timeline-workspace.js'),'utf8'),box,{filename:'timeline-workspace.js'});
const workspace=box.InkFrameTimelineWorkspace;
assert.ok(workspace,'Timeline Workspace runtime did not install');

const state=workspace.normalizeTimelineState({
  frameCount:20,currentFrame:7,maxFrames:120,remainingFrames:100,
  selected:[3,4,5],targetCount:3,hold:2,mixedHold:false,loopEnabled:true,canInteract:true,
});
assert.deepEqual({...state,selected:[...state.selected]}, {
  frameCount:20,currentFrame:7,maxFrames:120,targetCount:3,remainingFrames:100,
  selected:[3,4,5],selectedCount:3,selectionStart:3,selectionEnd:5,
  hold:2,mixedHold:false,loopEnabled:true,canInteract:true,
});
assert.equal(workspace.selectionLabel(state),'3 selected · 3–5');
assert.equal(workspace.holdLabel(state),'×2');
assert.equal(workspace.selectionLabel(workspace.normalizeTimelineState({frameCount:8,currentFrame:4})),'Frame 4');
assert.equal(workspace.selectionLabel(workspace.normalizeTimelineState({frameCount:8,currentFrame:4,selected:[2,5]})),'2 selected');
assert.equal(workspace.holdLabel(workspace.normalizeTimelineState({mixedHold:true,hold:4})),'Mixed');
assert.equal(Object.isFrozen(state),true);assert.equal(Object.isFrozen(state.selected),true);

assert.equal(workspace.COMMANDS.length,12);
assert.deepEqual([...workspace.COMMANDS].filter(item=>item.name==='hold').map(item=>item.value),[1,2,3,4]);
assert.deepEqual([...new Set([...workspace.COMMANDS].map(item=>item.name))].sort(),['clearSelection','delete','duplicate','hold','holdDelta','pingPong','reverse','selectAll'].sort());

assert.equal(workspace.directFrameWrites,0);
assert.equal(workspace.directHoldWrites,0);
assert.equal(workspace.directSelectionWrites,0);
assert.equal(workspace.directProjectSchemaWrites,0);
assert.equal(workspace.archiveWrites,0);
assert.equal(workspace.storageWrites,0);
assert.equal(workspace.networkWrites,0);
assert.equal(workspace.delegatedTimelineCommands,true);
assert.equal(workspace.artworkReads,0);
assert.equal(workspace.projectNameReads,0);
console.log('✅ Timeline Workspace state, selection labels, hold model, command surface, and zero-direct-write contract passed');
