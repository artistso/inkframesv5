import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url)),source=readFileSync(resolve(here,'..','onion-skin-studio.js'),'utf8');
const dom=new JSDOM('<!doctype html><html><head></head><body><div class="node" id="actions"><div class="orb"><span class="lbl">Actions</span></div><div class="kids"></div></div></body></html>',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});
const w=dom.window,d=w.document,node=d.getElementById('actions'),kids=node.querySelector('.kids');node._kids=kids;node._relayout=()=>{};
const projects=[{},{}];let projectIndex=0,editable=true,notices=[];
let settings={enabled:true,depth:2,pastOpacity:.34,futureOpacity:.24,tint:.5,layerOnly:false,pastColor:'#880057',futureColor:'#f7cac9'};
w.InkFrameOnionStudioEnvironment=()=>({
  project:projects[projectIndex],snapshot:()=>({...settings}),canEdit:()=>editable,
  apply:value=>{if(!editable)return false;settings={...value};w.dispatchEvent(new w.CustomEvent('inkframe:onion-settings',{detail:{...settings}}));return {...settings};},
  notify:message=>notices.push(String(message)),
});
w.eval(source);await new Promise(resolvePromise=>setTimeout(resolvePromise,35));
const studio=w.InkFrameOnionSkinStudio,toggle=kids.querySelector('.inkframe-onion-studio-toggle'),panel=d.querySelector('.inkframe-onion-studio');
assert.ok(studio&&toggle&&panel,'Onion Skin Studio must install from the Actions node');assert.equal(panel.hidden,true);

toggle.click();assert.equal(panel.hidden,false);assert.equal(toggle.getAttribute('aria-pressed'),'true');assert.match(panel.querySelector('.inkframe-onion-status').textContent,/2 frames each side/);
const button=text=>Array.from(panel.querySelectorAll('button')).find(item=>item.textContent===text);
button('Arc').click();assert.equal(settings.enabled,true);assert.equal(settings.depth,6);assert.equal(settings.pastOpacity,.18);assert.equal(settings.futureOpacity,.14);assert.equal(settings.tint,.82);assert.match(notices.at(-1),/Arc/);

let past=panel.querySelector('input[data-key="pastOpacity"]'),future=panel.querySelector('input[data-key="futureOpacity"]');
past.value='70';past.dispatchEvent(new w.Event('input',{bubbles:true}));past.dispatchEvent(new w.Event('change',{bubbles:true}));
assert.equal(settings.pastOpacity,.7);assert.equal(settings.futureOpacity,.14,'past opacity must not overwrite future opacity');
future=panel.querySelector('input[data-key="futureOpacity"]');future.value='35';future.dispatchEvent(new w.Event('input',{bubbles:true}));future.dispatchEvent(new w.Event('change',{bubbles:true}));
assert.equal(settings.futureOpacity,.35);assert.equal(settings.pastOpacity,.7);

const pastBefore=settings.pastColor,futureBefore=settings.futureColor;button('Swap colors').click();assert.equal(settings.pastColor,futureBefore);assert.equal(settings.futureColor,pastBefore);
button('Active layer').click();assert.equal(settings.layerOnly,true);assert.equal(button('Active layer'),undefined,'label must update after switching to active-layer mode');assert.ok(button('Full frame'));
button('Reset').click();assert.deepEqual(settings,{enabled:true,depth:2,pastOpacity:.34,futureOpacity:.24,tint:.5,layerOnly:false,pastColor:'#880057',futureColor:'#f7cac9'});

projectIndex=1;studio.renderPanel();assert.equal(panel.hidden,true,'a second project must not inherit the first project panel state');toggle.click();assert.equal(panel.hidden,false);
projectIndex=0;studio.renderPanel();assert.equal(panel.hidden,false,'the first project must retain its own open state');

editable=false;studio.renderPanel();const before={...settings};assert.equal(panel.dataset.blocked,'true');assert.match(panel.querySelector('.inkframe-onion-status').textContent,/Active stroke/);
assert.equal(studio.applyChange({depth:8},'Blocked'),false);assert.deepEqual(settings,before);assert.match(notices.at(-1),/Finish the active stroke/);
assert.ok(Array.from(panel.querySelectorAll('button')).filter(item=>item.textContent!=='×').every(item=>item.disabled),'all mutation controls must disable during an active stroke');

assert.equal(studio.projectCanvasWrites,0);assert.equal(studio.artworkUndoWrites,0);assert.equal(studio.projectSchemaWrites,0);assert.equal(studio.historyWrites,0);assert.equal(studio.networkWrites,0);
dom.window.close();console.log('✅ Onion Skin Studio Actions integration, presets, independent ghosts, project state, reset, and stroke guards passed');
