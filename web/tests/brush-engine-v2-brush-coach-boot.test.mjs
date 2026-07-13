import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);let JSDOM,VirtualConsole;
try{({JSDOM,VirtualConsole}=require('jsdom'));}catch{({JSDOM,VirtualConsole}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..'),webDir=resolve(root,'web');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-v2-brush-coach-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8').replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{const file=resolve(webDir,src);assert.ok(existsSync(file),`missing ${src}`);return `<script>${readFileSync(file,'utf8')}</script>`;});
  const replay=readFileSync(resolve(webDir,'brush-engine-v2/preview-replay.js'),'utf8');
  const coach=readFileSync(resolve(webDir,'brush-engine-v2/brush-coach.js'),'utf8');
  html=html.replace('</body>',`<script>${replay}</script><script>${coach}</script></body>`);
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.detail?.stack||e.message));vc.on('error',(...a)=>errors.push(a.join(' ')));
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.__canvasOps=[];w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;const canvas=this,state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter'};return new Proxy(state,{get(t,p){if(p==='canvas')return canvas;if(p==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});if(p==='putImageData')return()=>{};if(p==='createRadialGradient'||p==='createLinearGradient')return()=>({addColorStop:()=>{}});if(typeof p==='string'&&!p.startsWith('__')&&p!=='then'&&p!=='constructor'){if(p in t)return t[p];return(...args)=>w.__canvasOps.push({canvas,method:p,args});}return undefined;},set(t,p,v){t[p]=v;return true;}});};
    w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,';w.HTMLCanvasElement.prototype.toBlob=cb=>cb(null);w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[]});w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};w.MediaRecorder=function(){};w.MediaRecorder.isTypeSupported=()=>false;w.requestAnimationFrame=cb=>setTimeout(()=>cb(w.performance.now()),16);w.cancelAnimationFrame=id=>clearTimeout(id);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;
  }});
  await new Promise(r=>setTimeout(r,1000));assert.deepEqual(errors,[],errors.join('\n'));
  const d=dom.window.document,preview=dom.window.InkFrameBrushV2PreviewPad,replayApi=dom.window.InkFrameBrushV2ReferenceReplay,coachApi=dom.window.InkFrameBrushCoach;
  assert.ok(coachApi&&coachApi.installed,'Brush Coach did not install');
  const card=d.querySelector('.inkframe-v2-preview-card'),canvas=card.querySelector('.inkframe-v2-preview-canvas'),main=d.getElementById('c');
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:720,height:240,right:720,bottom:240});
  const pointer=(type,values)=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});canvas.dispatchEvent(event);};
  const mainBefore=dom.window.__canvasOps.filter(x=>x.canvas===main).length;
  pointer('pointerdown',{pointerId:44,pointerType:'pen',clientX:30,clientY:120,pressure:.2,timeStamp:0,buttons:1});
  pointer('pointermove',{pointerId:44,pointerType:'pen',clientX:95,clientY:80,pressure:.4,timeStamp:14,buttons:1});
  pointer('pointermove',{pointerId:44,pointerType:'pen',clientX:170,clientY:140,pressure:.65,timeStamp:28,buttons:1});
  pointer('pointermove',{pointerId:44,pointerType:'pen',clientX:280,clientY:70,pressure:.9,timeStamp:42,buttons:1});
  pointer('pointerup',{pointerId:44,pointerType:'pen',clientX:390,clientY:120,pressure:0,timeStamp:56,buttons:0});
  await new Promise(r=>setTimeout(r,60));
  const suggestion=coachApi.current();assert.equal(suggestion.valid,true);assert.ok(suggestion.confidence>=.55);assert.equal(replayApi.stats().reference.available,true);
  const buttons=Array.from(coachApi.panel.querySelectorAll('button'));assert.deepEqual(buttons.map(b=>b.textContent),['Save & Compare','Apply Suggestion','Save Suggestion']);assert.ok(buttons.every(b=>!b.disabled));
  assert.equal(coachApi.compare(),true);await new Promise(r=>setTimeout(r,40));
  assert.equal(preview.stats().compareEnabled,true);assert.ok(replayApi.stats().lastReplay.b>0);
  const store=dom.window.InkFrameBrushV2PresetUI.store,snapshot=store.snapshot();assert.equal(snapshot.presets.length,1);assert.ok(snapshot.presets[0].name.startsWith('Coach ·'));
  const beforeApply=dom.window.InkFrameBrushV2Adapter.currentTuning();assert.equal(coachApi.apply(),true);const afterApply=dom.window.InkFrameBrushV2Adapter.currentTuning();assert.notEqual(afterApply.stabilizerStrength,beforeApply.stabilizerStrength);assert.equal(afterApply.stabilizerStrength,suggestion.tuning.stabilizerStrength);
  coachApi.save();assert.equal(store.snapshot().presets.length,1,'saving the same suggestion should update, not duplicate');
  assert.equal(coachApi.projectCanvasWrites,0);assert.equal(coachApi.undoWrites,0);assert.equal(dom.window.__canvasOps.filter(x=>x.canvas===main).length,mainBefore);
  dom.window.close();console.log('✅ generated Android Brush Coach is local, explicit, and project-isolated');
}finally{rmSync(temp,{recursive:true,force:true});}
