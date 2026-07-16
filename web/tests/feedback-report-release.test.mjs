import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..','..');
const temp=mkdtempSync(resolve(tmpdir(),'inkframe-feedback-release-')),generated=resolve(temp,'index.html');
try{
  execFileSync(process.execPath,[resolve(root,'tools/inject-brush-v2-index.mjs'),resolve(root,'web/index.html'),generated,'--variant=release','--diagnostics=false','--default-engine=v2'],{cwd:root,stdio:'pipe'});
  const html=readFileSync(generated,'utf8'),sourcePath=resolve(root,'web/feedback-report.js'),source=readFileSync(sourcePath,'utf8'),injector=readFileSync(resolve(root,'tools/inject-feedback-report.mjs'),'utf8'),rootInjector=readFileSync(resolve(root,'tools/inject-brush-v2-index.mjs'),'utf8'),gradle=readFileSync(resolve(root,'app/build.gradle.kts'),'utf8'),mainActivity=readFileSync(resolve(root,'app/src/main/kotlin/com/inkframe/studio/MainActivity.kt'),'utf8'),metadata=JSON.parse(readFileSync(resolve(root,'web/metadata.json'),'utf8'));
  assert.ok(existsSync(sourcePath),'missing Feedback Report runtime');
  assert.ok(html.includes('<script src="feedback-report.js"></script>'),'release index must package Feedback Report');
  assert.ok(html.indexOf('onion-skin-studio.js')<html.indexOf('feedback-report.js'),'Feedback Report must load after Onion Skin Studio');
  assert.ok(html.indexOf('feedback-report.js')<html.indexOf('brush-engine-v2/sample.js'),'Feedback Report must initialize before the modular brush runtime');
  assert.ok(html.includes('window.InkFrameFeedbackEnvironment'),'release index must expose the bounded feedback environment');
  assert.ok(html.includes('feedbackReportSnapshot'),'release index must expose deterministic report facts');
  assert.ok(html.includes(`version:${JSON.stringify(metadata.version)}`),'release feedback bridge must embed canonical metadata version');
  assert.ok(html.includes(`packageName:${JSON.stringify(metadata.packageName)}`),'release feedback bridge must embed canonical package name');
  assert.ok(source.includes('Nothing is uploaded.'));assert.ok(source.includes('projectNameReads:0'));assert.ok(source.includes('artworkReads:0'));
  assert.ok(source.includes("copyTesterReport==='function'"),'Android copy must reuse the existing bridge');
  assert.ok(source.includes("saveDataUrl==='function'"),'Android save must reuse the existing export bridge');
  assert.ok(source.includes("document.getElementById('inkframe-test-report-btn')"),'legacy debug button must be removed if injected');
  assert.equal(source.includes('localStorage'),false,'Feedback Report notes must remain transient');
  assert.equal(source.includes('fetch('),false,'Feedback Report must remain offline');
  assert.ok(injector.includes("readFileSync(new URL('../web/metadata.json'"),'Feedback injector must read canonical metadata');
  assert.ok(rootInjector.includes("import { injectFeedbackReport } from './inject-feedback-report.mjs'"));
  assert.ok(rootInjector.includes('html = injectFeedbackReport(html, replaceOnce)'));
  for(const path of ['tools/inject-feedback-report.mjs'])assert.ok(gradle.includes(`rootProject.file("${path}")`),`missing Gradle input for ${path}`);
  assert.ok(gradle.includes('webMetadataFile'),'metadata must invalidate generated Android indexes');
  assert.ok(mainActivity.includes('fun copyTesterReport(report: String)'),'native clipboard bridge must remain available');
  assert.ok(mainActivity.includes('fun saveDataUrl(dataUrl: String'),'native text-save bridge must remain available');
  console.log('✅ generated release Feedback Report asset, metadata bridge, copy/save paths, Gradle inputs, redaction, and offline contract passed');
}finally{rmSync(temp,{recursive:true,force:true});}
