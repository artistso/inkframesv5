import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url)),source=readFileSync(resolve(here,'..','layer-workspace.js'),'utf8');
const dom=new JSDOM('<!doctype html><html><head></head><body><aside id="inkframeTabletDeck"><div class="deck-body"><div class="deck-modes"></div><div class="deck-transport"></div><div class="deck-utilities"></div></div></aside><div class="node" id="layersNode"><button class="orb"><span class="lbl">Layers</span></button><div class="kids"></div></div></body></html>',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});
const w=dom.window,d=w.document,layers=d.getElementById('layersNode');w.matchMedia=()=>({matches:true,addListener(){},removeListener(){}});
let notices=[],commands=[];
const blends=['Normal','Multiply','Screen'];
const layer={count:3,active:2,visible:true,opacity:100,blend:'Normal',canInteract:true};
w.InkFrameTabletDeckEnvironment=()=>({
  canInteract:()=>layer.canInteract,
  notify:message=>notices.push(String(message)),
  layerSnapshot:()=>layer,
  layerCommand:(name,value)=>{
    commands.push([name,value]);
    if(name==='selectAbove'&&layer.active<layer.count)layer.active++;
    else if(name==='selectBelow'&&layer.active>1)layer.active--;
    else if(name==='opacity')layer.opacity=Number(value);
    else if(name==='visibility')layer.visible=!layer.visible;
    else if(name==='blend')layer.blend=blends[(blends.indexOf(layer.blend)+1)%blends.length];
    else if(name==='add'){layer.count++;layer.active++;}
    else if(name==='duplicate'){layer.count++;layer.active++;}
    else if(name==='delete'&&layer.count>1){layer.count--;layer.active=Math.max(1,layer.active-1);}
    else if(name==='moveUp'&&layer.active<layer.count)layer.active++;
    else if(name==='moveDown'&&layer.active>1)layer.active--;
    else if(name==='mergeDown'&&layer.active>1){layer.count--;layer.active--;}
    return true;
  },
});
w.eval(source);await new Promise(resolvePromise=>setTimeout(resolvePromise,80));

const api=w.InkFrameLayerWorkspace,panel=d.getElementById('inkframeLayerWorkspace');
assert.ok(api&&panel,'Layer Workspace must attach to Tablet Command Deck');
assert.equal(panel.hidden,true,'Layer Workspace must stay hidden until Layers opens');
layers.classList.add('open');api.updateState();assert.equal(panel.hidden,false);
assert.equal(panel.querySelector('[data-layer-state="count"]').textContent,'3 layers');
assert.equal(panel.querySelector('[data-layer-state="position"]').textContent,'2 / 3');
assert.equal(panel.querySelector('[data-layer-state="visibility"]').textContent,'Visible');
assert.equal(panel.querySelector('[data-layer-state="opacity"]').textContent,'100%');
assert.equal(panel.querySelector('[data-layer-state="blend"]').textContent,'Normal');

const command=(name,value)=>panel.querySelector(`[data-layer-command="${name}"]${value==null?'':`[data-layer-value="${value}"]`}`);
command('opacity',50).click();api.updateState();assert.deepEqual(commands.at(-1),['opacity',50]);assert.equal(panel.querySelector('[data-layer-state="opacity"]').textContent,'50%');assert.equal(command('opacity',50).classList.contains('active'),true);
command('visibility').click();api.updateState();assert.equal(panel.querySelector('[data-layer-state="visibility"]').textContent,'Hidden');assert.equal(command('visibility').textContent,'Show');
command('blend').click();api.updateState();assert.equal(panel.querySelector('[data-layer-state="blend"]').textContent,'Multiply');
command('selectAbove').click();api.updateState();assert.equal(panel.querySelector('[data-layer-state="position"]').textContent,'3 / 3');assert.equal(command('selectAbove').disabled,true);assert.equal(command('moveUp').disabled,true);
command('moveDown').click();api.updateState();assert.equal(panel.querySelector('[data-layer-state="position"]').textContent,'2 / 3');
command('duplicate').click();api.updateState();assert.equal(panel.querySelector('[data-layer-state="count"]').textContent,'4 layers');assert.equal(panel.querySelector('[data-layer-state="position"]').textContent,'3 / 4');
command('mergeDown').click();api.updateState();assert.equal(panel.querySelector('[data-layer-state="count"]').textContent,'3 layers');assert.equal(panel.querySelector('[data-layer-state="position"]').textContent,'2 / 3');
command('delete').click();api.updateState();assert.equal(panel.querySelector('[data-layer-state="count"]').textContent,'2 layers');assert.equal(panel.querySelector('[data-layer-state="position"]').textContent,'1 / 2');assert.equal(command('moveDown').disabled,true);assert.equal(command('mergeDown').disabled,true);
command('delete').click();api.updateState();assert.equal(panel.querySelector('[data-layer-state="count"]').textContent,'1 layer');assert.equal(command('delete').disabled,true);

layer.canInteract=false;api.updateState();assert.equal(command('add').disabled,true);assert.equal(api.runCommand('add'),false);assert.match(notices.at(-1),/Finish the active stroke/);layer.canInteract=true;
layers.classList.remove('open');api.updateState();assert.equal(panel.hidden,true);

const css=d.querySelector('style[data-inkframe-layer-workspace-style]').textContent;
assert.match(css,/min-height:48px/);assert.match(css,/grid-template-columns:repeat\(4,1fr\)/);assert.match(css,/data-layer-command="delete"/);
assert.equal(api.directLayerWrites,0);assert.equal(api.directCanvasWrites,0);assert.equal(api.directOrderWrites,0);assert.equal(api.directProjectSchemaWrites,0);assert.equal(api.storageWrites,0);assert.equal(api.networkWrites,0);
dom.window.close();console.log('✅ Layer Workspace visibility, state, opacity, visibility, blend, ordering, structural actions, boundaries, and active-stroke lockout passed');
