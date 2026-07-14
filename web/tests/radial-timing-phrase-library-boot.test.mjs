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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-phrase-library-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="radial-timing-phrase-library.js"></script>'));
  assert.ok(html.indexOf('radial-timing-phrases.js')<html.indexOf('radial-timing-phrase-library.js'));
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
  const w=dom.window,d=w.document,radial=w.InkFrameRadialTimeline,recipes=w.InkFrameRadialRecipes,phrases=w.InkFrameRadialPhrases,phraseLibrary=w.InkFrameRadialPhraseLibrary;
  assert.ok(radial&&recipes&&phrases&&phraseLibrary,'phrase arrangement library stack missing');assert.equal(radial.__radialPhraseLibraryPatched,true);
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),board=d.getElementById('frameBoard');
  Object.defineProperty(frameGlass,'clientWidth',{configurable:true,value:760});Object.defineProperty(frameGlass,'clientHeight',{configurable:true,value:580});
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:20});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:20});
  canvas.getBoundingClientRect=()=>({left:20,top:20,width:720,height:540,right:740,bottom:560});board.getBoundingClientRect=()=>({left:0,top:0,width:760,height:580,right:760,bottom:580});

  const project={},holds=Array(8).fill(1),transactions=[];
  const env={frameGlass,canvas,slotCount:14,framesLength:8,current:0,selectedFrames:new Set(),holdAt:index=>holds[index],maxFrames:120,shape:'circle',project,playing:false,fps:12,loopOn:false,loopIn:0,loopOut:7,playbackFraction:.1,canNavigate:()=>true,canEditTiming:()=>true,seek:()=>true,seekFraction:()=>true,togglePlayback:()=>false,setHold:()=>false,setHolds:entries=>{transactions.push(entries.map(entry=>({...entry})));for(const entry of entries)holds[entry.index]=entry.value;return entries;},setLoopRange:()=>true,toggleLoop:()=>true,thumbAt:()=>''};
  const alpha=recipes.store.save('Alpha',[1,2]),beta=recipes.store.save('Beta',[3]),gamma=recipes.store.save('Gamma',[4,5]);
  const sourceBefore=JSON.stringify(recipes.store.snapshot());
  const wait=ms=>new Promise(resolvePromise=>setTimeout(resolvePromise,ms));
  const openStack=async()=>{
    radial.render(board,env);await wait(35);
    if(!board.querySelector('.inkframe-radial-timing-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-radial-timing-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-rhythm-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-rhythm-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-recipe-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-recipe-toggle').click();await wait(55);}
  };
  const openPhrase=async()=>{
    await openStack();const toggle=board.querySelector('.inkframe-phrase-toggle');assert.ok(toggle);
    if(toggle.getAttribute('aria-pressed')!=='true'){toggle.click();await wait(55);}assert.ok(board.querySelector('.inkframe-phrase-shelf'));
  };
  const openLibrary=async()=>{
    await openPhrase();const toggle=board.querySelector('.inkframe-phrase-library-toggle');assert.ok(toggle,'library toggle must follow Phrase Composer');
    if(toggle.getAttribute('aria-pressed')!=='true'){toggle.click();await wait(55);}assert.ok(board.querySelector('.inkframe-phrase-library-shelf'));
  };
  const choose=async id=>{const select=board.querySelector('.inkframe-phrase-source');select.value=id;select.dispatchEvent(new w.Event('change',{bubbles:true}));await wait(40);};

  await openPhrase();board.querySelector('.inkframe-phrase-add').click();await wait(45);
  await choose(gamma.id);board.querySelector('.inkframe-phrase-add').click();await wait(45);
  await choose(beta.id);board.querySelector('.inkframe-phrase-add').click();await wait(45);
  board.querySelector('.inkframe-phrase-segment[data-segment="2"] .inkframe-phrase-repeat').click();await wait(50);
  let arrangement=phrases.arrangementSnapshot(project);assert.deepEqual(Array.from(arrangement.segments,item=>({...item})),[{recipeId:alpha.id,repeat:1},{recipeId:gamma.id,repeat:1},{recipeId:beta.id,repeat:2}]);
  const phraseName=board.querySelector('.inkframe-phrase-name');phraseName.value='Opening Arrangement';phraseName.dispatchEvent(new w.Event('input',{bubbles:true}));

  await openLibrary();board.querySelector('.inkframe-phrase-library-save').click();await wait(75);
  let stored=phraseLibrary.store.snapshot();assert.equal(stored.phrases.length,1);const opening=stored.phrases[0];assert.equal(opening.name,'Opening Arrangement');
  assert.deepEqual(Array.from(opening.segments,item=>({recipeId:item.recipeId,repeat:item.repeat})),[{recipeId:alpha.id,repeat:1},{recipeId:gamma.id,repeat:1},{recipeId:beta.id,repeat:2}]);
  assert.ok(opening.segments.every(item=>item.recipeName&&item.recipeSignature));assert.ok(w.localStorage.getItem(phraseLibrary.STORAGE_KEY));
  assert.equal(JSON.stringify(recipes.store.snapshot()),sourceBefore,'saving arrangements must preserve source recipes');

  const libraryName=board.querySelector('.inkframe-phrase-library-name');libraryName.value='';libraryName.dispatchEvent(new w.Event('input',{bubbles:true}));board.querySelector('.inkframe-phrase-library-duplicate').click();await wait(70);
  stored=phraseLibrary.store.snapshot();assert.equal(stored.phrases.length,2);const copy=stored.phrases.find(item=>item.id!==opening.id);assert.ok(copy);assert.equal(copy.name,'Opening Arrangement Copy');
  await openLibrary();const renameInput=board.querySelector('.inkframe-phrase-library-name');renameInput.value='Alternate Opening';renameInput.dispatchEvent(new w.Event('input',{bubbles:true}));board.querySelector('.inkframe-phrase-library-rename').click();await wait(65);
  assert.equal(phraseLibrary.store.find(copy.id).name,'Alternate Opening');

  await openLibrary();const originalButton=board.querySelector(`[data-phrase-arrangement="${opening.id}"]`);assert.ok(originalButton);originalButton.click();await wait(50);
  await openPhrase();board.querySelector('.inkframe-phrase-clear').click();await wait(45);await choose(gamma.id);board.querySelector('.inkframe-phrase-add').click();await wait(45);
  assert.deepEqual(Array.from(phrases.viewSnapshot(project).segments,item=>item.recipeId),[gamma.id]);
  await openLibrary();board.querySelector('.inkframe-phrase-library-load').click();await wait(90);
  arrangement=phrases.arrangementSnapshot(project);assert.equal(arrangement.name,'Opening Arrangement');assert.deepEqual(Array.from(arrangement.segments,item=>({...item})),[{recipeId:alpha.id,repeat:1},{recipeId:gamma.id,repeat:1},{recipeId:beta.id,repeat:2}]);

  await openPhrase();board.querySelector('.inkframe-phrase-segment[data-segment="0"] .inkframe-phrase-repeat').click();await wait(45);
  await openLibrary();const updateInput=board.querySelector('.inkframe-phrase-library-name');updateInput.value='Opening Arrangement';updateInput.dispatchEvent(new w.Event('input',{bubbles:true}));board.querySelector('.inkframe-phrase-library-save').click();await wait(70);
  stored=phraseLibrary.store.snapshot();assert.equal(stored.phrases.length,2,'same-name save must update the original arrangement');assert.equal(phraseLibrary.store.find(opening.id).segments[0].repeat,2);

  const restored=phraseLibrary.createPhraseLibraryStore(w.localStorage).snapshot();assert.equal(restored.phrases.length,2);assert.deepEqual(Array.from(restored.phrases,item=>item.name).sort(),['Alternate Opening','Opening Arrangement']);
  recipes.store.save('Alpha',[8]);radial.render(board,env);await wait(55);await openLibrary();
  assert.equal(phraseLibrary.viewSnapshot(project).changedCount,1);assert.equal(phraseLibrary.viewSnapshot(project).loadable,true);assert.match(board.querySelector('.inkframe-phrase-library-status').textContent,/1 source changed/);
  recipes.store.remove(beta.id);radial.render(board,env);await wait(55);await openLibrary();
  assert.equal(phraseLibrary.viewSnapshot(project).missingCount,1);assert.equal(phraseLibrary.viewSnapshot(project).loadable,false);assert.equal(board.querySelector('.inkframe-phrase-library-load').disabled,true);

  const beforeBlocked=phraseLibrary.store.snapshot(),beforeTransactions=transactions.length;env.canEditTiming=()=>false;radial.render(board,env);await wait(35);
  assert.equal(phraseLibrary.saveCurrent('Blocked'),null);assert.equal(phraseLibrary.loadSelected(),false);assert.equal(phraseLibrary.duplicateSelected(),null);assert.equal(phraseLibrary.renameSelected('Blocked'),false);assert.equal(phraseLibrary.removeSelected(),false);
  assert.deepEqual(phraseLibrary.store.snapshot(),beforeBlocked);assert.equal(transactions.length,beforeTransactions);
  assert.deepEqual({...phraseLibrary.viewSnapshot({})},{open:false,selectedId:null,name:'',phraseCount:2,missingCount:0,changedCount:0,loadable:false},'library selection state must remain isolated by project');
  assert.deepEqual(project,{},'phrase library must not write project schema fields');

  assert.equal(phraseLibrary.projectCanvasWrites,0);assert.equal(phraseLibrary.artworkUndoWrites,0);assert.equal(phraseLibrary.timelineTimingWrites,0);assert.equal(phraseLibrary.projectSchemaWrites,0);assert.equal(phraseLibrary.deviceLibraryWrites,true);assert.equal(phraseLibrary.sourceRecipeWrites,0);assert.equal(phraseLibrary.randomWrites,0);assert.equal(phraseLibrary.transientPhraseWrites,true);
  dom.window.close();console.log('✅ generated Android phrase arrangement save, update, duplicate, rename, load, provenance, persistence, guards, and isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}
