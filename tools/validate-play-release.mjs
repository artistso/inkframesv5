#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];

function read(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) {
    failures.push(`Missing required file: ${relativePath}`);
    return '';
  }
  return readFileSync(path, 'utf8').trim();
}

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

function validateText(relativePath, { min = 1, max, label }) {
  const value = read(relativePath);
  requireCondition(value.length >= min, `${label} must contain at least ${min} character(s)`);
  requireCondition(value.length <= max, `${label} is ${value.length} characters; maximum is ${max}`);
  requireCondition(!/\b(TODO|TBD|CHANGEME|PLACEHOLDER)\b/i.test(value), `${label} contains a placeholder token`);
  return value;
}

const metadataText = read('web/metadata.json');
let metadata = {};
try {
  metadata = JSON.parse(metadataText);
} catch (error) {
  failures.push(`web/metadata.json is invalid JSON: ${error.message}`);
}

requireCondition(metadata.packageName === 'com.inkframe.studio', 'Package name must remain com.inkframe.studio');
requireCondition(Number.isInteger(metadata.targetSdk) && metadata.targetSdk >= 36, 'targetSdk must be API 36 or higher for the 2026 Play update');
requireCondition(Number.isInteger(metadata.minSdk) && metadata.minSdk >= 26, 'minSdk must be API 26 or higher');
requireCondition(Number.isInteger(metadata.versionCode) && metadata.versionCode > 0 && metadata.versionCode <= 2100000000, 'versionCode must be a positive Play-compatible integer');
requireCondition(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(metadata.version || '')), 'Version must be semantic version format');
requireCondition(/^\d{4}-\d{2}-\d{2}$/.test(String(metadata.releaseDate || '')), 'releaseDate must use YYYY-MM-DD');

const language = read('app/src/main/play/default-language.txt');
requireCondition(language === 'en-US', 'Default Play language must be en-US');

validateText('app/src/main/play/listings/en-US/title.txt', {
  max: 30,
  label: 'Play title',
});
validateText('app/src/main/play/listings/en-US/short-description.txt', {
  max: 80,
  label: 'Play short description',
});
validateText('app/src/main/play/listings/en-US/full-description.txt', {
  max: 4000,
  label: 'Play full description',
});
validateText('app/src/main/play/release-notes/en-US/default.txt', {
  max: 500,
  label: 'Play release notes',
});

const privacy = read('PRIVACY.md');
requireCondition(/does \*\*not\*\* collect, sell, share, or transmit personal data/i.test(privacy), 'PRIVACY.md must explicitly state current data-collection behavior');
requireCondition(/fully offline/i.test(privacy), 'PRIVACY.md must describe offline operation');

const manifest = read('app/src/main/AndroidManifest.xml');
requireCondition(!/READ_CONTACTS|ACCESS_FINE_LOCATION|RECORD_AUDIO|CAMERA/.test(manifest), 'Release manifest declares a sensitive permission that requires Play data-safety review');

const releaseNotes = read('RELEASE_NOTES.md');
requireCondition(releaseNotes.includes(String(metadata.version || '')), 'Generated RELEASE_NOTES.md must include the current version');

if (failures.length) {
  console.error('Google Play release validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`✅ Google Play release package is valid for InkFrame ${metadata.version} (${metadata.versionCode})`);
console.log(`   package=${metadata.packageName} targetSdk=${metadata.targetSdk} minSdk=${metadata.minSdk}`);
