import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const box={console,Math,Number,String,Object,Array,Map,Set,WeakMap,JSON,module:{exports:{}},setTimeout:()=>0};
box.globalThis=box;vm.createContext(box);
vm.runInContext(readFileSync(resolve(here,'..','onion-skin-studio.js'),'utf8'),box,{filename:'onion-skin-studio.js'});
const studio=box.InkFrameOnionSkinStudio;
assert.ok(studio,'Onion Skin Studio runtime did not install');
assert.equal(studio.PRESETS.length,5);assert.deepEqual(Array.from(studio.PRESETS,item=>item.id),['clean','inbetween','rough','arc','layer']);
assert.equal(Object.isFrozen(studio.DEFAULTS),true);assert.equal(Object.isFrozen(studio.PRESETS),true);assert.equal(Object.isFrozen(studio.PRESETS[0]),true);

const normalized=studio.normalizeSettings({enabled:0,depth:99,pastOpacity:-1,futureOpacity:4,tint:8,layerOnly:1,pastColor:'#ABCDEF',futureColor:'bad'});
assert.deepEqual({...normalized},{enabled:true,depth:8,pastOpacity:.02,futureOpacity:.85,tint:1,layerOnly:false,pastColor:'#abcdef',futureColor:'#f7cac9'});
assert.equal(Object.isFrozen(normalized),true);

const base=studio.normalizeSettings({enabled:false,depth:7,pastOpacity:.6,futureOpacity:.4,tint:.1,layerOnly:false,pastColor:'#112233',futureColor:'#445566'});
const arc=studio.applyPreset(base,'arc');
assert.deepEqual({...arc},{enabled:true,depth:6,pastOpacity:.18,futureOpacity:.14,tint:.82,layerOnly:false,pastColor:'#112233',futureColor:'#445566'});
assert.equal(studio.matchingPreset(arc).id,'arc');
const layer=studio.applyPreset(base,'layer');assert.equal(layer.layerOnly,true);assert.equal(layer.depth,3);assert.equal(studio.matchingPreset(layer).id,'layer');
assert.deepEqual({...studio.applyPreset(base,'missing')},{...base},'unknown presets must preserve the current normalized values');

const signature=studio.settingsSignature(arc);assert.equal(signature,'1|6|0.180|0.140|0.820|0|#112233|#445566');
assert.equal(studio.projectCanvasWrites,0);assert.equal(studio.artworkUndoWrites,0);assert.equal(studio.projectSchemaWrites,0);assert.equal(studio.historyWrites,0);
assert.equal(studio.devicePreferenceWrites,true);assert.equal(studio.randomWrites,0);assert.equal(studio.networkWrites,0);
console.log('✅ Onion Skin Studio preset arithmetic, bounds, colors, immutability, and isolation passed');
