// InkFrame Brush Engine V2 — custom preset library tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const sandbox={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
for(const file of ['brush-engine-v2/tuning.js','brush-engine-v2/user-presets.js']){
  vm.runInContext(readFileSync(resolve(root,file),'utf8'),sandbox,{filename:file});
}
const V2=sandbox.InkFrameBrushV2;

function storage(){
  const values=new Map();
  return {values,getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value))};
}

{
  const dirty={
    schema:999,
    presets:Array.from({length:30},(_,index)=>({
      id:'x'.repeat(48),
      name:'N'.repeat(32),
      tuning:{stabilizerStrength:999,ghostIntensity:-20,ghostDurationMs:99999,ghostWidthPercent:999,coverageMode:'bad',radiusMode:'bad',contactMode:'bad'},
    })),
    pinned:['x'.repeat(48),'missing','x'.repeat(48)],
  };
  const clean=V2.sanitizeUserPresetLibrary(dirty,1000);
  assert.equal(clean.schema,1);
  assert.equal(clean.presets.length,24);
  assert.equal(new Set(clean.presets.map(item=>item.id)).size,24);
  assert.equal(new Set(clean.presets.map(item=>item.name.toLowerCase())).size,24);
  assert.equal(clean.presets[0].tuning.stabilizerStrength,200);
  assert.equal(clean.presets[0].tuning.ghostIntensity,0);
  assert.equal(clean.presets[0].tuning.ghostDurationMs,1200);
  assert.equal(clean.presets[0].tuning.ghostWidthPercent,250);
  assert.equal(clean.presets[0].tuning.coverageMode,'ribbon');
  assert.equal(clean.presets[0].tuning.radiusMode,'guarded');
  assert.equal(clean.presets[0].tuning.contactMode,'raw');
  assert.deepEqual(Array.from(clean.pinned),[clean.presets[0].id]);
}

{
  let clock=10;
  let id=0;
  const memory=storage();
  const store=V2.createUserPresetStore(memory,{now:()=>++clock,makeId:()=>`slot-${++id}`});
  const first=store.save('My Ink',{stabilizerStrength:150,ghostMode:'echo'},true);
  assert.equal(first.name,'My Ink');
  assert.equal(first.tuning.stabilizerStrength,150);
  assert.equal(first.tuning.ghostMode,'echo');
  assert.deepEqual(Array.from(store.snapshot().pinned),[first.id]);

  const updated=store.save('  My   Ink  ',{stabilizerStrength:200,ghostMode:'comet'},true);
  assert.equal(updated.id,first.id,'duplicate names should update the existing preset');
  assert.equal(store.snapshot().presets.length,1);
  assert.equal(updated.tuning.stabilizerStrength,200);
  assert.equal(updated.tuning.ghostMode,'comet');

  for(let index=0;index<5;index++)store.save(`Preset ${index}`,{stabilizerStrength:index*10},true);
  const pinned=store.snapshot().pinned;
  assert.equal(pinned.length,4);
  assert.equal(pinned.includes(first.id),false,'oldest pin should roll out when a fifth preset is pinned');

  const exported=store.exportJson();
  const restored=V2.createUserPresetStore(storage(),{now:()=>500,makeId:()=>`restored-${++id}`});
  restored.importJson(exported);
  assert.equal(restored.snapshot().presets.length,6);
  assert.equal(restored.snapshot().pinned.length,4);

  const target=restored.snapshot().presets[0];
  assert.equal(restored.rename(target.id,'Renamed'),true);
  assert.equal(restored.find(target.id).name,'Renamed');
  assert.equal(restored.rename(target.id,'Preset 0'),false,'rename must reject duplicate names');
  assert.equal(restored.remove(target.id),true);
  assert.equal(restored.find(target.id),null);
  assert.equal(restored.snapshot().pinned.includes(target.id),false);
  assert.ok(memory.values.get(V2.USER_PRESET_STORAGE_KEY),'store should persist to local storage');
}

{
  const direct=V2.presetValue('direct');
  const custom=Object.assign({},direct,{preset:'custom'});
  assert.equal(V2.tuningPresetSignature(direct),V2.tuningPresetSignature(custom),'preset labels must not change tuning identity');
}

{
  const store=V2.createUserPresetStore(storage(),{now:()=>1,makeId:()=> 'same-id'});
  store.save('One',{},false);
  store.save('Two',{},false);
  const ids=store.snapshot().presets.map(item=>item.id);
  assert.deepEqual(Array.from(ids),['same-id','same-id-2']);
}

console.log('✅ Brush Engine V2 custom preset library tests passed');
