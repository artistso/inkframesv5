// InkFrame version metadata smoke test
// -----------------------------------------------------------------------------
// Keeps web/metadata.json as the single source of truth for human version and
// Android SDK/package metadata. No dependencies; safe to run before Gradle.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const read = p => readFileSync(resolve(root, p), 'utf8');

const metadata = JSON.parse(read('web/metadata.json'));
const pkg = JSON.parse(read('web/package.json'));
const appGradle = read('app/build.gradle.kts');
const indexHtml = read('web/index.html');

const errors = [];
const semverish = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
if (!semverish.test(metadata.version || '')) errors.push(`metadata.version is not semver-ish: ${metadata.version}`);
if (pkg.version !== metadata.version) errors.push(`web/package.json version (${pkg.version}) != metadata (${metadata.version})`);
if (metadata.packageName !== 'com.inkframe.studio') errors.push(`unexpected packageName: ${metadata.packageName}`);
if (metadata.targetSdk < 35) errors.push(`targetSdk must stay Play-compliant (>=35), got ${metadata.targetSdk}`);
if (metadata.minSdk < 23) errors.push(`minSdk should stay AndroidX-compatible (>=23), got ${metadata.minSdk}`);
if (!appGradle.includes('webMetadataString("version")')) errors.push('app/build.gradle.kts no longer reads version from web/metadata.json');
if (!appGradle.includes('webMetadataInt("targetSdk")')) errors.push('app/build.gradle.kts no longer reads targetSdk from web/metadata.json');
if (!indexHtml.includes("fetch('metadata.json'")) errors.push('web/index.html no longer loads metadata.json at runtime');
if (/Version<\/b>\s*0\.1\.0/.test(indexHtml)) errors.push('web/index.html appears to hardcode the Studio version');

if (errors.length) {
  console.error('❌ Version metadata smoke FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log(`✅ Version metadata smoke passed. version=${metadata.version} package=${metadata.packageName} targetSdk=${metadata.targetSdk}`);
