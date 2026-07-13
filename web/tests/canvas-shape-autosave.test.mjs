import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const autosavePath=resolve(here,'..','autosave.js');
const autosaveSource=readFileSync(autosavePath,'utf8');
const sandbox={console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Promise,setTimeout,clearTimeout,module:{exports:{}}};
sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(autosaveSource,sandbox,{filename:'autosave.js'});
const {normalizeCanvasShape}=sandbox.module.exports;

assert.equal(normalizeCanvasShape('circle'),'circle');
assert.equal(normalizeCanvasShape('square'),'square');
assert.equal(normalizeCanvasShape(undefined),'square');
assert.equal(normalizeCanvasShape('ellipse'),'square');
assert.ok(autosaveSource.includes('canvasShape: normalizeCanvasShape(P.canvasShape)'),'autosave serialization and restore must share canvas-shape normalization');
assert.equal((autosaveSource.match(/canvasShape: normalizeCanvasShape\(P\.canvasShape\)/g)||[]).length,2,'canvas shape must be normalized in both serialization and restore');
console.log('✅ Circular Canvas autosave normalization and legacy Square fallback passed');
