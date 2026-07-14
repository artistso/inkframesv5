import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);let JSDOM,VirtualConsole;
try{({JSDOM,VirtualConsole}=require('jsdom'));}catch{({JSDOM,VirtualConsole}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..'),web=resolve(root,'web');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-profile-history-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(web,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8').replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{const file=resolve(web,src);assert.ok(existsSync(file),`missing ${src}`);return `<script>${readFileSync(file,'utf8')}</script>`;});
  const optional=['preview-replay.js','brush-coach.js','coach-session.js','calibration-report.js','profile-history.js'].map(name=>readFileSync(resolve(web,'brush-engine-v2',name),'utf8'));
  html=html.replace('</body>',optional.map(source=>`<script>${source}</script>`).join('')+'</body>');
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.detail?.stack||error.message));
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.__canvasOps=[];w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;const canvas=this,state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter'};return new Proxy(state,{get(t,p){if(p==='canvas')return canvas;if(p==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});if(p==='putImageData')return()=>{};if(p==='createRadialGradient'||p==='createLinearGradient')return()=>({addColorStop:()=>{}});if(typeof p==='string'&&!p.startsWith('__')&&p!=='then'&&p!=='constructor'){if(p in t)return t[p];return(...args)=>w.__canvasOps.push({canvas,method:p,args});}return undefined;},set(t,p,v){t[p]=v;return true;}});};
    w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,';w.HTMLCanvasElement.prototype.toBlob=callback=>callback(null);w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[]});w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};w.MediaRecorder=function(){};w.MediaRecorder.isTypeSupported=()=>false;w.requestAnimationFrame=callback=>setTimeout(()=>callback(w.performance.now()),16);w.cancelAnimationFrame=id=>clearTimeout(id);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;
  }});
  await new Promise(resolvePromise=>setTimeout(resolvePromise,900));assert.deepEqual(errors,[],errors.join('\n'));
  const w=dom.window,d=w.document,history=w.InkFrameBrushProfileHistory,adapter=w.InkFrameBrushV2Adapter,preview=w.InkFrameBrushV2PreviewPad,main=d.getElementById('c');
  assert.ok(history&&history.installed,'Profile History did not install');assert.ok(history.details);assert.equal(history.model.snapshot().count,1);
  const mainBefore=w.__canvasOps.filter(operation=>operation.canvas===main).length;
  const lockButtons=Array.from(history.details.querySelectorAll('.lock button')),historyButtons=Array.from(history.details.querySelectorAll('.history button')),selectedButtons=Array.from(history.details.querySelectorAll('.selected button'));
  lockButtons[0].click();const locked=history.model.snapshot().locked;assert.ok(locked);assert.equal(history.details.querySelector('summary').textContent.includes('Locked'),true);
  assert.equal(adapter.setTuning({stabilizerStrength:150,ghostMode:'echo',ghostIntensity:82}),true);assert.equal(history.observe(),true);assert.equal(history.model.snapshot().count,2);
  historyButtons[0].click();await new Promise(resolvePromise=>setTimeout(resolvePromise,20));assert.equal(adapter.currentTuning().stabilizerStrength,locked.stabilizerStrength);assert.equal(history.model.snapshot().canRedo,true);
  historyButtons[1].click();await new Promise(resolvePromise=>setTimeout(resolvePromise,20));assert.equal(adapter.currentTuning().stabilizerStrength,150);
  const select=history.details.querySelector('select');select.value='0';select.dispatchEvent(new w.Event('change',{bubbles:true}));selectedButtons[0].click();await new Promise(resolvePromise=>setTimeout(resolvePromise,20));
  const store=w.InkFrameBrushV2PresetUI.store;assert.ok(store.snapshot().presets.some(preset=>preset.name==='History · Compared State'));assert.equal(preview.stats().compareEnabled,true);
  selectedButtons[2].click();assert.ok(store.snapshot().presets.some(preset=>preset.name.startsWith('Recovered ·')));
  lockButtons[1].click();await new Promise(resolvePromise=>setTimeout(resolvePromise,20));assert.equal(adapter.currentTuning().stabilizerStrength,locked.stabilizerStrength);
  assert.ok(w.localStorage.getItem('inkframe.brushEngine.profileHistory.v1'));assert.equal(history.projectCanvasWrites,0);assert.equal(history.undoWrites,0);assert.equal(w.__canvasOps.filter(operation=>operation.canvas===main).length,mainBefore);
  history.destroy();dom.window.close();console.log('✅ generated Android Profile Lock and tuning recovery are project-isolated');
}finally{rmSync(temp,{recursive:true,force:true});}
