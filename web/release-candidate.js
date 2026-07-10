// InkFrame — Release Candidate Stability Guard
// -----------------------------------------------------------------------------
// Last-loaded safety layer for APK release candidates. It does not add features
// or take ownership of drawing. The stable publish path is square-canvas only and
// uses the original in-page button UI: circular canvas modules and experimental
// UI override modules remain in the repository for later backend/future work, but
// this guard keeps the current APK focused on reliable square-canvas input.
'use strict';

(function installInkFrameReleaseCandidate(root){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__inkframeReleaseCandidateInstalled) return;
  window.__inkframeReleaseCandidateInstalled = true;

  const VERSION = 'v5-classic-plus-safety-guard';
  let metrics = null;

  const $ = id => document.getElementById(id);
  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function ensureStyle(){
    if ($('inkframe-rc-stability-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-rc-stability-style';
    style.textContent = [
      'body.inkframe-rc-stable{--inkframe-canvas-mode:square}',
      'body.inkframe-rc-stable.circular-canvas{--inkframe-canvas-mode:square}',
      'canvas#c{pointer-events:auto!important;touch-action:none!important;border-radius:0!important;clip-path:none!important}',
      '#frameGlass{pointer-events:auto!important;border-radius:18px!important;clip-path:none!important;transform:none!important}',
      '#inkframe-timeline-scrubber-zone{pointer-events:none!important;display:none!important}',
      'body:not(.scrubbing-timeline) #inkframe-scrub-hud{pointer-events:none!important}',
      '#inkframe-circle-toggle{display:none!important;visibility:hidden!important;pointer-events:none!important}',
      'body.inkframe-rc-stable #frameGlass{will-change:auto}',
      'body.inkframe-rc-stable canvas#c{will-change:auto}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function enforceSquareMode(){
    document.body.classList.remove('circular-canvas', 'scrubbing-timeline', 'inkframe-transforming-circle');
    try { localStorage.setItem('inkframe.circularCanvas.v1', '0'); } catch (_) {}
    const toggle = $('inkframe-circle-toggle');
    if (toggle) {
      toggle.setAttribute('aria-hidden', 'true');
      toggle.tabIndex = -1;
    }
    const badge = $('inkframe-shape-badge');
    if (badge) badge.setAttribute('aria-hidden', 'true');
  }

  function restoreOriginalButtonUI(){
    const classic = root.InkFrameUIClassicRestore;
    if (classic && typeof classic.apply === 'function') {
      try { classic.apply(); } catch (_) {}
    }
    document.body.classList.remove(
      'inkframe-flat-controls',
      'inkframe-glass-ui',
      'inkframe-icon-polish',
      'inkframe-ui-layout',
      'inkframe-layout-focus',
      'inkframe-ui-dragging'
    );
    document.body.classList.add('inkframe-classic-ui');
    const classicPlus = root.InkFrameUIClassicPlus;
    if (classicPlus && typeof classicPlus.apply === 'function') {
      try { classicPlus.apply(); } catch (_) {}
    }
    ['inkframe-ui-map', 'inkframe-ui-context', 'inkframe-scrub-hud'].forEach(id => {
      const el = $(id);
      if (el) {
        el.style.pointerEvents = 'none';
        el.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function killBlockingScrubberOverlay(){
    const zone = $('inkframe-timeline-scrubber-zone');
    if (zone) {
      zone.style.pointerEvents = 'none';
      zone.style.display = 'none';
      zone.setAttribute('aria-hidden', 'true');
    }
    return !!zone;
  }

  function canvasInputOpen(){
    const canvas = $('c');
    const frame = $('frameGlass');
    if (canvas) {
      canvas.style.pointerEvents = 'auto';
      canvas.style.touchAction = 'none';
      canvas.style.borderRadius = '0';
      canvas.style.clipPath = 'none';
      canvas.style.transform = '';
    }
    if (frame) {
      frame.style.pointerEvents = 'auto';
      frame.style.clipPath = 'none';
      frame.style.transform = '';
    }
    return !!canvas && !!frame;
  }

  function collectMetrics(){
    const canvas = $('c');
    const frame = $('frameGlass');
    const scrubberOverlay = $('inkframe-timeline-scrubber-zone');
    const toggle = $('inkframe-circle-toggle');
    const plusMetrics = root.InkFrameUIClassicPlus && typeof root.InkFrameUIClassicPlus.metrics === 'function'
      ? root.InkFrameUIClassicPlus.metrics()
      : null;
    metrics = {
      active: true,
      version: VERSION,
      canvasMode: 'square',
      canvasPresent: !!canvas,
      framePresent: !!frame,
      canvasPointerEvents: canvas ? getComputedStyle(canvas).pointerEvents : 'missing',
      framePointerEvents: frame ? getComputedStyle(frame).pointerEvents : 'missing',
      circleFrontendLoaded: !!root.InkFrameCircularCanvas || !!root.InkFrameCircularTransformSafe,
      circleTogglePresent: !!toggle,
      circleToggleVisible: toggle ? getComputedStyle(toggle).display !== 'none' && getComputedStyle(toggle).visibility !== 'hidden' : false,
      circularMode: document.body.classList.contains('circular-canvas'),
      scrubberLoaded: !!root.InkFrameCircularScrubber,
      scrubberOverlayPresent: !!scrubberOverlay,
      scrubberOverlayPointerEvents: scrubberOverlay ? getComputedStyle(scrubberOverlay).pointerEvents : 'none',
      brushEngine: !!root.InkFrameBrushEngine,
      brushDynamics: !!root.InkFrameBrushDynamics,
      vectorEngine: !!root.InkFrameVectorEngine,
      classicUI: !!root.InkFrameUIClassicRestore || document.body.classList.contains('inkframe-classic-ui'),
      classicPlus: !!root.InkFrameUIClassicPlus || document.body.classList.contains('inkframe-classic-plus'),
      uiLockToggle: !!$('inkframe-ui-lock-toggle'),
      uiReset: !!$('inkframe-ui-reset'),
      uiStatus: !!$('inkframe-ui-plus-status'),
      uiLocked: document.body.classList.contains('inkframe-ui-locked'),
      uiLockGate: !!(plusMetrics && plusMetrics.lockGate),
      uiResetConfirming: !!(plusMetrics && plusMetrics.resetConfirming),
      uiBlockedMoves: plusMetrics ? plusMetrics.blockedMoves : 0,
      flatControls: !!root.InkFrameUIFlatControls || document.body.classList.contains('inkframe-flat-controls'),
      glassControls: !!root.InkFrameUIGlass || document.body.classList.contains('inkframe-glass-ui'),
      layoutOverride: !!root.InkFrameUILayout || document.body.classList.contains('inkframe-ui-layout'),
      iconPolish: !!root.InkFrameUIIconPolish || document.body.classList.contains('inkframe-icon-polish'),
    };
    root.__inkframeReleaseCandidateMetrics = metrics;
    return metrics;
  }

  function apply(){
    ensureStyle();
    document.body.classList.add('inkframe-rc-stable');
    enforceSquareMode();
    restoreOriginalButtonUI();
    canvasInputOpen();
    killBlockingScrubberOverlay();
    collectMetrics();
  }

  function reportLines(){
    const m = metrics || root.__inkframeReleaseCandidateMetrics || collectMetrics();
    return [
      'Release Candidate: stable guard active',
      'Release Candidate version: ' + m.version,
      'Release Candidate canvas mode: ' + m.canvasMode,
      'Release Candidate canvas: ' + (m.canvasPresent ? 'present' : 'missing'),
      'Release Candidate frame shell: ' + (m.framePresent ? 'present' : 'missing'),
      'Release Candidate canvas pointer: ' + m.canvasPointerEvents,
      'Release Candidate circular frontend loaded: ' + (m.circleFrontendLoaded ? 'yes' : 'no'),
      'Release Candidate circle toggle visible: ' + (m.circleToggleVisible ? 'yes' : 'no'),
      'Release Candidate circular mode: ' + (m.circularMode ? 'circle' : 'square'),
      'Release Candidate scrubber loaded: ' + (m.scrubberLoaded ? 'yes' : 'no'),
      'Release Candidate scrubber overlay pointer: ' + m.scrubberOverlayPointerEvents,
      'Release Candidate brush engine: ' + (m.brushEngine ? 'yes' : 'no'),
      'Release Candidate brush dynamics: ' + (m.brushDynamics ? 'yes' : 'no'),
      'Release Candidate vector engine: ' + (m.vectorEngine ? 'yes' : 'no'),
      'Release Candidate classic UI: ' + (m.classicUI ? 'yes' : 'no'),
      'Release Candidate classic plus: ' + (m.classicPlus ? 'yes' : 'no'),
      'Release Candidate UI lock toggle: ' + (m.uiLockToggle ? 'yes' : 'no'),
      'Release Candidate UI reset: ' + (m.uiReset ? 'yes' : 'no'),
      'Release Candidate UI status: ' + (m.uiStatus ? 'yes' : 'no'),
      'Release Candidate UI locked: ' + (m.uiLocked ? 'yes' : 'no'),
      'Release Candidate UI lock gate: ' + (m.uiLockGate ? 'yes' : 'no'),
      'Release Candidate UI reset confirming: ' + (m.uiResetConfirming ? 'yes' : 'no'),
      'Release Candidate UI blocked moves: ' + m.uiBlockedMoves,
      'Release Candidate flat controls: ' + (m.flatControls ? 'yes' : 'no'),
      'Release Candidate glass controls: ' + (m.glassControls ? 'yes' : 'no'),
      'Release Candidate layout override: ' + (m.layoutOverride ? 'yes' : 'no'),
      'Release Candidate icon polish: ' + (m.iconPolish ? 'yes' : 'no')
    ];
  }

  function bridgeIntoTesterReport(){
    if (root.__inkframeReleaseCandidateReportBridge) return;
    const circular = root.InkFrameCircularCanvas;
    if (!circular || typeof circular.reportLines !== 'function') return;
    const originalReportLines = circular.reportLines.bind(circular);
    root.__inkframeReleaseCandidateReportBridge = true;
    circular.reportLines = function bridgedReleaseCandidateReport(){
      let lines = [];
      try {
        const original = originalReportLines();
        if (Array.isArray(original)) lines = lines.concat(original.map(String));
      } catch (e) {
        lines.push('Release Candidate: upstream report error');
      }
      try {
        lines = lines.concat(reportLines().map(String));
      } catch (e) {
        lines.push('Release Candidate: report error');
      }
      return lines;
    };
  }

  function boot(){
    apply();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => setTimeout(apply, 30)).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    }
    window.addEventListener('resize', () => setTimeout(apply, 60));
    window.addEventListener('orientationchange', () => setTimeout(apply, 240));
    for (let i = 1; i <= 12; i++) setTimeout(apply, i * 240);
    for (let i = 1; i <= 10; i++) setTimeout(bridgeIntoTesterReport, i * 260);
    bridgeIntoTesterReport();
  }

  root.InkFrameReleaseCandidate = {
    apply,
    metrics(){ return metrics || root.__inkframeReleaseCandidateMetrics || null; },
    reportLines,
  };

  ready(boot);
})(typeof window !== 'undefined' ? window : globalThis);
