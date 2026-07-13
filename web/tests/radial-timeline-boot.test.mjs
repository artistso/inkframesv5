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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-radial-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="radial-timeline.js"></script>'));
  assert.ok(html.includes('InkFrameRadialTimeline.render(board'));
  assert.ok(html.includes('InkFrameRadialTimeline.refreshThumbnail(cur,thumb)'));
  assert.ok(html.includes('project:projects[pi]'));
  assert.ok(html.includes('canNavigate:()=>'));
  assert.ok(html.includes('seek:i=>'));
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
  const w=dom.window,d=w.document,shape=w.InkFrameCanvasShape,radial=w.InkFrameRadialTimeline;
  assert.ok(shape&&shape.installed,'Circular Canvas did not install');
  assert.ok(radial,'Radial Timeline runtime missing');
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),board=d.getElementById('frameBoard');
  Object.defineProperty(frameGlass,'clientWidth',{configurable:true,value:760});Object.defineProperty(frameGlass,'clientHeight',{configurable:true,value:580});
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:20});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:20});
  canvas.getBoundingClientRect=()=>({left:20,top:20,width:720,height:540,right:740,bottom:560});
  board.getBoundingClientRect=()=>({left:0,top:0,width:760,height:580,right:760,bottom:580});

  assert.equal(shape.toggle(),true);await new Promise(r=>setTimeout(r,40));
  assert.equal(shape.currentShape(),'circle');
  assert.equal(board.dataset.radialTimeline,'true');assert.equal(board.dataset.timelineShape,'circle');
  assert.equal(board.getAttribute('role'),'listbox');assert.equal(board.tabIndex,0);
  assert.ok(board.querySelector('.inkframe-radial-orbits'),'orbit SVG missing');
  assert.ok(board.querySelector('.inkframe-radial-hit'),'orbit drag target missing');
  assert.ok(board.querySelector('.inkframe-radial-nav'),'navigation controls missing');
  assert.equal(board.querySelectorAll('.inkframe-radial-nav button').length,2);
  assert.equal(board.querySelectorAll('.frameSlot').length,12);
  assert.equal(board.querySelectorAll('.frameSlot.filled').length,1);
  assert.equal(board.querySelectorAll('.frameSlot.next').length,1);
  assert.ok(board.querySelector('.frameSlot.filled .inkframe-radial-thumb'),'frame thumbnail missing');
  assert.equal(board.querySelector('.frameSlot.cur .inkframe-radial-number').textContent,'1');
  assert.equal(board.getAttribute('aria-activedescendant'),'inkframe-radial-frame-0');
  const circular=radial.lastLayout;
  assert.equal(circular.shape,'circle');
  const radius=circular.rings[0].rx;
  assert.ok(circular.slots.every(slot=>Math.abs(Math.hypot(slot.x-circular.metrics.centerX,slot.y-circular.metrics.centerY)-radius)<1e-6));

  const project=shape.currentShape&&w.InkFrameCanvasShapeEnvironment().getProject();
  assert.equal(project.frames.length,1);
  let hit=board.querySelector('.frameSlot.next');d.elementFromPoint=()=>hit;
  const pointer=(type,target,values)=>{const event=new w.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});target.dispatchEvent(event);return event;};
  pointer('pointerdown',board,{pointerId:91,pointerType:'pen',clientX:100,clientY:100,buttons:1,button:0});
  pointer('pointerup',board,{pointerId:91,pointerType:'pen',clientX:100,clientY:100,buttons:0,button:0});
  await new Promise(r=>setTimeout(r,60));
  assert.equal(project.frames.length,2,'tapping the next orbital slot must preserve add-frame behavior');
  assert.equal(board.querySelectorAll('.frameSlot.filled').length,2);

  const key=name=>board.dispatchEvent(new w.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true}));
  key('End');await new Promise(r=>setTimeout(r,35));
  assert.equal(board.querySelector('.frameSlot.cur').dataset.frame,'1','End must seek the last frame');
  key('Home');await new Promise(r=>setTimeout(r,35));
  assert.equal(board.querySelector('.frameSlot.cur').dataset.frame,'0','Home must seek the first frame');
  key('ArrowRight');await new Promise(r=>setTimeout(r,35));
  assert.equal(board.querySelector('.frameSlot.cur').dataset.frame,'1','ArrowRight must step forward');

  board.querySelector('.inkframe-radial-center').click();await new Promise(r=>setTimeout(r,25));
  const focusedPoint=radial.lastLayout.slots[1];
  assert.ok(Math.abs(radial.normalizeAngle(focusedPoint.angle+Math.PI/2))<1e-6,'Center current must place frame 2 at twelve o’clock');

  const beforeRotation=radial.lastLayout.rotation,beforeFrames=project.frames.length,dragPlan=radial.lastLayout;
  hit=board.querySelector('.inkframe-radial-hit');d.elementFromPoint=()=>hit;
  pointer('pointerdown',hit,{pointerId:92,pointerType:'pen',clientX:dragPlan.metrics.centerX+dragPlan.rings[0].rx,clientY:dragPlan.metrics.centerY,buttons:1,button:0});
  pointer('pointermove',board,{pointerId:92,pointerType:'pen',clientX:dragPlan.metrics.centerX,clientY:dragPlan.metrics.centerY+dragPlan.rings[0].ry,buttons:1,button:0});
  pointer('pointerup',board,{pointerId:92,pointerType:'pen',clientX:dragPlan.metrics.centerX,clientY:dragPlan.metrics.centerY+dragPlan.rings[0].ry,buttons:0,button:0});
  await new Promise(r=>setTimeout(r,25));
  assert.ok(Math.abs(radial.normalizeAngle(radial.lastLayout.rotation-beforeRotation)-Math.PI/2)<1e-6,'orbit drag must rotate by the pen angle delta');
  assert.equal(project.frames.length,beforeFrames,'orbit rotation must not mutate timeline data');

  assert.equal(radial.refreshThumbnail(0,'data:image/png;base64,updated'),true);
  assert.ok(board.querySelector('.frameSlot[data-frame="0"] .inkframe-radial-thumb').style.backgroundImage.includes('updated'));

  assert.equal(shape.toggle(),true);await new Promise(r=>setTimeout(r,40));
  assert.equal(shape.currentShape(),'square');assert.equal(board.dataset.timelineShape,'square');
  const elliptical=radial.lastLayout;
  assert.notEqual(elliptical.rings[0].rx,elliptical.rings[0].ry);
  assert.equal(project.frames.length,2,'shape relayout must not mutate timeline data');

  const fakeProject={},fakeEnv={frameGlass,canvas,slotCount:120,framesLength:120,current:90,selectedFrames:new Set(),holdAt:()=>1,maxFrames:120,shape:'square',project:fakeProject,canNavigate:()=>true,seek:()=>true,thumbAt:()=>''};
  assert.equal(radial.render(board,fakeEnv),true);assert.ok(radial.lastLayout.rings.length>=2,'120 frames must expand beyond one ring at tablet dimensions');
  board.querySelector('.inkframe-radial-ring').click();await new Promise(r=>setTimeout(r,20));
  assert.ok(board.dataset.focusRing!=null,'ring focus must identify the current ring');
  assert.ok(board.querySelectorAll('.frameSlot.inkframe-radial-muted').length>0,'ring focus must dim other rings');
  assert.equal(board.querySelector('.inkframe-radial-ring').getAttribute('aria-pressed'),'true');
  board.querySelector('.inkframe-radial-ring').click();await new Promise(r=>setTimeout(r,20));
  assert.equal(board.dataset.focusRing,undefined);assert.equal(board.querySelectorAll('.frameSlot.inkframe-radial-muted').length,0);

  let blockedSeek=null;const blockedProject={};
  radial.render(board,{...fakeEnv,project:blockedProject,current:10,canNavigate:()=>false,seek:i=>blockedSeek=i});
  const blockedRotation=radial.lastLayout.rotation;
  board.querySelector('.inkframe-radial-center').click();
  key('End');await new Promise(r=>setTimeout(r,20));
  assert.equal(radial.lastLayout.rotation,blockedRotation,'active-stroke guard must block centering');
  assert.equal(blockedSeek,null,'active-stroke guard must block keyboard seek');

  assert.equal(radial.projectCanvasWrites,0);assert.equal(radial.undoWrites,0);
  dom.window.close();console.log('✅ generated Android radial navigation rotates, focuses, seeks, guards strokes, and preserves project data');
}finally{rmSync(temp,{recursive:true,force:true});}
