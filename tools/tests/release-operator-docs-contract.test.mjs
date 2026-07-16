#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const checklist = read('RELEASE_CHECKLIST.md');
const releasing = read('RELEASING.md');
const workflow = read('.github/workflows/release.yml');

for (const [path, content] of [
  ['RELEASE_CHECKLIST.md', checklist],
  ['RELEASING.md', releasing],
  ['.github/workflows/release.yml', workflow],
]) {
  assert.doesNotMatch(content, /\b0\.2\.0\b/, `${path} must not hard-code obsolete 0.2.0 release instructions`);
}

for (const job of [
  'Web and Brush Engine V2',
  'Unit tests (JVM)',
  'Build debug APK',
  'Verify signed production APK and AAB',
]) {
  assert.match(checklist, new RegExp(`\\*\\*${job.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*`));
}

const metadataVersionCommand = 'VERSION="$(node -p "require(\'./web/metadata.json\').version")"';
assert.ok(checklist.includes(metadataVersionCommand), 'release checklist must derive the tag from metadata');
assert.ok(releasing.includes(metadataVersionCommand), 'release guide must derive the tag from metadata');
assert.match(workflow, /description: Exact version from web\/metadata\.json/);
assert.match(workflow, /description: Exact versionCode from web\/metadata\.json/);
assert.match(workflow, /VERSION_CODE="\$\(node -p "require\('\.\/web\/metadata\.json'\)\.versionCode"\)"/);
assert.match(workflow, /TARGET_SDK="\$\(node -p "require\('\.\/web\/metadata\.json'\)\.targetSdk"\)"/);
assert.match(workflow, /test "\$TARGET_SDK" = "36"/);
assert.ok(
  workflow.includes('test "$GITHUB_REF_NAME" = "v$VERSION"') ||
    workflow.includes('if [[ "$GITHUB_REF_NAME" != "v$VERSION" ]]'),
  'signed release workflow must require the tag to exactly match metadata',
);

console.log('✅ Release operator documentation contract passed.');
