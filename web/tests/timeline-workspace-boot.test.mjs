import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url)),source=readFileSync(resolve(here,'..','timeline-workspace.js'),'utf8');
const dom=new JSDOM('<!doctype html><html><head></head><body><aside id="inkframeTabletDeck"><div class="deck-body"><div class="deck-modes"></div><div class="deck-transport"></div><div class="deck-utilities"></div></div></aside><div class="node" id="framesNode"><button class="orb"><span class="lbl">Frames</span></button><div class="kids"></div></div></body></html>',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});
const w=dom.window,d=w.document,frames=d.getElementById('framesNode');w.matchMedia=()=>({matches:true,addListener(){},removeListener(){}});
let notices=[],commands=[];
const timeline={frameCount:12,currentFrame:4,maxFrames:120,remainingFrames:108,selected:[],targetCount:1,hold:1,mixedHold:false,loopEnabled:false,canInteract:true};
w.InkFrameTabletDeckEnvironment=()=>({
  canInteract:()=>timeline.canInteract,
  notify:message=>notices.push(String(message)),
  timelineSnapshot:()=>timeline,
  timelineCommand:(name,value)=>{
    commands.push([name,value]);
    if(name==='hold'){timeline.hold=Number(value);timeline.mixedHold=false;}
    else if(name==='holdDelta')timeline.hold=Math.max(1,Math.min(8,timeline.hold+(Number(value)<0?-1:1)));
    else if(name==='selectAll'){timeline.selected=Array.from({length:timeline.frameCount},(_,i)=>i+1);timeline.targetCount=timeline.selected.length;}
    else if(name==='clearSelection'){timeline.selected=[];timeline.targetCount=1;}
    else if(name==='duplicate'){timeline.frameCount+=timeline.targetCount;timeline.remainingFrames=timeline.maxFrames-timeline.frameCount;}
    else if(name==='delete'){timeline.frameCount=Math.max(1,timeline.frameCount-timeline.targetCount);timeline.remainingFrames=timeline.maxFrames-timeline.frameCount;timeline.selected=[];timeline.targetCount=1;}
    return true;
  },
});
w.eval(source);await new Promise(resolvePromise=>setTimeout(resolvePromise,80));

const api=w.InkFrameTimelineWorkspace,panel=d.getElementById('inkframeTimelineWorkspace');
assert.ok(api&&panel,'Timeline Workspace must attach to Tablet Command Deck');
assert.equal(panel.hidden,true,'Timeline Workspace must stay hidden until Frames opens');
frames.classList.add('open');api.updateState();assert.equal(panel.hidden,false);
assert.equal(panel.querySelector('[data-timeline-state="count"]').textContent,'12 / 120');
assert.equal(panel.querySelector('[data-timeline-state="selection"]').textContent,'Frame 4');
assert.equal(panel.querySelector('[data-timeline-state="hold"]').textContent,'×1');
assert.equal(panel.querySelector('[data-timeline-state="capacity"]').textContent,'108 free');
assert.equal(panel.querySelector('[data-timeline-state="loop"]').textContent,'Off');

const command=(name,value)=>panel.querySelector(`[data-timeline-command="${name}"]${value==null?'':`[data-timeline-value="${value}"]`}`);
command('hold',2).click();api.updateState();assert.deepEqual(commands.at(-1),['hold',2]);assert.equal(panel.querySelector('[data-timeline-state="hold"]').textContent,'×2');assert.equal(command('hold',2).classList.contains('active'),true);
command('holdDelta',1).click();api.updateState();assert.equal(panel.querySelector('[data-timeline-state="hold"]').textContent,'×3');
command('selectAll').click();api.updateState();assert.equal(panel.querySelector('[data-timeline-state="selection"]').textContent,'12 selected · 1–12');assert.equal(command('reverse').disabled,false);
command('duplicate').click();api.updateState();assert.equal(panel.querySelector('[data-timeline-state="count"]').textContent,'24 / 120');assert.equal(panel.querySelector('[data-timeline-state="capacity"]').textContent,'96 free');
command('clearSelection').click();api.updateState();assert.equal(panel.querySelector('[data-timeline-state="selection"]').textContent,'Frame 4');assert.equal(command('reverse').disabled,true);
command('pingPong').click();assert.deepEqual(commands.at(-1),['pingPong',undefined]);

timeline.canInteract=false;api.updateState();assert.equal(command('delete').disabled,true);assert.equal(api.runCommand('delete'),false);assert.match(notices.at(-1),/Finish the active stroke/);timeline.canInteract=true;
frames.classList.remove('open');api.updateState();assert.equal(panel.hidden,true);

const css=d.querySelector('style[data-inkframe-timeline-workspace-style]').textContent;
assert.match(css,/min-height:48px/);assert.match(css,/grid-template-columns:repeat\(4,1fr\)/);assert.match(css,/overflow-y:auto/);
assert.equal(api.directFrameWrites,0);assert.equal(api.directHoldWrites,0);assert.equal(api.directSelectionWrites,0);assert.equal(api.directProjectSchemaWrites,0);assert.equal(api.storageWrites,0);assert.equal(api.networkWrites,0);
dom.window.close();console.log('✅ Timeline Workspace visibility, live state, holds, selection, delegated commands, touch layout, and active-stroke lockout passed');
