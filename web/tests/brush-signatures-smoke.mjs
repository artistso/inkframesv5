// InkFrame — Signature Feel brush profiles smoke
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  ({ JSDOM } = require(process.env.JSDOM_PATH || '/tmp/jsdom/node_modules/jsdom'));
}

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '..', 'brush-signatures.js'), 'utf8');
let failed = 0;
function check(condition, message){
  if (!condition) { console.error('❌ ' + message); failed++; }
}

const controls = [
  ['blabSize', 36], ['blabOp', 74], ['blabMin', 0], ['blabStab', 0],
  ['blabPred', 0], ['blabHard', 0], ['blabSp', 2], ['blabJit', 0],
  ['blabTin', 0], ['blabTout', 0], ['blabEP', 0], ['blabXP', 0],
  ['blabTex', 0], ['blabResp', 0],
];
const controlMarkup = controls.map(([id,value]) => `<input type="range" id="${id}" value="${value}">`).join('');
const dom = new JSDOM(`<!doctype html><html><head></head><body>
  <div id="blab" class="show">
    <div class="hdr"><b id="blabName">Ink</b><span id="blabSub">Long-press · adjust</span></div>
    <div class="preview"><canvas id="blabPreview"></canvas></div>
    ${controlMarkup}
  </div>
</body></html>`, {
  pretendToBeVisual:true,
  runScripts:'outside-only',
  url:'https://inkframe.local/',
});

const { window } = dom;
window.console = console;
window.eval(source);
const api = window.InkFrameBrushSignatures;
check(!!api, 'Signature Feel API missing');
check(api.VERSION === 'v1-signature-feel', 'Signature Feel version mismatch');
check(Object.keys(api.SIGNATURES).length === 5, 'expected five Signature Feel profiles');

api.install();
let metrics = api.metrics();
check(metrics.active === true, 'Signature Feel should be active');
check(metrics.panelPresent === true, 'Signature Feel panel missing');
check(metrics.buttonCount === 5, 'Signature Feel buttons missing');
check(window.document.querySelector('.preview + #inkframe-brush-signatures') !== null, 'Signature Feel should appear after preview');

let inputEvents = 0;
window.document.getElementById('blabStab').addEventListener('input', () => inputEvents++);
window.document.getElementById('blabResp').addEventListener('input', () => inputEvents++);

const sizeBefore = window.document.getElementById('blabSize').value;
const opacityBefore = window.document.getElementById('blabOp').value;
check(api.applySignature('precision') === true, 'Precision profile should apply');
check(window.document.getElementById('blabStab').value === '72', 'Precision stabilize value incorrect');
check(window.document.getElementById('blabPred').value === '55', 'Precision prediction value incorrect');
check(window.document.getElementById('blabResp').value === '22', 'Precision response value incorrect');
check(window.document.getElementById('blabSize').value === sizeBefore, 'Signature Feel must preserve size');
check(window.document.getElementById('blabOp').value === opacityBefore, 'Signature Feel must preserve opacity');
check(inputEvents === 2, 'Signature Feel should dispatch real input events');
check(api.currentSignature() === 'precision', 'Precision should be the active signature');
check(window.document.querySelector('[data-inkframe-signature="precision"]').classList.contains('active'), 'Precision button should be highlighted');
let stored = JSON.parse(window.localStorage.getItem(api.STORAGE_KEY));
check(stored.ink === 'precision', 'Precision choice should persist per brush');

const stabilize = window.document.getElementById('blabStab');
stabilize.value = '61';
stabilize.dispatchEvent(new window.Event('input', { bubbles:true }));
check(api.currentSignature() === 'custom', 'manual Brush Lab change should become Custom');
stored = JSON.parse(window.localStorage.getItem(api.STORAGE_KEY));
check(stored.ink === 'custom', 'Custom state should persist per brush');

window.document.getElementById('blabName').textContent = 'Pencil';
await new Promise(resolve => window.setTimeout(resolve, 0));
check(api.currentBrushKey() === 'pencil', 'brush key should follow Brush Lab name');
check(api.applySignature('velvet') === true, 'Velvet profile should apply');
check(window.document.getElementById('blabStab').value === '48', 'Velvet stabilize value incorrect');
check(window.document.getElementById('blabHard').value === '58', 'Velvet hardness value incorrect');
check(window.document.getElementById('blabResp').value === '52', 'Velvet response value incorrect');
stored = JSON.parse(window.localStorage.getItem(api.STORAGE_KEY));
check(stored.ink === 'custom' && stored.pencil === 'velvet', 'signature choices should remain brush-specific');

metrics = api.metrics();
check(metrics.applications === 2, 'signature application metric incorrect');
check(metrics.customChanges >= 1, 'custom-change metric missing');
check(metrics.sizePreserved === true && metrics.opacityPreserved === true, 'preservation metrics incorrect');
const report = api.reportLines();
check(report.some(line => line.includes('Brush Signatures: active')), 'Signature Feel report missing active state');
check(report.some(line => line.includes('Brush Signatures current feel: Velvet')), 'Signature Feel report missing current profile');
check(report.some(line => line.includes('Brush Signatures size preserved: yes')), 'Signature Feel report missing preservation status');

if (failed) {
  console.error(`\nBrush Signature smoke FAILED (${failed} check${failed > 1 ? 's' : ''}).`);
  window.close();
  process.exit(1);
}
console.log(`✅ Brush Signature smoke passed. profiles=${metrics.buttonCount} current=${api.currentSignature()} events=${metrics.inputEvents}`);
window.close();
process.exit(0);
