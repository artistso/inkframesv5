#!/usr/bin/env node
// InkFrame release tag helper
// -----------------------------------------------------------------------------
// Verifies the repo is ready to tag a release, then prints the exact tag/push
// commands for the version in web/metadata.json. It does NOT create the tag.
//
// Usage:
//   node tools/prepare-release.mjs
//   node tools/prepare-release.mjs --allow-dirty        # skip clean-tree check
//   node tools/prepare-release.mjs --skip-remote-tag    # skip remote tag lookup
//   node tools/prepare-release.mjs --skip-tag-check     # skip local+remote tag lookup

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = new Set(process.argv.slice(2));
const allowDirty = args.has('--allow-dirty');
const skipTagCheck = args.has('--skip-tag-check');
const skipRemoteTag = args.has('--skip-remote-tag') || skipTagCheck;

const read = p => readFileSync(resolve(root, p), 'utf8');
const errors = [];
const warnings = [];

function cmd(bin, cmdArgs, opts = {}) {
  const r = spawnSync(bin, cmdArgs, { cwd: root, encoding: 'utf8', ...opts });
  return r;
}
function okCmd(bin, cmdArgs) {
  const r = cmd(bin, cmdArgs);
  if (r.status !== 0) throw new Error(`${bin} ${cmdArgs.join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
function check(condition, msg) { if (!condition) errors.push(msg); }

const metadata = JSON.parse(read('web/metadata.json'));
const pkg = JSON.parse(read('web/package.json'));
const version = metadata.version;
const tag = `v${version}`;
const releaseName = `${metadata.name || 'InkFrame Studio'} ${version}`;

// --- Metadata/version checks ------------------------------------------------
check(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version || ''), `metadata.version is not semver-ish: ${version}`);
check(pkg.version === version, `web/package.json version (${pkg.version}) does not match web/metadata.json (${version})`);
check(metadata.packageName === 'com.inkframe.studio', `Unexpected packageName: ${metadata.packageName}`);
check(Number(metadata.targetSdk) >= 35, `targetSdk must be >=35 for Play compliance, got ${metadata.targetSdk}`);
check(Number(metadata.minSdk) >= 23, `minSdk should be >=23 for AndroidX compatibility, got ${metadata.minSdk}`);

// --- Generated docs checks --------------------------------------------------
const notesCheck = cmd('node', ['tools/update-release-notes.mjs', '--check']);
if (notesCheck.status !== 0) {
  errors.push(`RELEASE_NOTES.md is stale. Run: node tools/update-release-notes.mjs\n${notesCheck.stderr || notesCheck.stdout}`);
}
const notes = read('RELEASE_NOTES.md');
check(notes.includes(`# ${releaseName} Release Notes`), `RELEASE_NOTES.md title does not match ${releaseName}`);
check(read('RELEASE_CHECKLIST.md').includes('node tools/prepare-release.mjs'), 'RELEASE_CHECKLIST.md does not mention tools/prepare-release.mjs');

// --- Git checks -------------------------------------------------------------
let head = '';
try { head = okCmd('git', ['rev-parse', '--short', 'HEAD']); }
catch (e) { errors.push(String(e.message || e)); }

const dirty = cmd('git', ['status', '--porcelain']).stdout.trim();
if (dirty && !allowDirty) {
  errors.push('Git working tree is not clean. Commit/stash changes first, or rerun with --allow-dirty.');
}

const branch = cmd('git', ['branch', '--show-current']).stdout.trim();
if (branch && branch !== 'main') warnings.push(`Current branch is ${branch}; release tags normally come from main.`);

if (!skipTagCheck) {
  const localTag = cmd('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]);
  if (localTag.status === 0) errors.push(`Local tag ${tag} already exists. Bump web/metadata.json + web/package.json before preparing the next release.`);
}

if (!skipRemoteTag) {
  const remoteTag = cmd('git', ['ls-remote', '--tags', 'origin', tag]);
  if (remoteTag.status === 0 && remoteTag.stdout.trim()) errors.push(`Remote tag ${tag} already exists on origin. Bump web/metadata.json + web/package.json before preparing the next release.`);
  if (remoteTag.status !== 0) warnings.push('Could not check remote tags; rerun with network access or --skip-remote-tag.');
}

const behind = cmd('git', ['rev-list', '--count', 'HEAD..origin/main']).stdout.trim();
const ahead = cmd('git', ['rev-list', '--count', 'origin/main..HEAD']).stdout.trim();
if (behind && behind !== '0') errors.push(`Local branch is behind origin/main by ${behind} commit(s). Pull first.`);
if (ahead && ahead !== '0') errors.push(`Local branch is ahead of origin/main by ${ahead} commit(s). Push first.`);

if (warnings.length) {
  console.warn('⚠️  Warnings:');
  for (const w of warnings) console.warn('  - ' + w);
}
if (errors.length) {
  console.error('❌ Release prep FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log(`✅ Release prep checks passed for ${releaseName}${head ? ` (${head})` : ''}.`);
console.log('');
console.log('Run these commands to tag and publish the release workflow:');
console.log('');
console.log(`git tag -a ${tag} -m ${JSON.stringify(releaseName)}`);
console.log(`git push origin main ${tag}`);
console.log('');
console.log('Then watch:');
console.log('https://github.com/artistso/inkframesv5/actions/workflows/release.yml');
