// InkFrame — Classic Plus UI Controls
// -----------------------------------------------------------------------------
// A tiny release-stable layer on top of the original draggable orb UI. It keeps
// original movement and expansion behavior, but adds practical tablet controls:
// UI lock, UI reset, drag-safe styling, and diagnostics. It does not own drawing,
// canvas geometry, tool state, or child-button layout.
'use strict';

(function installInkFrameUIClassicPlus(root){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (root.__inkframeUIClassicPlusInstalled) return;
  root.__inkframeUIClassicPlusInstalled = true;

  const VERSION = 'v1-ui-lock-reset';
  const LOCK_KEY = 'inkframe.ui.locked.v1';
  const CLASSIC_RESET_KEYS = [
    'inkframe.ui.rootPositions.v1',
    'inkframe.ui.focus.v1',
    'inkframe.ui.layout.v1',
  ];
  let metrics = null;
  let lockButton = null;
  let resetButton = null;
  let locked = readLocked();

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
      'body.inkframe-classic-plus .orb{outline:0!important}',
      'body.inkframe-classic-plus .orb:before{content:"";position:absolute;inset:-10px;border-radius:50%;pointer-events:none}',
      'body.inkframe-classic-plus .node{touch-action:none!important}',
      'body.inkframe-classic-plus .node.dragging>.orb{transform:scale(1.035)}',
      'body.inkframe-classic-plus .kid,body.inkframe-classic-plus .branch{touch-action:manipulation!important}',
      'body.inkframe-ui-locked .orb{cursor:pointer!important}',
      'body.inkframe-ui-locked .node:not(.open)>.orb{box-shadow:var(--shadow),0 0 0 1px rgba(255,240,243,.22),inset 0 1px 0 var(--rim)!important}',
      'body.inkframe-ui-locked .node.dragging>.orb{transform:none!important}',
      '#inkframe-ui-classic-plus-dock{position:fixed;left:12px;bottom:12px;z-index:64;display:flex;gap:8px;align-items:center;pointer-events:auto}',
      '#inkframe-ui-classic-plus-dock button{min-height:32px;padding:7px 10px;border-radius:999px;border:1px solid rgba(247,202,201,.34);background:rgba(20,0,14,.56);color:#fff0f3;font:800 10px/1 system-ui,sans-serif;letter-spacing:.11em;text-transform:uppercase;box-shadow:0 5px 14px rgba(10,0,10,.25),inset 0 1px 0 rgba(255,255,255,.13);backdrop-filter:blur(10px) saturate(125%);-webkit-backdrop-filter:blur(10px) saturate(125%)}',
      '#inkframe-ui-lock-toggle[aria-pressed="true"]{background:rgba(187,0,55,.42);border-color:rgba(255,240,243,.58)}',
      '#inkframe-ui-reset{opacity:.84}',
      '#inkframe-ui-reset:active,#inkframe-ui-lock-toggle:active{transform:translateY(1px)}'
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
      resetButton.title = 'Reset floating button placement only. Artwork is not cleared.';
      resetButton.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        resetUI();
      });
      dock.appendChild(resetButton);
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
  }

  function setLocked(value){
    writeLocked(value);
    syncControls();
    collectMetrics();
  }

  function resetUI(){
    try {
      CLASSIC_RESET_KEYS.forEach(key => localStorage.removeItem(key));
      localStorage.setItem(LOCK_KEY, '0');
    } catch (_) {}
    locked = false;
    document.querySelectorAll('.node').forEach(node => {
      node.classList.remove('open', 'dragging', 'ui-active');
      node.style.left = '';
      node.style.top = '';
      node.style.right = '';
      node.style.bottom = '';
      node.style.transform = '';
      node.removeAttribute('data-manual-position');
    });
    syncControls();
    collectMetrics();
  }

  function installLockGate(){
    if (root.__inkframeUIClassicPlusLockGate) return;
    root.__inkframeUIClassicPlusLockGate = true;
    document.addEventListener('pointermove', ev => {
      if (!locked) return;
      const orb = ev.target && ev.target.closest ? ev.target.closest('.node > .orb') : null;
      if (!orb) return;
      const node = orb.closest('.node');
      if (node) node.classList.remove('dragging');
    }, true);
  }

  function collectMetrics(){
    metrics = {
      active: true,
      version: VERSION,
      locked,
      dockPresent: !!document.getElementById('inkframe-ui-classic-plus-dock'),
      lockTogglePresent: !!document.getElementById('inkframe-ui-lock-toggle'),
      resetPresent: !!document.getElementById('inkframe-ui-reset'),
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
      'UI Classic Plus root buttons: ' + m.rootButtons,
      'UI Classic Plus child buttons: ' + m.childButtons,
    ];
  }

  root.InkFrameUIClassicPlus = { apply, setLocked, resetUI, metrics(){ return metrics || root.__inkframeUIClassicPlusMetrics || null; }, reportLines };
  ready(() => {
    apply();
    setTimeout(apply, 120);
    setTimeout(apply, 360);
  });
})(typeof window !== 'undefined' ? window : globalThis);
