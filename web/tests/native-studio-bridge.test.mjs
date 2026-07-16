// InkFrame full-studio native canvas bridge contract
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}

const here=dirname(fileURLToPath(import.meta.url));
const web=resolve(here,'..');
const root=resolve(web,'..');
const source=readFileSync(resolve(web,'native-studio-bridge.js'),'utf8');
const injector=readFileSync(resolve(root,'tools/inject-brush-v2-index.mjs'),'utf8');
const studioSource=readFileSync(resolve(web,'index.html'),'utf8');
const manifest=readFileSync(resolve(root,'app/src/main/AndroidManifest.xml'),'utf8');

const dom=new JSDOM('<!doctype html><html><body><canvas id="c" width="1000" height="500"></canvas></body></html>',{
  runScripts:'outside-only',
  pretendToBeVisual:true,
  url:'file:///android_asset/index.html',
});
const {window}=dom;
const canvas=window.document.getElementById('c');
canvas.getBoundingClientRect=()=>({left:100,top:40,width:800,height:400,right:900,bottom:440});
Object.defineProperty(window,'innerWidth',{value:1200,configurable:true});
Object.defineProperty(window,'innerHeight',{value:700,configurable:true});

const configurations=[];
window.InkFrameStudioNativeBridge={
  configureCanvas(value){configurations.push(JSON.parse(String(value)));},
};
const calls=[];
window.InkFrameBrushV2InputBridge={
  begin(event,env){calls.push(['begin',event,env]);return true;},
  move(event){calls.push(['move',event]);return true;},
  end(event){calls.push(['end',event]);return true;},
};
const brushEnvironment={id:'existing-project-environment'};
window.InkFrameNativeStudioEnvironment=()=>({
  canvas,
  brushEnvironment,
  width:1000,
  height:500,
  brushId:'soft-pen',
  color:'#ff4f91',
  size:24,
  opacity:.75,
  canvasShape:'circle',
  projectIndex:2,
  frameIndex:7,
  contextToken:'2|7|1000|500|soft-pen|#ff4f91|24|0.75|circle',
  supported:true,
});
window.eval(source);
await new Promise(resolveWait=>window.requestAnimationFrame(resolveWait));

assert.ok(configurations.length>=1,'native bridge must publish the original canvas bounds');
const state=configurations.at(-1);
assert.equal(state.enabled,true);
assert.equal(state.left,100);
assert.equal(state.top,40);
assert.equal(state.width,800);
assert.equal(state.height,400);
assert.equal(state.canvasWidth,1000);
assert.equal(state.canvasHeight,500);
assert.equal(state.shape,'circle');
assert.equal(state.contextToken,'2|7|1000|500|soft-pen|#ff4f91|24|0.75|circle');

const payload={
  schema:1,
  contextToken:state.contextToken,
  pointerId:31,
  eraser:false,
  samples:[
    {x:.1,y:.2,pressure:.25,tiltX:2,tiltY:3,twist:4,dt:0},
    {x:.5,y:.5,pressure:.6,tiltX:4,tiltY:5,twist:6,dt:4},
    {x:.9,y:.8,pressure:1,tiltX:6,tiltY:7,twist:8,dt:8},
  ],
};
const replay=JSON.parse(window.InkFrameNativeStudio.replayStroke(JSON.stringify(payload)));
assert.equal(replay.ok,true);
assert.deepEqual(calls.map(value=>value[0]),['begin','move','end']);
assert.equal(calls[0][2],brushEnvironment,'completed native ink must enter the established Brush V2 environment');
assert.equal(calls[0][1].clientX,180);
assert.equal(calls[0][1].clientY,120);
assert.equal(calls[1][1].clientX,500);
assert.equal(calls[1][1].clientY,240);
assert.equal(calls[2][1].clientX,820);
assert.equal(calls[2][1].clientY,360);
assert.equal(calls[0][1].pointerType,'pen');

const rejected=JSON.parse(window.InkFrameNativeStudio.replayStroke(JSON.stringify({...payload,contextToken:'different-frame'})));
assert.equal(rejected.ok,false);
assert.equal(rejected.reason,'studio-context-changed');

const modal=window.document.createElement('div');
modal.id='projectPanel';
modal.className='show';
window.document.body.appendChild(modal);
window.InkFrameNativeStudio.publish();
assert.equal(configurations.at(-1).enabled,false,'blocking original studio surfaces must suspend native interception');

assert.ok(injector.includes('<script src="native-studio-bridge.js"></script>'));
assert.ok(injector.indexOf('brush-engine-v2/input.js')<injector.indexOf('native-studio-bridge.js'));
assert.ok(injector.includes('window.InkFrameNativeStudioEnvironment'));
assert.ok(injector.includes('brushEnvironment:makeBrushV2Env()'));
assert.doesNotMatch(source,/setInterval/);
assert.doesNotMatch(source,/localStorage|sessionStorage/);
assert.doesNotMatch(source,/fetch\(/);
assert.doesNotMatch(source,/while\s*\(true\)/);

// Golden-master product boundary: stable selectors and runtimes that define the
// original Glass Horizon studio must remain while Kotlin replaces subsystems.
for(const marker of [
  '#stage',
  '#frameGlass',
  'canvas#c',
  '#frameBoard',
  '.frameSlot',
  '.node',
  '.orb',
  '.kids',
  '#studio',
  '#projectPanel',
]){
  assert.ok(studioSource.includes(marker),`original studio golden-master selector missing: ${marker}`);
}
assert.ok(studioSource.includes('Circular Canvas')||injector.includes('inject-canvas-shape'),'square/circular canvas support must remain');
assert.ok(injector.includes('radial-timeline'),'the circular timeline must remain in generated Android assets');
assert.ok(injector.includes('viewport-gestures'),'the established viewport controls must remain in generated Android assets');

assert.ok(manifest.includes('android:name=".InkFrameStudioApplication"'),'production must use the full-studio Kotlin application host');
assert.equal((manifest.match(/android\.intent\.category\.LAUNCHER/g)||[]).length,1,'production must expose exactly one InkFrame launcher');
const prototypeStart=manifest.indexOf('android:name=".nativeink.NativeArtistActivity"');
assert.ok(prototypeStart>=0,'the internal native prototype activity must remain explicitly declared');
const prototypeEnd=manifest.indexOf('/>',prototypeStart);
assert.ok(prototypeEnd>prototypeStart,'the internal native prototype declaration must remain bounded');
const prototypeBlock=manifest.slice(prototypeStart,prototypeEnd+2);
assert.ok(prototypeBlock.includes('android:exported="false"'),'the simplified native prototype must remain internal');
assert.doesNotMatch(prototypeBlock,/MAIN|LAUNCHER/,'the simplified native prototype must never become a product launcher');
assert.match(manifest,/android:name="\.SplashActivity"[\s\S]*?android\.intent\.category\.LAUNCHER/,'the complete studio splash must remain the sole launcher');

window.close();
console.log('✅ full-studio native S Pen overlay, golden-master chrome, single-launcher, and original Brush V2 commit-path tests passed');
