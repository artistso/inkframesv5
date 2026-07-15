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
const externalDir=resolve(workspace,'external-docs');
mkdirSync(resolve(root,'docs'),{recursive:true});
mkdirSync(resolve(root,'media'),{recursive:true});
mkdirSync(externalDir,{recursive:true});
writeFileSync(resolve(root,'docs','Guide.md'),'# Guide\n');
writeFileSync(resolve(root,'media','hero image.png'),'png');
writeFileSync(resolve(workspace,'outside.md'),'outside');
writeFileSync(resolve(externalDir,'Guide.md'),'outside guide');
symlinkSync(resolve(workspace,'outside.md'),resolve(root,'docs','escape.md'));
symlinkSync(externalDir,resolve(root,'docs','escape-dir'),'dir');
symlinkSync(resolve(workspace,'outside.md'),resolve(root,'Linked.md'));

try{
  const valid=`# Links

[Guide](docs/Guide.md#intro)
![Hero](media/hero%20image.png)
[External](https://example.com/docs)
[FTP](ftp://example.com/docs)
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
[Escaping directory symlink](escape-dir/Guide.md)
`);
  const failures=validateMarkdownFiles({root,files:['docs/Broken.md']});
  assert.deepEqual(failures.map(item=>item.code),[
    'missing',
    'outside-root',
    'invalid-encoding',
    'unsafe-symlink',
    'unsafe-symlink',
  ]);
  assert.deepEqual(failures.map(item=>item.line),[2,3,4,5,6]);
  assert.match(formatFailure(failures[0],root),/^docs\/Broken\.md:2 \[missing\] missing\.md -> docs\/missing\.md$/);

  const reordered=validateMarkdownFiles({root,files:['docs/Broken.md','README.md']});
  assert.deepEqual(reordered,failures,'failures must be stable regardless of additional valid files');

  const unsafeSource=validateMarkdownFiles({root,files:['Linked.md']});
  assert.equal(unsafeSource.length,1);
  assert.equal(unsafeSource[0].code,'unsafe-source');

  const missingSource=validateMarkdownFiles({root,files:['Z.md','A.md']});
  assert.deepEqual(missingSource.map(item=>item.file),['A.md','Z.md']);
  assert.ok(missingSource.every(item=>item.code==='missing-source'));

  console.log('✅ Markdown link parsing, URI exclusion, traversal, real-path containment, line reporting, and deterministic ordering passed');
}finally{
  rmSync(workspace,{recursive:true,force:true});
}
