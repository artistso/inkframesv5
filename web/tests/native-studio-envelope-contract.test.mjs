import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..','..');
const application=readFileSync(resolve(root,'app/src/main/kotlin/com/inkframe/studio/InkFrameApplication.kt'),'utf8');
const registry=readFileSync(resolve(root,'core-model/src/main/kotlin/com/inkframe/core/model/StudioStrokeBindingRegistry.kt'),'utf8');
const registryTest=readFileSync(resolve(root,'core-model/src/test/kotlin/com/inkframe/core/model/StudioStrokeBindingRegistryTest.kt'),'utf8');

assert.match(application,/StudioStrokeBindingRegistry/,'Android host must use the typed Kotlin binding registry');
assert.match(application,/private fun promoteStrokeEnvelope/,'legacy overlay payloads must be promoted before replay');
assert.match(application,/bindingRegistry\.resolve\(token\)/,'promotion must resolve the exact frozen context token');
assert.match(application,/val envelope = promoteStrokeEnvelope\(payload\)/,'raw overlay payloads must never bypass promotion');
assert.match(application,/contextMirror\.validate\(binding\)/,'promoted bindings must pass the Kotlin context mirror');
assert.match(application,/InkFrameNativeStudio\.replayStroke\(\$\{jsString\(envelope\)\}\)/,'only the schema-2 envelope may enter JavaScript replay');

for(const field of [
  'contextRevision','projectIndex','frameIndex','layerIndex','layerCount','backgroundActive',
  'canvasWidth','canvasHeight','shape','canvasLeft','canvasTop','canvasDisplayWidth',
  'canvasDisplayHeight','brushId','brushColor','paperColor','brushSize','opacity',
]){
  assert.ok(application.includes(`value.put("${field}"`),`schema-2 envelope field missing: ${field}`);
}
assert.ok(application.includes('value.put("schema", StudioContextSnapshot.CURRENT_SCHEMA)'),
  'promoted payload must be marked with the current typed schema');
assert.doesNotMatch(application,/replayStroke\(\$\{jsString\(payload\)\}\)/,
  'raw schema-1 payload must never be forwarded to the studio');

assert.match(registry,/DEFAULT_CAPACITY = 32/,'registry must be explicitly bounded');
assert.match(registry,/while \(bindings\.size > capacity\)/,'registry must evict old context bindings');
assert.match(registry,/validatedOrNull/,'registry must reject malformed bindings');
assert.doesNotMatch(registry,/localStorage|sessionStorage|setInterval|Thread\.sleep/);

assert.match(registryTest,/remembersAndResolvesExactBinding/);
assert.match(registryTest,/evictsOldestBindingAtCapacity/);
assert.match(registryTest,/rejectsInvalidOrUndrawableContext/);
assert.match(registryTest,/clearRemovesAllBindings/);

console.log('✅ native schema-2 envelope promotion and bounded Kotlin binding registry contract passed');
