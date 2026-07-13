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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-v2-brush-coach-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8').replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{const file=resolve(webDir,src);assert.ok(existsSync(file),`missing ${src}`);return `<script>${readFileSync(file,'utf8')}</script>`;});
  const replay=readFileSync(resolve(webDir,'brush-engine-v2/preview-replay.js'),'utf8');
  const coach=readFileSync(resolve(webDir,'brush-engine-v2/brush-coach.js'),'utf8');
  const sessionSource=readFileSync(resolve(webDir,'brush-engine-v2/coach-session.js'),'utf8');
  const reportSource=readFileSync(resolve(webDir,'brush-engine-v2/calibration-report.js'),'utf8');
  const recoverySource=readFileSync(resolve(webDir,'brush-engine-v2/profile-recovery.js'),'utf8');
  const observerSource=readFileSync(resolve(webDir,'brush-engine-v2/profile-recovery-observer.js'),'utf8');
  const identitySource=readFileSync(resolve(webDir,'brush-engine-v2/profile-identities.js'),'utf8');
  html=html.replace('</body>',`<script>${replay}</script><script>${coach}</script><script>${sessionSource}</script><script>${reportSource}</script><script>${recoverySource}</script><script>${observerSource}</script><script>${identitySource}</script></body>`);
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.detail?.stack||e.message));vc.on('error',(...a)=>errors.push(a.join(' ')));
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.__canvasOps=[];w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;const canvas=this,state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter'};return new Proxy(state,{get(t,p){if(p==='canvas')return canvas;if(p==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});if(p==='putImageData')return()=>{};if(p==='createRadialGradient'||p==='createLinearGradient')return()=>({addColorStop:()=>{}});if(typeof p==='string'&&!p.startsWith('__')&&p!=='then'&&p!=='constructor'){if(p in t)return t[p];return(...args)=>w.__canvasOps.push({canvas,method:p,args});}return undefined;},set(t,p,v){t[p]=v;return true;}});};
    w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,';w.HTMLCanvasElement.prototype.toBlob=cb=>cb(null);w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[]});w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};w.MediaRecorder=function(){};w.MediaRecorder.isTypeSupported=()=>false;w.requestAnimationFrame=cb=>setTimeout(()=>cb(w.performance.now()),16);w.cancelAnimationFrame=id=>clearTimeout(id);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;
  }});
  await new Promise(r=>setTimeout(r,1000));assert.deepEqual(errors,[],errors.join('\n'));
  const d=dom.window.document,preview=dom.window.InkFrameBrushV2PreviewPad,replayApi=dom.window.InkFrameBrushV2ReferenceReplay,coachApi=dom.window.InkFrameBrushCoach,sessionApi=dom.window.InkFrameBrushCoachSession,reportApi=dom.window.InkFrameBrushCalibrationReport,recoveryApi=dom.window.InkFrameBrushProfileRecovery,observerApi=dom.window.InkFrameBrushProfileRecoveryObserver,identityApi=dom.window.InkFrameBrushProfileIdentities,adapter=dom.window.InkFrameBrushV2Adapter;
  assert.ok(coachApi&&coachApi.installed,'Brush Coach did not install');assert.ok(sessionApi&&sessionApi.installed,'Coach Session did not install');assert.ok(reportApi&&reportApi.installed,'Calibration Report did not install');assert.ok(recoveryApi&&recoveryApi.installed,'Profile Recovery did not install');assert.ok(observerApi&&observerApi.installed,'Profile Recovery Observer did not install');assert.ok(identityApi&&identityApi.installed,'Creative Brush Identities did not install');
  const identityButtons=Array.from(identityApi.details.querySelectorAll('.inkframe-v2-profile-identity-actions button'));assert.deepEqual(identityButtons.map(button=>button.textContent),['Save & Compare','Apply Identity','Save + Pin','Apply + Lock']);
  const card=d.querySelector('.inkframe-v2-preview-card'),canvas=card.querySelector('.inkframe-v2-preview-canvas'),main=d.getElementById('c');
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:720,height:240,right:720,bottom:240});
  const pointer=(type,values)=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});canvas.dispatchEvent(event);};
  const stroke=async(id,points)=>{for(let i=0;i<points.length;i++){const p=points[i],type=i===0?'pointerdown':i===points.length-1?'pointerup':'pointermove';pointer(type,{pointerId:id,pointerType:'pen',clientX:p[0],clientY:p[1],pressure:p[2],timeStamp:p[3],buttons:type==='pointerup'?0:1});}await new Promise(r=>setTimeout(r,50));};
  const mainBefore=dom.window.__canvasOps.filter(x=>x.canvas===main).length;
  const lockedBaseline=adapter.currentTuning();assert.equal(recoveryApi.lock().stabilizerStrength,lockedBaseline.stabilizerStrength);assert.ok(recoveryApi.model.snapshot().locked);
  await stroke(44,[[30,120,.2,0],[95,80,.4,14],[170,140,.65,28],[280,70,.9,42],[390,120,0,56]]);
  const suggestion=coachApi.current();assert.equal(suggestion.valid,true);assert.ok(suggestion.confidence>=.55);assert.equal(replayApi.stats().reference.available,true);assert.equal(reportApi.render().ready,2);
  const buttons=Array.from(coachApi.panel.querySelectorAll('.inkframe-v2-coach-actions button'));assert.deepEqual(buttons.map(b=>b.textContent),['Save & Compare','Apply Suggestion','Save Suggestion']);assert.ok(buttons.every(b=>!b.disabled));
  assert.equal(coachApi.compare(),true);await new Promise(r=>setTimeout(r,40));assert.equal(preview.stats().compareEnabled,true);assert.ok(replayApi.stats().lastReplay.b>0);
  const store=dom.window.InkFrameBrushV2PresetUI.store;assert.equal(store.snapshot().presets.length,1);assert.ok(store.snapshot().presets[0].name.startsWith('Coach ·'));
  const beforeApply=adapter.currentTuning();assert.equal(coachApi.apply(),true);const afterApply=adapter.currentTuning();assert.notEqual(afterApply.stabilizerStrength,beforeApply.stabilizerStrength);assert.equal(afterApply.stabilizerStrength,suggestion.tuning.stabilizerStrength);
  coachApi.save();assert.equal(store.snapshot().presets.length,1,'saving the same suggestion should update, not duplicate');

  sessionApi.details.open=true;
  await stroke(61,[[40,120,.25,100],[55,116,.35,145],[70,122,.45,190],[86,118,0,235]]);
  await stroke(62,[[60,160,.3,300],[120,80,.45,316],[180,160,.55,332],[240,80,.65,348],[300,160,0,364]]);
  await stroke(63,[[30,130,.35,400],[210,55,.5,406],[420,145,.65,412],[650,70,0,418]]);
  await stroke(64,[[50,130,.08,500],[150,110,.25,520],[250,125,.5,540],[350,105,.82,560],[470,130,0,580]]);
  const sessionSuggestion=sessionApi.model.suggestion();assert.equal(sessionApi.model.snapshot().completed,4);assert.equal(sessionSuggestion.valid,true);
  const sessionButtons=Array.from(sessionApi.details.querySelectorAll('.inkframe-v2-coach-session-actions button'));assert.ok(sessionButtons.slice(0,3).every(button=>!button.disabled));
  assert.equal(sessionApi.compare(),true);await new Promise(r=>setTimeout(r,40));assert.ok(store.snapshot().presets.some(item=>item.name==='Coach · Complete Session'));assert.ok(replayApi.stats().lastReplay.b>0);

  const report=reportApi.render();assert.equal(report.ready,3);assert.equal(report.rows.length,8);assert.equal(reportApi.details.querySelectorAll('.inkframe-v2-calibration-profile').length,3);assert.equal(reportApi.select('session'),true);
  const reportBefore=adapter.currentTuning();assert.equal(reportApi.compare(),true);await new Promise(r=>setTimeout(r,40));assert.ok(store.snapshot().presets.some(item=>item.name==='Calibration · Full Session'));assert.ok(replayApi.stats().lastReplay.b>0);
  assert.equal(reportApi.apply(),true);const reportAfter=adapter.currentTuning();assert.equal(reportAfter.stabilizerStrength,sessionSuggestion.tuning.stabilizerStrength);assert.notEqual(reportAfter.stabilizerStrength,reportBefore.stabilizerStrength);
  reportApi.save();assert.equal(store.snapshot().presets.filter(item=>item.name==='Calibration · Full Session').length,1,'saving the same report target should update, not duplicate');
  assert.equal(sessionApi.apply(),true);assert.equal(adapter.currentTuning().stabilizerStrength,sessionSuggestion.tuning.stabilizerStrength);

  const countBeforeManual=recoveryApi.model.snapshot().entries.length;assert.equal(adapter.setTuning({stabilizerStrength:160}),true);assert.equal(adapter.setTuning({stabilizerStrength:175}),true);const experimental=adapter.currentTuning();assert.equal(experimental.stabilizerStrength,175);assert.equal(recoveryApi.model.snapshot().entries.length,countBeforeManual+1,'rapid stabilizer changes must coalesce');
  const fixedRow=Array.from(d.querySelectorAll('.inkframe-v2-tune-row')).find(row=>row.querySelector('span')?.textContent==='Fixed lag'),fixedInput=fixedRow&&fixedRow.querySelector('input');assert.ok(fixedInput,'legacy Fixed lag slider missing');const beforeLegacy=recoveryApi.model.snapshot().entries.length;fixedInput.value='14';fixedInput.dispatchEvent(new dom.window.Event('input',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,30));assert.equal(Math.round(adapter.currentTuning().positionTimeConstantMs),14);assert.equal(recoveryApi.model.snapshot().entries.length,beforeLegacy+1,'legacy slider must create exactly one recovery entry');
  assert.equal(recoveryApi.compareLocked(),true);await new Promise(r=>setTimeout(r,40));assert.ok(store.snapshot().presets.some(item=>item.name==='Locked · Brush Profile'));assert.equal(adapter.currentTuning().stabilizerStrength,175,'comparison must not apply the lock');
  const preRestore=adapter.currentTuning();assert.equal(recoveryApi.restoreLocked(),true);assert.equal(adapter.currentTuning().stabilizerStrength,lockedBaseline.stabilizerStrength);assert.equal(recoveryApi.undoLast(),true);assert.equal(adapter.currentTuning().stabilizerStrength,preRestore.stabilizerStrength,'undo must restore the pre-restore brush');
  const historyActions=Array.from(recoveryApi.details.querySelectorAll('.inkframe-v2-profile-history-actions button'));historyActions[2].click();assert.ok(store.snapshot().presets.some(item=>item.name.startsWith('Recent · Change')));

  assert.equal(identityApi.current().name,'Lovely Comet');assert.equal(identityApi.select('precision-ink'),true);const beforeIdentityCompare=adapter.currentTuning();assert.equal(identityApi.compare(),true);await new Promise(r=>setTimeout(r,40));assert.ok(store.snapshot().presets.some(item=>item.name==='Precision Ink'));assert.equal(adapter.currentTuning().stabilizerStrength,beforeIdentityCompare.stabilizerStrength,'identity comparison must not apply');
  const pinned=identityApi.saveAndPin();assert.ok(pinned&&store.snapshot().pinned.includes(pinned.id),'Save + Pin must place the identity in Quick Access');
  assert.equal(identityApi.select('expressive-echo'),true);assert.equal(identityApi.apply(),true);assert.equal(adapter.currentTuning().ghostMode,'echo');
  assert.equal(identityApi.select('maximum-stabilized'),true);assert.equal(identityApi.applyAndLock(),true);assert.equal(adapter.currentTuning().stabilizerStrength,200);assert.equal(recoveryApi.model.snapshot().locked.stabilizerStrength,200);
  assert.equal(recoveryApi.model.snapshot().entries.length<=24,true);assert.equal(recoveryApi.projectCanvasWrites,0);assert.equal(recoveryApi.undoWrites,0);assert.equal(observerApi.projectCanvasWrites,0);assert.equal(observerApi.undoWrites,0);assert.equal(identityApi.projectCanvasWrites,0);assert.equal(identityApi.undoWrites,0);

  assert.equal(coachApi.projectCanvasWrites,0);assert.equal(coachApi.undoWrites,0);assert.equal(sessionApi.projectCanvasWrites,0);assert.equal(sessionApi.undoWrites,0);assert.equal(reportApi.projectCanvasWrites,0);assert.equal(reportApi.undoWrites,0);assert.equal(dom.window.__canvasOps.filter(x=>x.canvas===main).length,mainBefore);
  sessionButtons[3].click();assert.equal(sessionApi.model.snapshot().completed,0);assert.equal(sessionButtons[0].disabled,true);assert.equal(reportApi.render().ready,2);assert.equal(reportApi.current().profiles.session.valid,false);
  dom.window.close();console.log('✅ generated Android Coach, calibration, profile recovery, and creative identities are project-isolated');
}finally{rmSync(temp,{recursive:true,force:true});}
