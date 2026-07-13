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
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-v2-coach-session-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(webDir,'index.html'),generated,'--variant=debug','--diagnostics=true','--default-engine=v2'],{cwd:root});
  let html=readFileSync(generated,'utf8').replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{const file=resolve(webDir,src);assert.ok(existsSync(file),`missing ${src}`);return `<script>${readFileSync(file,'utf8')}</script>`;});
  const extra=['preview-replay.js','brush-coach.js','coach-session.js'].map(name=>`<script>${readFileSync(resolve(webDir,'brush-engine-v2',name),'utf8')}</script>`).join('');
  html=html.replace('</body>',`${extra}</body>`);
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.detail?.stack||e.message));vc.on('error',(...a)=>errors.push(a.join(' ')));
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.__canvasOps=[];w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;const canvas=this,state={fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter'};return new Proxy(state,{get(t,p){if(p==='canvas')return canvas;if(p==='getImageData')return()=>({data:new Uint8ClampedArray((canvas.width||1)*(canvas.height||1)*4),width:canvas.width||1,height:canvas.height||1});if(p==='putImageData')return()=>{};if(p==='createRadialGradient'||p==='createLinearGradient')return()=>({addColorStop:()=>{}});if(typeof p==='string'&&!p.startsWith('__')&&p!=='then'&&p!=='constructor'){if(p in t)return t[p];return(...args)=>w.__canvasOps.push({canvas,method:p,args});}return undefined;},set(t,p,v){t[p]=v;return true;}});};
    w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,';w.HTMLCanvasElement.prototype.toBlob=cb=>cb(null);w.HTMLCanvasElement.prototype.captureStream=()=>({getVideoTracks:()=>[]});w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};w.MediaRecorder=function(){};w.MediaRecorder.isTypeSupported=()=>false;w.requestAnimationFrame=cb=>setTimeout(()=>cb(w.performance.now()),16);w.cancelAnimationFrame=id=>clearTimeout(id);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;
  }});
  await new Promise(r=>setTimeout(r,1100));assert.deepEqual(errors,[],errors.join('\n'));
  const d=dom.window.document,preview=dom.window.InkFrameBrushV2PreviewPad,replay=dom.window.InkFrameBrushV2ReferenceReplay,session=dom.window.InkFrameBrushCoachSession;
  assert.ok(session&&session.installed,'Coach Session did not install');session.details.open=true;
  const canvas=d.querySelector('.inkframe-v2-preview-canvas'),main=d.getElementById('c');canvas.getBoundingClientRect=()=>({left:0,top:0,width:720,height:240,right:720,bottom:240});
  const pointer=(type,values)=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});canvas.dispatchEvent(event);};
  const stroke=async(id,points)=>{for(let i=0;i<points.length;i++){const p=points[i],type=i===0?'pointerdown':i===points.length-1?'pointerup':'pointermove';pointer(type,{pointerId:id,pointerType:'pen',clientX:p[0],clientY:p[1],pressure:p[2],timeStamp:p[3],buttons:type==='pointerup'?0:1});}await new Promise(r=>setTimeout(r,45));};
  const mainBefore=dom.window.__canvasOps.filter(x=>x.canvas===main).length;
  await stroke(61,[[40,120,.25,0],[55,116,.35,45],[70,122,.45,90],[86,118,0,135]]);assert.equal(session.model.snapshot().completed,1);assert.equal(session.model.selected,'corners');
  await stroke(62,[[60,160,.3,200],[120,80,.45,216],[180,160,.55,232],[240,80,.65,248],[300,160,0,264]]);assert.equal(session.model.snapshot().completed,2);assert.equal(session.model.selected,'gesture');
  await stroke(63,[[30,130,.35,300],[210,55,.5,306],[420,145,.65,312],[650,70,0,318]]);assert.equal(session.model.snapshot().completed,3);assert.equal(session.model.selected,'pressure');
  await stroke(64,[[50,130,.08,400],[150,110,.25,420],[250,125,.5,440],[350,105,.82,460],[470,130,0,480]]);assert.equal(session.model.snapshot().completed,4);
  const suggestion=session.model.suggestion();assert.equal(suggestion.valid,true);assert.ok(suggestion.tuning.stabilizerStrength>=25&&suggestion.tuning.stabilizerStrength<=200);assert.equal(suggestion.tuning.coverageMode,'ribbon');
  const actions=Array.from(session.details.querySelectorAll('.inkframe-v2-coach-session-actions button'));assert.equal(actions.length,4);assert.ok(actions.slice(0,3).every(button=>!button.disabled));
  assert.equal(session.compare(),true);await new Promise(r=>setTimeout(r,50));assert.equal(preview.stats().compareEnabled,true);assert.ok(replay.stats().lastReplay.b>0);
  const store=dom.window.InkFrameBrushV2PresetUI.store;assert.ok(store.snapshot().presets.some(item=>item.name==='Coach · Complete Session'));
  assert.equal(session.apply(),true);const applied=dom.window.InkFrameBrushV2Adapter.currentTuning();assert.equal(applied.stabilizerStrength,suggestion.tuning.stabilizerStrength);assert.equal(applied.cornerStrength,suggestion.tuning.cornerStrength);
  assert.equal(session.projectCanvasWrites,0);assert.equal(session.undoWrites,0);assert.equal(dom.window.__canvasOps.filter(x=>x.canvas===main).length,mainBefore);
  actions[3].click();assert.equal(session.model.snapshot().completed,0);assert.equal(actions[0].disabled,true);
  dom.window.close();console.log('✅ generated Android Coach Session is guided, explicit, and project-isolated');
}finally{rmSync(temp,{recursive:true,force:true});}
