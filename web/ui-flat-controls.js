// InkFrame — Flat Glass Control Styling
// -----------------------------------------------------------------------------
// Final visual override layer. Keeps the UI glassy, but removes the bubbled,
// inflated look. Buttons become flatter plates with thin rings, low shadows,
// restrained highlights, and cleaner canvas framing.
'use strict';

(function installInkFrameUIFlatControls(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeUIFlatControlsInstalled) return;
  window.__inkframeUIFlatControlsInstalled = true;

  const VERSION = 'v1-flat-glass-plates';
  let metrics = null;

  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function ensureStyle(){
    if (document.getElementById('inkframe-ui-flat-controls-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-ui-flat-controls-style';
    style.textContent = [
      ':root{--ink-flat-line:rgba(255,240,243,.34);--ink-flat-line-hot:rgba(255,240,243,.68);--ink-flat-bg:rgba(24,8,20,.58);--ink-flat-bg-hot:rgba(74,18,46,.62);--ink-flat-shadow:rgba(10,0,10,.26)}',

      'body.inkframe-flat-controls .orb,body.inkframe-flat-controls .kid,body.inkframe-flat-controls .branch,body.inkframe-flat-controls #inkframe-circle-toggle,body.inkframe-flat-controls #inkframe-test-report-btn{background:linear-gradient(180deg,rgba(255,255,255,.105),rgba(255,255,255,.025) 48%,rgba(0,0,0,.10))!important;border:1px solid var(--ink-flat-line)!important;box-shadow:0 5px 14px var(--ink-flat-shadow),inset 0 1px 0 rgba(255,255,255,.13)!important;backdrop-filter:blur(12px) saturate(130%)!important;-webkit-backdrop-filter:blur(12px) saturate(130%)!important}',
      'body.inkframe-flat-controls .orb::before,body.inkframe-flat-controls .kid::before,body.inkframe-flat-controls .branch::before,body.inkframe-flat-controls #inkframe-circle-toggle::before,body.inkframe-flat-controls #inkframe-test-report-btn::before{content:""!important;position:absolute!important;inset:-1px!important;border-radius:inherit!important;background:transparent!important;box-shadow:0 0 0 1px rgba(255,240,243,.18)!important;opacity:1!important;pointer-events:none!important;z-index:-1!important}',
      'body.inkframe-flat-controls .orb::after,body.inkframe-flat-controls .kid::after,body.inkframe-flat-controls .branch::after{content:""!important;position:absolute!important;left:13%!important;right:13%!important;top:6px!important;height:1px!important;border-radius:999px!important;background:rgba(255,255,255,.24)!important;box-shadow:none!important;opacity:.55!important;mix-blend-mode:normal!important;pointer-events:none!important}',

      'body.inkframe-flat-controls .orb{border-radius:18px!important}',
      'body.inkframe-flat-controls .kid,body.inkframe-flat-controls .branch{border-radius:15px!important}',
      'body.inkframe-flat-controls .kid.on,body.inkframe-flat-controls .node.ui-active > .orb{background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(187,0,55,.16) 52%,rgba(0,0,0,.12))!important;border-color:var(--ink-flat-line-hot)!important;box-shadow:0 0 0 1px rgba(255,255,255,.22),0 7px 18px rgba(10,0,10,.30),0 0 14px rgba(187,0,55,.28),inset 0 1px 0 rgba(255,255,255,.18)!important}',
      'body.inkframe-flat-controls .node.ui-active > .orb{border-radius:18px!important}',
      'body.inkframe-flat-controls .orb .lbl,body.inkframe-flat-controls .kid .sub{font-weight:850!important;text-shadow:0 1px 2px rgba(0,0,0,.82)!important}',

      'body.inkframe-flat-controls #inkframe-circle-toggle,body.inkframe-flat-controls #inkframe-test-report-btn{border-radius:14px!important;min-height:34px!important;min-width:82px!important;padding:8px 12px!important;background:rgba(24,8,20,.72)!important;color:#fff0f3!important;text-shadow:0 1px 2px rgba(0,0,0,.75)!important}',
      'body.inkframe-flat-controls.circular-canvas #inkframe-circle-toggle{background:rgba(72,18,46,.72)!important;border-color:rgba(255,240,243,.56)!important;color:#fff0f3!important}',

      'body.inkframe-flat-controls #frameGlass{background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.025) 48%,rgba(0,0,0,.09))!important;border:1px solid rgba(255,240,243,.26)!important;box-shadow:0 14px 42px rgba(10,0,10,.38),inset 0 1px 0 rgba(255,255,255,.14),0 0 0 1px rgba(255,240,243,.06)!important;backdrop-filter:blur(15px) saturate(132%)!important;-webkit-backdrop-filter:blur(15px) saturate(132%)!important}',
      'body.inkframe-flat-controls.circular-canvas #frameGlass{box-shadow:0 16px 48px rgba(10,0,10,.42),inset 0 1px 0 rgba(255,255,255,.16),0 0 0 1px rgba(255,240,243,.12),0 0 22px rgba(187,0,55,.12)!important}',
      'body.inkframe-flat-controls.circular-canvas #frameGlass:before{border-color:rgba(255,240,243,.28)!important;box-shadow:inset 0 0 12px rgba(255,240,243,.08),0 0 16px rgba(187,0,55,.10)!important}',

      'body.inkframe-flat-controls .frameSlot{box-shadow:0 2px 7px rgba(10,0,10,.22),inset 0 1px 0 rgba(255,255,255,.10)!important;border:1px solid rgba(255,240,243,.22)!important}',
      'body.inkframe-flat-controls .frameSlot.cur{box-shadow:0 0 0 1px rgba(255,255,255,.75),0 0 12px rgba(187,0,55,.38),0 2px 8px rgba(10,0,10,.24)!important}',
      'body.inkframe-flat-controls #inkframe-timeline-ring{filter:drop-shadow(0 0 8px rgba(187,0,55,.18))!important;opacity:.82!important}',
      'body.inkframe-flat-controls #inkframe-playhead-bead{width:12px!important;height:12px!important;margin:-6px 0 0 -6px!important;box-shadow:0 0 0 1px rgba(255,255,255,.82),0 0 9px rgba(187,0,55,.58),0 4px 10px rgba(10,0,10,.34)!important}',

      'body.inkframe-flat-controls #inkframe-ui-map,body.inkframe-flat-controls #inkframe-ui-context,body.inkframe-flat-controls #inkframe-scrub-hud{background:rgba(18,6,16,.50)!important;border:1px solid rgba(255,240,243,.16)!important;box-shadow:0 5px 14px rgba(10,0,10,.22),inset 0 1px 0 rgba(255,255,255,.10)!important;backdrop-filter:blur(12px) saturate(126%)!important;-webkit-backdrop-filter:blur(12px) saturate(126%)!important}',
      'body.inkframe-flat-controls .kid.ui-kind-branch::after{left:auto!important;right:auto!important;top:auto!important;height:auto!important;inset:-4px!important;border:1px dashed rgba(255,240,180,.42)!important;background:transparent!important;opacity:.65!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function apply(){
    ensureStyle();
    document.body.classList.add('inkframe-flat-controls');
    metrics = {
      active: true,
      version: VERSION,
      rootButtons: document.querySelectorAll('.node > .orb').length,
      childButtons: document.querySelectorAll('.kid,.branch').length,
      circleToggle: !!document.getElementById('inkframe-circle-toggle'),
      reportButton: !!document.getElementById('inkframe-test-report-btn'),
    };
    window.__inkframeUIFlatControlsMetrics = metrics;
    return metrics;
  }

  function reportLines(){
    const m = metrics || window.__inkframeUIFlatControlsMetrics || apply();
    return [
      'UI Flat Controls: active',
      'UI Flat Controls version: ' + m.version,
      'UI Flat root buttons: ' + m.rootButtons,
      'UI Flat child buttons: ' + m.childButtons,
      'UI Flat circle toggle: ' + (m.circleToggle ? 'visible' : 'missing'),
      'UI Flat report button: ' + (m.reportButton ? 'visible' : 'missing')
    ];
  }

  function bridgeIntoTesterReport(){
    if (window.__inkframeUIFlatControlsReportBridge) return;
    const circular = window.InkFrameCircularCanvas;
    if (!circular || typeof circular.reportLines !== 'function') return;
    const originalReportLines = circular.reportLines.bind(circular);
    window.__inkframeUIFlatControlsReportBridge = true;
    circular.reportLines = function bridgedFlatControlsReport(){
      let lines = [];
      try {
        const original = originalReportLines();
        if (Array.isArray(original)) lines = lines.concat(original.map(String));
      } catch (e) {
        lines.push('Circular/UI report error');
      }
      try {
        lines = lines.concat(reportLines().map(String));
      } catch (e) {
        lines.push('UI Flat Controls: report error');
      }
      return lines;
    };
  }

  function boot(){
    apply();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => setTimeout(apply, 25)).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    for (let i = 1; i <= 10; i++) setTimeout(apply, i * 220);
    for (let i = 1; i <= 10; i++) setTimeout(bridgeIntoTesterReport, i * 250);
    bridgeIntoTesterReport();
  }

  window.InkFrameUIFlatControls = { apply, metrics(){ return metrics || window.__inkframeUIFlatControlsMetrics || null; }, reportLines };
  ready(boot);
})();
