// InkFrame -- runtime module syntax smoke
// -----------------------------------------------------------------------------
// Verifies every runtime JavaScript file that ships inside the APK asset bundle
// is at least syntax-valid in Node before Android CI assembles an APK.

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');

const excludedDirs = new Set(['tests', 'node_modules', 'dist']);
const excludedFiles = new Set(['vite.config.js']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) out.push(...walk(path));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js') && !excludedFiles.has(entry.name)) out.push(path);
  }
  return out;
}

const files = walk(webDir).sort();
let failed = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('❌ Syntax check failed: ' + file.replace(webDir + '/', ''));
    if (result.stderr) console.error(result.stderr.trim());
    failed++;
  }
}

if (failed) {
  console.error(`\nRuntime module syntax FAILED (${failed} file${failed > 1 ? 's' : ''}).`);
  process.exit(1);
}

console.log(`✅ Runtime module syntax passed. files=${files.length}`);
