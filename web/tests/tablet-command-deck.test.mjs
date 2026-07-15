import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const store=new Map();
const box={
  console,Math,Number,String,Object,Array,Map,Set,WeakMap,JSON,
  innerWidth:1400,
  matchMedia:query=>({matches:query==='(pointer: coarse)'}),
  localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value))},
  setTimeout:()=>1,setInterval:()=>1,addEventListener:()=>{},
  module:{exports:{}},
};
box.globalThis=box;vm.createContext(box);
vm.runInContext(readFileSync(resolve(here,'..','tablet-command-deck.js'),'utf8'),box,{filename:'tablet-command-deck.js'});
const deck=box.InkFrameTabletDeck;
assert.ok(deck,'Tablet Command Deck runtime did not install');

const normalized=deck.normalizeSnapshot({
  brush:{id:'ink\u0000',engine:'v2',activeStroke:true},
  timeline:{frameCount:12.4,currentFrame:4.2,fps:900,playing:true},
  layers:{count:3.4,active:2.4},onion:{enabled:true},
});
assert.deepEqual({...normalized.brush},{id:'ink',engine:'v2',activeStroke:true});
assert.deepEqual({...normalized.timeline},{frameCount:12,currentFrame:4,fps:60,playing:true});
assert.deepEqual({...normalized.layers},{count:3,active:2});
assert.equal(normalized.onion.enabled,true);
assert.equal(Object.isFrozen(normalized),true);
assert.equal(Object.isFrozen(normalized.timeline),true);

const defaults=deck.loadPreferences();
assert.deepEqual(defaults,{visible:true,expanded:true});
assert.equal(deck.savePreferences({visible:false,expanded:true}),true);
assert.equal(store.size,1);
assert.equal(store.has(deck.PREF_KEY),true);
assert.deepEqual(deck.loadPreferences(),{visible:false,expanded:true});
assert.deepEqual([...deck.MODE_LABELS],['Brushes','Frames','Layers','Actions']);

assert.equal(deck.projectCanvasWrites,0);
assert.equal(deck.artworkUndoWrites,0);
assert.equal(deck.timingHistoryWrites,0);
assert.equal(deck.projectSchemaWrites,0);
assert.equal(deck.archiveWrites,0);
assert.equal(deck.storageWrites,'device-ui-preference-only');
assert.equal(deck.networkWrites,0);
assert.equal(deck.artworkReads,0);
assert.equal(deck.projectNameReads,0);
console.log('✅ Tablet Command Deck normalization, device-only preference, bounds, and zero-project-write contract passed');
