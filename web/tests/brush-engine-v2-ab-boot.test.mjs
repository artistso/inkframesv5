// Boots the generated Android debug index with every sibling module inlined.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
let JSDOM,VirtualConsole;
try{({JSDOM,VirtualConsole}=require('jsdom'));}
catch{({JSDOM,VirtualConsole}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..','..');
const webDir=resolve(root,'web');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-v2-boot-'));
const generated=resolve(temp,'index.html');

try{
  execFileSync(process.execPath,[
    resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,
    '--variant=debug','--diagnostics=true','--default-engine=v2',
  ],{cwd:root});
  let html=readFileSync(generated,'utf8');
  html=html.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{
    const file=resolve(webDir,src);assert.ok(existsSync(file),`generated index references missing script: ${src}`);
    return `<script>${readFileSync(file,'utf8')}</script>`;
  });
  const errors=[];const vc=new VirtualConsole();
  vc.on('jsdomError',error=>errors.push(error.detail?.stack||error.message));
  vc.on('error',(...args)=>errors.push(args.join(' ')));
  const dom=new JSDOM(html,{
    url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){
      w.HTMLCanvasElement.prototype.getContext=function(type){
        if(type!=='2d')return null;const canvas=this;
        const state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter'};
        return new Proxy(state,{get(target,prop){
          if(prop==='canvas')return canvas;
          if(prop==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});
          if(prop==='putImageData')return()=>{};
          if(prop==='createRadialGradient'||prop==='createLinearGradient')return()=>({addColorStop:()=>{}});
          if(typeof prop==='string'&&!prop.startsWith('__')&&prop!=='then'&&prop!=='constructor'){if(prop in target)return target[prop];return()=>{};}
        },set(target,prop,value){target[prop]=value;return true;}});
      };
      w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,';
      w.HTMLCanvasElement.prototype.toBlob=cb=>cb(null);
      w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[]});
      w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
      w.MediaRecorder=function(){};w.MediaRecorder.isTypeSupported=()=>false;
      w.requestAnimationFrame=cb=>setTimeout(cb,16);w.cancelAnimationFrame=id=>clearTimeout(id);
      w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
    },
  });

  await new Promise(resolveWait=>setTimeout(resolveWait,1000));
  assert.deepEqual(errors,[],errors.join('\n'));
  const d=dom.window.document;
  const adapter=dom.window.InkFrameBrushV2Adapter;
  const panel=d.getElementById('inkframe-v2-ab');
  const lab=d.getElementById('inkframe-v2-tuning');
  const nav=d.getElementById('inkframe-v2-lab-nav');
  const launcher=panel.querySelector(':scope > button[data-lab-launcher]');
  const engineToggle=d.getElementById('inkframe-v2-engine-toggle');
  assert.ok(panel&&lab&&nav&&launcher&&engineToggle,'refined Brush Lab shell did not install');
  assert.ok(panel.classList.contains('lab-launcher'));
  assert.ok(lab.classList.contains('lab-refined'));
  assert.equal(panel.querySelectorAll(':scope > button').length,1,'canvas should expose one Brush Lab launcher');
  assert.equal(nav.querySelectorAll('button').length,5);
  assert.deepEqual(Array.from(nav.querySelectorAll('button')).map(button=>button.textContent),['Stabilizer','Ghost Trail','Stroke','Safety','Diagnostics']);
  assert.equal(d.querySelectorAll('.inkframe-v2-lab-section').length,5);
  assert.ok(d.querySelectorAll('.inkframe-v2-control-card').length>=8,'controls should be grouped into cards');
  assert.ok(d.querySelector('.quick-row select'),'preset selector should live in Quick setup');
  assert.deepEqual(Array.from(d.querySelectorAll('.studio-actions button')).map(button=>button.textContent),['Studio 150%','Maximum 200%']);
  assert.deepEqual(Array.from(d.querySelectorAll('[data-lab-section="diagnostics"] .inkframe-v2-diag-tools button')).map(button=>button.textContent),['Import trace','Replay','Export trace']);

  const controls={
    coverage:d.getElementById('inkframe-v2-coverage-mode'),radius:d.getElementById('inkframe-v2-radius-mode'),contact:d.getElementById('inkframe-v2-contact-mode'),
    stabilizerMode:d.getElementById('inkframe-v2-stabilizer-mode'),stabilizerStrength:d.getElementById('inkframe-v2-stabilizer-strength'),
    cornerMode:d.getElementById('inkframe-v2-corner-mode'),cornerStrength:d.getElementById('inkframe-v2-corner-strength'),
    ghostMode:d.getElementById('inkframe-v2-ghost-mode'),ghostIntensity:d.getElementById('inkframe-v2-ghost-intensity'),
    ghostDuration:d.getElementById('inkframe-v2-ghost-duration'),ghostWidth:d.getElementById('inkframe-v2-ghost-width'),
  };
  for(const [name,node] of Object.entries(controls))assert.ok(node,`${name} control missing`);
  assert.equal(lab.querySelectorAll('input[type="range"]').length,9);
  assert.equal(controls.stabilizerStrength.max,'200');
  assert.equal(dom.window.InkFrameBuild.variant,'debug');
  assert.equal(adapter.currentMode(),'v2');
  assert.equal(adapter.currentTuning().ghostMode,'comet');
  assert.equal(adapter.__ghostTrailInstalled,true);

  assert.equal(lab.hidden,true);launcher.click();assert.equal(lab.hidden,false);
  assert.match(engineToggle.textContent,/V2/);engineToggle.click();assert.equal(adapter.currentMode(),'original');engineToggle.click();assert.equal(adapter.currentMode(),'v2');
  dom.window.InkFrameBrushV2LabUI.openTab('trail');
  assert.equal(d.querySelector('[data-lab-section="trail"]').hidden,false);
  assert.equal(d.querySelector('[data-lab-section="stabilizer"]').hidden,true);
  dom.window.InkFrameBrushV2LabUI.openTab('stabilizer');
  const maximum=Array.from(d.querySelectorAll('.studio-actions button')).find(button=>button.textContent==='Maximum 200%');
  maximum.click();assert.equal(adapter.currentTuning().stabilizerStrength,200);assert.equal(adapter.currentTuning().ghostMode,'echo');

  controls.ghostMode.value='comet';controls.ghostMode.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  controls.ghostIntensity.value='76';controls.ghostIntensity.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  assert.equal(adapter.currentTuning().ghostMode,'comet');assert.equal(adapter.currentTuning().ghostIntensity,76);
  controls.coverage.value='dabs';controls.coverage.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  controls.radius.value='raw';controls.radius.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  controls.contact.value='raw';controls.contact.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(adapter.currentTuning().coverageMode,'dabs');assert.equal(adapter.currentTuning().radiusMode,'raw');assert.equal(adapter.currentTuning().contactMode,'raw');

  const canvas=d.getElementById('c');let rect={left:100,top:50,width:512,height:384,right:612,bottom:434};canvas.getBoundingClientRect=()=>rect;
  const env=dom.window.InkFrameBrushV2Environment();assert.equal(env.coordinateTransform.left,100);assert.equal(env.coordinateTransform.scaleX,2);assert.equal(env.coordinateTransform.scaleY,2);
  rect={left:0,top:0,width:1024,height:768,right:1024,bottom:768};
  const converted=env.toSample({clientX:356,clientY:242,pressure:.5,pointerId:7,pointerType:'pen',timeStamp:10,tiltX:0,tiltY:0,width:1,height:1});
  assert.equal(converted.x,512);assert.equal(converted.y,384);
  console.log('✅ generated Brush V2 debug APK booted with the refined Brush Lab workspace');
}finally{rmSync(temp,{recursive:true,force:true});}
