import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  collectMarkdownTargets,
  formatFailure,
  validateMarkdownFiles,
} from '../check-doc-links.mjs';

const here=dirname(fileURLToPath(import.meta.url));
assert.ok(here.endsWith('tools/tests'));

const workspace=mkdtempSync(resolve(tmpdir(),'inkframe-doc-links-'));
const root=resolve(workspace,'repo');
mkdirSync(resolve(root,'docs'),{recursive:true});
mkdirSync(resolve(root,'media'),{recursive:true});
writeFileSync(resolve(root,'docs','Guide.md'),'# Guide\n');
writeFileSync(resolve(root,'media','hero image.png'),'png');
writeFileSync(resolve(workspace,'outside.md'),'outside');
symlinkSync(resolve(workspace,'outside.md'),resolve(root,'docs','escape.md'));

try{
  const valid=`# Links

[Guide](docs/Guide.md#intro)
![Hero](media/hero%20image.png)
[External](https://example.com/docs)
[Mail](mailto:test@example.com)
[Fragment](#links)
[Reference][guide]
[guide]: docs/Guide.md
<a href="docs/Guide.md?view=full#intro">HTML guide</a>
\`[Inline code](missing-inline.md)\`

\`\`\`md
[Fenced code](missing-fenced.md)
\`\`\`
`;
  writeFileSync(resolve(root,'README.md'),valid);
  assert.deepEqual(validateMarkdownFiles({root,files:['README.md']}),[]);

  const targets=collectMarkdownTargets(valid);
  assert.ok(targets.some(item=>item.target==='docs/Guide.md#intro'&&item.kind==='inline'));
  assert.ok(targets.some(item=>item.target==='media/hero%20image.png'&&item.kind==='inline'));
  assert.ok(targets.some(item=>item.target==='docs/Guide.md'&&item.kind==='reference'));
  assert.ok(targets.some(item=>item.target==='docs/Guide.md?view=full#intro'&&item.kind==='html'));
  assert.equal(targets.some(item=>item.target.includes('missing-inline')),false);
  assert.equal(targets.some(item=>item.target.includes('missing-fenced')),false);

  writeFileSync(resolve(root,'docs','Broken.md'),`# Broken
[Missing](missing.md)
[Traversal](../../outside.md)
[Malformed](bad%ZZ.md)
[Escaping symlink](escape.md)
`);
  const failures=validateMarkdownFiles({root,files:['docs/Broken.md']});
  assert.deepEqual(failures.map(item=>item.code),[
    'missing',
    'outside-root',
    'invalid-encoding',
    'unsafe-symlink',
  ]);
  assert.deepEqual(failures.map(item=>item.line),[2,3,4,5]);
  assert.match(formatFailure(failures[0],root),/^docs\/Broken\.md:2 \[missing\] missing\.md -> docs\/missing\.md$/);

  const reordered=validateMarkdownFiles({root,files:['docs/Broken.md','README.md']});
  assert.deepEqual(reordered,failures,'failures must be stable regardless of additional valid files');

  const missingSource=validateMarkdownFiles({root,files:['Z.md','A.md']});
  assert.deepEqual(missingSource.map(item=>item.file),['A.md','Z.md']);
  assert.ok(missingSource.every(item=>item.code==='missing-source'));

  console.log('✅ Markdown link parsing, escaping, traversal, symlink, line reporting, and deterministic ordering passed');
}finally{
  rmSync(workspace,{recursive:true,force:true});
}
