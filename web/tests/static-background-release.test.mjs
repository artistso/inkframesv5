import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-static-background-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(root,'web/index.html'),generated,'--variant=release','--diagnostics=false','--default-engine=v2'],{cwd:root,stdio:'pipe'});
  const html=readFileSync(generated,'utf8');
  const injector=readFileSync(resolve(root,'tools/inject-static-background.mjs'),'utf8');
  const autosave=readFileSync(resolve(root,'web/autosave.js'),'utf8');

  for(const marker of [
    'function newBackground','function ensureProjectBackground','function drawProjectBackground',
    "background:newBackground(w,h)",'backgroundActive:false','backgroundPixels','backgroundStruct',
    "drawProjectBackground(ctx,projects[pi],W,H)","drawProjectBackground(oc,projects[pi],W,H)",
    'flattenFrame(P, frame, width, height)',"drawProjectBackground(g,P,width,height)",
    "v:4, app:'InkFrame Studio'",
    "const kLayBg=lAct('@paper','BG'",'Static background · shared across all frames',
    'newBackground: newBackground',
  ])assert.ok(html.includes(marker),`generated static-background contract missing ${marker}`);

  assert.ok(/restored\.push\([\s\S]*?background[\s\S]*?backgroundActive:false/.test(html),'archive restore must attach the background and keep selection transient');
  assert.ok(html.indexOf('drawProjectBackground(ctx,projects[pi],W,H)')<html.indexOf('if(onion&&!playing)'),'background must render once before onion ghosts');
  assert.equal(/function onionSource[\s\S]{0,500}drawProjectBackground/.test(html),false,'onion sources must not include the shared background');
  assert.equal((html.match(/background:newBackground\(w,h\)/g)||[]).length>=2,true,'new projects and templates need backgrounds');
  assert.ok(injector.includes('Select a frame layer first'),'frame structural actions must reject background selection');
  assert.ok(autosave.includes('v: 3'),'autosave must use the static-background payload version');
  assert.ok(autosave.includes('background: {'),'autosave must serialize background properties and pixels');
  assert.ok(autosave.includes('backgroundActive: false'),'background selection must restore as transient');
  assert.ok(autosave.includes('env.newBackground(w, h)'),'older saves must migrate to a blank background');
  console.log('✅ generated static background render order, editing, exports, and archive/autosave migration passed');
}finally{rmSync(temp,{recursive:true,force:true});}
