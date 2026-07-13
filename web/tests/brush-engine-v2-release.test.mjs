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
  const compareSource=readFileSync(resolve(root,'web/brush-engine-v2/preview-compare.js'),'utf8');
  assert.ok(html.includes('INKFRAME_BRUSH_V2_RUNTIME'));
  assert.ok(html.includes('"variant":"release"'));
  assert.ok(html.includes('"diagnostics":false'));
  assert.ok(html.includes('"traceTools":false'));
  assert.ok(html.includes('"defaultBrushEngine":"v2"'));
  for(const script of [
    'stabilizer.js','ghost-trail.js','runtime.js','ghost-runtime.js',
    'stabilizer-ui.js','ghost-ui.js','user-presets.js','lab-ui.js','preset-ui.js','preview-compare.js','preview-pad.js',
  ]){
    assert.ok(html.includes(`<script src="brush-engine-v2/${script}"></script>`),`missing release script ${script}`);
    assert.ok(existsSync(resolve(root,`web/brush-engine-v2/${script}`)),`missing runtime file ${script}`);
  }
  assert.ok(existsSync(resolve(root,'web/brush-engine-v2/preview-replay.js')),'missing reference replay asset');
  assert.ok(existsSync(resolve(root,'web/brush-engine-v2/brush-coach.js')),'missing Brush Coach asset');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/preview-replay.js'"),'comparison runtime must load reference replay');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/brush-coach.js'"),'comparison runtime must load Brush Coach');
  assert.ok(compareSource.includes("script.addEventListener('load',()=>root.setTimeout(loadBrushCoach,0)"),'Brush Coach must be scheduled from the reference replay load event');
  assert.equal(html.includes('<script src="brush-engine-v2/native.js"></script>'), false);
  assert.ok(html.indexOf('brush-engine-v2/stabilizer.js') < html.indexOf('brush-engine-v2/filters.js'));
  assert.ok(html.indexOf('brush-engine-v2/rasterizer.js') < html.indexOf('brush-engine-v2/ghost-trail.js'));
  assert.ok(html.indexOf('brush-engine-v2/trace.js') < html.indexOf('brush-engine-v2/runtime.js'));
  assert.ok(html.indexOf('brush-engine-v2/tuning.js') < html.indexOf('brush-engine-v2/user-presets.js'));
  assert.ok(html.indexOf('brush-engine-v2/user-presets.js') < html.indexOf('brush-engine-v2/adapter.js'));
  assert.ok(html.indexOf('brush-engine-v2/runtime.js') < html.indexOf('brush-engine-v2/adapter.js'));
  assert.ok(html.indexOf('brush-engine-v2/session.js') < html.indexOf('brush-engine-v2/ghost-runtime.js'));
  assert.ok(html.indexOf('brush-engine-v2/ghost-runtime.js') < html.indexOf('brush-engine-v2/input.js'));
  assert.ok(html.indexOf('brush-engine-v2/ghost-ui.js') < html.indexOf('brush-engine-v2/lab-ui.js'));
  assert.ok(html.indexOf('brush-engine-v2/lab-ui.js') < html.indexOf('brush-engine-v2/preset-ui.js'));
  assert.ok(html.indexOf('brush-engine-v2/preset-ui.js') < html.indexOf('brush-engine-v2/preview-compare.js'));
  assert.ok(html.indexOf('brush-engine-v2/preview-compare.js') < html.indexOf('brush-engine-v2/preview-pad.js'));
  assert.ok(html.includes('InkFrameBrushV2InputBridge.begin'));
  assert.ok(html.includes('coordinateTransform:inputTransform'));

  console.log('✅ generated Brush V2 production Brush Coach policy passed');
} finally {
  rmSync(temp, { recursive:true, force:true });
}
