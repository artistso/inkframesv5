// InkFrame — Classic Plus Dock Corners
// -----------------------------------------------------------------------------
// Tiny ergonomic add-on for Classic Plus. Lets the small UI dock move between
// tablet-safe screen corners while preserving the original draggable orb system.
// This does not own drawing, canvas geometry, root-button drag, or tool state.
'use strict';

(function installInkFrameUIClassicDockCorners(root){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (root.__inkframeUIClassicDockCornersInstalled) return;
  root.__inkframeUIClassicDockCornersInstalled = true;

  const VERSION = 'v1-corner-dock';
  const CORNER_KEY = 'inkframe.ui.dockCorner.v1';
  const CORNERS = ['bottom-left', 'bottom-right', 'top-right', 'top-left'];
  const LABELS = {
    'bottom-left': 'BL',
    'bottom-right': 'BR',
    'top-right': 'TR',
    'top-left': 'TL',
  };
  const TITLES = {
    'bottom-left': 'Dock: bottom left. Tap to move to bottom right.',
    'bottom-right': 'Dock: bottom right. Tap to move to top right.',
    'top-right': 'Dock: top right. Tap to move to top left.',
    'top-left': 'Dock: top left. Tap to move to bottom left.',
  };

  let metrics = null;
  let cornerButton = null;
  let corner = readCorner();

  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function normalizeCorner(value){
    return CORNERS.includes(value) ? value : 'bottom-left';
  }

  function readCorner(){
    try { return normalizeCorner(localStorage.getItem(CORNER_KEY)); } catch (_) { return 'bottom-left'; }
  }

  function writeCorner(value){
    corner = normalizeCorner(value);
    try { localStorage.setItem(CORNER_KEY, corner); } catch (_) {}
  }

  function nextCorner(value){
    const current = normalizeCorner(value);
    return CORNERS[(CORNERS.indexOf(current) + 1) % CORNERS.length];
  }

  function ensureStyle(){
    if (document.getElementById('inkframe-ui-dock-corners-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-ui-dock-corners-style';
    style.textContent = [
      'body.inkframe-dock-corners{--inkframe-dock-corner:cornered}',
      '#inkframe-ui-classic-plus-dock[data-corner="bottom-left"]{left:max(12px,env(safe-area-inset-left))!important;right:auto!important;top:auto!important;bottom:max(12px,env(safe-area-inset-bottom))!important;flex-direction:row!important}',
      '#inkframe-ui-classic-plus-dock[data-corner="bottom-right"]{right:max(12px,env(safe-area-inset-right))!important;left:auto!important;top:auto!important;bottom:max(12px,env(safe-area-inset-bottom))!important;flex-direction:row-reverse!important}',
      '#inkframe-ui-classic-plus-dock[data-corner="top-right"]{right:max(12px,env(safe-area-inset-right))!important;left:auto!important;top:max(12px,env(safe-area-inset-top))!important;bottom:auto!important;flex-direction:row-reverse!important}',
      '#inkframe-ui-classic-plus-dock[data-corner="top-left"]{left:max(12px,env(safe-area-inset-left))!important;right:auto!important;top:max(12px,env(safe-area-inset-top))!important;bottom:auto!important;flex-direction:row!important}',
      '#inkframe-ui-dock-corner{min-width:34px!important;padding-inline:8px!important;opacity:.9}',
      '#inkframe-ui-dock-corner:active{transform:translateY(1px)}',
      'body.inkframe-dock-top #inkframe-ui-classic-plus-dock{filter:saturate(1.04)}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureDock(){
    const plus = root.InkFrameUIClassicPlus;
    if (plus && typeof plus.apply === 'function') {
      try { plus.apply(); } catch (_) {}
    }
    return document.getElementById('inkframe-ui-classic-plus-dock');
  }

  function ensureButton(dock){
    if (!dock) return null;
    let button = document.getElementById('inkframe-ui-dock-corner');
    if (!button) {
      button = document.createElement('button');
      button.id = 'inkframe-ui-dock-corner';
      button.type = 'button';
      button.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        cycleCorner();
      });
      dock.appendChild(button);
    }
    cornerButton = button;
    return button;
  }

  function applyCorner(value){
    writeCorner(value);
    const dock = ensureDock();
    if (!dock) return collectMetrics();
    document.body.classList.add('inkframe-dock-corners');
    document.body.classList.toggle('inkframe-dock-top', corner.startsWith('top-'));
    document.body.classList.toggle('inkframe-dock-right', corner.endsWith('-right'));
    dock.dataset.corner = corner;
    dock.setAttribute('data-corner', corner);
    const button = ensureButton(dock);
    if (button) {
      button.textContent = LABELS[corner] || 'BL';
      button.title = TITLES[corner] || 'Move dock corner.';
      button.setAttribute('aria-label', button.title);
    }
    return collectMetrics();
  }

  function cycleCorner(){
    return applyCorner(nextCorner(corner));
  }

  function resetCorner(){
    return applyCorner('bottom-left');
  }

  function collectMetrics(){
    const dock = document.getElementById('inkframe-ui-classic-plus-dock');
    const button = document.getElementById('inkframe-ui-dock-corner');
    const current = normalizeCorner((dock && dock.dataset.corner) || corner);
    metrics = {
      active: true,
      version: VERSION,
      dockPresent: !!dock,
      cornerButtonPresent: !!button,
      corner: current,
      dockTop: current.startsWith('top-'),
      dockRight: current.endsWith('-right'),
      bodyClass: document.body.classList.contains('inkframe-dock-corners'),
      persisted: readCorner(),
    };
    root.__inkframeUIClassicDockCornersMetrics = metrics;
    return metrics;
  }

  function reportLines(){
    const m = metrics || root.__inkframeUIClassicDockCornersMetrics || collectMetrics();
    return [
      'UI Classic Dock Corners: active',
      'UI Classic Dock Corners version: ' + m.version,
      'UI Classic Dock corner: ' + m.corner,
      'UI Classic Dock button: ' + (m.cornerButtonPresent ? 'yes' : 'no'),
      'UI Classic Dock top: ' + (m.dockTop ? 'yes' : 'no'),
      'UI Classic Dock right: ' + (m.dockRight ? 'yes' : 'no'),
    ];
  }

  root.InkFrameUIClassicDockCorners = {
    VERSION,
    apply: () => applyCorner(corner),
    applyCorner,
    cycleCorner,
    resetCorner,
    metrics(){ return metrics || root.__inkframeUIClassicDockCornersMetrics || null; },
    reportLines,
  };

  ready(() => {
    applyCorner(corner);
    setTimeout(() => applyCorner(corner), 140);
    setTimeout(() => applyCorner(corner), 420);
  });
})(typeof window !== 'undefined' ? window : globalThis);
