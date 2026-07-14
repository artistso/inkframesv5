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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-score-library-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="radial-timing-score-library.js"></script>'));
  assert.ok(html.indexOf('radial-timing-score.js')<html.indexOf('radial-timing-score-library.js'));
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
  const w=dom.window,d=w.document,radial=w.InkFrameRadialTimeline,recipes=w.InkFrameRadialRecipes,phraseLibrary=w.InkFrameRadialPhraseLibrary,score=w.InkFrameRadialScore,scoreLibrary=w.InkFrameRadialScoreLibrary;
  assert.ok(radial&&recipes&&phraseLibrary&&score&&scoreLibrary,'score library stack missing');assert.equal(radial.__radialScoreLibraryPatched,true);
  const canvas=d.getElementById('c'),frameGlass=d.getElementById('frameGlass'),board=d.getElementById('frameBoard');
  Object.defineProperty(frameGlass,'clientWidth',{configurable:true,value:760});Object.defineProperty(frameGlass,'clientHeight',{configurable:true,value:580});
  Object.defineProperty(canvas,'clientWidth',{configurable:true,value:720});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:540});
  Object.defineProperty(canvas,'offsetLeft',{configurable:true,value:20});Object.defineProperty(canvas,'offsetTop',{configurable:true,value:20});
  canvas.getBoundingClientRect=()=>({left:20,top:20,width:720,height:540,right:740,bottom:560});board.getBoundingClientRect=()=>({left:0,top:0,width:760,height:580,right:760,bottom:580});

  const project={},holds=Array(12).fill(1),transactions=[];
  const env={frameGlass,canvas,slotCount:18,framesLength:12,current:0,selectedFrames:new Set(),holdAt:index=>holds[index],maxFrames:120,shape:'circle',project,playing:false,fps:12,loopOn:false,loopIn:0,loopOut:11,playbackFraction:.1,canNavigate:()=>true,canEditTiming:()=>true,seek:()=>true,seekFraction:()=>true,togglePlayback:()=>false,setHold:()=>false,setHolds:entries=>{transactions.push(entries.map(entry=>({...entry})));for(const entry of entries)holds[entry.index]=entry.value;return entries;},setLoopRange:()=>true,toggleLoop:()=>true,thumbAt:()=>''};
  const alpha=recipes.store.save('Alpha',[1,2]),beta=recipes.store.save('Beta',[3]),gamma=recipes.store.save('Gamma',[4,5]);
  const recipeRecords=recipes.store.snapshot().recipes;
  const opening=phraseLibrary.store.save('Opening',[{recipeId:alpha.id,repeat:1},{recipeId:beta.id,repeat:2}],recipeRecords);
  const middle=phraseLibrary.store.save('Middle',[{recipeId:gamma.id,repeat:1}],recipeRecords);
  const closing=phraseLibrary.store.save('Closing',[{recipeId:beta.id,repeat:1},{recipeId:alpha.id,repeat:1}],recipeRecords);
  const arrangementsBefore=JSON.stringify(phraseLibrary.store.snapshot()),recipesBefore=JSON.stringify(recipes.store.snapshot());
  const wait=ms=>new Promise(resolvePromise=>setTimeout(resolvePromise,ms));
  const openStack=async()=>{
    radial.render(board,env);await wait(35);
    if(!board.querySelector('.inkframe-radial-timing-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-radial-timing-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-rhythm-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-rhythm-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-recipe-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-recipe-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-phrase-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-phrase-toggle').click();await wait(55);}
    if(!board.querySelector('.inkframe-score-toggle[aria-pressed="true"]')){board.querySelector('.inkframe-score-toggle').click();await wait(55);}
  };
  const openLibrary=async()=>{
    await openStack();const toggle=board.querySelector('.inkframe-score-library-toggle');assert.ok(toggle,'Score Library toggle must follow Score Composer');
    if(toggle.getAttribute('aria-pressed')!=='true'){toggle.click();await wait(55);}assert.ok(board.querySelector('.inkframe-score-library-shelf'));
  };
  const choose=async id=>{const select=board.querySelector('.inkframe-score-source');select.value=id;select.dispatchEvent(new w.Event('change',{bubbles:true}));await wait(40);};

  await openStack();board.querySelector('.inkframe-score-add').click();await wait(45);
  await choose(middle.id);board.querySelector('.inkframe-score-add').click();await wait(45);
  await choose(closing.id);board.querySelector('.inkframe-score-add').click();await wait(45);
  board.querySelector('.inkframe-score-section[data-section="1"] .inkframe-score-repeat').click();await wait(45);
  let structure=score.structureSnapshot(project);assert.deepEqual(Array.from(structure.sections,item=>({...item})),[{arrangementId:opening.id,repeat:1},{arrangementId:middle.id,repeat:2},{arrangementId:closing.id,repeat:1}]);
  const scoreName=board.querySelector('.inkframe-score-name');scoreName.value='Scene Structure';scoreName.dispatchEvent(new w.Event('input',{bubbles:true}));

  await openLibrary();board.querySelector('.inkframe-score-library-save').click();await wait(75);
  let stored=scoreLibrary.store.snapshot();assert.equal(stored.scores.length,1);const scene=stored.scores[0];assert.equal(scene.name,'Scene Structure');
  assert.deepEqual(Array.from(scene.sections,item=>({arrangementId:item.arrangementId,repeat:item.repeat})),[{arrangementId:opening.id,repeat:1},{arrangementId:middle.id,repeat:2},{arrangementId:closing.id,repeat:1}]);
  assert.ok(scene.sections.every(item=>item.arrangementName&&item.arrangementSignature));assert.ok(w.localStorage.getItem(scoreLibrary.STORAGE_KEY));
  assert.equal(JSON.stringify(phraseLibrary.store.snapshot()),arrangementsBefore);assert.equal(JSON.stringify(recipes.store.snapshot()),recipesBefore);

  const duplicateName=board.querySelector('.inkframe-score-library-name');duplicateName.value='';duplicateName.dispatchEvent(new w.Event('input',{bubbles:true}));board.querySelector('.inkframe-score-library-duplicate').click();await wait(70);
  stored=scoreLibrary.store.snapshot();assert.equal(stored.scores.length,2);const copy=stored.scores.find(item=>item.id!==scene.id);assert.ok(copy);assert.equal(copy.name,'Scene Structure Copy');
  await openLibrary();const renameInput=board.querySelector('.inkframe-score-library-name');renameInput.value='Alternate Structure';renameInput.dispatchEvent(new w.Event('input',{bubbles:true}));board.querySelector('.inkframe-score-library-rename').click();await wait(65);assert.equal(scoreLibrary.store.find(copy.id).name,'Alternate Structure');

  await openLibrary();board.querySelector(`[data-score-structure="${scene.id}"]`).click();await wait(45);
  await openStack();board.querySelector('.inkframe-score-clear').click();await wait(45);await choose(closing.id);board.querySelector('.inkframe-score-add').click();await wait(45);
  assert.deepEqual(Array.from(score.viewSnapshot(project).sections,item=>item.arrangementId),[closing.id]);
  const transactionsBeforeLoad=transactions.length;await openLibrary();board.querySelector('.inkframe-score-library-load').click();await wait(90);
  structure=score.structureSnapshot(project);assert.equal(structure.name,'Scene Structure');assert.deepEqual(Array.from(structure.sections,item=>({...item})),[{arrangementId:opening.id,repeat:1},{arrangementId:middle.id,repeat:2},{arrangementId:closing.id,repeat:1}]);assert.equal(transactions.length,transactionsBeforeLoad,'loading a score structure must not apply timing');

  await openStack();board.querySelector('.inkframe-score-section[data-section="0"] .inkframe-score-repeat').click();await wait(45);
  await openLibrary();const updateInput=board.querySelector('.inkframe-score-library-name');updateInput.value='Scene Structure';updateInput.dispatchEvent(new w.Event('input',{bubbles:true}));board.querySelector('.inkframe-score-library-save').click();await wait(70);
  stored=scoreLibrary.store.snapshot();assert.equal(stored.scores.length,2,'same-name save must update the original score structure');assert.equal(scoreLibrary.store.find(scene.id).sections[0].repeat,2);
  const restored=scoreLibrary.createScoreLibraryStore(w.localStorage).snapshot();assert.equal(restored.scores.length,2);assert.deepEqual(Array.from(restored.scores,item=>item.name).sort(),['Alternate Structure','Scene Structure']);

  phraseLibrary.store.save('Opening',[{recipeId:gamma.id,repeat:1}],recipes.store.snapshot().recipes);radial.render(board,env);await wait(55);await openLibrary();
  assert.equal(scoreLibrary.viewSnapshot(project).changedArrangementCount,1);assert.equal(scoreLibrary.viewSnapshot(project).loadable,true);assert.match(board.querySelector('.inkframe-score-library-status').textContent,/changed dependency/);
  recipes.store.save('Gamma',[8]);radial.render(board,env);await wait(55);await openLibrary();assert.equal(scoreLibrary.viewSnapshot(project).changedSourceCount,1);assert.equal(scoreLibrary.viewSnapshot(project).loadable,true);
  phraseLibrary.store.remove(middle.id);radial.render(board,env);await wait(55);await openLibrary();
  assert.equal(scoreLibrary.viewSnapshot(project).missingArrangementCount,1);assert.equal(scoreLibrary.viewSnapshot(project).loadable,false);assert.equal(board.querySelector('.inkframe-score-library-load').disabled,true);

  const beforeBlocked=scoreLibrary.store.snapshot(),beforeSections=score.structureSnapshot(project),beforeTransactions=transactions.length;env.canEditTiming=()=>false;radial.render(board,env);await wait(35);
  assert.equal(scoreLibrary.saveCurrent('Blocked'),null);assert.equal(scoreLibrary.loadSelected(),false);assert.equal(scoreLibrary.duplicateSelected(),null);assert.equal(scoreLibrary.renameSelected('Blocked'),false);assert.equal(scoreLibrary.removeSelected(),false);assert.equal(score.loadStructure({sections:[{arrangementId:opening.id,repeat:1}]}),false);
  assert.deepEqual(scoreLibrary.store.snapshot(),beforeBlocked);assert.deepEqual(Array.from(score.structureSnapshot(project).sections,item=>({...item})),Array.from(beforeSections.sections,item=>({...item})));assert.equal(transactions.length,beforeTransactions);
  assert.deepEqual({...scoreLibrary.viewSnapshot({})},{open:false,selectedId:null,name:'',scoreCount:2,missingArrangementCount:0,changedArrangementCount:0,missingSourceCount:0,changedSourceCount:0,loadable:false},'score library selection state must remain isolated by project');
  assert.deepEqual(project,{},'score library must not write project schema fields');
  assert.equal(scoreLibrary.projectCanvasWrites,0);assert.equal(scoreLibrary.artworkUndoWrites,0);assert.equal(scoreLibrary.timelineTimingWrites,0);assert.equal(scoreLibrary.projectSchemaWrites,0);assert.equal(scoreLibrary.deviceLibraryWrites,true);assert.equal(scoreLibrary.sourceScoreWrites,0);assert.equal(scoreLibrary.sourceArrangementWrites,0);assert.equal(scoreLibrary.sourceRecipeWrites,0);assert.equal(scoreLibrary.randomWrites,0);assert.equal(scoreLibrary.transientScoreWrites,true);
  dom.window.close();console.log('✅ generated Android score structure save, update, duplicate, rename, exact load, nested provenance, persistence, guards, and isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}
