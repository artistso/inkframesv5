import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const box={console,Math,Number,String,Object,Array,Map,Set,WeakMap,JSON,setTimeout:()=>1,addEventListener:()=>{},module:{exports:{}}};
box.globalThis=box;vm.createContext(box);
vm.runInContext(readFileSync(resolve(here,'..','layer-workspace.js'),'utf8'),box,{filename:'layer-workspace.js'});
const workspace=box.InkFrameLayerWorkspace;
assert.ok(workspace,'Layer Workspace runtime did not install');

const state=workspace.normalizeLayerState({count:4,active:2,visible:false,opacity:73.6,blend:'Multiply',canInteract:true});
assert.deepEqual({...state},{
  count:4,active:2,background:false,visible:false,opacity:74,blend:'Multiply',canInteract:true,
  canSelectAbove:true,canSelectBelow:true,canMoveUp:true,canMoveDown:true,canDelete:true,canMergeDown:true,
});
assert.equal(workspace.layerLabel(state),'2 / 4');
assert.equal(workspace.countLabel(state),'4 frame layers + BG');
assert.equal(workspace.visibilityLabel(state),'Hidden');
assert.equal(workspace.visibilityLabel(workspace.normalizeLayerState({count:1,active:1,visible:true})),'Visible');
assert.equal(workspace.normalizeLayerState({count:1,active:9,opacity:900}).active,1);
assert.equal(workspace.normalizeLayerState({count:1,active:1,opacity:900}).opacity,100);
assert.equal(workspace.normalizeLayerState({count:1,active:1,opacity:-20}).opacity,0);
assert.equal(workspace.normalizeLayerState({count:1,active:1}).canDelete,false);
assert.equal(workspace.normalizeLayerState({count:3,active:1}).canMergeDown,false);
assert.equal(workspace.normalizeLayerState({count:3,active:3}).canMoveUp,false);

const background=workspace.normalizeLayerState({count:3,active:2,background:true,visible:true,opacity:50,blend:'Screen'});
assert.equal(background.active,0);
assert.equal(workspace.layerLabel(background),'Static BG');
assert.equal(workspace.countLabel(background),'3 frame layers + BG');
assert.equal(background.canSelectAbove,true);
assert.equal(background.canSelectBelow,false);
assert.equal(background.canMoveUp,false);
assert.equal(background.canMoveDown,false);
assert.equal(background.canDelete,false);
assert.equal(background.canMergeDown,false);
assert.equal(Object.isFrozen(state),true);

assert.equal(workspace.COMMANDS.length,15);
assert.deepEqual([...workspace.COMMANDS].filter(item=>item.name==='opacity').map(item=>item.value),[25,50,75,100]);
assert.deepEqual([...new Set([...workspace.COMMANDS].map(item=>item.name))].sort(),['add','background','blend','delete','duplicate','mergeDown','moveDown','moveUp','opacity','selectAbove','selectBelow','visibility'].sort());

assert.equal(workspace.directLayerWrites,0);
assert.equal(workspace.directCanvasWrites,0);
assert.equal(workspace.directOrderWrites,0);
assert.equal(workspace.directProjectSchemaWrites,0);
assert.equal(workspace.archiveWrites,0);
assert.equal(workspace.storageWrites,0);
assert.equal(workspace.networkWrites,0);
assert.equal(workspace.delegatedLayerCommands,true);
assert.equal(workspace.artworkReads,0);
assert.equal(workspace.layerNameReads,0);
assert.equal(workspace.projectNameReads,0);
console.log('✅ Layer Workspace frame/static-background state, boundaries, opacity presets, command surface, and zero-direct-write contract passed');
