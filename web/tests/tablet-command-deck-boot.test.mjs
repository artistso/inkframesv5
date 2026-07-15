import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url)),source=readFileSync(resolve(here,'..','tablet-command-deck.js'),'utf8');
const dom=new JSDOM('<!doctype html><html><head></head><body><button id="railPrev">Prev</button><button id="railNext">Next</button><div id="railCount">4 / 12</div><div id="studio"></div><section class="inkframe-feedback" hidden></section></body></html>',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});
const w=dom.window,d=w.document;Object.defineProperty(w,'innerWidth',{value:1400,writable:true});w.matchMedia=query=>({matches:query==='(pointer: coarse)',media:query,addListener(){},removeListener(){}});

function addNode(label){
  const node=d.createElement('div');node.className='node';
  const orb=d.createElement('button');orb.className='orb';orb.innerHTML=`<span class="lbl">${label}</span>`;
  const kids=d.createElement('div');kids.className='kids';node.append(orb,kids);node._kids=kids;node._relayout=()=>{};d.body.appendChild(node);return node;
}
const tools=addNode('Tools'),frames=addNode('Frames'),layers=addNode('Layers'),actions=addNode('Actions');
const nodeMap={Tools:tools,Frames:frames,Layers:layers,Actions:actions};
let prevClicks=0,nextClicks=0,playClicks=0,labOpens=0,collapseCalls=0,notices=[];
d.getElementById('railPrev').addEventListener('click',()=>prevClicks++);d.getElementById('railNext').addEventListener('click',()=>nextClicks++);
const state={brush:{id:'ink',engine:'v2',activeStroke:false},timeline:{frameCount:12,currentFrame:4,fps:12,playing:false},layers:{count:3,active:2},onion:{enabled:true}};
w.InkFrameTabletDeckEnvironment=()=>({
  snapshot:()=>state,canInteract:()=>!state.brush.activeStroke,notify:message=>notices.push(String(message)),
  openMode:target=>{const node=nodeMap[target];if(!node)return false;node.classList.add('open');return true;},
  openBrushLab:()=>{labOpens++;return true;},
  togglePlayback:()=>{playClicks++;state.timeline.playing=!state.timeline.playing;return true;},
  collapseModes:()=>{collapseCalls++;for(const node of Object.values(nodeMap))node.classList.remove('open');return true;},
});
w.eval(source);await new Promise(resolvePromise=>setTimeout(resolvePromise,80));

const api=w.InkFrameTabletDeck,deck=d.getElementById('inkframeTabletDeck'),toggle=actions._kids.querySelector('.inkframe-tablet-deck-toggle');
assert.ok(api&&deck&&toggle,'Tablet Command Deck must install with an Actions toggle');
assert.equal(deck.hidden,false);assert.equal(deck.classList.contains('expanded'),true);assert.equal(toggle.getAttribute('aria-pressed'),'true');
assert.equal(deck.querySelector('[data-status="brush"]').textContent,'v2 · ink');
assert.equal(deck.querySelector('[data-status="frame"]').textContent,'4 / 12');
assert.equal(deck.querySelector('[data-status="layers"]').textContent,'2 / 3');
assert.match(deck.querySelector('[data-status="timing"]').textContent,/12 fps · paused · onion/);

const button=text=>Array.from(deck.querySelectorAll('button')).find(item=>item.textContent===text);
button('Draw').click();api.updateState();assert.equal(tools.classList.contains('open'),true);assert.equal(button('Draw').classList.contains('active'),true);
button('Frames').click();button('Actions').click();assert.equal(frames.classList.contains('open'),true);assert.equal(actions.classList.contains('open'),true);
deck.querySelector('[data-action="prev"]').click();deck.querySelector('[data-action="next"]').click();assert.equal(prevClicks,1);assert.equal(nextClicks,1);
deck.querySelector('[data-action="play"]').click();assert.equal(playClicks,1);api.updateState();assert.equal(deck.querySelector('[data-action="play"]').textContent,'Pause');
button('Brush Lab').click();assert.equal(labOpens,1);
button('Collapse').click();assert.equal(collapseCalls,1);assert.equal(tools.classList.contains('open'),false);assert.equal(frames.classList.contains('open'),false);

state.brush.activeStroke=true;button('Layers').click();deck.querySelector('[data-action="next"]').click();button('Brush Lab').click();assert.equal(layers.classList.contains('open'),false);assert.equal(nextClicks,1);assert.equal(labOpens,1);assert.match(notices.at(-1),/Finish the active stroke/);state.brush.activeStroke=false;

deck.querySelector('[title="Collapse deck"]').click();assert.equal(deck.classList.contains('expanded'),false);assert.match(w.localStorage.getItem(api.PREF_KEY),/"expanded":false/);deck.querySelector('.deck-grip').click();assert.equal(deck.classList.contains('expanded'),true);
deck.querySelector('[title="Hide deck"]').click();assert.equal(deck.hidden,true);assert.equal(toggle.getAttribute('aria-pressed'),'false');toggle.click();assert.equal(deck.hidden,false);

d.getElementById('studio').classList.add('show');api.updateState();assert.equal(deck.classList.contains('obscured'),true);d.getElementById('studio').classList.remove('show');api.updateState();assert.equal(deck.classList.contains('obscured'),false);
const feedback=d.querySelector('.inkframe-feedback');feedback.hidden=false;api.updateState();assert.equal(deck.classList.contains('obscured'),true);feedback.hidden=true;api.updateState();assert.equal(deck.classList.contains('obscured'),false);
const css=d.querySelector('style[data-inkframe-tablet-deck-style]').textContent;assert.match(css,/\.frameSlot\{width:26px!important/);assert.match(css,/\.deck-icon\{width:48px;height:48px;min-height:48px/);assert.match(css,/min-height:48px/);assert.match(css,/\.inkframe-feedback/);
assert.equal(api.projectCanvasWrites,0);assert.equal(api.artworkUndoWrites,0);assert.equal(api.timingHistoryWrites,0);assert.equal(api.projectSchemaWrites,0);assert.equal(api.networkWrites,0);
dom.window.close();console.log('✅ Tablet Command Deck Draw/Tools bridge, Brush Lab, transport, state, persistence, panel safety, and active-stroke lockout passed');
