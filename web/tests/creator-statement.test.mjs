// InkFrame 0.4.0 creator statement and preserved profile-history release gate
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const sourcePath=resolve(root,'web/creator-statement.js'),source=readFileSync(sourcePath,'utf8');
assert.ok(existsSync(sourcePath),'creator statement asset is missing');
assert.ok(source.includes('Steven Michael Allen Owens'));
assert.ok(source.includes('personal testimony and not as an independently verified factual finding'));
assert.ok(source.includes("label.textContent='Studio · Steven'"));
assert.ok(source.includes('projectCanvasWrites:0,artworkUndoWrites:0,projectSchemaWrites:0,storageWrites:0,networkWrites:0'));
assert.equal(source.includes('localStorage'),false,'creator statement must not persist data');
assert.equal(source.includes('fetch('),false,'creator statement must not use the network');

const dom=new JSDOM('<!doctype html><html><head></head><body><div class="lbl">Studio</div><div id="studio"><div class="card"><h2>InkFrame</h2><div class="metaGrid"></div></div></div></body></html>',{runScripts:'dangerously',url:'http://localhost/'});
dom.window.eval(source);await new Promise(resolvePromise=>setTimeout(resolvePromise,20));
const document=dom.window.document,details=document.querySelector('#studio .creatorStatement');
assert.ok(details,'creator statement must install in Studio');assert.equal(details.open,true);
assert.equal(details.querySelector('summary').textContent,'Personal statement from Steven Michael Allen Owens');
assert.match(details.querySelector('.creatorStatementNotice').textContent,/own account/);
assert.match(details.querySelector('.creatorStatementNotice').textContent,/not as an independently verified factual finding/);
assert.equal(details.querySelectorAll('p').length,8);
assert.equal(document.querySelector('.lbl').textContent,'Studio · Steven');
assert.equal(dom.window.InkFrameCreatorStatement.storageWrites,0);assert.equal(dom.window.InkFrameCreatorStatement.networkWrites,0);
dom.window.close();

const temp=mkdtempSync(resolve(tmpdir(),'inkframe-creator-release-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(root,'web/index.html'),generated,'--variant=release','--diagnostics=false','--default-engine=v2'],{cwd:root,stdio:'pipe'});
  const html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="creator-statement.js"></script>'),'release index must package the creator statement');
  assert.ok(html.indexOf('creator-statement.js')<html.indexOf('brush-engine-v2/sample.js'),'creator statement must load before the modular studio runtime');
}finally{rmSync(temp,{recursive:true,force:true});}
console.log('✅ creator statement testimony label, Studio rename, production packaging, and zero-write isolation passed');

await import('./onion-skin-studio.test.mjs');
await import('./onion-skin-studio-boot.test.mjs');
await import('./onion-skin-studio-release.test.mjs');
await import('./feedback-report.test.mjs');
await import('./feedback-report-boot.test.mjs');
await import('./feedback-report-release.test.mjs');
await import('./tablet-command-deck.test.mjs');
await import('./tablet-command-deck-boot.test.mjs');
await import('./tablet-command-deck-release.test.mjs');
await import('./timeline-workspace.test.mjs');
await import('./timeline-workspace-boot.test.mjs');
await import('./timeline-workspace-release.test.mjs');
await import('./layer-workspace.test.mjs');
await import('./layer-workspace-boot.test.mjs');
await import('./layer-workspace-release.test.mjs');
await import('./control-surface.test.mjs');
await import('./control-surface-boot.test.mjs');
await import('./control-surface-release.test.mjs');
await import('./static-background-release.test.mjs');
await import('./brush-engine-v2-profile-history-boot.test.mjs');
