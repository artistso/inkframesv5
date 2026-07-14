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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-radial-patterns-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="radial-timeline.js"></script>'));
  assert.ok(html.includes('<script src="radial-timing-editor.js"></script>'));
  assert.ok(html.includes('<script src="radial-timing-patterns.js"></script>'));
  assert.ok(html.indexOf('radial-timeline.js')<html.indexOf('radial-timing-editor.js'));
  assert.ok(html.indexOf('radial-timing-editor.js')<html.indexOf('radial-timing-patterns.js'));
  assert.ok(html.includes('setHolds:entries=>'));
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
        if(typeof p==='string'&&!p.startsWith('__')&&p!=='then'&&p!=='constructor'){if(p in t)return t[p];return(...args)=>{w.__canvasOps.push({canvas,method:p,args});};}
        return undefined;
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
  await new Promise(r=>setTimeout(r,950));
  assert.deepEqual(errors,[],errors.join('\n'));
  const w=dom.window,d=w.document,shape=w.InkFrameCanvasShape,radial=w.InkFrameRadialTimeline,timing=w.InkFrameRadialTiming,patterns=w.InkFrameRadialPatterns;
  assert.ok(shape&&shape.installed);assert.ok(radial&&timing&&patterns,'radial rhythm stack missing');
  assert.equal(radial.__radialTimingPatched,true);assert.equal(radial.__radialPatternsPatched,true);assert.equal(patterns.HISTORY_LIMIT,25);
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),board=d.getElementById('frameBoard');
  Object.defineProperty(frameGlass,'clientWidth',{configurable:true,value:760});Object.defineProperty(frameGlass,'clientHeight',{configurable:true,value:580});
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:20});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:20});
  canvas.getBoundingClientRect=()=>({left:20,top:20,width:720,height:540,right:740,bottom:560});
  board.getBoundingClientRect=()=>({left:0,top:0,width:760,height:580,right:760,bottom:580});
  const pointer=(type,target,values)=>{const event=new w.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});target.dispatchEvent(event);return event;};

  assert.equal(shape.toggle(),true);await new Promise(r=>setTimeout(r,70));
  const project=w.InkFrameCanvasShapeEnvironment().getProject();
  for(let i=0;i<4;i++){
    const next=board.querySelector('.frameSlot.next');d.elementFromPoint=()=>next;
    pointer('pointerdown',board,{pointerId:210+i,pointerType:'pen',clientX:100,clientY:100,buttons:1,button:0});
    pointer('pointerup',board,{pointerId:210+i,pointerType:'pen',clientX:100,clientY:100,buttons:0,button:0});
    await new Promise(r=>setTimeout(r,55));
  }
  assert.equal(project.frames.length,5);assert.deepEqual(Array.from(project.holds),[1,1,1,1,1]);
  const frameRefs=project.frames.slice(),layerRefs=project.frames.map(frame=>frame.layers.slice());

  board.querySelector('.inkframe-radial-timing-toggle').click();await new Promise(r=>setTimeout(r,60));
  assert.equal(timing.viewSnapshot(project).timingMode,true);
  assert.ok(board.querySelector('.inkframe-rhythm-toggle'),'rhythm toggle must follow local timing-toolbar render');
  board.querySelector('.inkframe-rhythm-toggle').click();await new Promise(r=>setTimeout(r,45));
  assert.equal(patterns.viewSnapshot(project).open,true);assert.ok(board.querySelector('.inkframe-rhythm-shelf'));
  assert.match(board.querySelector('.inkframe-rhythm-scope').textContent,/All frames · 5/);
  assert.equal(board.querySelectorAll('.inkframe-rhythm-pattern').length,6);

  board.querySelector('.inkframe-rhythm-twos').click();await new Promise(r=>setTimeout(r,85));
  assert.deepEqual(Array.from(project.holds),[2,2,2,2,2],'one-tap Twos must batch the complete default scope');
  assert.equal(patterns.viewSnapshot(project).undoDepth,1);assert.equal(patterns.viewSnapshot(project).redoDepth,0);
  assert.match(board.querySelector('.inkframe-rhythm-undo').title,/1\/25/);
  board.querySelector('.inkframe-rhythm-undo').click();await new Promise(r=>setTimeout(r,75));
  assert.deepEqual(Array.from(project.holds),[1,1,1,1,1]);assert.equal(patterns.viewSnapshot(project).redoDepth,1);
  board.querySelector('.inkframe-rhythm-redo').click();await new Promise(r=>setTimeout(r,75));
  assert.deepEqual(Array.from(project.holds),[2,2,2,2,2]);

  board.querySelector('.inkframe-rhythm-preview').click();await new Promise(r=>setTimeout(r,35));
  board.querySelector('.inkframe-rhythm-ease-in').click();await new Promise(r=>setTimeout(r,45));
  assert.deepEqual(Array.from(project.holds),[2,2,2,2,2],'preview must not mutate established holds');
  assert.equal(board.querySelectorAll('.inkframe-rhythm-preview-arc').length,5);
  assert.deepEqual(Array.from(board.querySelectorAll('.inkframe-rhythm-preview-arc'),node=>Number(node.dataset.hold)),[3,3,2,2,1]);
  assert.equal(board.querySelector('.inkframe-rhythm-apply').disabled,false);
  board.querySelector('.inkframe-rhythm-apply').click();await new Promise(r=>setTimeout(r,90));
  assert.deepEqual(Array.from(project.holds),[3,3,2,2,1]);assert.equal(patterns.viewSnapshot(project).undoDepth,2);
  assert.ok(frameRefs.every((frame,index)=>project.frames[index]===frame));
  assert.ok(layerRefs.every((layers,index)=>layers.every((layer,j)=>project.frames[index].layers[j]===layer)),'rhythms must preserve artwork object identity');

  const fakeProject={},fakeHolds=[1,1,1,1,1,1],transactions=[];
  const fakeEnv={frameGlass,canvas,slotCount:12,framesLength:6,current:0,selectedFrames:new Set([1,3,4]),holdAt:i=>fakeHolds[i],maxFrames:120,shape:'circle',project:fakeProject,playing:false,fps:12,loopOn:true,loopIn:0,loopOut:5,playbackFraction:.1,canNavigate:()=>true,canEditTiming:()=>true,seek:()=>true,seekFraction:()=>true,togglePlayback:()=>false,setHold:()=>false,setHolds:entries=>{transactions.push(entries.map(entry=>({...entry})));for(const entry of entries)fakeHolds[entry.index]=entry.value;return entries;},setLoopRange:()=>true,toggleLoop:()=>true,thumbAt:()=>''};
  radial.render(board,fakeEnv);await new Promise(r=>setTimeout(r,30));
  board.querySelector('.inkframe-radial-timing-toggle').click();await new Promise(r=>setTimeout(r,55));
  board.querySelector('.inkframe-rhythm-toggle').click();await new Promise(r=>setTimeout(r,35));
  assert.match(board.querySelector('.inkframe-rhythm-scope').textContent,/Selection · 3/);
  board.querySelector('.inkframe-rhythm-threes').click();await new Promise(r=>setTimeout(r,55));
  assert.deepEqual(fakeHolds,[1,3,1,3,3,1]);assert.equal(transactions.length,1,'selection rhythm must use one batch transaction');
  board.querySelector('.inkframe-rhythm-undo').click();await new Promise(r=>setTimeout(r,45));
  assert.deepEqual(fakeHolds,[1,1,1,1,1,1]);assert.equal(transactions.length,2);

  fakeEnv.selectedFrames=new Set();fakeEnv.loopOn=true;fakeEnv.loopIn=2;fakeEnv.loopOut=4;radial.render(board,fakeEnv);await new Promise(r=>setTimeout(r,35));
  assert.match(board.querySelector('.inkframe-rhythm-scope').textContent,/Loop · 3/);
  board.querySelector('.inkframe-rhythm-twos').click();await new Promise(r=>setTimeout(r,55));
  assert.deepEqual(fakeHolds,[1,1,2,2,2,1]);assert.equal(transactions.length,3,'loop rhythm must use one batch transaction');
  board.dispatchEvent(new w.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,55));
  assert.deepEqual(fakeHolds,[1,1,1,1,1,1],'Ctrl+Z must undo only the most recent timing rhythm');

  const beforeBlocked=transactions.length;fakeEnv.canEditTiming=()=>false;radial.render(board,fakeEnv);await new Promise(r=>setTimeout(r,25));
  const blockedPattern=board.querySelector('.inkframe-rhythm-threes');assert.ok(blockedPattern);blockedPattern.click();await new Promise(r=>setTimeout(r,30));
  assert.equal(transactions.length,beforeBlocked,'active-stroke timing guard must block rhythm writes');
  assert.equal(patterns.viewSnapshot(project).open,true,'rhythm shelf state must remain isolated by project');

  const limitProject={},limitHolds=[1],limitTransactions=[];
  const limitEnv={...fakeEnv,project:limitProject,framesLength:1,selectedFrames:new Set(),loopOn:false,loopIn:0,loopOut:0,holdAt:index=>limitHolds[index],canEditTiming:()=>true,setHolds:entries=>{limitTransactions.push(entries.map(entry=>({...entry})));for(const entry of entries)limitHolds[entry.index]=entry.value;return entries;}};
  radial.render(board,limitEnv);await new Promise(r=>setTimeout(r,35));
  for(let index=0;index<26;index++){
    const before=limitHolds[0],after=index%2===0?2:3;
    assert.equal(patterns.commitAssignments({id:`limit-${index}`,label:`Limit ${index}`,scope:'all'},[{index:0,before,after}]),true);
  }
  assert.equal(limitHolds[0],3);assert.equal(patterns.viewSnapshot(limitProject).undoDepth,25);assert.equal(patterns.viewSnapshot(limitProject).redoDepth,0);
  for(let index=0;index<25;index++)assert.equal(patterns.undo(),true);
  assert.equal(limitHolds[0],2,'the first retained state must remain after the oldest transaction is evicted');
  assert.equal(patterns.undo(),false,'a 26th Undo must be unavailable');
  assert.equal(patterns.viewSnapshot(limitProject).undoDepth,0);assert.equal(patterns.viewSnapshot(limitProject).redoDepth,25);
  for(let index=0;index<25;index++)assert.equal(patterns.redo(),true);
  assert.equal(limitHolds[0],3);assert.equal(patterns.redo(),false);assert.equal(patterns.viewSnapshot(limitProject).undoDepth,25);assert.equal(patterns.viewSnapshot(limitProject).redoDepth,0);
  assert.equal(patterns.undo(),true);assert.equal(limitHolds[0],2);assert.equal(patterns.viewSnapshot(limitProject).redoDepth,1);
  assert.equal(patterns.commitAssignments({id:'divergent',label:'Divergent',scope:'all'},[{index:0,before:2,after:4}]),true);
  assert.equal(limitHolds[0],4);assert.equal(patterns.viewSnapshot(limitProject).undoDepth,25);assert.equal(patterns.viewSnapshot(limitProject).redoDepth,0,'a divergent edit must clear Redo');
  assert.ok(limitTransactions.length>=52,'25-step history validation must exercise real batched timing writes');

  assert.equal(patterns.projectCanvasWrites,0);assert.equal(patterns.artworkUndoWrites,0);assert.equal(patterns.timelineTimingWrites,true);assert.equal(patterns.projectSchemaWrites,0);
  dom.window.close();console.log('✅ generated Android radial exposure rhythms preview, batch scopes, 25-step timing Undo/Redo, guards, and artwork isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}
