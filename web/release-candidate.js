// InkFrame — Release Candidate Stability Guard
// -----------------------------------------------------------------------------
// Last-loaded safety layer for APK release candidates. It does not add features
// or take ownership of drawing. It keeps the canvas input path open, confirms the
// square/circle toggle is visible, keeps retired scrubber overlays non-blocking,
// and contributes a compact stability section to REPORT.
'use strict';

(function installInkFrameReleaseCandidate(root){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__inkframeReleaseCandidateInstalled) return;
  window.__inkframeReleaseCandidateInstalled = true;

  const VERSION = 'v1-stable-apk-guard';
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
      'canvas#c{pointer-events:auto!important;touch-action:none!important}',
      '#frameGlass{pointer-events:auto!important}',
      '#inkframe-timeline-scrubber-zone{pointer-events:none!important}',
      'body:not(.scrubbing-timeline) #inkframe-scrub-hud{pointer-events:none!important}',
      '#inkframe-circle-toggle{display:flex!important;visibility:visible!important;pointer-events:auto!important}',
      'body.inkframe-rc-stable #inkframe-circle-toggle{outline:0!important}',
      'body.inkframe-rc-stable #frameGlass{will-change:border-radius,clip-path,transform}',
      'body.inkframe-rc-stable canvas#c{will-change:transform}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureToggle(){
    const safe = root.InkFrameCircularTransformSafe;
    if (safe && typeof safe.apply === 'function') {
      try { safe.apply(); } catch (_) {}
    }
    return !!$('inkframe-circle-toggle');
  }

  function killBlockingScrubberOverlay(){
    const zone = $('inkframe-timeline-scrubber-zone');
    if (zone) {
      zone.style.pointerEvents = 'none';
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
    }
    if (frame) frame.style.pointerEvents = 'auto';
    return !!canvas && !!frame;
  }

  function collectMetrics(){
    const toggle = $('inkframe-circle-toggle');
    const canvas = $('c');
    const frame = $('frameGlass');
    const scrubberOverlay = $('inkframe-timeline-scrubber-zone');
    metrics = {
      active: true,
      version: VERSION,
      canvasPresent: !!canvas,
      framePresent: !!frame,
      canvasPointerEvents: canvas ? getComputedStyle(canvas).pointerEvents : 'missing',
      framePointerEvents: frame ? getComputedStyle(frame).pointerEvents : 'missing',
      circleTogglePresent: !!toggle,
      circleToggleLabel: toggle ? String(toggle.textContent || '').trim() : 'missing',
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
    canvasInputOpen();
    ensureToggle();
    killBlockingScrubberOverlay();
    collectMetrics();
  }

  function reportLines(){
    const m = metrics || root.__inkframeReleaseCandidateMetrics || collectMetrics();
    return [
      'Release Candidate: stable guard active',
      'Release Candidate version: ' + m.version,
      'Release Candidate canvas: ' + (m.canvasPresent ? 'present' : 'missing'),
      'Release Candidate frame shell: ' + (m.framePresent ? 'present' : 'missing'),
      'Release Candidate canvas pointer: ' + m.canvasPointerEvents,
      'Release Candidate circle toggle: ' + (m.circleTogglePresent ? m.circleToggleLabel : 'missing'),
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
