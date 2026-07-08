// InkFrame — Refined Glass UI layer
// -----------------------------------------------------------------------------
// Pure visual polish: thin complimentary rings around UI buttons and stronger
// glass treatment for floating controls, panels, the circular canvas shell, and
// timeline affordances. No tool state, no layout ownership, no drag changes.
'use strict';

(function installInkFrameUIGlass(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeUIGlassInstalled) return;
  window.__inkframeUIGlassInstalled = true;

  const VERSION = 'v1-thin-rings-deeper-glass';
  let metrics = null;

  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function ensureStyle(){
    if (document.getElementById('inkframe-ui-glass-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-ui-glass-style';
    style.textContent = [
      ':root{--ink-glass-edge:rgba(255,240,243,.54);--ink-glass-hair:rgba(255,240,243,.34);--ink-glass-inner:rgba(255,255,255,.14);--ink-glass-shadow:rgba(20,0,14,.44);--ink-glass-rose:rgba(187,0,55,.42);--ink-glass-cool:rgba(155,220,255,.22)}',
      'body.inkframe-glass-ui .orb,body.inkframe-glass-ui .kid,body.inkframe-glass-ui .branch,body.inkframe-glass-ui #inkframe-circle-toggle,body.inkframe-glass-ui #inkframe-test-report-btn{position:relative;isolation:isolate}',
      'body.inkframe-glass-ui .orb::before,body.inkframe-glass-ui .kid::before,body.inkframe-glass-ui .branch::before,body.inkframe-glass-ui #inkframe-circle-toggle::before,body.inkframe-glass-ui #inkframe-test-report-btn::before{content:"";position:absolute;inset:-2px;border-radius:inherit;pointer-events:none;z-index:-1;background:linear-gradient(145deg,rgba(255,240,243,.70),rgba(255,240,243,.08) 38%,rgba(187,0,55,.42) 70%,rgba(155,220,255,.28));box-shadow:0 0 0 1px rgba(255,240,243,.22),0 0 14px rgba(187,0,55,.18);opacity:.72}',
      'body.inkframe-glass-ui .orb::after,body.inkframe-glass-ui .kid::after,body.inkframe-glass-ui .branch::after{content:"";position:absolute;inset:1px;border-radius:inherit;pointer-events:none;background:radial-gradient(circle at 34% 24%,rgba(255,255,255,.32),rgba(255,255,255,0) 32%),linear-gradient(155deg,rgba(255,255,255,.08),rgba(255,240,243,0) 56%);mix-blend-mode:screen;opacity:.56}',
      'body.inkframe-glass-ui .orb{border:1px solid rgba(255,240,243,.32)!important;background:linear-gradient(155deg,rgba(255,240,243,.22),rgba(247,202,201,.09) 52%,rgba(42,0,26,.24))!important;box-shadow:0 10px 28px var(--ink-glass-shadow),inset 0 1px 0 rgba(255,255,255,.24),inset 0 -10px 24px rgba(20,0,14,.18)!important;backdrop-filter:blur(18px) saturate(152%);-webkit-backdrop-filter:blur(18px) saturate(152%)}',
      'body.inkframe-glass-ui .kid,body.inkframe-glass-ui .branch{border:1px solid rgba(255,240,243,.28)!important;background:linear-gradient(155deg,rgba(255,240,243,.18),rgba(247,202,201,.07) 54%,rgba(20,0,14,.22))!important;box-shadow:0 8px 22px rgba(20,0,14,.34),inset 0 1px 0 rgba(255,255,255,.20),inset 0 -8px 18px rgba(20,0,14,.16)!important;backdrop-filter:blur(14px) saturate(145%);-webkit-backdrop-filter:blur(14px) saturate(145%)}',
      'body.inkframe-glass-ui .kid.on,body.inkframe-glass-ui .frameSlot.cur{box-shadow:0 0 0 1px rgba(255,255,255,.88),0 0 18px rgba(187,0,55,.66),0 8px 22px rgba(20,0,14,.34),inset 0 1px 0 rgba(255,255,255,.32)!important}',
      'body.inkframe-glass-ui .frameSlot{border:1px solid rgba(255,240,243,.22)!important;box-shadow:0 3px 10px rgba(20,0,14,.22),inset 0 1px 0 rgba(255,255,255,.14)!important}',
      'body.inkframe-glass-ui #frameGlass{background:radial-gradient(circle at 35% 20%,rgba(255,255,255,.14),rgba(255,255,255,0) 34%),linear-gradient(160deg,rgba(255,240,243,.18),rgba(247,202,201,.08) 42%,rgba(42,0,26,.26))!important;border:1px solid rgba(255,240,243,.36)!important;box-shadow:0 20px 70px rgba(20,0,14,.62),inset 0 1px 0 rgba(255,255,255,.28),inset 0 0 38px rgba(255,240,243,.07),0 0 0 1px rgba(255,240,243,.10)!important;backdrop-filter:blur(24px) saturate(160%);-webkit-backdrop-filter:blur(24px) saturate(160%)}',
      'body.inkframe-glass-ui.circular-canvas #frameGlass{box-shadow:0 20px 72px rgba(20,0,14,.68),inset 0 1px 0 rgba(255,255,255,.30),inset 0 0 48px rgba(255,240,243,.08),0 0 0 1px rgba(255,240,243,.16),0 0 34px rgba(187,0,55,.20)!important}',
      'body.inkframe-glass-ui #inkframe-timeline-ring{filter:drop-shadow(0 0 16px rgba(187,0,55,.34)) drop-shadow(0 0 4px rgba(255,240,243,.18))!important}',
      'body.inkframe-glass-ui #inkframe-playhead-bead{box-shadow:0 0 0 1px rgba(255,255,255,.96),0 0 0 3px rgba(255,240,243,.12),0 0 18px rgba(187,0,55,.92),0 8px 18px rgba(20,0,14,.44)!important}',
      'body.inkframe-glass-ui #inkframe-circle-toggle,body.inkframe-glass-ui #inkframe-test-report-btn{border:1px solid rgba(255,240,243,.42)!important;background:linear-gradient(155deg,rgba(255,240,243,.22),rgba(187,0,55,.52),rgba(42,0,26,.68))!important;box-shadow:0 10px 28px rgba(20,0,14,.44),inset 0 1px 0 rgba(255,255,255,.24)!important;backdrop-filter:blur(16px) saturate(150%);-webkit-backdrop-filter:blur(16px) saturate(150%)}',
      'body.inkframe-glass-ui #inkframe-ui-map,body.inkframe-glass-ui #inkframe-ui-context,body.inkframe-glass-ui #inkframe-scrub-hud{border-color:rgba(255,240,243,.18)!important;background:linear-gradient(155deg,rgba(255,240,243,.14),rgba(10,0,10,.36))!important;box-shadow:0 8px 24px rgba(10,0,10,.24),inset 0 1px 0 rgba(255,255,255,.12)!important;backdrop-filter:blur(16px) saturate(148%);-webkit-backdrop-filter:blur(16px) saturate(148%)}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function collectMetrics(){
    metrics = {
      active: true,
      version: VERSION,
      roots: document.querySelectorAll('.node > .orb').length,
      children: document.querySelectorAll('.kid,.branch').length,
      frameSlots: document.querySelectorAll('#frameBoard .frameSlot').length,
      floatingButtons: document.querySelectorAll('#inkframe-circle-toggle,#inkframe-test-report-btn').length
    };
    window.__inkframeUIGlassMetrics = metrics;
    return metrics;
  }

  function apply(){
    ensureStyle();
    document.body.classList.add('inkframe-glass-ui');
    collectMetrics();
  }

  function reportLines(){
    const m = metrics || window.__inkframeUIGlassMetrics || collectMetrics();
    return [
      'UI Glass: active',
      'UI Glass version: ' + m.version,
      'UI Glass roots: ' + m.roots,
      'UI Glass children: ' + m.children,
      'UI Glass frame slots: ' + m.frameSlots,
      'UI Glass floating buttons: ' + m.floatingButtons
    ];
  }

  function bridgeIntoTesterReport(){
    if (window.__inkframeUIGlassReportBridge) return;
    const circular = window.InkFrameCircularCanvas;
    if (!circular || typeof circular.reportLines !== 'function') return;
    const originalReportLines = circular.reportLines.bind(circular);
    window.__inkframeUIGlassReportBridge = true;
    circular.reportLines = function bridgedUIGlassReport(){
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
        lines.push('UI Glass: report error');
      }
      return lines;
    };
  }

  function boot(){
    apply();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => setTimeout(collectMetrics, 30)).observe(document.body, { childList: true, subtree: true });
    }
    for (let i = 1; i <= 8; i++) setTimeout(apply, i * 250);
    for (let i = 1; i <= 10; i++) setTimeout(bridgeIntoTesterReport, i * 250);
    bridgeIntoTesterReport();
  }

  window.InkFrameUIGlass = {
    apply,
    metrics(){ return metrics || window.__inkframeUIGlassMetrics || null; },
    reportLines
  };

  ready(boot);
})();
