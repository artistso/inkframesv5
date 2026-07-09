// InkFrame — Safe Circular Transform Controls
// -----------------------------------------------------------------------------
// Safety patch for the square-to-circle canvas transformation. It does not own
// circular geometry and it does not intercept drawing. It keeps the mode toggle
// visible, repairs it if the original control disappears, fixes the target-action
// label, and gives the square/circle transition a clearer Samsung-watch-style
// transform feeling.
'use strict';

(function installCircularTransformSafe(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeCircularTransformSafe) return;
  window.__inkframeCircularTransformSafe = true;

  const VERSION = 'v2-fallback-toggle-flat-transform';
  const KEY = 'inkframe.circularCanvas.v1';
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
      '#inkframe-circle-toggle{display:flex!important;align-items:center!important;justify-content:center!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;z-index:2147483647!important;right:12px!important;bottom:58px!important}',
      '#inkframe-circle-toggle[data-safe-fallback="1"]{position:fixed!important;min-width:86px!important;min-height:34px!important;padding:8px 12px!important;border-radius:14px!important;border:1px solid rgba(255,240,243,.46)!important;background:rgba(28,8,22,.72)!important;color:#fff0f3!important;font:850 10px/1 system-ui,sans-serif!important;letter-spacing:.14em!important;text-transform:uppercase!important;box-shadow:0 6px 16px rgba(10,0,10,.26),inset 0 1px 0 rgba(255,255,255,.12)!important;backdrop-filter:blur(14px) saturate(138%)!important;-webkit-backdrop-filter:blur(14px) saturate(138%)!important}',
      'body.circular-canvas #inkframe-circle-toggle{color:#fff0f3!important;background:rgba(42,12,30,.76)!important}',
      'body.circular-canvas #frameGlass,body.circular-canvas canvas#c{transition:border-radius .42s cubic-bezier(.2,.9,.22,1),clip-path .42s cubic-bezier(.2,.9,.22,1),box-shadow .28s ease,transform .28s ease!important}',
      'body:not(.circular-canvas) #frameGlass,body:not(.circular-canvas) canvas#c{transition:border-radius .42s cubic-bezier(.2,.9,.22,1),clip-path .42s cubic-bezier(.2,.9,.22,1),box-shadow .28s ease,transform .28s ease!important}',
      'body.circular-canvas #frameGlass{transform:scale(.992)}',
      'body.circular-canvas canvas#c{transform:scale(.996)}',
      'body.circular-canvas #inkframe-shape-badge::after{content:" · watch transform"}',
      'body.inkframe-transforming-circle #frameGlass{box-shadow:0 0 0 1px rgba(255,240,243,.32),0 18px 58px rgba(20,0,14,.58),0 0 30px rgba(187,0,55,.18)!important}',
      'body:not(.circular-canvas) #inkframe-shape-badge{opacity:0!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function setStoredMode(on){
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {}
  }

  function scheduleCircularLayout(){
    const circular = window.InkFrameCircularCanvas;
    if (circular && typeof circular.scheduleLayout === 'function') circular.scheduleLayout(0);
  }

  function toggleModeFallback(){
    const next = !document.body.classList.contains('circular-canvas');
    document.body.classList.toggle('circular-canvas', next);
    setStoredMode(next);
    if (!next) restoreSquareCanvasShell();
    scheduleCircularLayout();
    setTimeout(scheduleCircularLayout, 80);
    setTimeout(apply, 20);
    setTimeout(apply, 180);
    flashTransformCue();
  }

  function restoreSquareCanvasShell(){
    const fg = $('frameGlass');
    const canvas = $('c');
    if (fg) {
      fg.style.borderRadius = '';
      fg.style.padding = '';
      fg.style.transform = '';
    }
    if (canvas) {
      canvas.style.borderRadius = '';
      canvas.style.clipPath = '';
      canvas.style.transform = '';
    }
  }

  function ensureToggle(){
    let btn = $('inkframe-circle-toggle');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = 'inkframe-circle-toggle';
    btn.type = 'button';
    btn.dataset.safeFallback = '1';
    btn.addEventListener('pointerdown', ev => ev.stopPropagation(), true);
    btn.addEventListener('touchstart', ev => ev.stopPropagation(), { passive: true });
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      toggleModeFallback();
    });
    document.body.appendChild(btn);
    return btn;
  }

  function fixToggle(){
    const btn = ensureToggle();
    const circular = document.body.classList.contains('circular-canvas');
    if (!btn) return false;
    // Label is the target action, not the current state.
    btn.textContent = circular ? 'SQUARE' : 'CIRCLE';
    btn.setAttribute('aria-pressed', String(circular));
    btn.setAttribute('aria-label', circular ? 'Return canvas to square mode' : 'Transform canvas to circular watch mode');
    btn.title = circular ? 'Return to square canvas' : 'Transform to circular watch canvas';
    btn.dataset.targetShape = circular ? 'square' : 'circle';
    return true;
  }

  function collectMetrics(){
    metrics = {
      active: true,
      version: VERSION,
      circular: document.body.classList.contains('circular-canvas'),
      togglePresent: !!$('inkframe-circle-toggle'),
      fallbackToggle: $('inkframe-circle-toggle')?.dataset.safeFallback === '1',
      scrubberLoaded: !!window.InkFrameCircularScrubber,
    };
    window.__inkframeCircularTransformSafeMetrics = metrics;
    return metrics;
  }

  function apply(){
    ensureStyle();
    fixToggle();
    if (!document.body.classList.contains('circular-canvas')) restoreSquareCanvasShell();
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
      'Circular Transform fallback toggle: ' + (m.fallbackToggle ? 'yes' : 'no'),
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
    for (let i = 1; i <= 14; i++) setTimeout(apply, i * 180);
    for (let i = 1; i <= 10; i++) setTimeout(bridgeIntoTesterReport, i * 250);
    bridgeIntoTesterReport();
  }

  window.InkFrameCircularTransformSafe = { apply, metrics(){ return metrics || window.__inkframeCircularTransformSafeMetrics || null; }, reportLines };
  ready(boot);
})();
