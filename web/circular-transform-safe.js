// InkFrame — Safe Circular Transform Controls
// -----------------------------------------------------------------------------
// Safety patch for the square-to-circle canvas transformation. It does not own
// circular geometry and it does not intercept drawing. It keeps the mode toggle
// visible, fixes the target-action label, and gives the square/circle transition
// a clearer Samsung-watch-style transform feeling.
'use strict';

(function installCircularTransformSafe(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeCircularTransformSafe) return;
  window.__inkframeCircularTransformSafe = true;

  const VERSION = 'v1-safe-watch-transform';
  let metrics = null;

  const $ = id => document.getElementById(id);
  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function ensureStyle(){
    if ($('inkframe-circular-transform-safe-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-circular-transform-safe-style';
    style.textContent = [
      '#inkframe-circle-toggle{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;z-index:2147483647!important}',
      'body.circular-canvas #frameGlass,body.circular-canvas canvas#c{transition:border-radius .42s cubic-bezier(.2,.9,.22,1),clip-path .42s cubic-bezier(.2,.9,.22,1),box-shadow .28s ease,transform .28s ease!important}',
      'body:not(.circular-canvas) #frameGlass,body:not(.circular-canvas) canvas#c{transition:border-radius .42s cubic-bezier(.2,.9,.22,1),clip-path .42s cubic-bezier(.2,.9,.22,1),box-shadow .28s ease,transform .28s ease!important}',
      'body.circular-canvas #frameGlass{transform:scale(.992)}',
      'body.circular-canvas canvas#c{transform:scale(.996)}',
      'body.circular-canvas #inkframe-shape-badge::after{content:" · watch transform"}',
      'body.inkframe-transforming-circle #frameGlass{box-shadow:0 0 0 2px rgba(255,240,243,.34),0 22px 76px rgba(20,0,14,.70),0 0 42px rgba(187,0,55,.24)!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function fixToggle(){
    const btn = $('inkframe-circle-toggle');
    const circular = document.body.classList.contains('circular-canvas');
    if (!btn) return false;
    // Label is the target action, not the current state.
    btn.textContent = circular ? 'SQUARE' : 'CIRCLE';
    btn.setAttribute('aria-pressed', String(circular));
    btn.setAttribute('aria-label', circular ? 'Return canvas to square mode' : 'Transform canvas to circular watch mode');
    btn.title = circular ? 'Return to square canvas' : 'Transform to circular watch canvas';
    return true;
  }

  function collectMetrics(){
    metrics = {
      active: true,
      version: VERSION,
      circular: document.body.classList.contains('circular-canvas'),
      togglePresent: !!$('inkframe-circle-toggle'),
      scrubberLoaded: !!window.InkFrameCircularScrubber,
    };
    window.__inkframeCircularTransformSafeMetrics = metrics;
    return metrics;
  }

  function apply(){
    ensureStyle();
    fixToggle();
    collectMetrics();
  }

  function flashTransformCue(){
    document.body.classList.add('inkframe-transforming-circle');
    setTimeout(() => document.body.classList.remove('inkframe-transforming-circle'), 480);
  }

  function wireToggleWatch(){
    document.addEventListener('click', ev => {
      const target = ev.target && ev.target.closest ? ev.target.closest('#inkframe-circle-toggle') : null;
      if (!target) return;
      setTimeout(() => { fixToggle(); flashTransformCue(); collectMetrics(); }, 30);
      setTimeout(() => { fixToggle(); collectMetrics(); }, 240);
    }, true);
  }

  function reportLines(){
    const m = metrics || window.__inkframeCircularTransformSafeMetrics || collectMetrics();
    return [
      'Circular Transform Safe: active',
      'Circular Transform version: ' + m.version,
      'Circular Transform mode: ' + (m.circular ? 'circle' : 'square'),
      'Circular Transform toggle: ' + (m.togglePresent ? 'visible' : 'missing'),
      'Circular Transform scrubber loaded: ' + (m.scrubberLoaded ? 'yes' : 'no')
    ];
  }

  function bridgeIntoTesterReport(){
    if (window.__inkframeCircularTransformSafeReportBridge) return;
    const circular = window.InkFrameCircularCanvas;
    if (!circular || typeof circular.reportLines !== 'function') return;
    const originalReportLines = circular.reportLines.bind(circular);
    window.__inkframeCircularTransformSafeReportBridge = true;
    circular.reportLines = function bridgedCircularTransformReport(){
      let lines = [];
      try {
        const original = originalReportLines();
        if (Array.isArray(original)) lines = lines.concat(original.map(String));
      } catch (e) {
        lines.push('Circular Canvas: report error');
      }
      try {
        lines = lines.concat(reportLines().map(String));
      } catch (e) {
        lines.push('Circular Transform Safe: report error');
      }
      return lines;
    };
  }

  function boot(){
    apply();
    wireToggleWatch();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => setTimeout(apply, 20)).observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    }
    for (let i = 1; i <= 10; i++) setTimeout(apply, i * 220);
    for (let i = 1; i <= 10; i++) setTimeout(bridgeIntoTesterReport, i * 250);
    bridgeIntoTesterReport();
  }

  window.InkFrameCircularTransformSafe = { apply, metrics(){ return metrics || window.__inkframeCircularTransformSafeMetrics || null; }, reportLines };
  ready(boot);
})();
