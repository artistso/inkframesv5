import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const sourcePath=resolve(root,'web/control-surface.js');
assert.ok(existsSync(sourcePath),'Control Surface runtime is missing');
const source=readFileSync(sourcePath,'utf8');
assert.ok(source.includes("const STYLE_ID='inkframe-control-surface-v2'"));
assert.ok(source.includes('--ink-control-min-coarse:52px'));
assert.ok(source.includes("event.pointerType!=='pen'"));
assert.ok(source.includes('prefers-reduced-motion:reduce'));
assert.ok(source.includes('projectSchemaWrites:0,archiveWrites:0,storageWrites:0,networkWrites:0'));

const temp=mkdtempSync(resolve(tmpdir(),'inkframe-control-surface-release-'));
const generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[
    resolve(root,'tools/inject-brush-v2-index.mjs'),
    resolve(root,'web/index.html'),
    generated,
    '--variant=release','--diagnostics=false','--default-engine=v2',
  ],{cwd:root,stdio:'pipe'});
  const html=readFileSync(generated,'utf8');
  assert.ok(html.includes('<script src="control-surface.js"></script>'),'release index must load Control Surface v2');
  assert.ok(html.indexOf('layer-workspace.js')<html.indexOf('control-surface.js'),'Control Surface must load after contextual workspaces');
  assert.equal((html.match(/control-surface\.js/g)||[]).length,1,'Control Surface runtime must load exactly once');
}finally{rmSync(temp,{recursive:true,force:true});}

const injector=readFileSync(resolve(root,'tools/inject-feedback-report.mjs'),'utf8');
assert.ok(injector.includes("'control-surface.js'"),'tablet workspace injector must verify Control Surface');
const gradle=readFileSync(resolve(root,'app/build.gradle.kts'),'utf8');
assert.ok(gradle.includes('"**/*.js", "**/*.css"'),'Gradle stage task must package the Control Surface runtime');
console.log('✅ generated Android Control Surface ordering, uniqueness, staging, and presentation-only release contract passed');
