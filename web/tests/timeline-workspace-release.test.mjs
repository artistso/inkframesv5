import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-timeline-workspace-release-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(root,'web/index.html'),generated,'--variant=release','--diagnostics=false','--default-engine=v2'],{cwd:root,stdio:'pipe'});
  const html=readFileSync(generated,'utf8'),sourcePath=resolve(root,'web/timeline-workspace.js'),source=readFileSync(sourcePath,'utf8'),injector=readFileSync(resolve(root,'tools/inject-feedback-report.mjs'),'utf8'),gradle=readFileSync(resolve(root,'app/build.gradle.kts'),'utf8');
  assert.ok(existsSync(sourcePath),'missing Timeline Workspace runtime');
  assert.equal((html.match(/<script src="timeline-workspace\.js"><\/script>/g)||[]).length,1,'release index must package one Timeline Workspace runtime');
  assert.ok(html.indexOf('feedback-report.js')<html.indexOf('tablet-command-deck.js'));
  assert.ok(html.indexOf('tablet-command-deck.js')<html.indexOf('timeline-workspace.js'),'Timeline Workspace must load after Tablet Command Deck');
  assert.ok(html.indexOf('timeline-workspace.js')<html.indexOf('brush-engine-v2/sample.js'),'Timeline Workspace must initialize before modular brush UI');
  for(const marker of ['tabletTimelineSnapshot','tabletTimelineCommand','selectedSorted().map(i=>i+1)','selectedOrCurrent()','duplicateFrameSequence()','deleteFrameSelection()','reverseFrameSelection()','pingPongSelection()','adjustHolds(','clearFrameSelection()'])assert.ok(html.includes(marker),`generated timeline bridge missing ${marker}`);
  assert.ok(html.includes("window.dispatchEvent(new Event('inkframe:timeline'))"),'timeline commands must emit a bounded refresh signal');
  assert.ok(injector.includes('<script src="timeline-workspace.js"></script>'));
  assert.ok(injector.includes('Timeline Workspace must load after Tablet Command Deck'));
  assert.ok(gradle.includes('"**/*.js", "**/*.css"'),'web staging must include Timeline Workspace');
  assert.ok(gradle.includes('rootProject.file("tools/inject-feedback-report.mjs")'),'timeline bridge injector must remain a tracked Gradle input');
  assert.ok(source.includes('min-height:48px'),'Timeline Workspace controls must meet the 48 CSS px target');
  assert.ok(source.includes('overflow-y:auto'),'expanded tablet deck must remain scrollable when contextual controls are visible');
  assert.ok(source.includes("delegatedTimelineCommands:true"));
  for(const marker of ['directFrameWrites:0','directHoldWrites:0','directSelectionWrites:0','directProjectSchemaWrites:0','archiveWrites:0','storageWrites:0','networkWrites:0','artworkReads:0','projectNameReads:0'])assert.ok(source.includes(marker),`missing Timeline Workspace isolation marker ${marker}`);
  for(const forbidden of ['selectedFrames','selectedOrCurrent','duplicateFrameSequence','deleteFrameSelection','reverseFrameSelection','pingPongSelection','holds[','frames[','fetch(','XMLHttpRequest','WebSocket','sendBeacon','localStorage'])assert.equal(source.includes(forbidden),false,`Timeline Workspace runtime must delegate instead of directly using ${forbidden}`);
  console.log('✅ generated release Timeline Workspace ordering, established-function delegation, touch layout, tracked injection, and zero-direct-write isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}
