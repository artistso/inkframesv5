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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-radial-composer-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  for(const script of ['radial-timeline.js','radial-timing-editor.js','radial-timing-patterns.js','radial-rhythm-composer.js'])assert.ok(html.includes(`<script src="${script}"></script>`),`missing ${script}`);
  assert.ok(html.indexOf('radial-timing-editor.js')<html.indexOf('radial-timing-patterns.js'));
  assert.ok(html.indexOf('radial-timing-patterns.js')<html.indexOf('radial-rhythm-composer.js'));
  assert.ok(html.includes('setHolds:entries=>'));
  html=html.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{const file=resolve(webDir,src);assert.ok(existsSync(file),`missing ${src}`);return `<script>${readFileSync(file,'utf8')}</script>`;});
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.detail?.stack||error.message));vc.on('error',(...args)=>errors.push(args.join(' ')));
  const contexts=new WeakMap();
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    try{w.localStorage.clear();}catch(_){}
    w.__canvasOps=[];w.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(){this.callback([]);}disconnect(){}};
    w.HTMLCanvasElement.prototype.getContext=function(type){
      if(type!=='2d')return null;if(contexts.has(this))return contexts.get(this);const canvas=this;
      const state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter',imageSmoothingEnabled:true};
      const context=new Proxy(state,{get(target,property){
        if(property==='canvas')return canvas;
        if(property==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});
        if(property==='createImageData')return(width,height)=>({data:new Uint8ClampedArray(width*height*4),width,height});
        if(property==='putImageData')return(...args)=>w.__canvasOps.push({canvas,method:'putImageData',args});
        if(property==='createRadialGradient'||property==='createLinearGradient')return()=>({addColorStop:()=>{}});
        if(property==='measureText')return text=>({width:String(text).length*7});
        if(typeof property==='string'&&!property.startsWith('__')&&property!=='then'&&property!=='constructor'){if(property in target)return target[property];return(...args)=>{w.__canvasOps.push({canvas,method:property,args});};}
        return undefined;
      },set(target,property,value){target[property]=value;return true;}});contexts.set(canvas,context);return context;
    };
    w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,frame';w.HTMLCanvasElement.prototype.toBlob=callback=>callback(new w.Blob([],{type:'image/png'}));
    w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[{requestFrame(){},stop(){}}]});w.Element.prototype.setPointerCapture=()=>{};w.Element.prototype.releasePointerCapture=()=>{};
    w.MediaRecorder=function(){this.start=()=>{};this.stop=()=>{this.onstop&&this.onstop();};};w.MediaRecorder.isTypeSupported=()=>false;
    w.requestAnimationFrame=callback=>setTimeout(()=>callback(w.performance.now()),8);w.cancelAnimationFrame=id=>clearTimeout(id);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;
  }});
  await new Promise(resolve=>setTimeout(resolve,950));assert.deepEqual(errors,[],errors.join('\n'));
  const w=dom.window,d=w.document,radial=w.InkFrameRadialTimeline,timing=w.InkFrameRadialTiming,patterns=w.InkFrameRadialPatterns,composer=w.InkFrameRadialComposer;
  assert.ok(radial&&timing&&patterns&&composer,'custom rhythm stack missing');assert.equal(radial.__radialComposerPatched,true);
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),board=d.getElementById('frameBoard');
  Object.defineProperty(frameGlass,'clientWidth',{configurable:true,value:760});Object.defineProperty(frameGlass,'clientHeight',{configurable:true,value:580});
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:20});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:20});
  canvas.getBoundingClientRect=()=>({left:20,top:20,width:720,height:540,right:740,bottom:560});board.getBoundingClientRect=()=>({left:0,top:0,width:760,height:580,right:760,bottom:580});

  const frames=Array.from({length:6},(_,index)=>({index,layers:[{index,pixels:{}}]})),frameRefs=frames.slice(),layerRefs=frames.map(frame=>frame.layers[0]);
  const holds=[1,1,1,1,1,1],transactions=[];let editable=true;
  const project={frames,holds};
  const environment={frameGlass,canvas,slotCount:12,framesLength:6,current:0,selectedFrames:new Set(),holdAt:index=>holds[index],maxFrames:120,shape:'circle',project,playing:false,fps:12,loopOn:false,loopIn:0,loopOut:5,playbackFraction:.1,
    canNavigate:()=>editable,canEditTiming:()=>editable,seek:()=>true,seekFraction:()=>true,togglePlayback:()=>false,setHold:()=>false,
    setHolds:entries=>{transactions.push(entries.map(entry=>({...entry})));for(const entry of entries)holds[entry.index]=entry.value;return entries;},setLoopRange:()=>true,toggleLoop:()=>true,thumbAt:()=>''};
  radial.render(board,environment);await new Promise(resolve=>setTimeout(resolve,45));
  board.querySelector('.inkframe-radial-timing-toggle').click();await new Promise(resolve=>setTimeout(resolve,70));
  board.querySelector('.inkframe-rhythm-toggle').click();await new Promise(resolve=>setTimeout(resolve,60));
  assert.ok(board.querySelector('.inkframe-custom-rhythm-toggle'),'custom toggle must follow the rhythm shelf');
  board.querySelector('.inkframe-custom-rhythm-toggle').click();await new Promise(resolve=>setTimeout(resolve,45));
  assert.equal(composer.viewSnapshot(project).open,true);assert.ok(board.querySelector('.inkframe-rhythm-composer'));
  assert.deepEqual(Array.from(composer.viewSnapshot(project).values),[1,2]);

  const input=board.querySelector('.inkframe-composer-name');input.value='Bounce';input.dispatchEvent(new w.Event('input',{bubbles:true}));
  board.querySelector('.inkframe-composer-preview').click();await new Promise(resolve=>setTimeout(resolve,45));
  assert.deepEqual(holds,[1,1,1,1,1,1],'custom preview must not mutate holds');
  assert.equal(board.querySelectorAll('.inkframe-composer-preview-arc').length,6);
  assert.deepEqual(Array.from(board.querySelectorAll('.inkframe-composer-preview-arc'),node=>Number(node.dataset.hold)),[1,2,1,2,1,2]);
  board.querySelector('.inkframe-composer-apply').click();await new Promise(resolve=>setTimeout(resolve,80));
  assert.deepEqual(holds,[1,2,1,2,1,2]);assert.equal(transactions.length,1);assert.equal(patterns.viewSnapshot(project).undoDepth,1);
  board.querySelector('.inkframe-rhythm-undo').click();await new Promise(resolve=>setTimeout(resolve,70));assert.deepEqual(holds,[1,1,1,1,1,1]);

  board.querySelector('.inkframe-composer-save-pin').click();await new Promise(resolve=>setTimeout(resolve,70));
  let library=composer.library.snapshot();assert.equal(library.rhythms.length,1);assert.equal(library.rhythms[0].name,'Bounce');assert.deepEqual(library.rhythms[0].values,[1,2]);assert.deepEqual(library.pinned,[library.rhythms[0].id]);
  assert.ok(w.localStorage.getItem(composer.STORAGE_KEY));assert.ok(board.querySelector('.inkframe-custom-rhythm-pin'));
  const reloaded=composer.createCustomRhythmStore(w.localStorage);assert.equal(reloaded.snapshot().rhythms[0].name,'Bounce');assert.deepEqual(reloaded.snapshot().rhythms[0].values,[1,2]);

  holds.splice(0,holds.length,3,1,3,1,3,1);radial.render(board,environment);await new Promise(resolve=>setTimeout(resolve,50));
  if(!patterns.viewSnapshot(project).open){board.querySelector('.inkframe-rhythm-toggle').click();await new Promise(resolve=>setTimeout(resolve,50));}
  if(!composer.viewSnapshot(project).open){board.querySelector('.inkframe-custom-rhythm-toggle').click();await new Promise(resolve=>setTimeout(resolve,45));}
  board.querySelector('.inkframe-composer-capture').click();await new Promise(resolve=>setTimeout(resolve,45));
  assert.deepEqual(Array.from(composer.viewSnapshot(project).values),[3,1],'capture must reduce the active scope to its shortest repeating period');
  board.querySelector('.inkframe-composer-save').click();await new Promise(resolve=>setTimeout(resolve,55));library=composer.library.snapshot();assert.deepEqual(library.rhythms[0].values,[3,1],'saving the same name must update the existing rhythm');

  board.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));board.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,35));
  assert.deepEqual(Array.from(composer.viewSnapshot(project).values),[3,2]);
  editable=false;const beforeBlocked=transactions.length;radial.render(board,environment);await new Promise(resolve=>setTimeout(resolve,35));
  const pin=board.querySelector('.inkframe-custom-rhythm-pin');assert.ok(pin);pin.click();await new Promise(resolve=>setTimeout(resolve,35));assert.equal(transactions.length,beforeBlocked,'active-stroke guard must block saved rhythm application');
  assert.ok(frameRefs.every((frame,index)=>project.frames[index]===frame));assert.ok(layerRefs.every((layer,index)=>project.frames[index].layers[0]===layer),'composer must preserve artwork object identity');
  assert.equal(composer.projectCanvasWrites,0);assert.equal(composer.artworkUndoWrites,0);assert.equal(composer.timelineTimingWrites,true);assert.equal(composer.projectSchemaWrites,0);assert.equal(composer.appLibraryWrites,true);
  dom.window.close();console.log('✅ generated Android custom rhythm compose, preview, history, persistence, capture, pinning, guards, and artwork isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}
