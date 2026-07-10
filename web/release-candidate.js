// InkFrame — Release Candidate Stability Guard
// -----------------------------------------------------------------------------
// Last-loaded safety layer for APK release candidates. It does not add features
// or take ownership of drawing. The stable publish path is square-canvas only:
// circular canvas modules remain in the repository for later backend/future work,
// but this guard keeps the current APK focused on reliable square-canvas input.
'use strict';

(function installInkFrameReleaseCandidate(root){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__inkframeReleaseCandidateInstalled) return;
  window.__inkframeReleaseCandidateInstalled = true;

  const VERSION = 'v2-square-canvas-stable-guard';
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
      flatControls: !!root.InkFrameUIFlatControls,
    };
    root.__inkframeReleaseCandidateMetrics = metrics;
    return metrics;
  }

  function apply(){
    ensureStyle();
    document.body.classList.add('inkframe-rc-stable');
    enforceSquareMode();
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
      'Release Candidate flat controls: ' + (m.flatControls ? 'yes' : 'no')
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
    for (let i = 1; i <= 8; i++) setTimeout(apply, i * 240);
    for (let i = 1; i <= 4; i++) setTimeout(bridgeIntoTesterReport, i * 260);
    bridgeIntoTesterReport();
  }

  root.InkFrameReleaseCandidate = {
    apply,
    metrics(){ return metrics || root.__inkframeReleaseCandidateMetrics || null; },
    reportLines,
  };

  ready(boot);
})(typeof window !== 'undefined' ? window : globalThis);
