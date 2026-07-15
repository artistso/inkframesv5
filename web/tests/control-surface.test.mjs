import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const box={
  console,Math,Number,String,Object,Array,Map,Set,WeakMap,JSON,RegExp,
  setTimeout:()=>1,addEventListener:()=>{},module:{exports:{}},
};
box.globalThis=box;vm.createContext(box);
vm.runInContext(readFileSync(resolve(here,'..','control-surface.js'),'utf8'),box,{filename:'control-surface.js'});
const surface=box.InkFrameControlSurface;
assert.ok(surface,'Control Surface runtime did not install');

const radial=surface.classifyDescriptor({tag:'div',className:'kid glass on',text:'Ink'});
assert.equal(radial.radial,true);
assert.equal(radial.selected,true);
assert.equal(radial.compact,true);

const transport=surface.classifyDescriptor({tag:'button',dataset:{action:'play'},text:'Play'});
assert.equal(transport.transport,true);
assert.equal(transport.role,'transport');

const danger=surface.classifyDescriptor({tag:'button',dataset:{layerCommand:'delete'},text:'Delete'});
assert.equal(danger.danger,true);
assert.equal(danger.role,'danger');

const nextBlend=surface.classifyDescriptor({tag:'button',dataset:{layerCommand:'blend'},text:'Next blend'});
assert.equal(nextBlend.transport,false);
const clearSelection=surface.classifyDescriptor({tag:'button',dataset:{timelineCommand:'clearSelection'},text:'Clear selection'});
assert.equal(clearSelection.danger,false);
const ariaDisabled=surface.classifyDescriptor({tag:'div',className:'custom',ariaDisabled:'true'});
assert.equal(ariaDisabled.disabled,true);

const standard=surface.classifyDescriptor({tag:'button',text:'Brush Lab'});
assert.equal(standard.radial,false);
assert.equal(standard.transport,false);
assert.equal(standard.danger,false);
assert.equal(standard.role,'standard');

const css=surface.css();
assert.match(css,/--ink-control-min-coarse:52px/);
assert.match(css,/:focus-visible/);
assert.match(readFileSync(resolve(here,'..','control-surface.js'),'utf8'),/pointerType/);
assert.match(css,/prefers-reduced-motion:reduce/);
assert.match(css,/\.ink-control--danger/);
assert.match(css,/\.ink-control--selected/);

for(const key of [
  'projectCanvasWrites','artworkWrites','artworkUndoWrites','timingWrites','layerWrites',
  'projectSchemaWrites','archiveWrites','storageWrites','networkWrites',
])assert.equal(surface[key],0,`${key} must remain zero`);

console.log('✅ Glass Horizon Control Surface role classification, tablet sizing, focus, motion, and zero-write contract passed');
