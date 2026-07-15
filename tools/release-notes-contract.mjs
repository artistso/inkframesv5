#!/usr/bin/env node
// Shared fail-closed release-notes source contract.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function extractUnreleased(changelog) {
  const marker = /^## \[Unreleased\]\s*$/m;
  const match = marker.exec(changelog);
  if (!match) throw new Error('CHANGELOG.md is missing a "## [Unreleased]" section');

  const rest = changelog.slice(match.index + match[0].length);
  const next = /^## (?!\[Unreleased\])/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export function resolveReleaseNotesSource(root, version) {
  const relativeVersionPath = `release-notes/${version}.md`;
  const versionPath = resolve(root, relativeVersionPath);

  if (existsSync(versionPath)) {
    const body = readFileSync(versionPath, 'utf8').trim();
    if (!body) throw new Error(`${relativeVersionPath} exists but is empty`);
    return { kind: 'version', path: relativeVersionPath, body };
  }

  const changelogPath = resolve(root, 'CHANGELOG.md');
  const body = extractUnreleased(readFileSync(changelogPath, 'utf8'));
  if (!body) {
    throw new Error(
      `No release notes source for ${version}: add user-facing entries under ` +
      '`CHANGELOG.md` → `## [Unreleased]` or create ' +
      `\`${relativeVersionPath}\``
    );
  }

  return { kind: 'unreleased', path: 'CHANGELOG.md#Unreleased', body };
}

export function releaseChanges(root, version) {
  return resolveReleaseNotesSource(root, version).body
    .replace(/^### /gm, '## ')
    .trim();
}
