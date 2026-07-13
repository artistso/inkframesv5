import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const box={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Symbol,Promise,setTimeout,clearTimeout,module:{exports:{}}};
box.globalThis=box;vm.createContext(box);
vm.runInContext(readFileSync(resolve(here,'..','radial-rhythm-composer.js'),'utf8'),box,{filename:'radial-rhythm-composer.js'});
const composer=box.module.exports;
assert.ok(composer,'custom rhythm composer did not install');
assert.equal(composer.STORAGE_KEY,'inkframe.radial.customRhythms.v1');
assert.deepEqual(Array.from(composer.normalizeSequence([0,9,2.4])),[1,8,2]);
assert.deepEqual(Array.from(composer.normalizeSequence([])),[1]);
assert.deepEqual(Array.from(composer.minimalPeriod([1,2,1,2,1,2])),[1,2]);
assert.deepEqual(Array.from(composer.minimalPeriod([3,3,2,2,1,1])),[3,3,2,2,1,1]);
assert.deepEqual(Array.from(composer.minimalPeriod([1,2,3,4,5,6,7,8,1,2,3,4,5],12)),[1,2,3,4,5,6,7,8,1,2,3,4]);

const dirty={schema:99,rhythms:[
  {id:'bad id',name:'  Bounce  ',values:[0,2,99]},
  {id:'bad id',name:'bounce',values:[]},
],pinned:['badid','badid','missing']};
const sanitized=composer.sanitizeLibrary(dirty,100);
assert.equal(sanitized.schema,1);assert.equal(sanitized.rhythms.length,2);
assert.deepEqual(sanitized.rhythms.map(item=>item.id),['badid','badid-2']);
assert.deepEqual(sanitized.rhythms.map(item=>item.name),['Bounce','bounce 2']);
assert.deepEqual(sanitized.rhythms[0].values,[1,2,8]);assert.deepEqual(sanitized.rhythms[1].values,[1]);
assert.deepEqual(sanitized.pinned,['badid']);

const memory=new Map();const storage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,value)};
let now=1000,id=0;const store=composer.createCustomRhythmStore(storage,{now:()=>++now,makeId:()=>`custom-${++id}`});
let item=store.save('Bounce',[1,2],true);assert.equal(item.name,'Bounce');assert.deepEqual(item.values,[1,2]);
assert.deepEqual(store.snapshot().pinned,[item.id]);assert.ok(memory.has(composer.STORAGE_KEY));
item=store.save('bounce',[3,1],false);assert.equal(store.snapshot().rhythms.length,1,'case-insensitive save must update');assert.deepEqual(item.values,[3,1]);
assert.equal(store.rename(item.id,'Pulse'),true);assert.equal(store.find(item.id).name,'Pulse');
assert.equal(store.togglePin(item.id),false);assert.deepEqual(store.snapshot().pinned,[]);
assert.equal(store.togglePin(item.id),true);assert.deepEqual(store.snapshot().pinned,[item.id]);
const exported=store.exportJson();const imported=composer.createCustomRhythmStore(null,{now:()=>5000,makeId:()=>`import-${++id}`});
imported.importJson(exported);assert.deepEqual(imported.snapshot().rhythms.map(value=>({name:value.name,values:value.values})),[{name:'Pulse',values:[3,1]}]);
assert.equal(store.remove(item.id),true);assert.equal(store.snapshot().rhythms.length,0);assert.equal(store.remove(item.id),false);

const bounded=composer.createCustomRhythmStore(null,{now:()=>6000,makeId:()=>`bounded-${++id}`});
for(let index=0;index<composer.MAX_RHYTHMS;index++)bounded.save(`Rhythm ${index+1}`,[index%8+1],index<composer.MAX_PINNED);
assert.equal(bounded.snapshot().rhythms.length,composer.MAX_RHYTHMS);assert.equal(bounded.snapshot().pinned.length,composer.MAX_PINNED);
assert.throws(()=>bounded.save('Overflow',[1]),/Maximum 24 rhythms reached/);

const brokenStorage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
const resilient=composer.createCustomRhythmStore(brokenStorage,{now:()=>7000,makeId:()=>`safe-${++id}`});
assert.doesNotThrow(()=>resilient.save('Offline',[2,1]));assert.equal(resilient.snapshot().rhythms.length,1);
assert.equal(composer.projectCanvasWrites,0);assert.equal(composer.artworkUndoWrites,0);assert.equal(composer.timelineTimingWrites,true);assert.equal(composer.projectSchemaWrites,0);assert.equal(composer.appLibraryWrites,true);
console.log('✅ custom radial rhythm normalization, bounded library, persistence, pinning, import/export, and isolation passed');
