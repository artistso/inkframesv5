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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-radial-score-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="radial-timing-score.js"></script>'));
  assert.ok(html.indexOf('radial-timing-phrase-library.js')<html.indexOf('radial-timing-score.js'));
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
  const w=dom.window,d=w.document,radial=w.InkFrameRadialTimeline,patterns=w.InkFrameRadialPatterns,recipes=w.InkFrameRadialRecipes,phrases=w.InkFrameRadialPhrases,phraseLibrary=w.InkFrameRadialPhraseLibrary,score=w.InkFrameRadialScore;
  assert.ok(radial&&patterns&&recipes&&phrases&&phraseLibrary&&score,'radial score stack missing');assert.equal(radial.__radialScorePatched,true);
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
  const arrangementsBefore=JSON.stringify(phraseLibrary.store.snapshot()),recipesBefore=recipes.store.snapshot();
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
  const openScore=async()=>{
    await openPhrase();const toggle=board.querySelector('.inkframe-score-toggle');assert.ok(toggle,'Score toggle must follow Phrase Composer');
    if(toggle.getAttribute('aria-pressed')!=='true'){toggle.click();await wait(55);}assert.ok(board.querySelector('.inkframe-score-shelf'));
  };
  const choose=async id=>{const select=board.querySelector('.inkframe-score-source');select.value=id;select.dispatchEvent(new w.Event('change',{bubbles:true}));await wait(40);};

  await openScore();let snapshot=score.viewSnapshot(project);assert.equal(snapshot.selectedArrangementId,opening.id);assert.equal(snapshot.arrangementCount,3);assert.equal(snapshot.sections.length,0);assert.equal(board.querySelector('.inkframe-score-apply').disabled,true);
  board.querySelector('.inkframe-score-add').click();await wait(45);
  await choose(middle.id);board.querySelector('.inkframe-score-add').click();await wait(45);
  await choose(closing.id);board.querySelector('.inkframe-score-add').click();await wait(45);
  snapshot=score.viewSnapshot(project);assert.deepEqual(Array.from(snapshot.sections,item=>({...item})),[{arrangementId:opening.id,repeat:1},{arrangementId:middle.id,repeat:1},{arrangementId:closing.id,repeat:1}]);

  board.querySelector('.inkframe-score-section[data-section="1"] .inkframe-score-repeat').click();await wait(45);
  board.querySelector('.inkframe-score-section[data-section="2"] .inkframe-score-left').click();await wait(45);
  snapshot=score.viewSnapshot(project);assert.deepEqual(Array.from(snapshot.sections,item=>({...item})),[{arrangementId:opening.id,repeat:1},{arrangementId:closing.id,repeat:1},{arrangementId:middle.id,repeat:2}]);
  board.querySelector('.inkframe-score-section[data-section="1"] .inkframe-score-duplicate').click();await wait(45);
  assert.deepEqual(Array.from(score.viewSnapshot(project).sections,item=>item.arrangementId),[opening.id,closing.id,closing.id,middle.id]);
  board.querySelector('.inkframe-score-section[data-section="2"] .inkframe-score-remove').click();await wait(45);
  snapshot=score.viewSnapshot(project);assert.equal(snapshot.valid,true);assert.equal(snapshot.scoreLength,11);assert.equal(snapshot.changedCount,0);assert.equal(snapshot.unresolvedCount,0);

  board.querySelector('.inkframe-score-preview').click();await wait(70);
  const expected=[1,2,3,3,3,1,2,4,5,4,5,1];
  assert.deepEqual(Array.from(holds),Array(12).fill(1),'score preview must not mutate timing');
  assert.deepEqual(Array.from(board.querySelectorAll('.inkframe-score-preview-arc'),node=>Number(node.dataset.hold)),expected);assert.equal(transactions.length,0);

  board.querySelector('.inkframe-score-apply').click();await wait(90);
  assert.deepEqual(Array.from(holds),expected);assert.equal(transactions.length,1,'score apply must use one batched timing transaction');assert.equal(patterns.viewSnapshot(project).undoDepth,1);
  await openStack();board.querySelector('.inkframe-rhythm-undo').click();await wait(75);assert.deepEqual(Array.from(holds),Array(12).fill(1));assert.equal(patterns.viewSnapshot(project).redoDepth,1);

  await openScore();const name=board.querySelector('.inkframe-score-name');name.value='Scene Score';name.dispatchEvent(new w.Event('input',{bubbles:true}));
  const beforeIds=new Set(recipes.store.snapshot().recipes.map(item=>item.id));board.querySelector('.inkframe-score-save').click();await wait(95);
  const recipeAfterSave=recipes.store.snapshot(),saved=recipeAfterSave.recipes.find(item=>!beforeIds.has(item.id));assert.ok(saved);assert.equal(saved.name,'Scene Score');assert.deepEqual(Array.from(saved.values),[1,2,3,3,3,1,2,4,5,4,5]);
  assert.equal(JSON.stringify(phraseLibrary.store.snapshot()),arrangementsBefore,'saving a score must preserve source arrangements');
  for(const source of recipesBefore.recipes)assert.deepEqual(Array.from(recipes.store.find(source.id).values),Array.from(source.values),'saving a score must preserve source recipes');

  const beforeBlockedSections=score.viewSnapshot(project),beforeBlockedTransactions=transactions.length,beforeBlockedRecipes=recipes.store.snapshot().recipes.length;env.canEditTiming=()=>false;radial.render(board,env);await wait(35);
  assert.equal(score.addSelected(),false);assert.equal(score.setSectionRepeat(0,3),false);assert.equal(score.moveSection(0,1),false);assert.equal(score.duplicateSection(0),false);assert.equal(score.removeSection(0),false);assert.equal(score.clearSections(),false);assert.equal(score.loadStructure({sections:[{arrangementId:opening.id,repeat:1}]}),false);assert.equal(score.applyScore(),false);assert.equal(score.saveScore(),null);
  assert.deepEqual(Array.from(score.viewSnapshot(project).sections,item=>({...item})),Array.from(beforeBlockedSections.sections,item=>({...item})));assert.equal(transactions.length,beforeBlockedTransactions);assert.equal(recipes.store.snapshot().recipes.length,beforeBlockedRecipes);
  env.canEditTiming=()=>true;

  recipes.store.save('Alpha',[8]);radial.render(board,env);await wait(55);await openScore();snapshot=score.viewSnapshot(project);assert.equal(snapshot.valid,true);assert.equal(snapshot.changedCount,1);assert.match(board.querySelector('.inkframe-score-status').textContent,/1 changed source/);
  recipes.store.remove(beta.id);radial.render(board,env);await wait(55);await openScore();snapshot=score.viewSnapshot(project);assert.equal(snapshot.valid,false);assert.equal(snapshot.unresolvedCount,1);assert.equal(snapshot.preview,false);assert.equal(board.querySelector('.inkframe-score-preview').disabled,true);assert.equal(board.querySelector('.inkframe-score-apply').disabled,true);assert.equal(board.querySelector('.inkframe-score-save').disabled,true);

  const other=score.viewSnapshot({});assert.deepEqual({...other,sections:Array.from(other.sections)},{open:false,selectedArrangementId:null,sections:[],preview:false,name:'',arrangementCount:3,scoreLength:0,valid:false,truncated:false,unresolvedCount:0,changedCount:0},'score state must remain isolated by project');
  assert.deepEqual(project,{},'score composer must not write project schema fields');
  assert.equal(score.projectCanvasWrites,0);assert.equal(score.artworkUndoWrites,0);assert.equal(score.timelineTimingWrites,true);assert.equal(score.projectSchemaWrites,0);assert.equal(score.deviceLibraryWrites,true);assert.equal(score.sourceArrangementWrites,0);assert.equal(score.sourceRecipeWrites,0);assert.equal(score.randomWrites,0);
  dom.window.close();console.log('✅ generated Android score ordering, repeats, preview, shared apply/undo, saved recipe, provenance warnings, guards, and isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}

await import('./radial-timing-score-library-boot.test.mjs');
