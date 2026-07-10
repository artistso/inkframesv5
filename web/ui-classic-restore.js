// InkFrame — Classic Draggable Button Restore
// -----------------------------------------------------------------------------
// Release-stable UI layer that restores the original smooth draggable orb system.
// It does not own dragging, expansion, tool state, or layout. It only removes the
// later experimental override classes/storage and reinforces the original round
// orb/kid button presentation from index.html.
'use strict';

(function installInkFrameUIClassicRestore(root){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (root.__inkframeUIClassicRestoreInstalled) return;
  root.__inkframeUIClassicRestoreInstalled = true;

  const VERSION = 'v2-original-orb-ui-polish';
  const LAYOUT_STORAGE_KEYS = [
    'inkframe.ui.rootPositions.v1',
    'inkframe.ui.focus.v1',
    'inkframe.ui.layout.v1',
  ];
  let metrics = null;
  let pointerWatchInstalled = false;

  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function ensureStyle(){
    if (document.getElementById('inkframe-ui-classic-restore-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-ui-classic-restore-style';
    style.textContent = [
      'body.inkframe-classic-ui{--inkframe-ui-mode:classic-original-orbs}',
      'body.inkframe-classic-ui .node{position:fixed!important;z-index:20!important;will-change:transform!important;contain:layout style!important}',
      'body.inkframe-classic-ui .node.dragging{z-index:44!important}',
      'body.inkframe-classic-ui .orb{width:58px!important;height:58px!important;border-radius:50%!important;cursor:grab!important;touch-action:none!important;display:flex!important;align-items:center!important;justify-content:center!important;transition:box-shadow .20s ease,transform .10s ease,background .18s ease,filter .18s ease!important;backface-visibility:hidden!important;transform:translateZ(0)!important}',
      'body.inkframe-classic-ui .orb:active{cursor:grabbing!important}',
      'body.inkframe-classic-ui .node.dragging>.orb,body.inkframe-classic-ui .node.dragging .orb{transform:translateZ(0) scale(1.035)!important;filter:saturate(1.08)!important}',
      'body.inkframe-classic-ui .node.open>.orb{transform:translateZ(0) scale(1.02)!important}',
      'body.inkframe-classic-ui .kid,body.inkframe-classic-ui .branch{width:48px!important;height:48px!important;margin:-24px 0 0 -24px!important;border-radius:50%!important;display:flex!important;align-items:center!important;justify-content:center!important;touch-action:manipulation!important;transition:transform .32s cubic-bezier(.2,.95,.25,1.1),opacity .22s ease,box-shadow .18s ease!important;backface-visibility:hidden!important}',
      'body.inkframe-classic-ui .kids{position:absolute!important;left:29px!important;top:29px!important;width:0!important;height:0!important;z-index:-1!important}',
      'body.inkframe-classic-ui .orb::before{content:""!important;position:absolute!important;inset:-8px!important;border-radius:50%!important;pointer-events:none!important;background:transparent!important}',
      'body.inkframe-classic-ui .orb::after{content:""!important;position:absolute!important;inset:0!important;border-radius:50%!important;pointer-events:none!important;background:radial-gradient(circle at 50% 42%,rgba(20,0,14,.34),rgba(20,0,14,0) 72%)!important;box-shadow:none!important}',
      'body.inkframe-classic-ui .kid::after,body.inkframe-classic-ui .branch::after{content:""!important;position:absolute!important;inset:0!important;border-radius:50%!important;pointer-events:none!important;background:radial-gradient(circle at 50% 42%,rgba(20,0,14,.30),rgba(20,0,14,0) 72%)!important;box-shadow:none!important}',
      'body.inkframe-classic-ui .orb .glyph,body.inkframe-classic-ui .kid .glyph,body.inkframe-classic-ui .branch .glyph{position:relative!important;z-index:1!important;text-shadow:0 1px 3px rgba(0,0,0,.6),0 0 10px rgba(0,0,0,.35)!important}',
      'body.inkframe-classic-ui .orb .lbl{display:block!important;top:62px!important;opacity:1!important}',
      'body.inkframe-classic-ui .node.open>.orb .lbl{opacity:0!important}',
      'body.inkframe-classic-ui .kid .sub,body.inkframe-classic-ui .branch .sub{display:block!important;opacity:1!important;top:50px!important}',
      'body.inkframe-classic-ui .node.ui-pointer-down>.orb{transform:translateZ(0) scale(.985)!important}',
      'body.inkframe-classic-ui .kid.ui-pointer-down,body.inkframe-classic-ui .branch.ui-pointer-down{transform:translate(var(--dx,0),var(--dy,0)) scale(.96)!important}',
      'body.inkframe-classic-ui .node.open>.kids>.kid.ui-pointer-down,body.inkframe-classic-ui .branch.open>.kids>.kid.ui-pointer-down{transform:translate(var(--dx,0),var(--dy,0)) scale(.96)!important}',
      'body.inkframe-classic-ui #inkframe-ui-map,body.inkframe-classic-ui #inkframe-ui-context,body.inkframe-classic-ui #inkframe-scrub-hud{display:none!important;pointer-events:none!important}',
      'body.inkframe-classic-ui #inkframe-circle-toggle{display:none!important;pointer-events:none!important;visibility:hidden!important}',
      'body.inkframe-classic-ui *{-webkit-tap-highlight-color:transparent!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function removeOverrideClasses(){
    document.body.classList.remove(
      'inkframe-flat-controls',
      'inkframe-glass-ui',
      'inkframe-icon-polish',
      'inkframe-ui-layout',
      'inkframe-layout-focus',
      'inkframe-ui-dragging',
      'circular-canvas',
      'scrubbing-timeline',
      'inkframe-transforming-circle'
    );
    document.body.classList.add('inkframe-classic-ui');
  }

  function clearExperimentalLayoutState(){
    try {
      LAYOUT_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
      localStorage.setItem('inkframe.circularCanvas.v1', '0');
    } catch (_) {}
  }

  function removeHelperOverlays(){
    ['inkframe-ui-map', 'inkframe-ui-context', 'inkframe-scrub-hud', 'inkframe-timeline-scrubber-zone', 'inkframe-circle-toggle', 'inkframe-shape-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.pointerEvents = 'none';
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    });
  }

  function markClassicControls(){
    document.querySelectorAll('.node').forEach((node, index) => {
      node.dataset.uiClassic = 'root';
      node.dataset.uiClassicIndex = String(index);
      const orb = node.querySelector(':scope > .orb');
      if (orb) {
        orb.dataset.uiClassic = 'orb';
        orb.setAttribute('draggable', 'false');
      }
    });
    document.querySelectorAll('.kid,.branch').forEach(control => {
      control.dataset.uiClassic = control.classList.contains('branch') ? 'branch' : 'kid';
      control.setAttribute('draggable', 'false');
    });
  }

  function installPointerWatch(){
    if (pointerWatchInstalled) return;
    pointerWatchInstalled = true;
    const clearPressed = () => document.querySelectorAll('.ui-pointer-down').forEach(el => el.classList.remove('ui-pointer-down'));
    document.addEventListener('pointerdown', ev => {
      const target = ev.target && ev.target.closest ? ev.target.closest('.orb,.kid,.branch') : null;
      if (!target) return;
      target.classList.add('ui-pointer-down');
      const node = target.closest('.node');
      if (node && target.classList.contains('orb')) node.classList.add('ui-pointer-down');
    }, true);
    document.addEventListener('pointerup', clearPressed, true);
    document.addEventListener('pointercancel', clearPressed, true);
    document.addEventListener('lostpointercapture', clearPressed, true);
    window.addEventListener('blur', clearPressed);
  }

  function collectMetrics(){
    metrics = {
      active: true,
      version: VERSION,
      rootButtons: document.querySelectorAll('.node > .orb').length,
      childButtons: document.querySelectorAll('.kid,.branch').length,
      classicMarkedRoots: document.querySelectorAll('.node[data-ui-classic="root"]').length,
      flatClass: document.body.classList.contains('inkframe-flat-controls'),
      glassClass: document.body.classList.contains('inkframe-glass-ui'),
      layoutClass: document.body.classList.contains('inkframe-ui-layout'),
      iconPolishClass: document.body.classList.contains('inkframe-icon-polish'),
      classicClass: document.body.classList.contains('inkframe-classic-ui'),
      pointerWatch: pointerWatchInstalled,
    };
    root.__inkframeUIClassicRestoreMetrics = metrics;
    return metrics;
  }

  function apply(){
    ensureStyle();
    removeOverrideClasses();
    clearExperimentalLayoutState();
    removeHelperOverlays();
    markClassicControls();
    installPointerWatch();
    return collectMetrics();
  }

  function reportLines(){
    const m = metrics || root.__inkframeUIClassicRestoreMetrics || collectMetrics();
    return [
      'UI Classic Restore: active',
      'UI Classic Restore version: ' + m.version,
      'UI Classic root buttons: ' + m.rootButtons,
      'UI Classic child buttons: ' + m.childButtons,
      'UI Classic marked roots: ' + m.classicMarkedRoots,
      'UI Classic pointer watch: ' + (m.pointerWatch ? 'yes' : 'no'),
      'UI Classic class: ' + (m.classicClass ? 'yes' : 'no'),
      'UI Classic flat class: ' + (m.flatClass ? 'yes' : 'no'),
      'UI Classic glass class: ' + (m.glassClass ? 'yes' : 'no'),
      'UI Classic layout class: ' + (m.layoutClass ? 'yes' : 'no'),
      'UI Classic icon polish class: ' + (m.iconPolishClass ? 'yes' : 'no')
    ];
  }

  function boot(){
    apply();
    setTimeout(apply, 80);
    setTimeout(apply, 320);
  }

  root.InkFrameUIClassicRestore = { apply, metrics(){ return metrics || root.__inkframeUIClassicRestoreMetrics || null; }, reportLines };
  ready(boot);
})(typeof window !== 'undefined' ? window : globalThis);
