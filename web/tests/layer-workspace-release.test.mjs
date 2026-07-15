import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-layer-workspace-release-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(root,'web/index.html'),generated,'--variant=release','--diagnostics=false','--default-engine=v2'],{cwd:root,stdio:'pipe'});
  const html=readFileSync(generated,'utf8'),sourcePath=resolve(root,'web/layer-workspace.js'),source=readFileSync(sourcePath,'utf8'),injector=readFileSync(resolve(root,'tools/inject-feedback-report.mjs'),'utf8'),gradle=readFileSync(resolve(root,'app/build.gradle.kts'),'utf8');
  assert.ok(existsSync(sourcePath),'missing Layer Workspace runtime');
  assert.equal((html.match(/<script src="layer-workspace\.js"><\/script>/g)||[]).length,1,'release index must package one Layer Workspace runtime');
  assert.ok(html.indexOf('tablet-command-deck.js')<html.indexOf('timeline-workspace.js'));
  assert.ok(html.indexOf('timeline-workspace.js')<html.indexOf('layer-workspace.js'),'Layer Workspace must load after Timeline Workspace');
  assert.ok(html.indexOf('layer-workspace.js')<html.indexOf('brush-engine-v2/sample.js'),'Layer Workspace must initialize before modular brush UI');
  for(const marker of ['tabletLayerSnapshot','tabletLayerCommand','tabletLayerSelect','tabletLayerSetOpacity','kLayAdd.click()','kLayDup.click()','kLayDel.click()','kLayUp.click()','kLayDn.click()','kLayMerge.click()','kLayEye.click()','kLayBlend.click()','refreshFctx();render();refreshLayers()'])assert.ok(html.includes(marker),`generated layer bridge missing ${marker}`);
  assert.ok(html.includes("window.dispatchEvent(new Event('inkframe:layers'))"),'layer commands must emit a bounded refresh signal');
  assert.ok(injector.includes('<script src="layer-workspace.js"></script>'));
  assert.ok(injector.includes('Layer Workspace must load after Timeline Workspace'));
  assert.ok(gradle.includes('"**/*.js", "**/*.css"'),'web staging must include Layer Workspace');
  assert.ok(gradle.includes('rootProject.file("tools/inject-feedback-report.mjs")'),'layer bridge injector must remain a tracked Gradle input');
  assert.ok(source.includes('min-height:48px'),'Layer Workspace controls must meet the 48 CSS px target');
  assert.ok(source.includes('delegatedLayerCommands:true'));
  for(const marker of ['directLayerWrites:0','directCanvasWrites:0','directOrderWrites:0','directProjectSchemaWrites:0','archiveWrites:0','storageWrites:0','networkWrites:0','artworkReads:0','layerNameReads:0','projectNameReads:0'])assert.ok(source.includes(marker),`missing Layer Workspace isolation marker ${marker}`);
  for(const forbidden of ['activeLayer(','kLayAdd','kLayDup','kLayDel','kLayUp','kLayDn','kLayMerge','kLayEye','kLayBlend','frames[','layers[','canvas.getContext','localStorage','fetch(','XMLHttpRequest','WebSocket','sendBeacon'])assert.equal(source.includes(forbidden),false,`Layer Workspace runtime must delegate instead of directly using ${forbidden}`);
  console.log('✅ generated release Layer Workspace ordering, established-control delegation, touch layout, tracked injection, and zero-direct-write isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}
