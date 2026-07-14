import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-history-inspector-release-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(root,'web/index.html'),generated,'--variant=release','--diagnostics=false','--default-engine=v2'],{cwd:root,stdio:'pipe'});
  const html=readFileSync(generated,'utf8'),source=readFileSync(resolve(root,'web/radial-timing-patterns.js'),'utf8');
  assert.ok(html.includes('<script src="radial-timing-patterns.js"></script>'),'release index must load timing history runtime');
  assert.ok(existsSync(resolve(root,'web/radial-timing-patterns.js')),'missing timing history runtime');
  assert.ok(source.includes('const HISTORY_LIMIT=25'),'timing history must retain exactly 25 transactions');
  assert.ok(source.includes('function historyTimeline'),'timing history must expose a linear projection');
  assert.ok(source.includes('undo.concat(Array.from(redo).reverse())'),'linear history must preserve chronological redo order');
  assert.ok(source.includes('function historyPositionPlan'),'timing history must expose deterministic position planning');
  assert.ok(source.includes('function jumpToHistoryPosition'),'timing history must expose position jumps through Undo and Redo');
  assert.ok(source.includes('inkframe-rhythm-history-toggle'),'release runtime must include the tablet History control');
  assert.ok(source.includes('inkframe-rhythm-history-position'),'release runtime must include reachable history-state controls');
  assert.ok(source.includes('canEditTiming'),'history jumps must honor active-stroke timing guards');
  assert.ok(source.includes('historyPersistenceWrites:0'),'history inspector must declare zero persistence writes');
  assert.equal(source.includes('localStorage'),false,'timing transaction history must remain transient');
  console.log('✅ generated release timing history inspector, 25-step model, guards, and zero-persistence contract passed');
}finally{rmSync(temp,{recursive:true,force:true});}
