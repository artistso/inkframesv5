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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-radial-phrases-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="radial-timing-phrases.js"></script>'));
  assert.ok(html.indexOf('radial-timing-morph.js')<html.indexOf('radial-timing-phrases.js'));
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
  const w=dom.window,d=w.document,radial=w.InkFrameRadialTimeline,timing=w.InkFrameRadialTiming,patterns=w.InkFrameRadialPatterns,recipes=w.InkFrameRadialRecipes,phrases=w.InkFrameRadialPhrases;
  assert.ok(radial&&timing&&patterns&&recipes&&phrases,'radial phrase stack missing');assert.equal(radial.__radialPhrasesPatched,true);
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),board=d.getElementById('frameBoard');
  Object.defineProperty(frameGlass,'clientWidth',{configurable:true,value:760});Object.defineProperty(frameGlass,'clientHeight',{configurable:true,value:580});
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:20});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:20});
  canvas.getBoundingClientRect=()=>({left:20,top:20,width:720,height:540,right:740,bottom:560});board.getBoundingClientRect=()=>({left:0,top:0,width:760,height:580,right:760,bottom:580});

  const project={},holds=[1,1,1,1,1,1,1,1],transactions=[];
  const env={frameGlass,canvas,slotCount:14,framesLength:8,current:0,selectedFrames:new Set(),holdAt:index=>holds[index],maxFrames:120,shape:'circle',project,playing:false,fps:12,loopOn:false,loopIn:0,loopOut:7,playbackFraction:.1,canNavigate:()=>true,canEditTiming:()=>true,seek:()=>true,seekFraction:()=>true,togglePlayback:()=>false,setHold:()=>false,setHolds:entries=>{transactions.push(entries.map(entry=>({...entry})));for(const entry of entries)holds[entry.index]=entry.value;return entries;},setLoopRange:()=>true,toggleLoop:()=>true,thumbAt:()=>''};
  const alpha=recipes.store.save('Alpha',[1,2]),beta=recipes.store.save('Beta',[3]),gamma=recipes.store.save('Gamma',[4,5]);assert.equal(recipes.store.snapshot().recipes.length,3);
  const wait=ms=>new Promise(resolvePromise=>setTimeout(resolvePromise,ms));
  const openStack=async()=>{
    radial.render(board,env);await wait(35);
    if(!board.querySelector('.inkframe-radial-timing-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-radial-timing-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-rhythm-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-rhythm-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-recipe-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-recipe-toggle').click();await wait(55);}
  };
  const openPhrase=async()=>{
    await openStack();const toggle=board.querySelector('.inkframe-phrase-toggle');assert.ok(toggle,'phrase toggle must follow recipe shelf render');
    if(toggle.getAttribute('aria-pressed')!=='true'){toggle.click();await wait(55);}
    assert.equal(phrases.viewSnapshot(project).open,true);assert.ok(board.querySelector('.inkframe-phrase-shelf'));
  };
  const choose=async id=>{const select=board.querySelector('.inkframe-phrase-source');select.value=id;select.dispatchEvent(new w.Event('change',{bubbles:true}));await wait(45);};

  await openPhrase();
  let snapshot=phrases.viewSnapshot(project);assert.equal(snapshot.selectedRecipeId,alpha.id);assert.equal(snapshot.recipeCount,3);assert.equal(snapshot.segments.length,0);
  assert.equal(board.querySelectorAll('.inkframe-phrase-source option').length,3);assert.equal(board.querySelector('.inkframe-phrase-apply').disabled,true);

  board.querySelector('.inkframe-phrase-add').click();await wait(55);
  await choose(beta.id);board.querySelector('.inkframe-phrase-add').click();await wait(55);
  await choose(gamma.id);board.querySelector('.inkframe-phrase-add').click();await wait(55);
  snapshot=phrases.viewSnapshot(project);assert.deepEqual(Array.from(snapshot.segments,item=>({...item})),[{recipeId:alpha.id,repeat:1},{recipeId:beta.id,repeat:1},{recipeId:gamma.id,repeat:1}]);

  board.querySelector('.inkframe-phrase-segment[data-segment="1"] .inkframe-phrase-repeat').click();await wait(55);
  snapshot=phrases.viewSnapshot(project);assert.equal(snapshot.segments[1].repeat,2);
  board.querySelector('.inkframe-phrase-segment[data-segment="2"] .inkframe-phrase-left').click();await wait(55);
  snapshot=phrases.viewSnapshot(project);assert.deepEqual(Array.from(snapshot.segments,item=>item.recipeId),[alpha.id,gamma.id,beta.id]);
  board.querySelector('.inkframe-phrase-segment[data-segment="1"] .inkframe-phrase-duplicate').click();await wait(55);
  assert.deepEqual(Array.from(phrases.viewSnapshot(project).segments,item=>item.recipeId),[alpha.id,gamma.id,gamma.id,beta.id]);
  board.querySelector('.inkframe-phrase-segment[data-segment="2"] .inkframe-phrase-remove').click();await wait(55);
  snapshot=phrases.viewSnapshot(project);assert.deepEqual(Array.from(snapshot.segments,item=>({...item})),[{recipeId:alpha.id,repeat:1},{recipeId:gamma.id,repeat:1},{recipeId:beta.id,repeat:2}]);
  assert.equal(snapshot.phraseLength,6);assert.equal(snapshot.truncated,false);

  board.querySelector('.inkframe-phrase-preview').click();await wait(70);
  const expected=[1,2,4,5,3,3,1,2];
  assert.deepEqual(Array.from(holds),Array(8).fill(1),'phrase preview must not mutate timing');
  assert.deepEqual(Array.from(board.querySelectorAll('.inkframe-phrase-preview-arc'),node=>Number(node.dataset.hold)),expected);
  assert.equal(phrases.viewSnapshot(project).preview,true);assert.equal(transactions.length,0);

  board.querySelector('.inkframe-phrase-apply').click();await wait(85);
  assert.deepEqual(Array.from(holds),expected);assert.equal(transactions.length,1,'phrase apply must use one batched timing transaction');
  assert.equal(patterns.viewSnapshot(project).undoDepth,1,'phrases must share timing-only history');
  await openStack();board.querySelector('.inkframe-rhythm-undo').click();await wait(75);
  assert.deepEqual(Array.from(holds),Array(8).fill(1));assert.equal(patterns.viewSnapshot(project).redoDepth,1);

  await openPhrase();const input=board.querySelector('.inkframe-phrase-name');input.value='Scene Pulse';input.dispatchEvent(new w.Event('input',{bubbles:true}));
  const beforeLibrary=recipes.store.snapshot(),sourceBefore=new Map(beforeLibrary.recipes.map(item=>[item.id,Array.from(item.values)])),beforeIds=new Set(beforeLibrary.recipes.map(item=>item.id));
  board.querySelector('.inkframe-phrase-save').click();await wait(95);
  const library=recipes.store.snapshot();assert.equal(library.recipes.length,beforeLibrary.recipes.length+1);const saved=library.recipes.find(item=>!beforeIds.has(item.id));
  assert.ok(saved);assert.equal(saved.name,'Scene Pulse');assert.deepEqual(Array.from(saved.values),[1,2,4,5,3,3]);assert.ok(w.localStorage.getItem(recipes.STORAGE_KEY));
  assert.deepEqual(Array.from(recipes.store.find(alpha.id).values),sourceBefore.get(alpha.id));assert.deepEqual(Array.from(recipes.store.find(beta.id).values),sourceBefore.get(beta.id));assert.deepEqual(Array.from(recipes.store.find(gamma.id).values),sourceBefore.get(gamma.id));

  await openPhrase();board.querySelector('.inkframe-phrase-clear').click();await wait(55);
  snapshot=phrases.viewSnapshot(project);assert.equal(snapshot.segments.length,0);assert.equal(snapshot.preview,false);assert.equal(snapshot.phraseLength,0);assert.ok(recipes.store.find(saved.id));

  const beforeBlockedTransactions=transactions.length,beforeBlockedLibrary=recipes.store.snapshot().recipes.length;env.canEditTiming=()=>false;radial.render(board,env);await wait(35);
  assert.equal(phrases.addSelected(),false);assert.equal(phrases.setSegmentRepeat(0,2),false);assert.equal(phrases.moveSegment(0,1),false);assert.equal(phrases.duplicateSegment(0),false);assert.equal(phrases.removeSegment(0),false);assert.equal(phrases.clearSegments(),false);assert.equal(phrases.loadArrangement({segments:[{recipeId:alpha.id,repeat:1}]}),false);assert.equal(phrases.applyPhrase(),false);assert.equal(phrases.savePhrase(),null);
  assert.equal(transactions.length,beforeBlockedTransactions);assert.equal(recipes.store.snapshot().recipes.length,beforeBlockedLibrary);
  const other=phrases.viewSnapshot({});assert.deepEqual({...other,segments:Array.from(other.segments)},{open:false,selectedRecipeId:null,segments:[],preview:false,name:'',recipeCount:4,phraseLength:0,truncated:false},'phrase view state must remain isolated by project');
  assert.deepEqual(project,{},'phrase composer must not write project schema fields');

  assert.equal(phrases.projectCanvasWrites,0);assert.equal(phrases.artworkUndoWrites,0);assert.equal(phrases.timelineTimingWrites,true);assert.equal(phrases.projectSchemaWrites,0);assert.equal(phrases.deviceLibraryWrites,true);assert.equal(phrases.sourceRecipeWrites,0);assert.equal(phrases.randomWrites,0);
  dom.window.close();console.log('✅ generated Android timing phrase ordering, repeats, preview, shared apply/undo, saved persistence, guards, and isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}

await import('./radial-timing-phrase-library-boot.test.mjs');
