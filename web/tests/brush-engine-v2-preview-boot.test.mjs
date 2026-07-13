// Boots the generated Android debug index and exercises the non-destructive preview pad.
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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-v2-preview-boot-'));
const generated=resolve(temp,'index.html');

try{
  execFileSync(process.execPath,[
    resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,
    '--variant=debug','--diagnostics=true','--default-engine=v2',
  ],{cwd:root});
  let html=readFileSync(generated,'utf8');
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
  const preview=d.querySelector('.inkframe-v2-preview-canvas');
  const card=d.querySelector('.inkframe-v2-preview-card');
  const clearButton=Array.from(card?.querySelectorAll('button')||[]).find(button=>button.textContent==='Clear Preview');
  assert.ok(card,'Preview Pad card did not install');
  assert.ok(preview,'Preview Pad canvas did not install');
  assert.ok(clearButton,'Clear Preview control did not install');
  assert.equal(preview.width,720);
  assert.equal(preview.height,240);
  assert.equal(dom.window.InkFrameBrushV2PreviewPad.installed,true);
  assert.equal(typeof dom.window.InkFrameBrushV2PreviewPad.createPreviewSession,'function');
  assert.match(card.querySelector('.inkframe-v2-preview-status').textContent,/Ink · 55% · Comet/);

  preview.getBoundingClientRect=()=>({left:0,top:0,width:720,height:240,right:720,bottom:240});
  const pointer=(type,values)=>{
    const event=new dom.window.Event(type,{bubbles:true,cancelable:true});
    for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});
    preview.dispatchEvent(event);
  };
  const main=d.getElementById('c');
  const mainOpsBefore=dom.window.__canvasOps.filter(entry=>entry.canvas===main).length;
  pointer('pointerdown',{pointerId:9,pointerType:'pen',clientX:40,clientY:120,pressure:0.35,timeStamp:0,buttons:1});
  pointer('pointermove',{pointerId:9,pointerType:'pen',clientX:100,clientY:105,pressure:0.45,timeStamp:8,buttons:1});
  pointer('pointermove',{pointerId:9,pointerType:'pen',clientX:180,clientY:130,pressure:0.55,timeStamp:16,buttons:1});
  pointer('pointermove',{pointerId:9,pointerType:'pen',clientX:280,clientY:90,pressure:0.7,timeStamp:24,buttons:1});
  pointer('pointermove',{pointerId:9,pointerType:'pen',clientX:400,clientY:135,pressure:0.8,timeStamp:32,buttons:1});
  pointer('pointerup',{pointerId:9,pointerType:'pen',clientX:430,clientY:140,pressure:0,timeStamp:40,buttons:0});
  await new Promise(resolveWait=>setTimeout(resolveWait,30));

  const stats=dom.window.InkFrameBrushV2PreviewPad.stats();
  assert.equal(stats.strokes,1);
  assert.ok(stats.dabs>0,'preview stroke must emit real V2 dabs');
  assert.equal(stats.active,false);
  assert.equal(stats.projectCanvasWrites,0);
  assert.equal(stats.undoWrites,0);
  const mainOpsAfter=dom.window.__canvasOps.filter(entry=>entry.canvas===main).length;
  assert.equal(mainOpsAfter,mainOpsBefore,'preview drawing must not render into the project canvas');
  assert.ok(dom.window.__canvasOps.some(entry=>entry.canvas===preview),'preview canvas must receive raster operations');

  clearButton.click();
  const cleared=dom.window.InkFrameBrushV2PreviewPad.stats();
  assert.equal(cleared.strokes,0);
  assert.equal(cleared.dabs,0);
  assert.match(card.querySelector('.inkframe-v2-preview-hint').textContent,/artwork.*stay untouched/);

  dom.window.close();
  console.log('✅ generated Android Brush Lab preview pad is isolated and functional');
}finally{
  rmSync(temp,{recursive:true,force:true});
}
