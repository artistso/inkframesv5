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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-radial-recipes-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="radial-timing-recipes.js"></script>'));
  assert.ok(html.indexOf('radial-timing-patterns.js')<html.indexOf('radial-timing-recipes.js'));
  html=html.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{const file=resolve(webDir,src);assert.ok(existsSync(file),`missing ${src}`);return `<script>${readFileSync(file,'utf8')}</script>`;});
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.detail?.stack||e.message));vc.on('error',(...a)=>errors.push(a.join(' ')));
  const contexts=new WeakMap();
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.__canvasOps=[];w.ResizeObserver=class{constructor(cb){this.cb=cb;}observe(){this.cb([]);}disconnect(){}};
    w.HTMLCanvasElement.prototype.getContext=function(type){
      if(type!=='2d')return null;if(contexts.has(this))return contexts.get(this);
      const canvas=this,state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter',imageSmoothingEnabled:true};
      const ctx=new Proxy(state,{get(t,p){
        if(p==='canvas')return canvas;if(p==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});
        if(p==='createImageData')return(width,height)=>({data:new Uint8ClampedArray(width*height*4),width,height});if(p==='putImageData')return(...args)=>w.__canvasOps.push({canvas,method:'putImageData',args});
        if(p==='createRadialGradient'||p==='createLinearGradient')return()=>({addColorStop:()=>{}});if(p==='measureText')return text=>({width:String(text).length*7});
        if(typeof p==='string'&&!p.startsWith('__')&&p!=='then'&&p!=='constructor'){if(p in t)return t[p];return(...args)=>{w.__canvasOps.push({canvas,method:p,args});};}return undefined;
      },set(t,p,v){t[p]=v;return true;}});contexts.set(canvas,ctx);return ctx;
    };
    w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,frame';w.HTMLCanvasElement.prototype.toBlob=cb=>cb(new w.Blob([],{type:'image/png'}));
    w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[{requestFrame(){},stop(){}}]});w.Element.prototype.setPointerCapture=()=>{};w.Element.prototype.releasePointerCapture=()=>{};
    w.MediaRecorder=function(){this.start=()=>{};this.stop=()=>{this.onstop&&this.onstop();};};w.MediaRecorder.isTypeSupported=()=>false;
    w.requestAnimationFrame=cb=>setTimeout(()=>cb(w.performance.now()),8);w.cancelAnimationFrame=id=>clearTimeout(id);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;
  }});
  await new Promise(r=>setTimeout(r,950));assert.deepEqual(errors,[],errors.join('\n'));
  const w=dom.window,d=w.document,radial=w.InkFrameRadialTimeline,timing=w.InkFrameRadialTiming,patterns=w.InkFrameRadialPatterns,recipes=w.InkFrameRadialRecipes;
  assert.ok(radial&&timing&&patterns&&recipes,'radial recipe stack missing');assert.equal(radial.__radialRecipesPatched,true);
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),board=d.getElementById('frameBoard');
  Object.defineProperty(frameGlass,'clientWidth',{configurable:true,value:760});Object.defineProperty(frameGlass,'clientHeight',{configurable:true,value:580});
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:20});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:20});
  canvas.getBoundingClientRect=()=>({left:20,top:20,width:720,height:540,right:740,bottom:560});board.getBoundingClientRect=()=>({left:0,top:0,width:760,height:580,right:760,bottom:580});

  const project={},holds=[1,2,3,1,2,3],transactions=[];
  const env={frameGlass,canvas,slotCount:12,framesLength:6,current:0,selectedFrames:new Set(),holdAt:index=>holds[index],maxFrames:120,shape:'circle',project,playing:false,fps:12,loopOn:false,loopIn:0,loopOut:5,playbackFraction:.1,canNavigate:()=>true,canEditTiming:()=>true,seek:()=>true,seekFraction:()=>true,togglePlayback:()=>false,setHold:()=>false,setHolds:entries=>{transactions.push(entries.map(entry=>({...entry})));for(const entry of entries)holds[entry.index]=entry.value;return entries;},setLoopRange:()=>true,toggleLoop:()=>true,thumbAt:()=>''};
  radial.render(board,env);await new Promise(r=>setTimeout(r,40));
  board.querySelector('.inkframe-radial-timing-toggle').click();await new Promise(r=>setTimeout(r,65));
  board.querySelector('.inkframe-rhythm-toggle').click();await new Promise(r=>setTimeout(r,65));
  assert.ok(board.querySelector('.inkframe-recipe-toggle'),'recipe toggle must follow rhythm shelf render');
  board.querySelector('.inkframe-recipe-toggle').click();await new Promise(r=>setTimeout(r,55));
  assert.equal(recipes.viewSnapshot(project).open,true);assert.ok(board.querySelector('.inkframe-recipe-shelf'));

  const name=board.querySelector('.inkframe-recipe-name');name.value='Pulse Three';name.dispatchEvent(new w.Event('input',{bubbles:true}));
  board.querySelector('.inkframe-recipe-capture').click();await new Promise(r=>setTimeout(r,75));
  const library=recipes.store.snapshot();assert.equal(library.recipes.length,1);assert.equal(library.recipes[0].name,'Pulse Three');assert.deepEqual(Array.from(library.recipes[0].values),[1,2,3]);
  assert.ok(w.localStorage.getItem(recipes.STORAGE_KEY),'captured recipe must persist outside project data');
  assert.equal(transactions.length,0,'capture must not mutate holds');assert.ok(board.querySelector('.inkframe-recipe-item'));

  board.querySelector('.inkframe-recipe-preview').click();board.querySelector('.inkframe-recipe-phase-up').click();board.querySelector('.inkframe-recipe-reverse').click();await new Promise(r=>setTimeout(r,70));
  assert.deepEqual(Array.from(holds),[1,2,3,1,2,3],'preview transforms must remain non-destructive');
  assert.deepEqual(Array.from(board.querySelectorAll('.inkframe-recipe-preview-arc'),node=>Number(node.dataset.hold)),[1,3,2,1,3,2]);
  assert.equal(recipes.viewSnapshot(project).phase,1);assert.equal(recipes.viewSnapshot(project).reverse,true);

  board.querySelector('.inkframe-recipe-apply').click();await new Promise(r=>setTimeout(r,85));
  assert.deepEqual(Array.from(holds),[1,3,2,1,3,2]);assert.equal(transactions.length,1,'recipe apply must use one batch transaction');
  assert.equal(patterns.viewSnapshot(project).undoDepth,1,'recipes must share timing-only history');
  board.querySelector('.inkframe-rhythm-undo').click();await new Promise(r=>setTimeout(r,75));
  assert.deepEqual(Array.from(holds),[1,2,3,1,2,3]);assert.equal(patterns.viewSnapshot(project).redoDepth,1);

  env.selectedFrames=new Set([1,3,5]);holds.splice(0,holds.length,1,2,3,4,5,6);radial.render(board,env);await new Promise(r=>setTimeout(r,55));
  if(!board.querySelector('.inkframe-radial-timing-toggle[aria-pressed="true"]'))board.querySelector('.inkframe-radial-timing-toggle').click();await new Promise(r=>setTimeout(r,45));
  if(!board.querySelector('.inkframe-rhythm-toggle[aria-pressed="true"]'))board.querySelector('.inkframe-rhythm-toggle').click();await new Promise(r=>setTimeout(r,55));
  if(!board.querySelector('.inkframe-recipe-toggle[aria-pressed="true"]'))board.querySelector('.inkframe-recipe-toggle').click();await new Promise(r=>setTimeout(r,55));
  const selectedInput=board.querySelector('.inkframe-recipe-name');selectedInput.value='Selection';selectedInput.dispatchEvent(new w.Event('input',{bubbles:true}));board.querySelector('.inkframe-recipe-capture').click();await new Promise(r=>setTimeout(r,65));
  const selectionRecipe=recipes.store.snapshot().recipes.find(item=>item.name==='Selection');assert.ok(selectionRecipe);assert.deepEqual(Array.from(selectionRecipe.values),[2,4,6]);
  assert.equal(transactions.length,2,'only prior apply and undo should have written timing');

  const restored=recipes.createRecipeStore(w.localStorage).snapshot();assert.equal(restored.recipes.length,2);assert.deepEqual(restored.recipes.map(item=>item.name),['Pulse Three','Selection']);
  const beforeBlocked=transactions.length;env.canEditTiming=()=>false;radial.render(board,env);await new Promise(r=>setTimeout(r,40));
  const applyBlocked=board.querySelector('.inkframe-recipe-apply');assert.ok(applyBlocked);applyBlocked.click();await new Promise(r=>setTimeout(r,35));assert.equal(transactions.length,beforeBlocked,'active-stroke guard must block recipe writes');

  assert.equal(recipes.projectCanvasWrites,0);assert.equal(recipes.artworkUndoWrites,0);assert.equal(recipes.timelineTimingWrites,true);assert.equal(recipes.projectSchemaWrites,0);assert.equal(recipes.deviceLibraryWrites,true);
  dom.window.close();console.log('✅ generated Android custom timing recipes capture, persistence, transformed preview, shared history, scope, guards, and isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}
