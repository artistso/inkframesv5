import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const cliPath=resolve(root,'inkframe-cli');
const read=path=>readFileSync(resolve(root,path),'utf8');
const spawn=(command,args=[])=>spawnSync(command,args,{
  cwd:root,
  encoding:'utf8',
  env:{...process.env,LC_ALL:'C'},
});
const run=(args=[])=>spawn('bash',[cliPath,...args]);

const cli=read('inkframe-cli');
const readme=read('README.md');
const agent=read('AGENT.md');
const markdownResult=spawn('git',['ls-files','-z','--',':(icase)*.md']);
assert.equal(markdownResult.status,0,markdownResult.stderr);
const markdownFiles=markdownResult.stdout.split('\0').filter(Boolean).sort();
const allDocs=markdownFiles.map(file=>`\n--- ${file} ---\n${read(file)}`).join('');

assert.equal(existsSync(resolve(root,'tools/inkframe-cli.mjs')),false,
  'the removed historical helper must not silently reappear without its own tested implementation');
assert.doesNotMatch(cli,/tools\/inkframe-cli\.mjs/);
assert.doesNotMatch(cli,/\bexport-gif\b/);
assert.doesNotMatch(allDocs,/\.\/inkframe-cli\s+export-gif\b/);
assert.doesNotMatch(allDocs,/\bagent\s+export-gif\b/);
assert.doesNotMatch(allDocs,/tools\/inkframe-cli\.mjs/);
assert.doesNotMatch(allDocs,/^#{1,6}\s+Headless export\s*$/im);
assert.doesNotMatch(allDocs,/bit-identical to the in-app encoder/i);
assert.match(readme,/Media export/);
assert.match(readme,/Actions[^\n]*orb/);
assert.match(readme,/Headless `\.inkframe` archive conversion is not currently supported/);
assert.match(agent,/Headless `\.inkframe` archive conversion is not currently supported/);

const syntax=spawn('bash',['-n',cliPath]);
assert.equal(syntax.status,0,syntax.stderr||syntax.stdout);

const help=run(['help']);
assert.equal(help.status,0,help.stderr);
assert.match(help.stdout,/InkFrame Studio CLI/);
assert.match(help.stdout,/Media export is supported inside InkFrame/);
assert.doesNotMatch(help.stdout,/\bexport-gif\b/);

const helpFlag=run(['--help']);
assert.equal(helpFlag.status,0,helpFlag.stderr);
assert.equal(helpFlag.stdout,help.stdout);

const before=spawn('git',['status','--porcelain','--untracked-files=all']).stdout;
for(const args of [
  ['export-gif','sample.inkframe','out.gif'],
  ['export','sample.inkframe','out.gif'],
]){
  const result=run(args);
  assert.equal(result.status,2,`unsupported command unexpectedly returned ${result.status}: ${args.join(' ')}`);
  assert.match(result.stderr,/Unknown InkFrame CLI command/);
}
const agentExport=run(['agent','export-gif','sample.inkframe','out.gif']);
assert.equal(agentExport.status,1,agentExport.stderr);
assert.match(agentExport.stderr,/Agent task must be one of/);
assert.equal(existsSync(resolve(root,'out.gif')),false,'unsupported export route must not create output');
const after=spawn('git',['status','--porcelain','--untracked-files=all']).stdout;
assert.equal(after,before,'unsupported commands must not mutate the checkout');

console.log(`✅ CLI help, ${markdownFiles.length} Markdown files, unsupported-command failure, and no-mutation contracts passed`);
