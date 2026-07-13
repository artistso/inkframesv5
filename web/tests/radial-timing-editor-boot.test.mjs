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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-radial-timing-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="radial-timeline.js"></script>'));
  assert.ok(html.includes('<script src="radial-timing-editor.js"></script>'));
  assert.ok(html.indexOf('radial-timeline.js')<html.indexOf('radial-timing-editor.js'),'timing editor must load after the radial core');
  assert.ok(html.includes('canEditTiming:()=>'));
  assert.ok(html.includes('setHold:(i,v)=>'));
  assert.ok(html.includes('setLoopRange:(a,b)=>'));
  assert.ok(html.includes('toggleLoop:()=>'));
  assert.ok(html.includes("AUTOSAVE.schedule)AUTOSAVE.schedule()"));
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
    w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,frame';
    w.HTMLCanvasElement.prototype.toBlob=cb=>cb(new w.Blob([],{type:'image/png'}));
    w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[{requestFrame(){},stop(){}}]});
    w.Element.prototype.setPointerCapture=()=>{};w.Element.prototype.releasePointerCapture=()=>{};
    w.MediaRecorder=function(){this.start=()=>{};this.stop=()=>{this.onstop&&this.onstop();};};w.MediaRecorder.isTypeSupported=()=>false;
    w.requestAnimationFrame=cb=>setTimeout(()=>cb(w.performance.now()),8);w.cancelAnimationFrame=id=>clearTimeout(id);
    w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;
  }});
  await new Promise(r=>setTimeout(r,900));
  assert.deepEqual(errors,[],errors.join('\n'));
  const w=dom.window,d=w.document,shape=w.InkFrameCanvasShape,radial=w.InkFrameRadialTimeline,timing=w.InkFrameRadialTiming;
  assert.ok(shape&&shape.installed);assert.ok(radial);assert.ok(timing,'Radial Timing runtime missing');
  assert.equal(radial.__radialTimingPatched,true);
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),board=d.getElementById('frameBoard');
  Object.defineProperty(frameGlass,'clientWidth',{configurable:true,value:760});Object.defineProperty(frameGlass,'clientHeight',{configurable:true,value:580});
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:20});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:20});
  canvas.getBoundingClientRect=()=>({left:20,top:20,width:720,height:540,right:740,bottom:560});
  board.getBoundingClientRect=()=>({left:0,top:0,width:760,height:580,right:760,bottom:580});
  const pointer=(type,target,values)=>{const event=new w.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});target.dispatchEvent(event);return event;};

  assert.equal(shape.toggle(),true);await new Promise(r=>setTimeout(r,60));
  assert.equal(board.dataset.radialTiming,'true');
  assert.ok(board.querySelector('.inkframe-radial-timing-svg'));
  assert.ok(board.querySelector('.inkframe-radial-timing-toggle'));
  assert.equal(board.querySelectorAll('.inkframe-radial-nav button').length,5);
  assert.equal(board.querySelectorAll('.inkframe-hold-arc').length,1);

  const project=w.InkFrameCanvasShapeEnvironment().getProject();
  for(let i=0;i<3;i++){
    const next=board.querySelector('.frameSlot.next');d.elementFromPoint=()=>next;
    pointer('pointerdown',board,{pointerId:110+i,pointerType:'pen',clientX:100,clientY:100,buttons:1,button:0});
    pointer('pointerup',board,{pointerId:110+i,pointerType:'pen',clientX:100,clientY:100,buttons:0,button:0});
    await new Promise(r=>setTimeout(r,55));
  }
  assert.equal(project.frames.length,4);assert.equal(board.querySelectorAll('.inkframe-hold-arc').length,4);
  const frameRefs=project.frames.slice(),layerRefs=project.frames.map(frame=>frame.layers.slice());

  board.querySelector('.inkframe-radial-timing-toggle').click();await new Promise(r=>setTimeout(r,30));
  assert.equal(timing.viewSnapshot(project).timingMode,true);assert.equal(board.dataset.timingMode,'true');
  assert.ok(board.querySelector('.inkframe-timing-tools'));
  let current=Number(board.querySelector('.frameSlot.cur').dataset.frame);
  assert.match(board.querySelector('.inkframe-timing-status').textContent,new RegExp(`Frame ${current+1} · Hold 1`));

  board.querySelector('.inkframe-timing-plus').click();await new Promise(r=>setTimeout(r,55));
  assert.equal(project.holds[current],2,'plus timing control must update the established hold array');
  assert.equal(board.querySelector(`.inkframe-hold-arc[data-frame="${current}"]`).dataset.hold,'2');
  assert.match(board.querySelector(`.frameSlot[data-frame="${current}"]`).title,/hold 2$/);

  const plan=radial.lastLayout,slot=plan.slots[current];
  const dx=slot.x-plan.metrics.centerX,dy=slot.y-plan.metrics.centerY,len=Math.hypot(dx,dy)||1;
  const ox=slot.x+dx/len*42,oy=slot.y+dy/len*42;
  let cell=board.querySelector(`.frameSlot[data-frame="${current}"]`);
  pointer('pointerdown',cell,{pointerId:121,pointerType:'pen',clientX:slot.x,clientY:slot.y,buttons:1,button:0});
  pointer('pointermove',board,{pointerId:121,pointerType:'pen',clientX:ox,clientY:oy,buttons:1,button:0});
  pointer('pointerup',board,{pointerId:121,pointerType:'pen',clientX:ox,clientY:oy,buttons:0,button:0});
  await new Promise(r=>setTimeout(r,70));
  assert.equal(project.holds[current],4,'outward S Pen drag must increase hold by radial distance');
  assert.equal(board.querySelector(`.inkframe-hold-arc[data-frame="${current}"]`).dataset.hold,'4');

  board.dispatchEvent(new w.KeyboardEvent('keydown',{key:'1',bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,45));
  assert.equal(project.holds[current],1,'timing keyboard preset must update the current hold');
  board.querySelector('.inkframe-timing-twos').click();await new Promise(r=>setTimeout(r,45));
  assert.equal(project.holds[current],2,'Twos must delegate to the established hold array');

  board.querySelector('.inkframe-timing-loop').click();await new Promise(r=>setTimeout(r,70));
  assert.equal(radial.playbackState.loopOn,true);assert.equal(board.querySelectorAll('.inkframe-timing-loop-handle').length,2);
  assert.ok(board.querySelector('.inkframe-radial-loop'));
  let inHandle=board.querySelector('.inkframe-timing-loop-handle[data-which="in"]');
  let target=radial.lastLayout.slots[1];
  pointer('pointerdown',inHandle,{pointerId:122,pointerType:'pen',clientX:Number.parseFloat(inHandle.style.left),clientY:Number.parseFloat(inHandle.style.top),buttons:1,button:0});
  pointer('pointermove',inHandle,{pointerId:122,pointerType:'pen',clientX:target.x,clientY:target.y,buttons:1,button:0});
  pointer('pointerup',inHandle,{pointerId:122,pointerType:'pen',clientX:target.x,clientY:target.y,buttons:0,button:0});
  await new Promise(r=>setTimeout(r,70));
  assert.equal(radial.playbackState.loopIn,1,'loop IN handle must delegate to the established loop range');

  let outHandle=board.querySelector('.inkframe-timing-loop-handle[data-which="out"]');target=radial.lastLayout.slots[2];
  pointer('pointerdown',outHandle,{pointerId:123,pointerType:'pen',clientX:Number.parseFloat(outHandle.style.left),clientY:Number.parseFloat(outHandle.style.top),buttons:1,button:0});
  pointer('pointermove',outHandle,{pointerId:123,pointerType:'pen',clientX:target.x,clientY:target.y,buttons:1,button:0});
  pointer('pointerup',outHandle,{pointerId:123,pointerType:'pen',clientX:target.x,clientY:target.y,buttons:0,button:0});
  await new Promise(r=>setTimeout(r,70));
  assert.equal(radial.playbackState.loopOut,2,'loop OUT handle must delegate to the established loop range');
  assert.equal(project.frames.length,4);assert.ok(frameRefs.every((frame,i)=>project.frames[i]===frame));
  assert.ok(layerRefs.every((layers,i)=>layers.every((layer,j)=>project.frames[i].layers[j]===layer)),'timing edits must not replace artwork layers');

  let blockedHold=0,blockedLoop=0;const blockedProject={};
  const blockedEnv={frameGlass,canvas,slotCount:12,framesLength:4,current:0,selectedFrames:new Set(),holdAt:()=>1,maxFrames:120,shape:'circle',project:blockedProject,playing:false,fps:12,loopOn:true,loopIn:0,loopOut:3,playbackFraction:.1,canNavigate:()=>false,canEditTiming:()=>false,seek:()=>false,seekFraction:()=>false,togglePlayback:()=>false,setHold:()=>blockedHold++,setLoopRange:()=>blockedLoop++,toggleLoop:()=>blockedLoop++,thumbAt:()=>''};
  radial.render(board,blockedEnv);await new Promise(r=>setTimeout(r,25));
  board.querySelector('.inkframe-radial-timing-toggle').click();
  board.dispatchEvent(new w.KeyboardEvent('keydown',{key:']',bubbles:true,cancelable:true}));
  const blockedHandle=board.querySelector('.inkframe-timing-loop-handle[data-which="in"]'),blockedTarget=radial.lastLayout.slots[2];
  pointer('pointerdown',blockedHandle,{pointerId:124,pointerType:'pen',clientX:blockedTarget.x,clientY:blockedTarget.y,buttons:1,button:0});
  pointer('pointermove',blockedHandle,{pointerId:124,pointerType:'pen',clientX:blockedTarget.x,clientY:blockedTarget.y,buttons:1,button:0});
  pointer('pointerup',blockedHandle,{pointerId:124,pointerType:'pen',clientX:blockedTarget.x,clientY:blockedTarget.y,buttons:0,button:0});
  await new Promise(r=>setTimeout(r,30));
  assert.equal(timing.viewSnapshot(blockedProject).timingMode,false,'active-stroke guard must block timing mode');
  assert.equal(blockedHold,0,'active-stroke guard must block hold changes');assert.equal(blockedLoop,0,'active-stroke guard must block loop changes');
  assert.equal(timing.viewSnapshot(project).timingMode,true,'timing mode must remain memory-only and isolated by project');

  assert.equal(timing.projectCanvasWrites,0);assert.equal(timing.artworkUndoWrites,0);assert.equal(timing.timelineTimingWrites,true);
  dom.window.close();console.log('✅ generated Android radial timing edits holds and loop bounds while preserving artwork and active-stroke guards');
}finally{rmSync(temp,{recursive:true,force:true});}
