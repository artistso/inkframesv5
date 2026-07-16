import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require(process.env.JSDOM_PATH||'/tmp/jsdom/node_modules/jsdom'));}

const here=dirname(fileURLToPath(import.meta.url));
const web=resolve(here,'..');
const root=resolve(web,'..');
const source=readFileSync(resolve(web,'artist-canvas-ui.js'),'utf8');
const injector=readFileSync(resolve(root,'tools/inject-brush-v2-index.mjs'),'utf8');
const overlay=readFileSync(resolve(root,'app/src/main/kotlin/com/inkframe/studio/nativeink/NativeStudioInkOverlay.kt'),'utf8');
const statusModel=readFileSync(resolve(root,'core-model/src/main/kotlin/com/inkframe/core/model/StudioArtistCanvasStatus.kt'),'utf8');
const statusStore=readFileSync(resolve(root,'app/src/main/kotlin/com/inkframe/studio/nativeink/StudioArtistCanvasStatusStore.kt'),'utf8');

const dom=new JSDOM('<!doctype html><html><head></head><body><div id="inkframe-v2-ab"></div><section id="inkframe-v2-tuning"></section></body></html>',{
  runScripts:'outside-only',url:'file:///android_asset/index.html'
});
const {window}=dom;
window.eval(source);

assert.ok(window.document.body.classList.contains('inkframe-artist-canvas-ui'));
const style=window.document.getElementById('inkframe-artist-canvas-ui-style');
assert.ok(style,'artist canvas style must install once');
assert.match(style.textContent,/#inkframe-v2-ab\{display:none!important\}/);
assert.equal(window.document.getElementById('inkframe-v2-tuning').hidden,false,'Brush Lab itself must remain available');
assert.equal(window.InkFrameArtistCanvasUI.diagnosticsVisible(),false);
assert.equal(window.InkFrameArtistCanvasUI.setDiagnosticsVisible(true),true);
assert.ok(window.document.body.classList.contains('inkframe-show-engine-diagnostics'));
assert.equal(window.InkFrameArtistCanvasUI.setDiagnosticsVisible(false),false);
assert.ok(!window.document.body.classList.contains('inkframe-show-engine-diagnostics'));

assert.ok(injector.includes('<script src="native-studio-bridge.js"></script>\n<script src="artist-canvas-ui.js"></script>'));
assert.ok(injector.indexOf('artist-canvas-ui.js')<injector.indexOf('brush-engine-v2/lab-ui.js'));
assert.match(overlay,/ACTION_HOVER_MOVE/);
assert.match(overlay,/drawHoverCursor/);
assert.match(overlay,/brushSizeDisplayPx/);
assert.match(overlay,/hoverEraser/);
assert.match(overlay,/StudioArtistCanvasStatusStore\.label\(\)/);
assert.match(overlay,/overlay\.hasActiveStroke \|\| overlay\.hasHover/);
assert.match(statusModel,/data class StudioArtistCanvasStatus/);
assert.match(statusModel,/F \$frameNumber\/\$frameCount/);
assert.match(statusStore,/AtomicReference/);

for(const forbidden of [/setInterval/,/localStorage|sessionStorage/,/fetch\(/,/projectCanvasWrites:[1-9]/,/artworkUndoWrites:[1-9]/,/timelineWrites:[1-9]/]){
  assert.doesNotMatch(source,forbidden);
}

console.log('✅ Android artist canvas UI, native S Pen hover cursor, and Kotlin context HUD contracts passed');
