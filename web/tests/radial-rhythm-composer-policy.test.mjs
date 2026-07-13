import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-composer-policy-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(root,'web/index.html'),generated,'--variant=release','--diagnostics=false','--default-engine=v2'],{cwd:root,stdio:'pipe'});
  const html=readFileSync(generated,'utf8');
  const patterns=readFileSync(resolve(root,'web/radial-timing-patterns.js'),'utf8');
  const composer=readFileSync(resolve(root,'web/radial-rhythm-composer.js'),'utf8');
  assert.ok(existsSync(resolve(root,'web/radial-rhythm-composer.js')),'missing custom rhythm composer runtime');
  assert.ok(html.includes('<script src="radial-rhythm-composer.js"></script>'),'release index must load custom rhythm composer');
  assert.ok(html.indexOf('radial-timing-patterns.js')<html.indexOf('radial-rhythm-composer.js'),'composer must load after built-in rhythm history');
  assert.ok(html.includes('setHolds:entries=>'),'release bridge must expose batched custom rhythm writes');
  assert.ok(patterns.includes('function normalizeDefinition'),'rhythm engine must normalize custom definitions');
  assert.ok(patterns.includes('function applyDefinition'),'custom definitions must use established timing history');
  assert.ok(patterns.includes('patterns.applyDefinition')===false,'base rhythm engine must remain independent of composer naming');
  assert.ok(composer.includes("STORAGE_KEY='inkframe.radial.customRhythms.v1'"),'composer must use a versioned app-library key');
  assert.ok(composer.includes('MAX_RHYTHMS=24'),'composer library must remain bounded');
  assert.ok(composer.includes('MAX_PINNED=4'),'pinned quick rhythms must remain bounded');
  assert.ok(composer.includes('MAX_STEPS=12'),'custom hold sequences must remain bounded');
  assert.ok(composer.includes('function minimalPeriod'),'scope capture must reduce repeating hold sequences');
  assert.ok(composer.includes('function sanitizeLibrary'),'persisted custom rhythms must be normalized');
  assert.ok(composer.includes('function createCustomRhythmStore'),'composer must expose a testable defensive store');
  assert.ok(composer.includes('inkframe-custom-rhythm-pin'),'composer must expose pinned quick rhythms');
  assert.ok(composer.includes('inkframe-composer-preview-svg'),'composer must expose non-destructive preview arcs');
  assert.ok(composer.includes('patterns.applyDefinition'),'custom application must delegate to established rhythm history');
  assert.ok(composer.includes('patterns.resolveTargetIndices'),'custom preview and capture must share automatic scope rules');
  assert.ok(composer.includes('canEditTiming'),'composer must honor active-stroke guards');
  assert.ok(composer.includes('projectCanvasWrites:0'),'composer must declare project-canvas isolation');
  assert.ok(composer.includes('artworkUndoWrites:0'),'composer must declare artwork-undo isolation');
  assert.ok(composer.includes('projectSchemaWrites:0'),'composer must declare zero project-schema writes');
  assert.ok(composer.includes('appLibraryWrites:true'),'composer must explicitly declare bounded app-library persistence');
  console.log('✅ generated release requires custom rhythm storage, capture, preview, pinning, history delegation, and isolation policy');
}finally{rmSync(temp,{recursive:true,force:true});}
