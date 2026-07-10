// InkFrame — Classic Plus UI Size Control
// -----------------------------------------------------------------------------
// Small release-stable add-on for the original orb UI. Cycles button size between
// normal, large, and compact for tablet ergonomics without changing drawing,
// tool state, button movement, or child-button layout ownership.
'use strict';

(function installInkFrameUIClassicSize(root){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (root.__inkframeUIClassicSizeInstalled) return;
  root.__inkframeUIClassicSizeInstalled = true;

  const VERSION = 'v1-classic-ui-size-cycle';
  const SIZE_KEY = 'inkframe.ui.size.v1';
  const SIZES = ['normal', 'large', 'compact'];
  const LABELS = { normal: 'SIZE N', large: 'SIZE L', compact: 'SIZE S' };
  let metrics = null;
  let button = null;
  let size = readSize();

  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function readSize(){
    try {
      const stored = localStorage.getItem(SIZE_KEY);
      return SIZES.includes(stored) ? stored : 'normal';
    } catch (_) {
      return 'normal';
    }
  }

  function writeSize(next){
    size = SIZES.includes(next) ? next : 'normal';
    try { localStorage.setItem(SIZE_KEY, size); } catch (_) {}
  }

  function ensureStyle(){
    if (document.getElementById('inkframe-ui-classic-size-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-ui-classic-size-style';
    style.textContent = [
      'body.inkframe-ui-size-normal{--ink-orb-size:58px;--ink-kid-size:48px;--ink-kids-origin:29px;--ink-kid-margin:-24px;--ink-root-label-top:62px;--ink-child-label-top:50px}',
      'body.inkframe-ui-size-large{--ink-orb-size:66px;--ink-kid-size:54px;--ink-kids-origin:33px;--ink-kid-margin:-27px;--ink-root-label-top:70px;--ink-child-label-top:56px}',
      'body.inkframe-ui-size-compact{--ink-orb-size:50px;--ink-kid-size:42px;--ink-kids-origin:25px;--ink-kid-margin:-21px;--ink-root-label-top:54px;--ink-child-label-top:44px}',
      'body.inkframe-classic-ui .orb{width:var(--ink-orb-size,58px)!important;height:var(--ink-orb-size,58px)!important}',
      'body.inkframe-classic-ui .kid,body.inkframe-classic-ui .branch{width:var(--ink-kid-size,48px)!important;height:var(--ink-kid-size,48px)!important;margin:var(--ink-kid-margin,-24px) 0 0 var(--ink-kid-margin,-24px)!important}',
      'body.inkframe-classic-ui .kids{left:var(--ink-kids-origin,29px)!important;top:var(--ink-kids-origin,29px)!important}',
      'body.inkframe-classic-ui .orb .lbl{top:var(--ink-root-label-top,62px)!important}',
      'body.inkframe-classic-ui .kid .sub,body.inkframe-classic-ui .branch .sub{top:var(--ink-child-label-top,50px)!important}',
      '#inkframe-ui-size-toggle{min-width:58px}',
      'body.inkframe-ui-size-large #inkframe-ui-size-toggle{background:rgba(187,0,55,.34);border-color:rgba(255,240,243,.52)}',
      'body.inkframe-ui-size-compact #inkframe-ui-size-toggle{background:rgba(20,0,14,.46);opacity:.86}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function plusDock(){
    return document.getElementById('inkframe-ui-classic-plus-dock');
  }

  function ensureButton(){
    const dock = plusDock();
    if (!dock) return null;
    if (!button) {
      button = document.createElement('button');
      button.id = 'inkframe-ui-size-toggle';
      button.type = 'button';
      button.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        cycleSize();
      });
    }
    const reset = document.getElementById('inkframe-ui-reset');
    if (reset && reset.parentElement === dock && button.parentElement !== dock) {
      dock.insertBefore(button, reset);
    } else if (!button.parentElement) {
      dock.appendChild(button);
    }
    syncButton();
    return button;
  }

  function applySizeClass(){
    document.body.classList.remove('inkframe-ui-size-normal', 'inkframe-ui-size-large', 'inkframe-ui-size-compact');
    document.body.classList.add('inkframe-ui-size-' + size);
    document.body.dataset.inkframeUiSize = size;
  }

  function syncButton(){
    if (!button) return;
    button.textContent = LABELS[size] || LABELS.normal;
    button.title = 'Classic UI size: ' + size + '. Tap to cycle normal, large, compact.';
    button.setAttribute('aria-label', 'Classic UI size ' + size);
    button.dataset.uiSize = size;
  }

  function setSize(next){
    writeSize(next);
    applySizeClass();
    syncButton();
    collectMetrics();
  }

  function cycleSize(){
    const index = SIZES.indexOf(size);
    setSize(SIZES[(index + 1) % SIZES.length]);
  }

  function collectMetrics(){
    metrics = {
      active: true,
      version: VERSION,
      size,
      buttonPresent: !!document.getElementById('inkframe-ui-size-toggle'),
      largeClass: document.body.classList.contains('inkframe-ui-size-large'),
      normalClass: document.body.classList.contains('inkframe-ui-size-normal'),
      compactClass: document.body.classList.contains('inkframe-ui-size-compact'),
    };
    root.__inkframeUIClassicSizeMetrics = metrics;
    return metrics;
  }

  function apply(){
    ensureStyle();
    applySizeClass();
    ensureButton();
    return collectMetrics();
  }

  function reportLines(){
    const m = metrics || root.__inkframeUIClassicSizeMetrics || collectMetrics();
    return [
      'UI Classic Size: active',
      'UI Classic Size version: ' + m.version,
      'UI Classic Size value: ' + m.size,
      'UI Classic Size button: ' + (m.buttonPresent ? 'yes' : 'no'),
      'UI Classic Size normal class: ' + (m.normalClass ? 'yes' : 'no'),
      'UI Classic Size large class: ' + (m.largeClass ? 'yes' : 'no'),
      'UI Classic Size compact class: ' + (m.compactClass ? 'yes' : 'no'),
    ];
  }

  root.InkFrameUIClassicSize = { apply, setSize, cycleSize, metrics(){ return metrics || root.__inkframeUIClassicSizeMetrics || null; }, reportLines };
  ready(() => {
    apply();
    setTimeout(apply, 160);
    setTimeout(apply, 420);
  });
})(typeof window !== 'undefined' ? window : globalThis);
