import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const box={console,Math,Number,String,Object,Array,Map,Set,WeakMap,JSON,Date,Blob:class{},URL:{},module:{exports:{}},setTimeout:()=>1};
box.globalThis=box;vm.createContext(box);
vm.runInContext(readFileSync(resolve(here,'..','feedback-report.js'),'utf8'),box,{filename:'feedback-report.js'});
const report=box.InkFrameFeedbackReport;
assert.ok(report,'Feedback Report runtime did not install');

const notes=report.sanitizeNotes({summary:'  crash\u0000 now  ',steps:'one\r\ntwo',expected:'works',actual:'failed'});
assert.deepEqual({...notes},{summary:'crash now',steps:'one\ntwo',expected:'works',actual:'failed'});
assert.equal(Object.isFrozen(notes),true);
assert.equal(report.sanitizeNotes({steps:'x'.repeat(report.NOTE_LIMIT+50)}).steps.length,report.NOTE_LIMIT);

const raw={
  build:{version:'0.4.0',packageName:'com.inkframe.studio',variant:'debug',diagnostics:true,defaultBrushEngine:'v2'},
  projectSlot:2,projectTotal:4,projectName:'Secret Project',
  canvas:{width:1920,height:1080,shape:'circle',pixels:'forbidden'},
  timeline:{frameCount:3,currentFrame:2,fps:12,holds:[1,2,9],playing:false,loopEnabled:true,loopIn:1,loopOut:3},
  layers:{count:5,active:3,names:['Secret Layer']},
  brush:{id:'ink',engine:'v2',stylusOnly:true,barrelMode:'pick',activeStroke:false,presetName:'Private'},
  onion:{enabled:true,depth:4,pastOpacity:.3,futureOpacity:.2,tint:.6,layerOnly:true},
  recoveryAvailable:true,recoveryLastSave:'2026-07-14T23:50:00Z',artwork:'pixel bytes',archive:'secret',
};
const normalized=report.normalizeSnapshot(raw);
assert.equal(normalized.canvas.shape,'circle');assert.equal(normalized.timeline.holds[2],8);
assert.equal(normalized.projectName,undefined);assert.equal(normalized.layers.names,undefined);assert.equal(normalized.artwork,undefined);
assert.equal(Object.isFrozen(normalized),true);assert.equal(Object.isFrozen(normalized.timeline.holds),true);

const platform={userAgent:'Mozilla/5.0 (Linux; Android 15; SM-X820 Build/AP3A; wv) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile Safari/537.36',webViewVersion:'143.0.0.0',androidWebView:true,viewportWidth:1400,viewportHeight:900,screenWidth:1848,screenHeight:2960,devicePixelRatio:2,touchPoints:10,coarsePointer:true,finePointer:false};
const text=report.buildReport(raw,notes,platform,'2026-07-14T23:55:00.000Z');
assert.match(text,/InkFrame Feedback Report/);assert.match(text,/Version: 0\.4\.0/);assert.match(text,/Canvas: 1920x1080 \(circle\)/);assert.match(text,/Holds: 1,2,8/);assert.match(text,/Summary: crash now/);assert.match(text,/Android WebView: yes/);
for(const forbidden of ['Secret Project','Secret Layer','pixel bytes','archive: secret','Private'])assert.equal(text.includes(forbidden),false,`report leaked forbidden value: ${forbidden}`);
assert.match(text,/no artwork, thumbnails, project names, layer names, archives, file paths/);

assert.equal(report.projectCanvasWrites,0);assert.equal(report.artworkUndoWrites,0);assert.equal(report.timingHistoryWrites,0);assert.equal(report.projectSchemaWrites,0);assert.equal(report.storageWrites,0);assert.equal(report.networkWrites,0);assert.equal(report.artworkReads,0);assert.equal(report.projectNameReads,0);
console.log('✅ Feedback Report normalization, redaction, deterministic text, bounds, and zero-write privacy contract passed');
