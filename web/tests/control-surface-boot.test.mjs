import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'..','control-surface.js'),'utf8');
const dom=new JSDOM(`<!doctype html><html><head></head><body>
  <button id="play" data-action="play">Play</button>
  <button id="delete" data-layer-command="delete">Delete</button>
  <button id="selected" class="active">Draw</button>
  <button id="disabled" disabled>Unavailable</button>
  <button id="icon" title="Close"></button>
  <div id="orb" class="orb glass"><span class="glyph">✦</span></div>
  <div id="kid" class="kid glass on"><span class="glyph">I</span></div>
</body></html>`,{runScripts:'dangerously',url:'http://localhost/'});

dom.window.eval(source);
await new Promise(resolvePromise=>setTimeout(resolvePromise,150));
const {document}=dom.window;

assert.ok(document.getElementById('inkframe-control-surface-v2'),'shared control style must install');
assert.ok(document.getElementById('play').classList.contains('ink-control--transport'));
assert.ok(document.getElementById('delete').classList.contains('ink-control--danger'));
assert.ok(document.getElementById('selected').classList.contains('ink-control--selected'));
assert.ok(document.getElementById('orb').classList.contains('ink-control--radial'));
assert.ok(document.getElementById('kid').classList.contains('ink-control--selected'));
assert.equal(document.getElementById('disabled').getAttribute('aria-disabled'),'true');
assert.equal(document.getElementById('icon').getAttribute('aria-label'),'Close');

const penOver=new dom.window.Event('pointerover',{bubbles:true});
Object.defineProperty(penOver,'pointerType',{value:'pen'});
document.getElementById('play').dispatchEvent(penOver);
assert.ok(document.getElementById('play').classList.contains('inkframe-pen-hover'));
document.getElementById('play').dispatchEvent(new dom.window.Event('pointerout',{bubbles:true}));
assert.equal(document.getElementById('play').classList.contains('inkframe-pen-hover'),false);

const added=document.createElement('button');added.textContent='Next';document.body.appendChild(added);
await new Promise(resolvePromise=>setTimeout(resolvePromise,20));
assert.ok(added.classList.contains('ink-control'));
assert.ok(added.classList.contains('ink-control--transport'));

assert.equal(source.includes('localStorage'),false);
assert.equal(source.includes('fetch('),false);
assert.equal(dom.window.InkFrameControlSurface.networkWrites,0);
dom.window.close();
console.log('✅ Glass Horizon Control Surface installs, decorates dynamic controls, exposes S Pen hover, and preserves zero-network behavior');
