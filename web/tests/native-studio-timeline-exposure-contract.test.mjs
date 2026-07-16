// Kotlin timeline/exposure migration contract
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const model=readFileSync(resolve(root,'core-model/src/main/kotlin/com/inkframe/core/model/StudioTimelineExposure.kt'),'utf8');
const types=readFileSync(resolve(root,'core-model/src/main/kotlin/com/inkframe/core/model/StudioTimelineTypes.kt'),'utf8');
const mirror=readFileSync(resolve(root,'core-model/src/main/kotlin/com/inkframe/core/model/StudioTimelineExposureMirror.kt'),'utf8');
const controller=readFileSync(resolve(root,'app/src/main/kotlin/com/inkframe/studio/StudioProjectReconciliationController.kt'),'utf8');
const bridge=readFileSync(resolve(root,'web/native-studio-bridge.js'),'utf8');

assert.match(model,/data class StudioTimelineExposureSnapshot/);
assert.match(model,/StudioDeclaredExposureSpan/);
assert.match(model,/selectionRanges/);
assert.match(model,/fun frameState/);
assert.match(model,/fun steppedFrameIndex/);
assert.match(types,/data class StudioPlaybackRange/);
assert.match(types,/data class StudioFrameSelectionRange/);
assert.match(types,/data class StudioTimelineFrameState/);
assert.match(mirror,/class StudioTimelineExposureMirror/);
assert.match(mirror,/AtomicReference<StudioTimelineExposureSnapshot\?>/);
assert.match(controller,/private val timelineMirror = StudioTimelineExposureMirror\(\)/);
assert.match(controller,/StudioTimelineExposureSnapshot\.from\(candidate\)/);
assert.match(controller,/fun timelineSnapshot\(\)/);
assert.match(bridge,/timelineSnapshot/);
assert.match(bridge,/selectedFrames/);
assert.match(bridge,/holdFrames/);
assert.doesNotMatch(model,/localStorage|sessionStorage|WebView|Canvas/);
assert.doesNotMatch(controller,/setInterval|Timer\(/);
assert.ok(existsSync(resolve(root,'web/radial-timeline.js')),'circular timeline runtime must remain');
assert.ok(existsSync(resolve(root,'web/timeline-workspace.js')),'perimeter timeline workspace must remain');

console.log('✅ Typed Kotlin timeline/exposure mirror remains read-only and connected to both original timeline surfaces');
