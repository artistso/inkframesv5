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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-circle-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="canvas-shape.js"></script>'));
  assert.ok(html.includes('InkFrameCanvasShapeEnvironment'));
  assert.ok(html.includes('InkFrameCanvasShape.boundaryEvent'));
  assert.ok(html.includes("canvasShape:P.canvasShape==='circle'?'circle':'square'"));
  html=html.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{const file=resolve(webDir,src);assert.ok(existsSync(file),`missing ${src}`);return `<script>${readFileSync(file,'utf8')}</script>`;});
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.detail?.stack||e.message));vc.on('error',(...a)=>errors.push(a.join(' ')));
  const contexts=new WeakMap();
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.__canvasOps=[];
    w.ResizeObserver=class{constructor(cb){this.cb=cb;}observe(){this.cb([]);}disconnect(){}};
    w.HTMLCanvasElement.prototype.getContext=function(type){
      if(type!=='2d')return null;if(contexts.has(this))return contexts.get(this);
      const canvas=this,state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter',imageSmoothingEnabled:true};
      const ctx=new Proxy(state,{get(t,p){
        if(p==='canvas')return canvas;
        if(p==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});
        if(p==='createImageData')return(width,height)=>({data:new Uint8ClampedArray(width*height*4),width,height});
        if(p==='putImageData')return(...args)=>w.__canvasOps.push({canvas,method:'putImageData',args});
        if(p==='createRadialGradient'||p==='createLinearGradient')return()=>({addColorStop:()=>{}});
        if(p==='measureText')return text=>({width:String(text).length*7});
        if(typeof p==='string'&&!p.startsWith('__')&&p!=='then'&&p!=='constructor'){
          if(p in t)return t[p];return(...args)=>{w.__canvasOps.push({canvas,method:p,args});};
        }return undefined;
      },set(t,p,v){t[p]=v;return true;}});contexts.set(canvas,ctx);return ctx;
    };
    w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,';
    w.HTMLCanvasElement.prototype.toBlob=cb=>cb(new w.Blob([],{type:'image/png'}));
    w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[{requestFrame(){},stop(){}}]});
    w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};w.HTMLCanvasElement.prototype.releasePointerCapture=()=>{};
    w.MediaRecorder=function(){this.start=()=>{};this.stop=()=>{this.onstop&&this.onstop();};};w.MediaRecorder.isTypeSupported=()=>false;
    w.requestAnimationFrame=cb=>setTimeout(()=>cb(w.performance.now()),8);w.cancelAnimationFrame=id=>clearTimeout(id);
    w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;
  }});
  await new Promise(r=>setTimeout(r,900));
  assert.deepEqual(errors,[],errors.join('\n'));
  const w=dom.window,d=w.document,api=w.InkFrameCanvasShape,adapter=w.InkFrameBrushV2Adapter,bridge=w.InkFrameBrushV2InputBridge;
  assert.ok(api&&api.installed,'Circular Canvas did not install');
  assert.ok(adapter&&bridge,'Brush V2 bridge unavailable');
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),button=frameGlass.querySelector('.inkframe-canvas-shape-toggle');
  assert.ok(button,'shape toggle missing');
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:14});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:14});
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:720,height:540,right:720,bottom:540});
  api.sync();
  assert.equal(api.currentShape(),'square');assert.equal(button.textContent,'□ Square');
  assert.equal(api.toggle(),true);assert.equal(api.currentShape(),'circle');assert.equal(w.InkFrameCanvasShapeEnvironment().getProject().canvasShape,'circle');
  assert.equal(d.body.classList.contains('inkframe-canvas-circle'),true);assert.ok(canvas.style.clipPath.startsWith('circle('));assert.equal(button.textContent,'◯ Circle');

  const pointer=(type,values)=>{const event=new w.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});Object.defineProperty(event,'getCoalescedEvents',{configurable:true,value:()=>[]});canvas.dispatchEvent(event);return event;};
  adapter.setMode('v2');
  pointer('pointerdown',{pointerId:71,pointerType:'pen',clientX:360,clientY:270,pressure:.35,timeStamp:10,buttons:1,button:0,tiltX:0,tiltY:0});
  assert.equal(adapter.isActive(),true,'V2 stroke did not begin inside circle');
  assert.equal(api.toggle(),false,'shape must not change during an active stroke');
  pointer('pointermove',{pointerId:71,pointerType:'pen',clientX:800,clientY:270,pressure:.7,timeStamp:24,buttons:1,button:0,tiltX:0,tiltY:0});
  await new Promise(r=>setTimeout(r,80));
  assert.equal(adapter.isActive(),false,'outside move must finish the stroke');
  const trace=adapter.lastTrace();assert.ok(trace&&trace.samples&&trace.samples.length>=2,'finished trace unavailable');
  const last=trace.samples[trace.samples.length-1];
  assert.ok(Math.abs(last.x-896)<1e-6,`expected exact circle edge x=896, got ${last.x}`);
  assert.ok(Math.abs(last.y-384)<1e-6,`expected exact circle edge y=384, got ${last.y}`);

  assert.equal(api.toggle(),true);assert.equal(api.currentShape(),'square');
  assert.equal(api.toggle(),true);assert.equal(api.currentShape(),'circle');
  const beforeTrace=JSON.stringify(adapter.lastTrace()),beforeMainOps=w.__canvasOps.filter(op=>op.canvas===canvas).length;
  pointer('pointerdown',{pointerId:72,pointerType:'pen',clientX:5,clientY:5,pressure:.5,timeStamp:100,buttons:1,button:0});
  pointer('pointerup',{pointerId:72,pointerType:'pen',clientX:5,clientY:5,pressure:0,timeStamp:110,buttons:0,button:0});
  await new Promise(r=>setTimeout(r,30));
  assert.equal(adapter.isActive(),false);assert.equal(JSON.stringify(adapter.lastTrace()),beforeTrace,'outside start must not create a trace');
  assert.equal(w.__canvasOps.filter(op=>op.canvas===canvas).length,beforeMainOps,'outside start must not paint the project canvas');
  assert.equal(api.projectCanvasWrites,0);assert.equal(api.undoWrites,0);
  dom.window.close();console.log('✅ generated Android Circular Canvas installs, rejects outside starts, and ends V2 at the rim');
}finally{rmSync(temp,{recursive:true,force:true});}
