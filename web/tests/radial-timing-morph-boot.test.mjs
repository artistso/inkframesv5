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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-radial-morph-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="radial-timing-morph.js"></script>'));
  assert.ok(html.indexOf('radial-timing-variations.js')<html.indexOf('radial-timing-morph.js'));
  html=html.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{const file=resolve(webDir,src);assert.ok(existsSync(file),`missing ${src}`);return `<script>${readFileSync(file,'utf8')}</script>`;});
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.detail?.stack||error.message));vc.on('error',(...args)=>errors.push(args.join(' ')));
  const contexts=new WeakMap();
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.__canvasOps=[];w.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(){this.callback([]);}disconnect(){}};
    w.HTMLCanvasElement.prototype.getContext=function(type){
      if(type!=='2d')return null;if(contexts.has(this))return contexts.get(this);
      const canvas=this,state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter',imageSmoothingEnabled:true};
      const context=new Proxy(state,{get(target,key){
        if(key==='canvas')return canvas;if(key==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});
        if(key==='createImageData')return(width,height)=>({data:new Uint8ClampedArray(width*height*4),width,height});if(key==='putImageData')return(...args)=>w.__canvasOps.push({canvas,method:'putImageData',args});
        if(key==='createRadialGradient'||key==='createLinearGradient')return()=>({addColorStop:()=>{}});if(key==='measureText')return text=>({width:String(text).length*7});
        if(typeof key==='string'&&!key.startsWith('__')&&key!=='then'&&key!=='constructor'){if(key in target)return target[key];return(...args)=>w.__canvasOps.push({canvas,method:key,args});}return undefined;
      },set(target,key,value){target[key]=value;return true;}});contexts.set(canvas,context);return context;
    };
    w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,frame';w.HTMLCanvasElement.prototype.toBlob=callback=>callback(new w.Blob([],{type:'image/png'}));
    w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[{requestFrame(){},stop(){}}]});w.Element.prototype.setPointerCapture=()=>{};w.Element.prototype.releasePointerCapture=()=>{};
    w.MediaRecorder=function(){this.start=()=>{};this.stop=()=>{this.onstop&&this.onstop();};};w.MediaRecorder.isTypeSupported=()=>false;
    w.requestAnimationFrame=callback=>setTimeout(()=>callback(w.performance.now()),8);w.cancelAnimationFrame=id=>clearTimeout(id);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;
  }});
  await new Promise(resolvePromise=>setTimeout(resolvePromise,950));assert.deepEqual(errors,[],errors.join('\n'));
  const w=dom.window,d=w.document,radial=w.InkFrameRadialTimeline,timing=w.InkFrameRadialTiming,patterns=w.InkFrameRadialPatterns,recipes=w.InkFrameRadialRecipes,morph=w.InkFrameRadialMorph;
  assert.ok(radial&&timing&&patterns&&recipes&&morph,'radial morph stack missing');assert.equal(radial.__radialMorphPatched,true);
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),board=d.getElementById('frameBoard');
  Object.defineProperty(frameGlass,'clientWidth',{configurable:true,value:760});Object.defineProperty(frameGlass,'clientHeight',{configurable:true,value:580});
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:20});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:20});
  canvas.getBoundingClientRect=()=>({left:20,top:20,width:720,height:540,right:740,bottom:560});board.getBoundingClientRect=()=>({left:0,top:0,width:760,height:580,right:760,bottom:580});

  const project={},holds=[1,3,1,3,1,3],transactions=[];
  const env={frameGlass,canvas,slotCount:12,framesLength:6,current:0,selectedFrames:new Set(),holdAt:index=>holds[index],maxFrames:120,shape:'circle',project,playing:false,fps:12,loopOn:false,loopIn:0,loopOut:5,playbackFraction:.1,canNavigate:()=>true,canEditTiming:()=>true,seek:()=>true,seekFraction:()=>true,togglePlayback:()=>false,setHold:()=>false,setHolds:entries=>{transactions.push(entries.map(entry=>({...entry})));for(const entry of entries)holds[entry.index]=entry.value;return entries;},setLoopRange:()=>true,toggleLoop:()=>true,thumbAt:()=>''};
  const alpha=recipes.store.save('Alpha',[1,3]),beta=recipes.store.save('Beta',[5,7,2]);assert.equal(recipes.store.snapshot().recipes.length,2);
  const wait=ms=>new Promise(resolvePromise=>setTimeout(resolvePromise,ms));
  const openStack=async()=>{
    radial.render(board,env);await wait(35);
    if(!board.querySelector('.inkframe-radial-timing-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-radial-timing-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-rhythm-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-rhythm-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-recipe-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-recipe-toggle').click();await wait(55);}
  };
  const openMorph=async()=>{
    await openStack();const toggle=board.querySelector('.inkframe-morph-toggle');assert.ok(toggle,'morph toggle must follow recipe shelf render');
    if(toggle.getAttribute('aria-pressed')!=='true'){toggle.click();await wait(55);}
    assert.equal(morph.viewSnapshot(project).open,true);assert.ok(board.querySelector('.inkframe-morph-shelf'));
  };

  await openMorph();
  let snapshot=morph.viewSnapshot(project);assert.equal(snapshot.sourceAId,alpha.id);assert.equal(snapshot.sourceBId,beta.id);assert.equal(snapshot.mix,50);assert.equal(snapshot.recipeCount,2);
  assert.equal(board.querySelectorAll('.inkframe-morph-source').length,2);assert.equal(board.querySelectorAll('.inkframe-morph-source option').length,4);
  board.querySelector('.inkframe-morph-preview').click();await wait(70);
  assert.deepEqual(Array.from(holds),[1,3,1,3,1,3],'morph preview must not mutate timing');
  assert.deepEqual(Array.from(board.querySelectorAll('.inkframe-morph-preview-arc'),node=>Number(node.dataset.hold)),[3,5,2,4,4,3]);
  assert.equal(morph.viewSnapshot(project).preview,true);assert.equal(transactions.length,0);

  board.querySelector('.inkframe-morph-apply').click();await wait(85);
  assert.deepEqual(Array.from(holds),[3,5,2,4,4,3]);assert.equal(transactions.length,1,'morph apply must use one batch transaction');
  assert.equal(patterns.viewSnapshot(project).undoDepth,1,'morphs must share timing-only history');
  await openStack();board.querySelector('.inkframe-rhythm-undo').click();await wait(75);
  assert.deepEqual(Array.from(holds),[1,3,1,3,1,3]);assert.equal(patterns.viewSnapshot(project).redoDepth,1);

  await openMorph();board.querySelector('[data-mix="25"]').click();await wait(65);
  assert.equal(morph.viewSnapshot(project).mix,25);const quarter=[2,4,1,4,3,3];
  assert.deepEqual(Array.from(board.querySelectorAll('.inkframe-morph-preview-arc'),node=>Number(node.dataset.hold)),quarter);
  const beforeSwap=Array.from(board.querySelectorAll('.inkframe-morph-preview-arc'),node=>Number(node.dataset.hold));board.querySelector('.inkframe-morph-swap').click();await wait(65);
  snapshot=morph.viewSnapshot(project);assert.equal(snapshot.sourceAId,beta.id);assert.equal(snapshot.sourceBId,alpha.id);assert.equal(snapshot.mix,75);
  assert.deepEqual(Array.from(board.querySelectorAll('.inkframe-morph-preview-arc'),node=>Number(node.dataset.hold)),beforeSwap,'Swap plus complementary mix must preserve the blend');

  const beforeLibrary=recipes.store.snapshot(),beforeIds=new Set(beforeLibrary.recipes.map(item=>item.id));board.querySelector('.inkframe-morph-save').click();await wait(90);
  const library=recipes.store.snapshot();assert.equal(library.recipes.length,beforeLibrary.recipes.length+1);const saved=library.recipes.find(item=>!beforeIds.has(item.id));
  assert.ok(saved);assert.match(saved.name,/↔/);assert.match(saved.name,/· 75%$/);assert.deepEqual(Array.from(saved.values),quarter);assert.ok(w.localStorage.getItem(recipes.STORAGE_KEY));

  await openMorph();board.dispatchEvent(new w.KeyboardEvent('keydown',{key:'m',bubbles:true,cancelable:true}));await wait(40);assert.equal(morph.viewSnapshot(project).mix,80);
  board.dispatchEvent(new w.KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}));await wait(40);assert.equal(morph.viewSnapshot(project).mix,75);

  const beforeBlockedTransactions=transactions.length,beforeBlockedLibrary=recipes.store.snapshot().recipes.length;env.canEditTiming=()=>false;radial.render(board,env);await wait(35);
  assert.equal(morph.applyBlend(),false);assert.equal(morph.saveBlend(),null);assert.equal(morph.setMix(50),false);assert.equal(morph.swapSources(),false);
  assert.equal(transactions.length,beforeBlockedTransactions);assert.equal(recipes.store.snapshot().recipes.length,beforeBlockedLibrary);
  assert.deepEqual({...morph.viewSnapshot({})},{open:false,sourceAId:null,sourceBId:null,mix:50,preview:false,recipeCount:3},'morph view state must remain isolated by project');
  assert.deepEqual(project,{},'morph lab must not write project schema fields');

  assert.equal(morph.projectCanvasWrites,0);assert.equal(morph.artworkUndoWrites,0);assert.equal(morph.timelineTimingWrites,true);assert.equal(morph.projectSchemaWrites,0);assert.equal(morph.deviceLibraryWrites,true);assert.equal(morph.sourceRecipeWrites,0);assert.equal(morph.randomWrites,0);
  dom.window.close();console.log('✅ generated Android timing morph preview, snap/swap invariance, shared apply/undo, saved blends, collision-free mix keys, guards, and isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}

await import('./radial-timing-phrases-boot.test.mjs');
