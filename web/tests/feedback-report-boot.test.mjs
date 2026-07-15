import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url)),source=readFileSync(resolve(here,'..','feedback-report.js'),'utf8');
const dom=new JSDOM('<!doctype html><html><head></head><body><button id="inkframe-test-report-btn">REPORT</button><div class="node" id="actions"><div class="orb"><span class="lbl">Actions</span></div><div class="kids"></div></div></body></html>',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});
const w=dom.window,d=w.document,node=d.getElementById('actions'),kids=node.querySelector('.kids');node._kids=kids;node._relayout=()=>{};
const projects=[{},{}];let projectIndex=0,editable=true,copied='',saved=null,notices=[];
const snapshots=[
  {build:{version:'0.4.0',packageName:'com.inkframe.studio',variant:'debug',diagnostics:true,defaultBrushEngine:'v2'},projectSlot:1,projectTotal:2,projectName:'Never include me',canvas:{width:1024,height:768,shape:'circle'},timeline:{frameCount:12,currentFrame:4,fps:12,holds:[1,2,2],playing:false,loopEnabled:true,loopIn:2,loopOut:8},layers:{count:3,active:2,names:['Private']},brush:{id:'ink',engine:'v2',stylusOnly:true,barrelMode:'pick',activeStroke:false},onion:{enabled:true,depth:4,pastOpacity:.3,futureOpacity:.2,tint:.6,layerOnly:false},recoveryAvailable:true,recoveryLastSave:'recent'},
  {build:{version:'0.4.0',packageName:'com.inkframe.studio',variant:'debug',diagnostics:true,defaultBrushEngine:'v2'},projectSlot:2,projectTotal:2,canvas:{width:512,height:512,shape:'square'},timeline:{frameCount:2,currentFrame:1,fps:8,holds:[1,1],playing:false,loopEnabled:false,loopIn:0,loopOut:0},layers:{count:1,active:1},brush:{id:'pencil',engine:'original',stylusOnly:false,barrelMode:'off',activeStroke:false},onion:{enabled:false,depth:1,pastOpacity:.2,futureOpacity:.2,tint:.2,layerOnly:false}},
];
w.InkFrameFeedbackEnvironment=()=>({project:projects[projectIndex],snapshot:()=>snapshots[projectIndex],canOpen:()=>editable,notify:message=>notices.push(String(message))});
w.InkFrameAndroidBridge={copyTesterReport:text=>{copied=String(text);},saveDataUrl:(dataUrl,name,mime)=>{saved={dataUrl:String(dataUrl),name:String(name),mime:String(mime)};}};
w.eval(source);await new Promise(resolvePromise=>setTimeout(resolvePromise,40));
const feedback=w.InkFrameFeedbackReport,toggle=kids.querySelector('.inkframe-feedback-toggle'),panel=d.querySelector('.inkframe-feedback');
assert.ok(feedback&&toggle&&panel,'Feedback Report must install from the Actions node');
assert.equal(d.getElementById('inkframe-test-report-btn'),null,'legacy floating report button must be removed');
assert.equal(panel.hidden,true);assert.equal(toggle.querySelector('.sub').textContent,'Feedback');

toggle.click();assert.equal(panel.hidden,false);assert.equal(toggle.getAttribute('aria-pressed'),'true');
assert.match(panel.querySelector('.privacy').textContent,/Nothing is uploaded/);assert.match(panel.querySelector('.summary').textContent,/1024×768 circle/);
const field=key=>panel.querySelector(`textarea[data-note="${key}"]`);
field('summary').value='Export turns blank';field('summary').dispatchEvent(new w.Event('input',{bubbles:true}));
field('steps').value='1. Draw\n2. Export';field('steps').dispatchEvent(new w.Event('input',{bubbles:true}));
field('expected').value='Visible frames';field('expected').dispatchEvent(new w.Event('input',{bubbles:true}));
field('actual').value='Blank file';field('actual').dispatchEvent(new w.Event('input',{bubbles:true}));
const button=text=>Array.from(panel.querySelectorAll('button')).find(item=>item.textContent===text);
button('Copy report').click();await new Promise(resolvePromise=>setTimeout(resolvePromise,0));
assert.match(copied,/Summary: Export turns blank/);assert.match(copied,/Canvas: 1024x768 \(circle\)/);assert.match(copied,/Steps:\n1\. Draw/);
assert.equal(copied.includes('Never include me'),false);assert.equal(copied.includes('Private'),false);assert.match(notices.at(-1),/copied/);
button('Save .txt').click();assert.ok(saved);assert.equal(saved.mime,'text/plain');assert.match(saved.name,/^InkFrame-feedback-.*\.txt$/);assert.match(saved.dataUrl,/^data:text\/plain;charset=utf-8,/);assert.match(decodeURIComponent(saved.dataUrl.split(',').slice(1).join(',')),/Export turns blank/);

projectIndex=1;feedback.renderPanel();assert.equal(panel.hidden,true,'second project must not inherit first project panel state');toggle.click();assert.equal(panel.hidden,false);assert.match(panel.querySelector('.summary').textContent,/512×512 square/);assert.equal(field('summary').value,'');
projectIndex=0;feedback.renderPanel();assert.equal(panel.hidden,false);assert.equal(field('summary').value,'Export turns blank','first project must retain transient notes in memory');
button('Reset notes').click();assert.equal(field('summary').value,'');assert.match(notices.at(-1),/reset/);

button('×').click();assert.equal(panel.hidden,true);editable=false;toggle.click();assert.equal(panel.hidden,true,'active stroke must block panel opening');assert.match(notices.at(-1),/Finish the active stroke/);
assert.equal(feedback.projectCanvasWrites,0);assert.equal(feedback.artworkUndoWrites,0);assert.equal(feedback.timingHistoryWrites,0);assert.equal(feedback.projectSchemaWrites,0);assert.equal(feedback.storageWrites,0);assert.equal(feedback.networkWrites,0);assert.equal(feedback.artworkReads,0);assert.equal(feedback.projectNameReads,0);
dom.window.close();console.log('✅ Feedback Report Actions integration, transient notes, copy/save, redaction, legacy cleanup, and stroke guard passed');
