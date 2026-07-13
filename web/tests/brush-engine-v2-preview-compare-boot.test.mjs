// Boots the generated Android debug index and exercises deterministic A/B Brush Preview.
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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-v2-preview-compare-'));
const generated=resolve(temp,'index.html');

try{
  execFileSync(process.execPath,[
    resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,
    '--variant=debug','--diagnostics=true','--default-engine=v2',
  ],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.indexOf('brush-engine-v2/preview-compare.js')<html.indexOf('brush-engine-v2/preview-pad.js'));
  html=html.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{
    const file=resolve(webDir,src);assert.ok(existsSync(file),`missing generated script ${src}`);
    return `<script>${readFileSync(file,'utf8')}</script>`;
  });

  const errors=[];
  const vc=new VirtualConsole();
  vc.on('jsdomError',error=>errors.push(error.detail?.stack||error.message));
  vc.on('error',(...args)=>errors.push(args.join(' ')));
  const dom=new JSDOM(html,{
    url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){
      w.__canvasOps=[];
      w.HTMLCanvasElement.prototype.getContext=function(type){
        if(type!=='2d')return null;
        const canvas=this;
        const state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter'};
        return new Proxy(state,{
          get(target,prop){
            if(prop==='canvas')return canvas;
            if(prop==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});
            if(prop==='putImageData')return()=>{};
            if(prop==='createRadialGradient'||prop==='createLinearGradient')return()=>({addColorStop:()=>{}});
            if(typeof prop==='string'&&!prop.startsWith('__')&&prop!=='then'&&prop!=='constructor'){
              if(prop in target)return target[prop];
              return(...args)=>{w.__canvasOps.push({canvas,method:prop,args});};
            }
            return undefined;
          },
          set(target,prop,value){target[prop]=value;return true;},
        });
      };
      w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,';
      w.HTMLCanvasElement.prototype.toBlob=callback=>callback(null);
      w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[]});
      w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
      w.MediaRecorder=function(){};w.MediaRecorder.isTypeSupported=()=>false;
      w.requestAnimationFrame=callback=>setTimeout(()=>callback(w.performance.now()),16);
      w.cancelAnimationFrame=id=>clearTimeout(id);
      w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
      w.alert=()=>{};w.confirm=()=>true;
    },
  });

  await new Promise(resolveWait=>setTimeout(resolveWait,1000));
  assert.deepEqual(errors,[],errors.join('\n'));
  const d=dom.window.document;
  const api=dom.window.InkFrameBrushV2PreviewPad;
  const card=d.querySelector('.inkframe-v2-preview-card');
  const canvases=Array.from(card?.querySelectorAll('.inkframe-v2-preview-canvas')||[]);
  const compareButton=Array.from(card?.querySelectorAll('button')||[]).find(button=>button.textContent==='Compare Off');
  const applyButton=Array.from(card?.querySelectorAll('button')||[]).find(button=>button.textContent==='Apply B');
  const swapButton=Array.from(card?.querySelectorAll('button')||[]).find(button=>button.textContent==='Swap A/B');
  const clearButton=Array.from(card?.querySelectorAll('button')||[]).find(button=>button.textContent==='Clear Preview');
  const select=card?.querySelector('.inkframe-v2-preview-compare-controls select');
  assert.ok(card&&compareButton&&applyButton&&swapButton&&clearButton&&select,'A/B preview controls did not install');
  assert.equal(canvases.length,2);
  assert.equal(select.options.length,3);
  assert.deepEqual(Array.from(select.options).map(option=>option.value),['studio:direct','studio:balanced','studio:smooth']);
  assert.equal(api.stats().compareEnabled,false);
  assert.equal(card.querySelector('[data-preview-side="B"]').hidden,true);

  const liveBefore=dom.window.InkFrameBrushV2Adapter.currentTuning();
  assert.equal(liveBefore.stabilizerStrength,55);
  assert.equal(api.selectCompare('studio:direct'),true);
  assert.equal(api.compareChoice().tuning.stabilizerStrength,25);
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().stabilizerStrength,55,'selecting B must not mutate live tuning');
  compareButton.click();
  assert.equal(api.stats().compareEnabled,true);
  assert.equal(card.querySelector('[data-preview-side="B"]').hidden,false);

  for(const canvas of canvases)canvas.getBoundingClientRect=()=>({left:0,top:0,width:720,height:240,right:720,bottom:240});
  const pointer=(canvas,type,values)=>{
    const event=new dom.window.Event(type,{bubbles:true,cancelable:true});
    for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});
    canvas.dispatchEvent(event);
  };
  const main=d.getElementById('c');
  const mainOpsBefore=dom.window.__canvasOps.filter(entry=>entry.canvas===main).length;
  pointer(canvases[0],'pointerdown',{pointerId:17,pointerType:'pen',clientX:40,clientY:120,pressure:0.35,timeStamp:0,buttons:1});
  pointer(canvases[0],'pointermove',{pointerId:17,pointerType:'pen',clientX:120,clientY:90,pressure:0.5,timeStamp:8,buttons:1});
  pointer(canvases[0],'pointermove',{pointerId:17,pointerType:'pen',clientX:240,clientY:135,pressure:0.65,timeStamp:16,buttons:1});
  pointer(canvases[0],'pointermove',{pointerId:17,pointerType:'pen',clientX:390,clientY:80,pressure:0.8,timeStamp:24,buttons:1});
  pointer(canvases[0],'pointerup',{pointerId:17,pointerType:'pen',clientX:430,clientY:110,pressure:0,timeStamp:32,buttons:0});
  await new Promise(resolveWait=>setTimeout(resolveWait,30));

  const stats=api.stats();
  assert.equal(stats.strokes,1);
  assert.ok(stats.dabsA>0,'A must emit production V2 dabs');
  assert.ok(stats.dabsB>0,'B must emit production V2 dabs');
  assert.equal(stats.projectCanvasWrites,0);
  assert.equal(stats.undoWrites,0);
  assert.ok(dom.window.__canvasOps.some(entry=>entry.canvas===canvases[0]),'A canvas must receive raster operations');
  assert.ok(dom.window.__canvasOps.some(entry=>entry.canvas===canvases[1]),'B canvas must receive raster operations');
  assert.equal(dom.window.__canvasOps.filter(entry=>entry.canvas===main).length,mainOpsBefore,'A/B preview must not render into the project canvas');

  assert.equal(api.applyCompare(),true);
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().stabilizerStrength,25,'Apply B must explicitly copy B to live tuning');
  assert.equal(api.selectCompare('studio:smooth'),true);
  assert.equal(api.swapCompare(),true);
  assert.equal(dom.window.InkFrameBrushV2Adapter.currentTuning().stabilizerStrength,80,'Swap must move B into A');
  assert.equal(api.compareChoice().id,'transient');
  assert.equal(api.compareChoice().tuning.stabilizerStrength,25,'Swap must preserve former A as Previous A');

  clearButton.click();
  const cleared=api.stats();
  assert.equal(cleared.strokes,0);
  assert.equal(cleared.dabsA,0);
  assert.equal(cleared.dabsB,0);
  assert.equal(dom.window.__canvasOps.filter(entry=>entry.canvas===main).length,mainOpsBefore);

  dom.window.close();
  console.log('✅ generated Android A/B Brush Preview is deterministic and project-isolated');
}finally{
  rmSync(temp,{recursive:true,force:true});
}
