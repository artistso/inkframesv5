import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {dirname, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const workflowDir=resolve(root,'.github/workflows');
const requiredWorkflows=Object.freeze([
  'android.yml',
  'release-policy-diagnostics.yml',
  'release.yml',
  'agent-build.yml',
  'agent-cli.yml',
  'docs-links.yml',
  'actions-runtime-contract.yml',
]);
const workflowFiles=readdirSync(workflowDir)
  .filter(file=>['.yml','.yaml'].includes(extname(file)))
  .sort();

for(const required of requiredWorkflows){
  assert.ok(workflowFiles.includes(required),`required workflow is missing: ${required}`);
}

let checkoutCount=0;
let setupNodeCount=0;
for(const file of workflowFiles){
  const path=resolve(workflowDir,file);
  const source=readFileSync(path,'utf8');
  const lines=source.split(/\r?\n/);

  assert.doesNotMatch(source,/actions\/checkout@v(?:1|2|3|4|5|6)\b/,
    `${file} uses a checkout major older than v7`);
  assert.doesNotMatch(source,/actions\/setup-node@v(?:1|2|3|4|5|6)\b/,
    `${file} uses a setup-node major older than v7`);
  assert.doesNotMatch(source,/node-version:\s*['"]?20(?:\.x)?['"]?\s*$/m,
    `${file} explicitly selects deprecated Node 20`);
  assert.doesNotMatch(source,/Set up Node 20/i,
    `${file} still labels a step as Node 20`);

  for(let index=0;index<lines.length;index+=1){
    const line=lines[index];
    if(/uses:\s*actions\/checkout@/.test(line)){
      checkoutCount+=1;
      assert.match(line,/uses:\s*actions\/checkout@v7\s*$/,
        `${file}:${index+1} must use actions/checkout@v7`);
    }
    if(!/uses:\s*actions\/setup-node@/.test(line))continue;

    setupNodeCount+=1;
    assert.match(line,/uses:\s*actions\/setup-node@v7\s*$/,
      `${file}:${index+1} must use actions/setup-node@v7`);
    const block=lines.slice(index+1,index+9).join('\n');
    assert.match(block,/node-version:\s*['"]24['"]/,
      `${file}:${index+1} must explicitly select Node 24`);
    assert.match(block,/package-manager-cache:\s*false/,
      `${file}:${index+1} must explicitly disable automatic package-manager caching`);
  }
}

assert.ok(checkoutCount>=requiredWorkflows.length,
  `expected checkout coverage across active workflows, found ${checkoutCount}`);
assert.ok(setupNodeCount>=requiredWorkflows.length,
  `expected setup-node coverage across active workflows, found ${setupNodeCount}`);

console.log(`✅ ${workflowFiles.length} workflows, ${checkoutCount} checkout steps, and ${setupNodeCount} Node 24 setup steps satisfy the runtime contract`);
