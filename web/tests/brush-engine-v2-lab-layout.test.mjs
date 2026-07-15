// InkFrame Brush Engine V2 — tablet-first Brush Lab structure tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const web=resolve(here,'..');
const source=readFileSync(resolve(web,'brush-engine-v2/lab-ui.js'),'utf8');
const performanceSource=readFileSync(resolve(web,'brush-engine-v2/performance-ui.js'),'utf8');

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

function loadPerformance(config,stats){
  const sandbox={
    console,Math,Date,JSON,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,
    InkFrameBuild:config,
    InkFrameBrushV2Adapter:{
      performanceStats:()=>Object.assign({},stats),
      sessionStats:()=>({implicitEnds:1}),
      ghostTrailStats:()=>({sessionsFinished:2}),
    },
    InkFrameBrushV2InputBridge:{stats:()=>({emitted:18})},
    module:{exports:{}},
    exports:{},
  };
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(performanceSource,sandbox,{filename:'performance-ui.js'});
  return sandbox.InkFrameBrushV2PerformanceUI;
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

{
  const stats={
    frames:4,queuedEvents:20,processedEvents:18,compactedEvents:2,liveRenders:4,
    stampHits:9,stampMisses:1,stampFallbacks:0,paintedDabs:100,ribbonLines:20,
    active:false,queued:3,stampCacheSize:12,maxEventsPerFrame:48,frameBudgetMs:5,
  };
  const debug=loadPerformance({variant:'debug',diagnostics:true,traceTools:true,defaultBrushEngine:'v2'},stats);
  assert.equal(debug.enabled(),true);
  const snapshot=debug.capture();
  assert.equal(snapshot.performance.processedEvents,18);
  assert.equal(snapshot.input.emitted,18);
  assert.equal(snapshot.session.implicitEnds,1);
  assert.equal(snapshot.ghost.sessionsFinished,2);
  const formatted=debug.formatStats(snapshot,null);
  assert.equal(formatted.queue,'3');
  assert.equal(formatted.eventsPerFrame,'4.50');
  assert.equal(formatted.compactedEvents,'2');
  assert.equal(formatted.stampHitRate,'90.0%');
  assert.equal(formatted.stampCache,'12 / 96');
  assert.equal(formatted.framePolicy,'48 events / 5.0 ms');
  assert.equal(formatted.status,'Backlog compacted');

  const baseline={performance:{frames:1,queuedEvents:5,processedEvents:4,compactedEvents:1,liveRenders:1,stampHits:2,stampMisses:0,paintedDabs:10,ribbonLines:2}};
  const delta=debug.formatStats(snapshot,baseline);
  assert.equal(delta.frames,'3');
  assert.equal(delta.queuedEvents,'15');
  assert.equal(delta.processedEvents,'14');
  assert.equal(delta.compactedEvents,'1');
}

{
  const release=loadPerformance({variant:'release',diagnostics:false,traceTools:false},{});
  assert.equal(release.enabled(),false);
  assert.equal(release.install(),false);
}

assert.match(source,/shell\.dataset\.layout='split'/);
assert.match(source,/workspace\.id='inkframe-v2-lab-workspace'/);
assert.match(source,/tabs\.setAttribute\('aria-orientation','vertical'\)/);
assert.match(source,/studioDetails\.className='inkframe-v2-studio-presets'/);
assert.doesNotMatch(source,/studioDetails\.open\s*=\s*true/);
assert.match(source,/button\.append\(iconNode,summaryNode,labelNode\)/);
assert.match(performanceSource,/inkframe-v2-performance-diagnostics/);
assert.match(performanceSource,/Metrics refresh after stroke termination/);
assert.doesNotMatch(performanceSource,/setInterval/);
assert.doesNotMatch(performanceSource,/setTimeout\(tick/);
assert.doesNotMatch(performanceSource,/localStorage/);
assert.doesNotMatch(performanceSource,/fetch\(/);

console.log('✅ Brush Engine V2 tablet-first Brush Lab and debug performance diagnostics tests passed');
