// InkFrame Brush Engine V2 — generated release asset policy
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const temp = mkdtempSync(resolve(tmpdir(), 'inkframe-v2-release-'));
const generated = resolve(temp, 'index.html');

try {
  execFileSync(process.execPath, [
    resolve(root, 'tools/inject-brush-v2-index.mjs'),
    resolve(root, 'web/index.html'),
    generated,
    '--variant=release',
    '--diagnostics=false',
    '--default-engine=v2',
  ], { cwd:root, stdio:'pipe' });

  const html = readFileSync(generated, 'utf8');
  assert.ok(html.includes('INKFRAME_BRUSH_V2_RUNTIME'));
  assert.ok(html.includes('"variant":"release"'));
  assert.ok(html.includes('"diagnostics":false'));
  assert.ok(html.includes('"traceTools":false'));
  assert.ok(html.includes('"defaultBrushEngine":"v2"'));
  assert.ok(html.includes('<script src="brush-engine-v2/stabilizer.js"></script>'));
  assert.ok(html.includes('<script src="brush-engine-v2/stabilizer-ui.js"></script>'));
  assert.ok(html.includes('<script src="brush-engine-v2/runtime.js"></script>'));
  assert.equal(html.includes('<script src="brush-engine-v2/native.js"></script>'), false);
  assert.ok(existsSync(resolve(root, 'web/brush-engine-v2/stabilizer.js')));
  assert.ok(existsSync(resolve(root, 'web/brush-engine-v2/stabilizer-ui.js')));
  assert.ok(existsSync(resolve(root, 'web/brush-engine-v2/runtime.js')));
  assert.ok(html.indexOf('brush-engine-v2/stabilizer.js') < html.indexOf('brush-engine-v2/filters.js'));
  assert.ok(html.indexOf('brush-engine-v2/trace.js') < html.indexOf('brush-engine-v2/runtime.js'));
  assert.ok(html.indexOf('brush-engine-v2/runtime.js') < html.indexOf('brush-engine-v2/adapter.js'));
  assert.ok(html.includes('InkFrameBrushV2InputBridge.begin'));
  assert.ok(html.includes('coordinateTransform:inputTransform'));

  console.log('✅ generated Brush V2 production release policy passed');
} finally {
  rmSync(temp, { recursive:true, force:true });
}
