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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-radial-variations-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="radial-timing-variations.js"></script>'));
  assert.ok(html.indexOf('radial-timing-recipes.js')<html.indexOf('radial-timing-variations.js'));
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
  const w=dom.window,d=w.document,radial=w.InkFrameRadialTimeline,timing=w.InkFrameRadialTiming,patterns=w.InkFrameRadialPatterns,recipes=w.InkFrameRadialRecipes,variations=w.InkFrameRadialVariations;
  assert.ok(radial&&timing&&patterns&&recipes&&variations,'radial variation stack missing');assert.equal(radial.__radialVariationsPatched,true);
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),board=d.getElementById('frameBoard');
  Object.defineProperty(frameGlass,'clientWidth',{configurable:true,value:760});Object.defineProperty(frameGlass,'clientHeight',{configurable:true,value:580});
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:20});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:20});
  canvas.getBoundingClientRect=()=>({left:20,top:20,width:720,height:540,right:740,bottom:560});board.getBoundingClientRect=()=>({left:0,top:0,width:760,height:580,right:760,bottom:580});

  const project={},holds=[1,2,3,1,2,3],transactions=[];
  const env={frameGlass,canvas,slotCount:12,framesLength:6,current:0,selectedFrames:new Set(),holdAt:index=>holds[index],maxFrames:120,shape:'circle',project,playing:false,fps:12,loopOn:false,loopIn:0,loopOut:5,playbackFraction:.1,canNavigate:()=>true,canEditTiming:()=>true,seek:()=>true,seekFraction:()=>true,togglePlayback:()=>false,setHold:()=>false,setHolds:entries=>{transactions.push(entries.map(entry=>({...entry})));for(const entry of entries)holds[entry.index]=entry.value;return entries;},setLoopRange:()=>true,toggleLoop:()=>true,thumbAt:()=>''};
  const wait=ms=>new Promise(resolvePromise=>setTimeout(resolvePromise,ms));
  const openStack=async()=>{
    radial.render(board,env);await wait(35);
    if(!board.querySelector('.inkframe-radial-timing-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-radial-timing-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-rhythm-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-rhythm-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-recipe-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-recipe-toggle').click();await wait(55);}
  };
  const openVariations=async()=>{
    await openStack();const toggle=board.querySelector('.inkframe-variation-toggle');assert.ok(toggle,'variation toggle must follow recipe shelf render');
    if(toggle.getAttribute('aria-pressed')!=='true'){toggle.click();await wait(55);}
    assert.equal(variations.viewSnapshot(project).open,true);assert.ok(board.querySelector('.inkframe-variation-shelf'));
  };

  await openStack();
  const name=board.querySelector('.inkframe-recipe-name');name.value='Pulse Three';name.dispatchEvent(new w.Event('input',{bubbles:true}));board.querySelector('.inkframe-recipe-capture').click();await wait(75);
  assert.equal(recipes.store.snapshot().recipes.length,1);assert.deepEqual(Array.from(recipes.store.snapshot().recipes[0].values),[1,2,3]);
  await openVariations();assert.equal(board.querySelectorAll('.inkframe-variation-item').length,8);

  board.querySelector('[data-variation="palindrome"]').click();board.querySelector('.inkframe-variation-preview').click();await wait(70);
  assert.deepEqual(Array.from(holds),[1,2,3,1,2,3],'variation preview must not mutate timing');
  assert.deepEqual(Array.from(board.querySelectorAll('.inkframe-variation-preview-arc'),node=>Number(node.dataset.hold)),[1,2,3,2,1,1]);
  assert.equal(variations.viewSnapshot(project).selectedVariationId,'palindrome');assert.equal(variations.viewSnapshot(project).preview,true);

  board.querySelector('.inkframe-variation-apply').click();await wait(85);
  assert.deepEqual(Array.from(holds),[1,2,3,2,1,1]);assert.equal(transactions.length,1,'variation apply must use one batch transaction');
  assert.equal(patterns.viewSnapshot(project).undoDepth,1,'variations must share timing-only history');
  await openStack();board.querySelector('.inkframe-rhythm-undo').click();await wait(75);
  assert.deepEqual(Array.from(holds),[1,2,3,1,2,3]);assert.equal(patterns.viewSnapshot(project).redoDepth,1);

  await openVariations();board.querySelector('[data-variation="pulse"]').click();await wait(35);
  const beforeLibrary=recipes.store.snapshot(),beforeIds=new Set(beforeLibrary.recipes.map(item=>item.id));board.querySelector('.inkframe-variation-save').click();await wait(90);
  const library=recipes.store.snapshot();assert.equal(library.recipes.length,beforeLibrary.recipes.length+1);const saved=library.recipes.find(item=>!beforeIds.has(item.id));
  assert.ok(saved);assert.match(saved.name,/· Pulse$/);assert.deepEqual(Array.from(saved.values),[2,1,4]);assert.ok(w.localStorage.getItem(recipes.STORAGE_KEY));

  await openVariations();const beforeKeyboard=variations.viewSnapshot(project).selectedVariationId;board.dispatchEvent(new w.KeyboardEvent('keydown',{key:'k',bubbles:true,cancelable:true}));await wait(40);
  assert.notEqual(variations.viewSnapshot(project).selectedVariationId,beforeKeyboard,'K must cycle forward through generated siblings');
  const beforePreview=variations.viewSnapshot(project).preview;board.dispatchEvent(new w.KeyboardEvent('keydown',{key:'b',bubbles:true,cancelable:true}));await wait(40);assert.equal(variations.viewSnapshot(project).preview,!beforePreview);

  const beforeBlockedTransactions=transactions.length,beforeBlockedLibrary=recipes.store.snapshot().recipes.length;env.canEditTiming=()=>false;radial.render(board,env);await wait(35);
  assert.equal(variations.applySelected(),false);assert.equal(variations.saveSelected(),null);assert.equal(transactions.length,beforeBlockedTransactions);assert.equal(recipes.store.snapshot().recipes.length,beforeBlockedLibrary);
  assert.deepEqual({...variations.viewSnapshot({})},{open:false,baseId:null,selectedVariationId:null,preview:false},'variation view state must remain isolated by project');
  assert.deepEqual(project,{},'variation lab must not write project schema fields');

  assert.equal(variations.projectCanvasWrites,0);assert.equal(variations.artworkUndoWrites,0);assert.equal(variations.timelineTimingWrites,true);assert.equal(variations.projectSchemaWrites,0);assert.equal(variations.deviceLibraryWrites,true);assert.equal(variations.randomWrites,0);
  dom.window.close();console.log('✅ generated Android timing variation preview, shared apply/undo, saved siblings, keyboard controls, guards, and isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}
