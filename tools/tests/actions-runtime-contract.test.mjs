import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const workflowsDir=resolve(root,'.github/workflows');
const workflowFiles=readdirSync(workflowsDir)
  .filter(name=>/\.ya?ml$/i.test(name))
  .sort();

assert.ok(workflowFiles.length>=6,'expected the active InkFrame workflow set');

let checkoutCount=0;
let setupNodeCount=0;

for(const file of workflowFiles){
  const path=resolve(workflowsDir,file);
  const source=readFileSync(path,'utf8');
  const lines=source.split(/\r?\n/);

  assert.doesNotMatch(source,/actions\/checkout@v(?:1|2|3|4|5)\b/,
    `${file} uses a checkout action older than v6`);
  assert.doesNotMatch(source,/actions\/setup-node@v(?:1|2|3|4|5)\b/,
    `${file} uses a setup-node action older than v6`);
  assert.doesNotMatch(source,/Set up Node 20|node-version:\s*['"]?20(?:\.x)?['"]?\s*$/m,
    `${file} still declares Node 20`);

  for(let index=0;index<lines.length;index++){
    const line=lines[index];
    const checkout=/^(\s*)-?\s*uses:\s*actions\/checkout@(v\d+)\s*$/.exec(line);
    if(checkout){
      checkoutCount++;
      assert.equal(checkout[2],'v6',`${file}:${index+1} must pin actions/checkout@v6`);
    }

    const setup=/^(\s*)-?\s*uses:\s*actions\/setup-node@(v\d+)\s*$/.exec(line);
    if(!setup) continue;

    setupNodeCount++;
    assert.equal(setup[2],'v6',`${file}:${index+1} must pin actions/setup-node@v6`);
    const baseIndent=setup[1].length;
    const block=[];
    for(let cursor=index+1;cursor<lines.length;cursor++){
      const next=lines[cursor];
      if(!next.trim()){
        block.push(next);
        continue;
      }
      const indent=/^\s*/.exec(next)[0].length;
      if(indent<=baseIndent) break;
      block.push(next);
    }
    const text=block.join('\n');
    assert.match(text,/node-version:\s*['"]?24['"]?/,
      `${file}:${index+1} must explicitly select Node 24`);
    assert.match(text,/package-manager-cache:\s*false/,
      `${file}:${index+1} must explicitly disable automatic npm caching`);
  }
}

assert.ok(checkoutCount>=10,`expected repository checkout coverage, found ${checkoutCount}`);
assert.ok(setupNodeCount>=8,`expected repository Node setup coverage, found ${setupNodeCount}`);

console.log(`✅ GitHub Actions runtime contract passed (${workflowFiles.length} workflows, ${checkoutCount} checkouts, ${setupNodeCount} Node setups)`);
