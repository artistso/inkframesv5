import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-onion-release-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(root,'web/index.html'),generated,'--variant=release','--diagnostics=false','--default-engine=v2'],{cwd:root,stdio:'pipe'});
  const html=readFileSync(generated,'utf8'),sourcePath=resolve(root,'web/onion-skin-studio.js'),source=readFileSync(sourcePath,'utf8'),injector=readFileSync(resolve(root,'tools/inject-onion-skin-studio.mjs'),'utf8'),gradle=readFileSync(resolve(root,'app/build.gradle.kts'),'utf8');
  assert.ok(existsSync(sourcePath),'missing Onion Skin Studio runtime');
  assert.ok(html.includes('<script src="onion-skin-studio.js"></script>'),'release index must package Onion Skin Studio');
  assert.ok(html.indexOf('creator-statement.js')<html.indexOf('onion-skin-studio.js'),'Onion Skin Studio must load after creator statement');
  assert.ok(html.indexOf('onion-skin-studio.js')<html.indexOf('brush-engine-v2/sample.js'),'Onion Skin Studio must initialize before the modular brush runtime');
  assert.ok(html.includes('window.InkFrameOnionStudioEnvironment'),'release index must expose the established onion compositor bridge');
  assert.ok(html.includes('applyOnionStudioSettings'),'release index must expose bounded preference application');
  assert.ok(html.includes('syncOnionStudioControls'),'external settings must synchronize the original Actions controls');
  assert.ok(html.includes("inkframe:onion-settings"),'the bridge must publish settings changes to the tablet panel');
  assert.ok(source.includes("Object.freeze({id:'clean'"));assert.ok(source.includes("Object.freeze({id:'inbetween'"));assert.ok(source.includes("Object.freeze({id:'rough'"));assert.ok(source.includes("Object.freeze({id:'arc'"));assert.ok(source.includes("Object.freeze({id:'layer'"));
  assert.ok(source.includes('pastOpacity'));assert.ok(source.includes('futureOpacity'));assert.ok(source.includes('layerOnly'));assert.ok(source.includes('Swap colors'));
  assert.ok(source.includes("input.addEventListener('input',()=>{wrap.dataset.previewColor=input.value;})"),'native color input must preview without committing');
  assert.ok(source.includes("input.addEventListener('change',()=>applyChange"),'native color changes must commit only after picker completion');
  assert.ok(source.includes("Finish the active stroke before changing onion settings"),'Onion Skin Studio must visibly guard active strokes');
  assert.ok(source.includes('const projectViews=new WeakMap()'),'panel state must remain transient per project');
  assert.ok(source.includes('projectCanvasWrites:0,artworkUndoWrites:0,projectSchemaWrites:0,historyWrites:0,devicePreferenceWrites:true,randomWrites:0,networkWrites:0'),'Onion Skin Studio must declare exact isolation boundaries');
  assert.equal(source.includes('localStorage'),false,'the panel must use the existing preference bridge rather than its own storage');
  assert.equal(source.includes('fetch('),false,'Onion Skin Studio must remain offline');
  assert.ok(injector.includes('onionDepth=Math.max(0,Math.min(8'));
  assert.ok(injector.includes('onionPastOpacity=Math.max(.02,Math.min(.85'));
  assert.ok(injector.includes('onionFutureOpacity=Math.max(.02,Math.min(.85'));
  assert.ok(gradle.includes('val indexInjectorInputs = files('),'Android index generation must declare imported injector inputs');
  for(const path of ['tools/inject-brush-v2-index.mjs','tools/inject-canvas-shape.mjs','tools/inject-onion-skin-studio.mjs'])assert.ok(gradle.includes(`rootProject.file("${path}")`),`missing Gradle input for ${path}`);
  assert.ok(gradle.includes('inputs.files(indexInjectorInputs, sourceIndex)'),'generated index task must consume the complete injector input set');
  console.log('✅ generated release Onion Skin Studio asset, bridge, presets, color lifecycle, injector inputs, synchronization, and isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}
