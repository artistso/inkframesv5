// InkFrame Brush Engine V2 — tablet-first Brush Lab structure tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const web=resolve(here,'..');
const source=readFileSync(resolve(web,'brush-engine-v2/lab-ui.js'),'utf8');

function load(config){
  const sandbox={
    console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,
    InkFrameBuild:config,
    module:{exports:{}},
    exports:{},
  };
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source,sandbox,{filename:'lab-ui.js'});
  return sandbox.InkFrameBrushV2LabUI;
}

{
  const debug=load({variant:'debug',traceTools:true});
  assert.deepEqual(Array.from(debug.visibleGroups(),group=>group[0]),[
    'stabilizer','trail','stroke','safety','diagnostics',
  ]);
  assert.equal(debug.groupSummary('stabilizer',{stabilizerMode:'adaptive',stabilizerStrength:150}),'Adaptive · 150%');
  assert.equal(debug.groupSummary('trail',{ghostMode:'echo',ghostIntensity:82}),'Echo · 82%');
  assert.equal(debug.groupSummary('trail',{ghostMode:'off',ghostIntensity:82}),'Off');
  assert.equal(debug.groupSummary('stroke',{coverageMode:'ribbon',radiusMode:'guarded'}),'Ribbon · Guarded width');
  assert.equal(debug.groupSummary('safety',{contactMode:'strict'}),'Strict contact · Protected');
  assert.equal(debug.groupSummary('diagnostics',{}),'Debug trace tools');
}

{
  const release=load({variant:'release',traceTools:false});
  assert.deepEqual(Array.from(release.visibleGroups(),group=>group[0]),[
    'stabilizer','trail','stroke','safety',
  ]);
  assert.equal(release.groupSummary('diagnostics',{}),'Unavailable');
}

assert.match(source,/shell\.dataset\.layout='split'/);
assert.match(source,/workspace\.id='inkframe-v2-lab-workspace'/);
assert.match(source,/tabs\.setAttribute\('aria-orientation','vertical'\)/);
assert.match(source,/studioDetails\.className='inkframe-v2-studio-presets'/);
assert.doesNotMatch(source,/studioDetails\.open\s*=\s*true/);
assert.match(source,/button\.append\(iconNode,summaryNode,labelNode\)/);

console.log('✅ Brush Engine V2 tablet-first Brush Lab tests passed');
