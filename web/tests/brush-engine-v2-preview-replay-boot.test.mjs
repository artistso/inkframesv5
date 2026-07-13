import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
let JSDOM,VirtualConsole;
try{({JSDOM,VirtualConsole}=require('jsdom'));}catch{({JSDOM,VirtualConsole}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..','..');
const webDir=resolve(root,'web');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-v2-reference-replay-'));
const generated=resolve(temp,'index.html');

try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  html=html.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{
    const file=resolve(webDir,src);assert.ok(existsSync(file),`missing generated script ${src}`);return `<script>${readFileSync(file,'utf8')}</script>`;
  });
  const replaySource=readFileSync(resolve(webDir,'brush-engine-v2/preview-replay.js'),'utf8');
  html=html.replace('</body>',`<script>${replaySource}</script></body>`);

  const errors=[];const vc=new VirtualConsole();
  vc.on('jsdomError',e=>errors.push(e.detail?.stack||e.message));vc.on('error',(...a)=>errors.push(a.join(' ')));
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.__canvasOps=[];
    w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;const canvas=this;const state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter'};return new Proxy(state,{get(target,prop){if(prop==='canvas')return canvas;if(prop==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});if(prop==='putImageData')return()=>{};if(prop==='createRadialGradient'||prop==='createLinearGradient')return()=>({addColorStop:()=>{}});if(typeof prop==='string'&&!prop.startsWith('__')&&prop!=='then'&&prop!=='constructor'){if(prop in target)return target[prop];return(...args)=>{w.__canvasOps.push({canvas,method:prop,args});};}return undefined;},set(target,prop,value){target[prop]=value;return true;}});};
    w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,';w.HTMLCanvasElement.prototype.toBlob=cb=>cb(null);w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[]});w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
    w.MediaRecorder=function(){};w.MediaRecorder.isTypeSupported=()=>false;w.requestAnimationFrame=cb=>setTimeout(()=>cb(w.performance.now()),16);w.cancelAnimationFrame=id=>clearTimeout(id);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;
  }});

  await new Promise(r=>setTimeout(r,1000));
  assert.deepEqual(errors,[],errors.join('\n'));
  const d=dom.window.document;const preview=dom.window.InkFrameBrushV2PreviewPad;const replay=dom.window.InkFrameBrushV2ReferenceReplay;
  const card=d.querySelector('.inkframe-v2-preview-card');const canvases=Array.from(card.querySelectorAll('.inkframe-v2-preview-canvas'));
  const compareButton=Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='Compare Off');
  const replayButton=Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='Replay Last');
  const autoButton=Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='Auto Replay On');
  const select=card.querySelector('.inkframe-v2-preview-compare-controls select');
  assert.ok(replay&&replay.installed&&replayButton&&autoButton,'reference replay controls did not install');
  compareButton.click();assert.equal(preview.stats().compareEnabled,true);
  for(const canvas of canvases)canvas.getBoundingClientRect=()=>({left:0,top:0,width:720,height:240,right:720,bottom:240});
  const pointer=(canvas,type,values)=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});canvas.dispatchEvent(event);};
  const main=d.getElementById('c');const mainBefore=dom.window.__canvasOps.filter(x=>x.canvas===main).length;
  pointer(canvases[0],'pointerdown',{pointerId:31,pointerType:'pen',clientX:35,clientY:120,pressure:.3,timeStamp:0,buttons:1});
  pointer(canvases[0],'pointermove',{pointerId:31,pointerType:'pen',clientX:130,clientY:85,pressure:.5,timeStamp:8,buttons:1});
  pointer(canvases[0],'pointermove',{pointerId:31,pointerType:'pen',clientX:280,clientY:140,pressure:.7,timeStamp:16,buttons:1});
  pointer(canvases[0],'pointerup',{pointerId:31,pointerType:'pen',clientX:430,clientY:100,pressure:0,timeStamp:24,buttons:0});
  await new Promise(r=>setTimeout(r,40));
  assert.equal(replay.stats().reference.available,true);assert.equal(replayButton.disabled,false);

  select.value='studio:smooth';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,220));
  const afterAuto=replay.stats();assert.ok(afterAuto.replayCount>=1);assert.ok(afterAuto.lastReplay.a>0);assert.ok(afterAuto.lastReplay.b>0);
  assert.ok(card.querySelector('[data-diff-key="stabilizer"]'),'stabilizer difference chip missing');
  assert.equal(dom.window.__canvasOps.filter(x=>x.canvas===main).length,mainBefore);

  autoButton.click();assert.equal(replay.stats().autoReplay,false);const count=replay.stats().replayCount;
  select.value='studio:direct';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,180));assert.equal(replay.stats().replayCount,count);
  replayButton.click();await new Promise(r=>setTimeout(r,30));assert.equal(replay.stats().replayCount,count+1);
  assert.equal(replay.stats().projectCanvasWrites,0);assert.equal(replay.stats().undoWrites,0);assert.equal(dom.window.__canvasOps.filter(x=>x.canvas===main).length,mainBefore);

  dom.window.close();console.log('✅ generated Android reference replay is deterministic and project-isolated');
}finally{rmSync(temp,{recursive:true,force:true});}
