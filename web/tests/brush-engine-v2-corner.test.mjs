// InkFrame Brush Engine V2 — corner-preserving stabilizer tests
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
  'brush-engine-v2/stabilizer.js',
  'brush-engine-v2/tuning.js',
]) vm.runInContext(readFileSync(resolve(root,file),'utf8'),sandbox,{filename:file});
const V2=sandbox.InkFrameBrushV2;
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);

// Heading measurement is bounded and ignores segments below the physical floor.
{
  near(V2.segmentTurnRadians(10,0,0,10,0.5),Math.PI/2);
  near(V2.segmentTurnRadians(10,0,-10,0,0.5),Math.PI);
  assert.equal(V2.segmentTurnRadians(10,0,0.1,0.1,0.75),0);
}

// Straight motion is byte-identical with corner preservation enabled or disabled.
{
  function run(cornerMode){
    const f=V2.createPositionStabilizer({
      mode:'adaptive',slowTimeConstantMs:22,fastTimeConstantMs:3,
      speedStartPxPerMs:0.1,speedEndPxPerMs:4,speedSmoothingTimeConstantMs:12,
      cornerMode,cornerStrength:1,cornerTimeConstantMs:1,
    });
    const output=[f.reset({x:0,y:0,time:0})];
    for(const p of [[20,0,10],[40,0,20],[60,0,30],[80,0,40]])output.push(f.update({x:p[0],y:p[1],time:p[2]}));
    return JSON.parse(JSON.stringify({output,stats:f.stats()}));
  }
  const smooth=run('smooth');
  const preserve=run('preserve');
  assert.deepEqual(preserve.output,smooth.output);
  assert.equal(preserve.stats.cornerActivations,0);
  assert.equal(preserve.stats.maximumCornerFactor,0);
}

// A deliberate right-angle turn receives a one-sample bounded lag release.
{
  function run(cornerMode){
    const f=V2.createPositionStabilizer({
      mode:'adaptive',slowTimeConstantMs:24,fastTimeConstantMs:4,
      speedStartPxPerMs:0.1,speedEndPxPerMs:6,speedSmoothingTimeConstantMs:10,
      cornerMode,cornerStrength:1,cornerStartRadians:0.2,cornerEndRadians:1.8,
      cornerTimeConstantMs:1,cornerMinimumSegmentPx:0.75,
    });
    f.reset({x:0,y:0,time:0});
    f.update({x:30,y:0,time:10});
    f.update({x:60,y:0,time:20});
    const corner=f.update({x:60,y:30,time:30});
    return {corner,stats:f.stats()};
  }
  const smooth=run('smooth');
  const preserve=run('preserve');
  const smoothError=Math.hypot(60-smooth.corner.x,30-smooth.corner.y);
  const preserveError=Math.hypot(60-preserve.corner.x,30-preserve.corner.y);
  assert.ok(preserveError<smoothError,`${preserveError} should be below ${smoothError}`);
  assert.ok(preserve.corner.x>=0&&preserve.corner.x<=60);
  assert.ok(preserve.corner.y>=0&&preserve.corner.y<=30);
  assert.equal(preserve.stats.cornerActivations,1);
  assert.ok(preserve.stats.cornerFactor>0.4);
  assert.ok(preserve.stats.timeConstantMs<preserve.stats.baseTimeConstantMs);
}

// Tiny hand jitter cannot replace the established direction or trigger a corner.
{
  const f=V2.createPositionStabilizer({
    mode:'adaptive',cornerMode:'preserve',cornerStrength:1,
    cornerMinimumSegmentPx:0.75,cornerStartRadians:0.2,cornerEndRadians:1.8,
  });
  f.reset({x:0,y:0,time:0});
  f.update({x:10,y:0,time:10});
  f.update({x:10.1,y:0.1,time:20});
  f.update({x:20,y:0,time:30});
  assert.equal(f.stats().cornerActivations,0);
}

// Same polyline and configuration replay deterministically.
{
  function run(){
    const f=V2.createPositionStabilizer({
      mode:'adaptive',cornerMode:'preserve',cornerStrength:0.7,
      cornerTimeConstantMs:1.75,
    });
    const output=[f.reset({x:0,y:0,time:0})];
    for(const p of [[20,0,8],[40,0,16],[40,20,24],[40,40,32],[60,40,40]])output.push(f.update({x:p[0],y:p[1],time:p[2]}));
    return JSON.parse(JSON.stringify({output,stats:f.stats()}));
  }
  assert.deepEqual(run(),run());
}

// Older tuning objects and v2 storage migrate to Smooth; new presets opt in.
{
  assert.equal(V2.normalizeTuning({stabilizerMode:'adaptive',stabilizerStrength:55}).cornerMode,'smooth');
  assert.equal(V2.presetValue('direct').cornerMode,'preserve');
  assert.equal(V2.presetValue('balanced').cornerMode,'preserve');
  assert.equal(V2.presetValue('smooth').cornerMode,'preserve');
  const memory=new Map([[V2.PREVIOUS_STORAGE_KEY,JSON.stringify({
    preset:'balanced',stabilizerMode:'adaptive',stabilizerStrength:55,
  })]]);
  const storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
  const store=V2.createTuningStore(storage);
  assert.equal(store.snapshot().cornerMode,'smooth');
  assert.ok(memory.has(V2.STORAGE_KEY));
}

// Tuning coefficients remain bounded and explicit.
{
  const options=V2.tuningFilterOptions(V2.presetValue('balanced'));
  assert.equal(options.cornerMode,'preserve');
  assert.equal(options.cornerStrength,0.7);
  assert.ok(options.cornerTimeConstantMs>0);
  assert.ok(options.cornerMinimumSegmentPx>0);
}

console.log('✅ Brush Engine V2 corner-preservation tests passed');
