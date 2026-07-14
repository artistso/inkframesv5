import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-score-library-release-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(root,'web/index.html'),generated,'--variant=release','--diagnostics=false','--default-engine=v2'],{cwd:root,stdio:'pipe'});
  const html=readFileSync(generated,'utf8'),scoreSource=readFileSync(resolve(root,'web/radial-timing-score.js'),'utf8'),librarySource=readFileSync(resolve(root,'web/radial-timing-score-library.js'),'utf8');
  assert.ok(html.includes('<script src="radial-timing-score-library.js"></script>'),'release index must load Timing Score Library');
  assert.ok(existsSync(resolve(root,'web/radial-timing-score-library.js')),'missing Timing Score Library runtime');
  assert.ok(html.indexOf('radial-timing-score.js')<html.indexOf('radial-timing-score-library.js'),'Timing Score Library must load after Score Composer');
  assert.ok(scoreSource.includes('function structureSnapshot'),'Timing Score Composer must expose structural snapshots');
  assert.ok(scoreSource.includes('function loadStructure'),'Timing Score Composer must expose explicit structural loading');
  assert.ok(librarySource.includes("const STORAGE_KEY='inkframe.radialTiming.scoreLibrary.v1'"),'Timing Score Library must use a versioned device key');
  assert.ok(librarySource.includes('const SCHEMA=1,MAX_SCORES=12,MAX_SECTIONS=8'),'Timing Score Library must visibly bound and version structures');
  assert.ok(librarySource.includes('function arrangementSignature'),'Timing Score Library must preserve phrase-structure provenance');
  assert.ok(librarySource.includes('function resolveRecord'),'Timing Score Library must resolve phrase and nested recipe dependencies');
  assert.ok(librarySource.includes('function createScoreLibraryStore'),'Timing Score Library must expose a sanitized persistent store');
  assert.ok(librarySource.includes('score.loadStructure'),'Timing Score Library must restore editable Score Composer state explicitly');
  assert.ok(librarySource.includes('const projectViews=new WeakMap()'),'Timing Score Library selection must remain memory-only per project');
  assert.ok(librarySource.includes('canEditTiming'),'Timing Score Library must honor active-stroke guards');
  assert.ok(librarySource.includes('timelineTimingWrites:0,projectSchemaWrites:0,deviceLibraryWrites:true,sourceScoreWrites:0,sourceArrangementWrites:0,sourceRecipeWrites:0,randomWrites:0,transientScoreWrites:true'),'Timing Score Library must isolate structure persistence from timing, sources, and project schema');
  console.log('✅ generated release Score Library asset, order, structural APIs, persistence, provenance, guards, and isolation passed');
}finally{rmSync(temp,{recursive:true,force:true});}
