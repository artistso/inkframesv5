#!/usr/bin/env node
// InkFrame version bump helper
// -----------------------------------------------------------------------------
// Updates the metadata/package versions, refreshes generated release notes, and
// runs the cheap release metadata checks. It does not commit or tag.
//
// Usage:
//   node tools/bump-version.mjs 0.1.1
//   node tools/bump-version.mjs 0.1.1 --date 2026-07-06
//   node tools/bump-version.mjs 0.1.1 --no-notes
//   node tools/bump-version.mjs --show

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const showOnly = flags.has('--show');
const noNotes = flags.has('--no-notes');
const force = flags.has('--force');
const dateIndex = args.indexOf('--date');
const releaseDate = dateIndex >= 0 ? args[dateIndex + 1] : new Date().toISOString().slice(0, 10);
const version = args.find(a => !a.startsWith('--') && a !== releaseDate);

const semverish = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const dateish = /^\d{4}-\d{2}-\d{2}$/;

const read = p => readFileSync(resolve(root, p), 'utf8');
const writeJson = (p, obj) => writeFileSync(resolve(root, p), JSON.stringify(obj, null, 2) + '\n');
function run(bin, cmdArgs, opts = {}) {
  const r = spawnSync(bin, cmdArgs, { cwd: root, encoding: 'utf8', stdio: opts.stdio || 'pipe' });
  if (r.status !== 0) {
    throw new Error(`${bin} ${cmdArgs.join(' ')} failed\n${r.stdout || ''}${r.stderr || ''}`);
  }
  return r.stdout || '';
}
function usage(exitCode = 0) {
  console.log(`Usage:
  node tools/bump-version.mjs <version> [--date YYYY-MM-DD] [--no-notes] [--force]
  node tools/bump-version.mjs --show

Examples:
  node tools/bump-version.mjs 0.1.1
  node tools/bump-version.mjs 0.2.0 --date 2026-08-01
`);
  process.exit(exitCode);
}

const metadataPath = 'web/metadata.json';
const packagePath = 'web/package.json';
const metadata = JSON.parse(read(metadataPath));
const pkg = JSON.parse(read(packagePath));

if (showOnly) {
  console.log(`metadata version: ${metadata.version}`);
  console.log(`package  version: ${pkg.version}`);
  console.log(`release date:     ${metadata.releaseDate || '(none)'}`);
  process.exit(0);
}
if (!version || flags.has('--help') || flags.has('-h')) usage(version ? 0 : 1);
if (!semverish.test(version)) throw new Error(`Version must look like semver, e.g. 0.1.1; got ${version}`);
if (!dateish.test(releaseDate || '')) throw new Error(`--date must be YYYY-MM-DD; got ${releaseDate}`);
if (!force && metadata.version === version && pkg.version === version) {
  throw new Error(`Version is already ${version}. Use --force to rewrite releaseDate/notes anyway.`);
}

metadata.version = version;
metadata.releaseDate = releaseDate;
pkg.version = version;

writeJson(metadataPath, metadata);
writeJson(packagePath, pkg);
console.log(`✅ Updated ${metadataPath} and ${packagePath} to ${version} (${releaseDate})`);

if (!noNotes) {
  run('node', ['tools/update-release-notes.mjs'], { stdio: 'inherit' });
  run('node', ['tools/update-release-notes.mjs', '--check'], { stdio: 'inherit' });
}
run('node', ['web/tests/version-smoke.mjs'], { stdio: 'inherit' });

console.log('');
console.log('Next steps:');
console.log('  1. Review CHANGELOG.md / RELEASE_NOTES.md.');
console.log('  2. Commit the version bump.');
console.log('  3. Push main and wait for CI.');
console.log('  4. Run: node tools/prepare-release.mjs');
console.log('  5. Tag using the commands printed by prepare-release.');
