// InkFrame — Signature Feel brush profiles
// -----------------------------------------------------------------------------
// A lightweight product layer over the real Brush Lab controls. Signature Feel
// profiles do not replace the painter: they drive its existing pressure curve,
// stabilization, prediction, spacing, taper, texture, and nib controls through
// the same input events an artist uses manually. Size, opacity, and colour are
// deliberately preserved.
'use strict';

(function installInkFrameBrushSignatures(root, factory){
  const api = factory(root);
  if (root) root.InkFrameBrushSignatures = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildBrushSignatures(root){
  const VERSION = 'v1-signature-feel';
  const STORAGE_KEY = 'inkframe.brush.signatures.v1';

  const SIGNATURES = Object.freeze({
    precision: Object.freeze({
      name:'Precision', tagline:'Clean control',
      values:{ blabMin:3, blabStab:72, blabPred:55, blabHard:92, blabSp:6, blabJit:0, blabTin:14, blabTout:28, blabEP:0, blabXP:0, blabTex:4, blabResp:22 }
    }),
    natural: Object.freeze({
      name:'Natural', tagline:'Balanced hand',
      values:{ blabMin:8, blabStab:32, blabPred:24, blabHard:72, blabSp:9, blabJit:1, blabTin:10, blabTout:20, blabEP:0, blabXP:0, blabTex:18, blabResp:0 }
    }),
    expressive: Object.freeze({
      name:'Expressive', tagline:'Pressure drama',
      values:{ blabMin:0, blabStab:8, blabPred:6, blabHard:84, blabSp:8, blabJit:3, blabTin:26, blabTout:42, blabEP:10, blabXP:18, blabTex:24, blabResp:-48 }
    }),
    velvet: Object.freeze({
      name:'Velvet', tagline:'Polished flow',
      values:{ blabMin:12, blabStab:48, blabPred:35, blabHard:58, blabSp:6, blabJit:0, blabTin:18, blabTout:26, blabEP:0, blabXP:0, blabTex:10, blabResp:52 }
    }),
    raw: Object.freeze({
      name:'Raw', tagline:'Direct response',
      values:{ blabMin:0, blabStab:0, blabPred:0, blabHard:100, blabSp:4, blabJit:0, blabTin:0, blabTout:0, blabEP:0, blabXP:0, blabTex:0, blabResp:0 }
    }),
  });

  const CONTROL_IDS = Object.freeze(Array.from(new Set(
    Object.values(SIGNATURES).flatMap(signature => Object.keys(signature.values))
  )));

  let installed = false;
  let applying = false;
  let panel = null;
  let status = null;
  let observer = null;
  let activeSignature = 'custom';
  let metrics = {
    active:false,
    version:VERSION,
    panelPresent:false,
    buttonCount:0,
    currentBrush:'brush',
    currentSignature:'custom',
    applications:0,
    customChanges:0,
    inputEvents:0,
    sizePreserved:true,
    opacityPreserved:true,
  };

  function safeText(value){ return String(value == null ? '' : value).trim(); }
  function currentBrushKey(){
    if (typeof document === 'undefined') return 'brush';
    const name = document.getElementById('blabName');
    const text = safeText(name && name.textContent).toLowerCase();
    return text.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brush';
  }

  function readStored(){
    try {
      const parsed = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) { return {}; }
  }

  function writeStored(brushKey, signatureKey){
    try {
      const stored = readStored();
      stored[brushKey] = signatureKey;
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      return true;
    } catch (_) { return false; }
  }

  function control(id){ return typeof document === 'undefined' ? null : document.getElementById(id); }
  function numericValue(id){
    const el = control(id);
    const value = Number(el && el.value);
    return Number.isFinite(value) ? value : null;
  }

  function matchesSignature(key){
    const signature = SIGNATURES[key];
    if (!signature) return false;
    return Object.entries(signature.values).every(([id, expected]) => numericValue(id) === Number(expected));
  }

  function detectSignature(){
    for (const key of Object.keys(SIGNATURES)) if (matchesSignature(key)) return key;
    return 'custom';
  }

  function signatureLabel(key){ return SIGNATURES[key] ? SIGNATURES[key].name : 'Custom'; }

  function updateUI(key){
    activeSignature = SIGNATURES[key] ? key : 'custom';
    if (panel) {
      panel.querySelectorAll('[data-inkframe-signature]').forEach(button => {
        const selected = button.dataset.inkframeSignature === activeSignature;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }
    if (status) {
      const signature = SIGNATURES[activeSignature];
      status.textContent = signature
        ? `${signature.name} · ${signature.tagline}`
        : 'Custom · manual Brush Lab tuning';
    }
    metrics.currentBrush = currentBrushKey();
    metrics.currentSignature = activeSignature;
    root.__inkframeBrushSignatureMetrics = { ...metrics };
    return activeSignature;
  }

  function emitInput(el){
    if (!el) return;
    const EventCtor = root.Event || Event;
    el.dispatchEvent(new EventCtor('input', { bubbles:true }));
    el.dispatchEvent(new EventCtor('change', { bubbles:true }));
    metrics.inputEvents += 2;
  }

  function applySignature(key){
    const signature = SIGNATURES[key];
    if (!signature) return false;
    const beforeSize = numericValue('blabSize');
    const beforeOpacity = numericValue('blabOp');
    applying = true;
    try {
      for (const [id, value] of Object.entries(signature.values)) {
        const el = control(id);
        if (!el) continue;
        el.value = String(value);
        emitInput(el);
      }
    } finally {
      applying = false;
    }
    metrics.applications++;
    metrics.sizePreserved = beforeSize === numericValue('blabSize');
    metrics.opacityPreserved = beforeOpacity === numericValue('blabOp');
    writeStored(currentBrushKey(), key);
    updateUI(key);
    return true;
  }

  function markCustom(){
    if (applying) return;
    metrics.customChanges++;
    writeStored(currentBrushKey(), 'custom');
    updateUI('custom');
  }

  function syncForBrush(){
    const detected = detectSignature();
    if (detected !== 'custom') return updateUI(detected);
    const stored = readStored()[currentBrushKey()];
    return updateUI(SIGNATURES[stored] && matchesSignature(stored) ? stored : 'custom');
  }

  function ensureStyle(){
    if (typeof document === 'undefined' || document.getElementById('inkframe-brush-signatures-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-brush-signatures-style';
    style.textContent = [
      '#inkframe-brush-signatures{margin:8px 0 10px;padding:9px;border:1px solid rgba(247,202,201,.28);border-radius:14px;background:rgba(20,0,14,.22)}',
      '#inkframe-brush-signatures .sigHdr{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}',
      '#inkframe-brush-signatures .sigTitle{font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}',
      '#inkframe-brush-signatures .sigStatus{font-size:10px;opacity:.82;text-align:right}',
      '#inkframe-brush-signatures .sigButtons{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}',
      '#inkframe-brush-signatures button{min-width:0;min-height:34px;padding:6px 4px;border-radius:10px;border:1px solid rgba(247,202,201,.30);background:rgba(255,240,243,.08);color:inherit;font:800 9px/1.05 var(--font-ui, sans-serif);letter-spacing:.05em;text-transform:uppercase;touch-action:manipulation}',
      '#inkframe-brush-signatures button.active{background:rgba(187,0,55,.42);border-color:rgba(255,240,243,.72);box-shadow:0 0 12px rgba(187,0,55,.24)}',
      '@media (max-width:760px){#inkframe-brush-signatures .sigButtons{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensurePanel(){
    if (typeof document === 'undefined') return null;
    const lab = document.getElementById('blab');
    if (!lab) return null;
    panel = document.getElementById('inkframe-brush-signatures');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'inkframe-brush-signatures';
      panel.setAttribute('aria-label', 'Signature Feel presets');
      const header = document.createElement('div');
      header.className = 'sigHdr';
      const title = document.createElement('span');
      title.className = 'sigTitle';
      title.textContent = 'Signature Feel';
      status = document.createElement('span');
      status.className = 'sigStatus';
      header.append(title, status);
      const buttons = document.createElement('div');
      buttons.className = 'sigButtons';
      for (const [key, signature] of Object.entries(SIGNATURES)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.inkframeSignature = key;
        button.textContent = signature.name;
        button.title = `${signature.name}: ${signature.tagline}. Preserves size and opacity.`;
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          applySignature(key);
        });
        buttons.appendChild(button);
      }
      panel.append(header, buttons);
      const preview = lab.querySelector('.preview');
      if (preview && preview.nextSibling) lab.insertBefore(panel, preview.nextSibling);
      else if (preview) preview.insertAdjacentElement('afterend', panel);
      else lab.insertBefore(panel, lab.firstChild);
    } else {
      status = panel.querySelector('.sigStatus');
    }
    metrics.panelPresent = true;
    metrics.buttonCount = panel.querySelectorAll('[data-inkframe-signature]').length;
    return panel;
  }

  function attachControlListeners(){
    for (const id of CONTROL_IDS) {
      const el = control(id);
      if (!el || el.dataset.inkframeSignatureWatch === '1') continue;
      el.dataset.inkframeSignatureWatch = '1';
      el.addEventListener('input', markCustom);
    }
  }

  function installObserver(){
    if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const lab = document.getElementById('blab');
    const name = document.getElementById('blabName');
    observer = new MutationObserver(() => {
      ensurePanel();
      attachControlListeners();
      syncForBrush();
    });
    if (lab) observer.observe(lab, { attributes:true, attributeFilter:['class'] });
    if (name) observer.observe(name, { childList:true, characterData:true, subtree:true });
  }

  function install(){
    if (installed || typeof document === 'undefined') return { ...metrics };
    const lab = document.getElementById('blab');
    if (!lab) return { ...metrics };
    installed = true;
    metrics.active = true;
    ensureStyle();
    ensurePanel();
    attachControlListeners();
    installObserver();
    syncForBrush();
    root.__inkframeBrushSignatureMetrics = { ...metrics };
    return { ...metrics };
  }

  function reportLines(){
    const m = { ...metrics, currentBrush:currentBrushKey(), currentSignature:activeSignature };
    return [
      'Brush Signatures: ' + (m.active ? 'active' : 'inactive'),
      'Brush Signatures version: ' + VERSION,
      'Brush Signatures panel: ' + (m.panelPresent ? 'yes' : 'no'),
      'Brush Signatures buttons: ' + m.buttonCount,
      'Brush Signatures current brush: ' + m.currentBrush,
      'Brush Signatures current feel: ' + signatureLabel(m.currentSignature),
      'Brush Signatures applications: ' + m.applications,
      'Brush Signatures custom changes: ' + m.customChanges,
      'Brush Signatures size preserved: ' + (m.sizePreserved ? 'yes' : 'no'),
      'Brush Signatures opacity preserved: ' + (m.opacityPreserved ? 'yes' : 'no'),
    ];
  }

  const api = {
    VERSION,
    STORAGE_KEY,
    SIGNATURES,
    CONTROL_IDS,
    install,
    applySignature,
    markCustom,
    detectSignature,
    currentBrushKey,
    currentSignature(){ return activeSignature; },
    metrics(){ return { ...metrics, currentBrush:currentBrushKey(), currentSignature:activeSignature }; },
    reportLines,
  };

  if (typeof document !== 'undefined') {
    const boot = () => {
      install();
      root.setTimeout && root.setTimeout(() => { ensurePanel(); attachControlListeners(); syncForBrush(); }, 220);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
    else boot();
  }
  return api;
});
