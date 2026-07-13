// InkFrame Brush Engine V2 — adaptive stabilizer regression tests
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
for(const file of [
  'brush-engine-v2/sample.js',
  'brush-engine-v2/stabilizer.js',
  'brush-engine-v2/filters.js',
  'brush-engine-v2/tuning.js',
]) vm.runInContext(readFileSync(resolve(root,file),'utf8'),sandbox,{filename:file});
const V2=sandbox.InkFrameBrushV2;
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);

// Fixed mode remains the historical time-constant EMA.
{
  const f=V2.createStrokeFilter({stabilizerMode:'fixed',positionTimeConstantMs:8});
  f.begin({x:0,y:0,time:0,pressure:0.5,tiltX:0,tiltY:0,altitude:1,azimuth:0});
  const out=f.update({x:100,y:0,time:8,pressure:0.5,tiltX:0,tiltY:0,altitude:1,azimuth:0});
  near(out.x,100*(1-Math.exp(-1)),1e-9);
  assert.equal(f.snapshot().stabilizer.mode,'fixed');
}

// Adaptive mode smooths slow detail more strongly, then settles to lower lag
// than the historical fixed filter during sustained fast movement.
{
  const adaptive=V2.createPositionStabilizer({
    mode:'adaptive',slowTimeConstantMs:24,fastTimeConstantMs:3,
    speedStartPxPerMs:0.1,speedEndPxPerMs:3,speedSmoothingTimeConstantMs:8,
  });
  const fixed=V2.createPositionStabilizer({mode:'fixed',fixedTimeConstantMs:8});
  adaptive.reset({x:0,y:0,time:0}); fixed.reset({x:0,y:0,time:0});
  const aSlow=adaptive.update({x:1,y:0,time:10});
  const fSlow=fixed.update({x:1,y:0,time:10});
  assert.ok(aSlow.x<fSlow.x,'adaptive should clean slow movement more strongly');
  let aFast=aSlow, fFast=fSlow;
  for(const [x,time] of [[101,20],[201,30],[301,40],[401,50]]){
    aFast=adaptive.update({x,y:0,time});
    fFast=fixed.update({x,y:0,time});
  }
  assert.ok(401-aFast.x<401-fFast.x,'adaptive should release lag during sustained fast movement');
  const stats=adaptive.stats();
  assert.ok(stats.minimumTimeConstantMs>=3-1e-9);
  assert.ok(stats.maximumTimeConstantMs<=24+1e-9);
}

// The exact linear-input response makes constant-speed motion converge across
// event rates instead of depending on how often WebView samples the same line.
{
  function run(step){
    const f=V2.createPositionStabilizer({
      mode:'adaptive',slowTimeConstantMs:20,fastTimeConstantMs:3,
      speedStartPxPerMs:0.1,speedEndPxPerMs:4,speedSmoothingTimeConstantMs:20,
    });
    let out=f.reset({x:0,y:0,time:0});
    for(let t=step;t<=160;t+=step)out=f.update({x:t*0.75,y:0,time:t});
    return {out,stats:f.stats()};
  }
  const low=run(16),high=run(4);
  near(low.out.x,high.out.x,1e-7);
  near(low.stats.timeConstantMs,high.stats.timeConstantMs,1e-7);
}

// Same input and configuration replay identically.
{
  function run(){
    const f=V2.createPositionStabilizer({mode:'adaptive',slowTimeConstantMs:22,fastTimeConstantMs:4});
    const output=[f.reset({x:0,y:0,time:0})];
    for(const p of [[2,1,8],[7,2,16],[30,5,24],[31,6,32]])output.push(f.update({x:p[0],y:p[1],time:p[2]}));
    return JSON.parse(JSON.stringify({output,stats:f.stats()}));
  }
  assert.deepEqual(run(),run());
}

// Old traces and old saved tuning remain fixed; new presets opt into adaptive.
{
  assert.equal(V2.normalizeTuning({positionTimeConstantMs:9}).stabilizerMode,'fixed');
  assert.equal(V2.presetValue('balanced').stabilizerMode,'adaptive');
  assert.equal(V2.presetValue('balanced').stabilizerStrength,55);
  const memory=new Map([[V2.LEGACY_STORAGE_KEY,JSON.stringify({preset:'balanced',positionTimeConstantMs:11})]]);
  const storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
  const store=V2.createTuningStore(storage);
  assert.equal(store.snapshot().stabilizerMode,'fixed');
  assert.equal(store.snapshot().positionTimeConstantMs,11);
  assert.ok(memory.has(V2.STORAGE_KEY));
}

// Strength maps only to bounded deterministic filter coefficients.
{
  const direct=V2.tuningFilterOptions(V2.presetValue('direct'));
  const smooth=V2.tuningFilterOptions(V2.presetValue('smooth'));
  assert.equal(direct.stabilizerMode,'adaptive');
  assert.ok(smooth.positionSlowTimeConstantMs>direct.positionSlowTimeConstantMs);
  assert.ok(smooth.positionFastTimeConstantMs>direct.positionFastTimeConstantMs);
  assert.ok(smooth.stabilizerSpeedEndPxPerMs>direct.stabilizerSpeedEndPxPerMs);
}

console.log('✅ Brush Engine V2 adaptive stabilizer tests passed');
