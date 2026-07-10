// InkFrame — Classic Plus UI Controls
// -----------------------------------------------------------------------------
// A tiny release-stable layer on top of the original draggable orb UI. It keeps
// original movement and expansion behavior, but adds practical tablet controls:
// UI lock, safer two-tap UI reset, drag-safe styling, and diagnostics. It does
// not own drawing, canvas geometry, tool state, or child-button layout.
'use strict';

(function installInkFrameUIClassicPlus(root){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (root.__inkframeUIClassicPlusInstalled) return;
  root.__inkframeUIClassicPlusInstalled = true;

  const VERSION = 'v2-lock-reset-safety';
  const LOCK_KEY = 'inkframe.ui.locked.v1';
  const RESET_CONFIRM_MS = 2400;
  const CLASSIC_RESET_KEYS = [
    'inkframe.ui.rootPositions.v1',
    'inkframe.ui.focus.v1',
    'inkframe.ui.layout.v1',
    'inkframe.ui.drag.v1',
    'inkframe.ui.root.drag.v1',
  ];
  let metrics = null;
  let lockButton = null;
  let resetButton = null;
  let statusEl = null;
  let locked = readLocked();
  let lockGateInstalled = false;
  let lockedPointerId = null;
  let lockedNodeSnapshot = null;
  let resetConfirmUntil = 0;
  let lastResetAt = 0;
  let blockedMoves = 0;

  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function readLocked(){
    try { return localStorage.getItem(LOCK_KEY) === '1'; } catch (_) { return false; }
  }

  function writeLocked(value){
    locked = !!value;
    try { localStorage.setItem(LOCK_KEY, locked ? '1' : '0'); } catch (_) {}
  }

  function ensureStyle(){
    if (document.getElementById('inkframe-ui-classic-plus-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-ui-classic-plus-style';
    style.textContent = [
      'body.inkframe-classic-plus{--inkframe-ui-plus:classic-plus}',
      'body.inkframe-classic-plus .orb{outline:0!important}',
      'body.inkframe-classic-plus .orb:before{content:"";position:absolute;inset:-10px;border-radius:50%;pointer-events:none}',
      'body.inkframe-classic-plus .node{touch-action:none!important}',
      'body.inkframe-classic-plus .node.dragging>.orb{transform:scale(1.035)}',
      'body.inkframe-classic-plus .kid,body.inkframe-classic-plus .branch{touch-action:manipulation!important}',
      'body.inkframe-ui-locked .orb{cursor:pointer!important}',
      'body.inkframe-ui-locked .node:not(.open)>.orb{box-shadow:var(--shadow),0 0 0 1px rgba(255,240,243,.22),inset 0 1px 0 var(--rim)!important}',
      'body.inkframe-ui-locked .node.dragging>.orb{transform:none!important}',
      'body.inkframe-ui-locked .node.ui-lock-held>.orb{filter:saturate(1.08)!important;box-shadow:var(--shadow),0 0 0 2px rgba(255,240,243,.38),inset 0 1px 0 var(--rim)!important}',
      '#inkframe-ui-classic-plus-dock{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));z-index:64;display:flex;gap:8px;align-items:center;pointer-events:auto;max-width:calc(100vw - 24px)}',
      '#inkframe-ui-classic-plus-dock button{min-height:32px;padding:7px 10px;border-radius:999px;border:1px solid rgba(247,202,201,.34);background:rgba(20,0,14,.56);color:#fff0f3;font:800 10px/1 system-ui,sans-serif;letter-spacing:.11em;text-transform:uppercase;box-shadow:0 5px 14px rgba(10,0,10,.25),inset 0 1px 0 rgba(255,255,255,.13);backdrop-filter:blur(10px) saturate(125%);-webkit-backdrop-filter:blur(10px) saturate(125%)}',
      '#inkframe-ui-lock-toggle[aria-pressed="true"]{background:rgba(187,0,55,.42);border-color:rgba(255,240,243,.58)}',
      '#inkframe-ui-reset{opacity:.84}',
      '#inkframe-ui-reset[data-confirm="1"]{opacity:1;background:rgba(187,0,55,.44);border-color:rgba(255,240,243,.64)}',
      '#inkframe-ui-plus-status{min-height:32px;display:flex;align-items:center;padding:0 9px;border-radius:999px;border:1px solid rgba(247,202,201,.20);background:rgba(10,0,10,.36);color:rgba(255,240,243,.78);font:800 9px/1 system-ui,sans-serif;letter-spacing:.10em;text-transform:uppercase;box-shadow:0 4px 12px rgba(10,0,10,.20);pointer-events:none;white-space:nowrap}',
      '#inkframe-ui-reset:active,#inkframe-ui-lock-toggle:active{transform:translateY(1px)}',
      '@media (max-width:520px){#inkframe-ui-plus-status{display:none}#inkframe-ui-classic-plus-dock button{padding-inline:9px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureDock(){
    let dock = document.getElementById('inkframe-ui-classic-plus-dock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'inkframe-ui-classic-plus-dock';
      dock.setAttribute('aria-label', 'Classic UI controls');
      document.body.appendChild(dock);
    }
    if (!lockButton) {
      lockButton = document.createElement('button');
      lockButton.id = 'inkframe-ui-lock-toggle';
      lockButton.type = 'button';
      lockButton.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        setLocked(!locked);
      });
      dock.appendChild(lockButton);
    }
    if (!resetButton) {
      resetButton = document.createElement('button');
      resetButton.id = 'inkframe-ui-reset';
      resetButton.type = 'button';
      resetButton.textContent = 'RESET UI';
      resetButton.title = 'Tap twice to reset floating button placement only. Artwork is not cleared.';
      resetButton.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        requestResetUI();
      });
      dock.appendChild(resetButton);
    }
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'inkframe-ui-plus-status';
      statusEl.setAttribute('aria-live', 'polite');
      dock.appendChild(statusEl);
    }
    syncControls();
  }

  function syncControls(){
    document.body.classList.add('inkframe-classic-plus');
    document.body.classList.toggle('inkframe-ui-locked', locked);
    if (lockButton) {
      lockButton.textContent = locked ? 'UI LOCKED' : 'MOVE UI';
      lockButton.title = locked ? 'UI is locked. Tap to allow moving buttons.' : 'UI can move. Tap to lock button positions.';
      lockButton.setAttribute('aria-pressed', String(locked));
    }
    if (resetButton && Date.now() > resetConfirmUntil) {
      resetButton.textContent = 'RESET UI';
      resetButton.removeAttribute('data-confirm');
    }
    if (statusEl) statusEl.textContent = locked ? 'Draw safe' : 'Move buttons';
  }

  function setLocked(value){
    writeLocked(value);
    resetConfirmUntil = 0;
    syncControls();
    collectMetrics();
  }

  function requestResetUI(){
    const now = Date.now();
    if (now < resetConfirmUntil) {
      resetConfirmUntil = 0;
      resetUI();
      return;
    }
    resetConfirmUntil = now + RESET_CONFIRM_MS;
    if (resetButton) {
      resetButton.textContent = 'TAP AGAIN';
      resetButton.setAttribute('data-confirm', '1');
    }
    if (statusEl) statusEl.textContent = 'Confirm reset';
    setTimeout(syncControls, RESET_CONFIRM_MS + 20);
    collectMetrics();
  }

  function resetUI(){
    try {
      CLASSIC_RESET_KEYS.forEach(key => localStorage.removeItem(key));
      localStorage.setItem(LOCK_KEY, '0');
    } catch (_) {}
    locked = false;
    lastResetAt = Date.now();
    document.querySelectorAll('.node').forEach(node => {
      node.classList.remove('open', 'dragging', 'ui-active', 'ui-lock-held');
      node.style.left = '';
      node.style.top = '';
      node.style.right = '';
      node.style.bottom = '';
      node.style.transform = '';
      node.removeAttribute('data-manual-position');
      node.removeAttribute('data-ui-lock-snapshot');
    });
    syncControls();
    if (statusEl) statusEl.textContent = 'UI reset';
    setTimeout(syncControls, 1200);
    collectMetrics();
  }

  function snapshotNode(node){
    if (!node) return null;
    return {
      node,
      left: node.style.left || '',
      top: node.style.top || '',
      right: node.style.right || '',
      bottom: node.style.bottom || '',
      transform: node.style.transform || '',
      manual: node.getAttribute('data-manual-position'),
    };
  }

  function restoreSnapshot(snapshot){
    if (!snapshot || !snapshot.node) return;
    const node = snapshot.node;
    node.style.left = snapshot.left;
    node.style.top = snapshot.top;
    node.style.right = snapshot.right;
    node.style.bottom = snapshot.bottom;
    node.style.transform = snapshot.transform;
    if (snapshot.manual == null) node.removeAttribute('data-manual-position');
    else node.setAttribute('data-manual-position', snapshot.manual);
    node.classList.remove('dragging', 'ui-lock-held');
  }

  function installLockGate(){
    if (lockGateInstalled) return;
    lockGateInstalled = true;
    document.addEventListener('pointerdown', ev => {
      if (!locked) return;
      const orb = ev.target && ev.target.closest ? ev.target.closest('.node > .orb') : null;
      if (!orb) return;
      const node = orb.closest('.node');
      lockedPointerId = ev.pointerId;
      lockedNodeSnapshot = snapshotNode(node);
      if (node) node.classList.add('ui-lock-held');
    }, true);
    document.addEventListener('pointermove', ev => {
      if (!locked || lockedPointerId == null || ev.pointerId !== lockedPointerId) return;
      blockedMoves++;
      restoreSnapshot(lockedNodeSnapshot);
    }, true);
    const release = ev => {
      if (lockedPointerId != null && (ev.pointerId == null || ev.pointerId === lockedPointerId)) {
        restoreSnapshot(lockedNodeSnapshot);
        lockedPointerId = null;
        lockedNodeSnapshot = null;
      }
    };
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    document.addEventListener('lostpointercapture', release, true);
    window.addEventListener('blur', () => {
      restoreSnapshot(lockedNodeSnapshot);
      lockedPointerId = null;
      lockedNodeSnapshot = null;
    });
  }

  function collectMetrics(){
    metrics = {
      active: true,
      version: VERSION,
      locked,
      dockPresent: !!document.getElementById('inkframe-ui-classic-plus-dock'),
      lockTogglePresent: !!document.getElementById('inkframe-ui-lock-toggle'),
      resetPresent: !!document.getElementById('inkframe-ui-reset'),
      statusPresent: !!document.getElementById('inkframe-ui-plus-status'),
      resetConfirming: Date.now() < resetConfirmUntil,
      lastResetAt,
      blockedMoves,
      lockGate: lockGateInstalled,
      rootButtons: document.querySelectorAll('.node > .orb').length,
      childButtons: document.querySelectorAll('.kid,.branch').length,
      classicClass: document.body.classList.contains('inkframe-classic-ui'),
      plusClass: document.body.classList.contains('inkframe-classic-plus'),
      lockedClass: document.body.classList.contains('inkframe-ui-locked'),
    };
    root.__inkframeUIClassicPlusMetrics = metrics;
    return metrics;
  }

  function apply(){
    ensureStyle();
    ensureDock();
    installLockGate();
    syncControls();
    return collectMetrics();
  }

  function reportLines(){
    const m = metrics || root.__inkframeUIClassicPlusMetrics || collectMetrics();
    return [
      'UI Classic Plus: active',
      'UI Classic Plus version: ' + m.version,
      'UI Classic Plus locked: ' + (m.locked ? 'yes' : 'no'),
      'UI Classic Plus dock: ' + (m.dockPresent ? 'yes' : 'no'),
      'UI Classic Plus lock toggle: ' + (m.lockTogglePresent ? 'yes' : 'no'),
      'UI Classic Plus reset: ' + (m.resetPresent ? 'yes' : 'no'),
      'UI Classic Plus status: ' + (m.statusPresent ? 'yes' : 'no'),
      'UI Classic Plus reset confirming: ' + (m.resetConfirming ? 'yes' : 'no'),
      'UI Classic Plus lock gate: ' + (m.lockGate ? 'yes' : 'no'),
      'UI Classic Plus blocked moves: ' + m.blockedMoves,
      'UI Classic Plus root buttons: ' + m.rootButtons,
      'UI Classic Plus child buttons: ' + m.childButtons,
    ];
  }

  root.InkFrameUIClassicPlus = { apply, setLocked, resetUI, requestResetUI, metrics(){ return metrics || root.__inkframeUIClassicPlusMetrics || null; }, reportLines };
  ready(() => {
    apply();
    setTimeout(apply, 120);
    setTimeout(apply, 360);
  });
})(typeof window !== 'undefined' ? window : globalThis);
