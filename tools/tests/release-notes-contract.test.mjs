#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractUnreleased,
  releaseChanges,
  resolveReleaseNotesSource,
} from '../release-notes-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const tempRoots = [];

function fixture({ changelog = '# Changelog\n\n## [Unreleased]\n\n', version, notes } = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'inkframe-release-notes-'));
  tempRoots.push(dir);
  mkdirSync(resolve(dir, 'release-notes'), { recursive: true });
  writeFileSync(resolve(dir, 'CHANGELOG.md'), changelog);
  if (version && notes !== undefined) {
    writeFileSync(resolve(dir, 'release-notes', `${version}.md`), notes);
  }
  return dir;
}

try {
  assert.equal(
    extractUnreleased('# Changelog\n\n## [Unreleased]\n\n### Added\n- A\n\n## [0.4.0]\n'),
    '### Added\n- A'
  );
  assert.throws(() => extractUnreleased('# Changelog\n'), /missing a "## \[Unreleased\]" section/);

  const empty = fixture();
  assert.throws(
    () => resolveReleaseNotesSource(empty, '0.5.0'),
    /No release notes source for 0\.5\.0/
  );

  const versioned = fixture({ version: '0.5.0', notes: '### Added\n- Version source\n' });
  assert.deepEqual(resolveReleaseNotesSource(versioned, '0.5.0'), {
    kind: 'version',
    path: 'release-notes/0.5.0.md',
    body: '### Added\n- Version source',
  });
  assert.equal(releaseChanges(versioned, '0.5.0'), '## Added\n- Version source');

  const unreleased = fixture({
    changelog: '# Changelog\n\n## [Unreleased]\n\n### Changed\n- Changelog source\n\n## [0.4.0]\n',
  });
  assert.deepEqual(resolveReleaseNotesSource(unreleased, '0.5.0'), {
    kind: 'unreleased',
    path: 'CHANGELOG.md#Unreleased',
    body: '### Changed\n- Changelog source',
  });
  assert.equal(releaseChanges(unreleased, '0.5.0'), '## Changed\n- Changelog source');

  const emptyVersioned = fixture({ version: '0.5.0', notes: '  \n' });
  assert.throws(
    () => resolveReleaseNotesSource(emptyVersioned, '0.5.0'),
    /release-notes\/0\.5\.0\.md exists but is empty/
  );

  const bumpSource = readFileSync(resolve(root, 'tools/bump-version.mjs'), 'utf8');
  const preflightIndex = bumpSource.indexOf('releaseChanges(root, version)');
  const metadataMutationIndex = bumpSource.indexOf('metadata.version = version;');
  assert.ok(preflightIndex >= 0, 'bump-version must preflight release notes');
  assert.ok(
    preflightIndex < metadataMutationIndex,
    'release-note preflight must run before metadata mutation'
  );

  console.log('✅ Release-notes source and no-mutation contracts passed.');
} finally {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
}
