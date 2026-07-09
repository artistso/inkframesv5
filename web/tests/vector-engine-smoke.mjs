// InkFrame -- vector-engine JS smoke test
// -----------------------------------------------------------------------------
// Validates the portable vector geometry contract used by WebView and mirrored
// by native Kotlin VectorEngine.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const src = readFileSync(resolve(webDir, 'vector-engine.js'), 'utf8');

const context = { console, Math, Number, Object, Array, module: { exports: {} }, exports: {}, globalThis: {} };
vm.createContext(context);
vm.runInContext(src, context, { filename: 'vector-engine.js' });

const engine = context.module.exports;
let failed = 0;
function check(condition, message) {
  if (!condition) {
    console.error('❌ ' + message);
    failed++;
  }
}

check(engine && typeof engine.planVectorStroke === 'function', 'planVectorStroke export missing');
check(engine.VERSION === 'v0.1.0-vector-path-core', 'version mismatch');

const points = [
  engine.vec(0, 0),
  engine.vec(12, 8),
  engine.vec(24, -4),
  engine.vec(36, 12),
  engine.vec(48, 0),
];
const plan = engine.planVectorStroke(points, { simplificationTolerance: 0.1, strokeWidth: 6 });
check(plan.rawPoints.length === points.length, 'raw points not preserved');
check(plan.cubics.length > 0, 'cubics missing');
check(plan.anchors.length > 0, 'anchors missing');
check(plan.samples.length >= plan.cubics.length, 'samples missing');
check(plan.outline.left.length === plan.samples.length, 'left outline mismatch');
check(plan.outline.right.length === plan.samples.length, 'right outline mismatch');
check(plan.bounds.width > 0 && plan.bounds.height > 0, 'bounds invalid');
check(plan.svgPathData.startsWith('M 0 0'), 'SVG path missing move command');
check(plan.svgPathData.includes(' C '), 'SVG path missing cubic command');

const simplified = engine.simplify([engine.vec(0,0), engine.vec(5,0.1), engine.vec(10,0), engine.vec(20,0)], 0.5);
check(simplified.length < 4, 'simplification did not reduce points');
check(simplified[0].x === 0 && simplified[simplified.length - 1].x === 20, 'simplification endpoints changed');

const snappedGrid = engine.snapPoint(engine.vec(23, 41), null, { mode: 'grid', gridSize: 16, origin: engine.vec(0, 0) });
check(snappedGrid.x === 16 && snappedGrid.y === 48, 'grid snapping failed');

const snappedAngle = engine.snapPoint(engine.vec(10, 3), engine.vec(0, 0), { mode: 'angle', angleStepDegrees: 45 });
check(Math.abs(snappedAngle.y) < 0.0001 && snappedAngle.x > 10, 'angle snapping failed');

const copies = engine.symmetryCopies([engine.vec(2, 3)], 'quad', engine.vec(10, 10));
check(copies.length === 4, 'quad symmetry did not create four copies');
check(copies[1][0].x === 18 && copies[2][0].y === 17 && copies[3][0].x === 18 && copies[3][0].y === 17, 'quad symmetry coordinates invalid');

if (failed) {
  console.error(`\nVector engine smoke FAILED (${failed} check${failed > 1 ? 's' : ''}).`);
  process.exit(1);
}

console.log(`✅ Vector engine smoke passed. cubics=${plan.cubics.length} samples=${plan.samples.length} bounds=${plan.bounds.width.toFixed(1)}x${plan.bounds.height.toFixed(1)}`);
