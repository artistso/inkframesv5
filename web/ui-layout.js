// InkFrame — UI section layout module
// -----------------------------------------------------------------------------
// Browser/WebView-only layout stabilizer for the floating node UI. This does not
// own the studio state; it reads the existing DOM nodes and adds clearer section
// grouping, safer spacing, focus state, and denser child-button packing.
'use strict';

(function installInkFrameUILayout(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeUILayoutInstalled) return;
  window.__inkframeUILayoutInstalled = true;

  const ROOT_GAP = 112;
  const EDGE = 18;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  let layoutQueued = false;
  let enabled = true;
  let lastMetrics = null;

  function ensureStyle(){
    if (document.getElementById('inkframe-ui-layout-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-ui-layout-style';
    style.textContent = [
      'body.inkframe-ui-layout .node{transition:transform .22s cubic-bezier(.2,.9,.22,1),opacity .18s ease,filter .18s ease}',
      'body.inkframe-ui-layout .orb{width:54px;height:54px}',
      'body.inkframe-ui-layout .orb .lbl{top:58px;font-size:9px;letter-spacing:.13em;padding:3px 7px;border-radius:999px;background:rgba(10,0,10,.42);border:1px solid rgba(255,240,243,.18);box-shadow:0 4px 12px rgba(10,0,10,.24)}',
      'body.inkframe-ui-layout .node[data-ui-section]::before{content:attr(data-ui-section);position:absolute;left:50%;top:-22px;transform:translateX(-50%);min-width:72px;text-align:center;padding:4px 8px;border-radius:999px;font:850 8px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#fff0f3;background:rgba(10,0,10,.46);border:1px solid rgba(255,240,243,.20);box-shadow:0 5px 14px rgba(10,0,10,.24);pointer-events:none;opacity:.82;text-shadow:0 1px 2px #000}',
      'body.inkframe-ui-layout .node.open[data-ui-section]::before{opacity:1;background:rgba(187,0,55,.34);border-color:rgba(255,240,243,.38)}',
      'body.inkframe-ui-focus .node.ui-muted{opacity:.42;filter:saturate(.72) brightness(.82)}',
      'body.inkframe-ui-focus .node.ui-active{opacity:1;filter:saturate(1.08) brightness(1.08);z-index:34!important}',
      'body.inkframe-ui-focus .node.ui-active > .orb{box-shadow:0 0 0 1.5px rgba(255,240,243,.68),0 0 22px rgba(187,0,55,.55),inset 0 1px 0 rgba(255,240,243,.52)!important}',
      'body.inkframe-ui-layout .kids{z-index:40}',
      'body.inkframe-ui-layout .kid,body.inkframe-ui-layout .branch{width:42px;height:42px;margin:-21px 0 0 -21px}',
      'body.inkframe-ui-layout .kid .glyph svg{width:19px;height:19px}',
      'body.inkframe-ui-layout .kid .glyph{font-size:16px}',
      'body.inkframe-ui-layout .kid .sub{font-size:8px;letter-spacing:.08em;max-width:58px;line-height:1.05;text-align:center;text-shadow:0 1px 2px #000,0 0 8px rgba(0,0,0,.50)}',
      'body.inkframe-ui-layout .node.open > .kids > .kid,body.inkframe-ui-layout .branch.open > .kids > .kid{transform:translate(var(--dx,0),var(--dy,0)) scale(var(--ui-scale,1))}',
      'body.inkframe-ui-layout .node.open > .kids > .kidwrap{transform:translate(var(--dx,0),var(--dy,0)) scale(var(--ui-scale,1))}',
      'body.inkframe-ui-layout .kid.on{box-shadow:0 0 0 1.5px rgba(255,255,255,.9),0 0 18px rgba(187,0,55,.70),inset 0 1px 0 rgba(255,240,243,.64)!important}',
      '#inkframe-ui-map{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:18;pointer-events:none;display:flex;gap:7px;padding:5px 8px;border-radius:999px;background:rgba(10,0,10,.28);border:1px solid rgba(255,240,243,.14);box-shadow:0 5px 16px rgba(10,0,10,.18);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:.70;transition:opacity .18s ease,background .18s ease,border-color .18s ease}',
      '#inkframe-ui-map span{font:850 8px/1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#fff0f3;text-shadow:0 1px 2px #000;opacity:.62;padding:3px 5px;border-radius:999px;transition:opacity .18s ease,background .18s ease}',
      '#inkframe-ui-map span.on{opacity:1;background:rgba(187,0,55,.38)}',
      'body.inkframe-ui-focus #inkframe-ui-map{opacity:.90;background:rgba(10,0,10,.42);border-color:rgba(255,240,243,.22)}',
      'body.zen #inkframe-ui-map{opacity:0}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function labelOf(node){
    const lbl = node.querySelector(':scope > .orb .lbl');
    return (lbl && lbl.textContent ? lbl.textContent.trim() : '').replace(/\s+/g, ' ');
  }

  function roots(){
    return $$('.node').filter(node => node.querySelector(':scope > .orb .lbl'));
  }

  function classify(label){
    const key = label.toLowerCase();
    if (['tools','line','select'].includes(key)) return { section: 'Create', side: 'left' };
    if (['color','actions','fx'].includes(key)) return { section: 'Adjust', side: 'right' };
    if (['frames','layers'].includes(key)) return { section: 'Animate', side: 'bottom' };
    if (['studio','gallery','theme','themes','help','project'].includes(key)) return { section: 'Studio', side: 'top' };
    return { section: 'Tools', side: 'left' };
  }

  function setNodePos(node, x, y){
    node.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  }

  function sectionSlots(nodes){
    const h = window.innerHeight || 900;
    const w = window.innerWidth || 1400;
    const left = nodes.filter(n => classify(labelOf(n)).side === 'left');
    const right = nodes.filter(n => classify(labelOf(n)).side === 'right');
    const bottom = nodes.filter(n => classify(labelOf(n)).side === 'bottom');
    const top = nodes.filter(n => classify(labelOf(n)).side === 'top');

    left.forEach((node, i) => setNodePos(node, EDGE, 86 + i * ROOT_GAP));
    right.forEach((node, i) => setNodePos(node, w - 72, 86 + i * ROOT_GAP));
    bottom.forEach((node, i) => {
      const total = bottom.length;
      const step = total > 1 ? Math.min(112, (w - 220) / (total - 1)) : 0;
      const start = w / 2 - step * (total - 1) / 2;
      setNodePos(node, Math.max(84, Math.min(w - 84, start + i * step)), h - 88);
    });
    top.forEach((node, i) => setNodePos(node, 160 + i * 96, 24));
  }

  function markSections(){
    roots().forEach(node => {
      const label = labelOf(node);
      const info = classify(label);
      node.dataset.uiLabel = label || 'Node';
      node.dataset.uiSection = info.section;
      node.dataset.uiSide = info.side;
    });
  }

  function clampChildToViewport(node, dx, dy){
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const margin = 46;
    const minX = margin - cx;
    const maxX = (window.innerWidth || 1400) - margin - cx;
    const minY = margin - cy;
    const maxY = (window.innerHeight || 900) - margin - cy;
    return {
      dx: Math.max(minX, Math.min(maxX, dx)),
      dy: Math.max(minY, Math.min(maxY, dy))
    };
  }

  function layoutKidsFor(node){
    if (!node.classList.contains('open')) return;
    const kidsWrap = node.querySelector(':scope > .kids');
    const orb = node.querySelector(':scope > .orb');
    if (!kidsWrap || !orb) return;
    const kids = Array.from(kidsWrap.children).filter(k => !k._pinned);
    const n = kids.length;
    if (!n) return;

    const side = node.dataset.uiSide || classify(labelOf(node)).side;
    const dense = n > 8;
    const item = dense ? 48 : 56;
    const cols = n > 12 ? 4 : n > 8 ? 3 : n > 5 ? 2 : 1;
    const rows = Math.ceil(n / cols);
    const outwardX = side === 'right' ? -1 : side === 'left' ? 1 : 0;
    const outwardY = side === 'bottom' ? -1 : side === 'top' ? 1 : 0;
    const baseX = outwardX * 84;
    const baseY = outwardY * 84;
    const fan = side === 'left' || side === 'right';

    kids.forEach((kid, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      let dx, dy;
      if (fan) {
        dx = baseX + outwardX * col * item;
        dy = (row - (rows - 1) / 2) * item;
      } else {
        dx = (col - (cols - 1) / 2) * item;
        dy = baseY + outwardY * row * item;
      }
      const clamped = clampChildToViewport(node, dx, dy);
      kid.style.setProperty('--dx', clamped.dx.toFixed(1) + 'px');
      kid.style.setProperty('--dy', clamped.dy.toFixed(1) + 'px');
      kid.style.setProperty('--ui-scale', dense ? '.92' : '1');
      kid.style.transitionDelay = (Math.min(i, 14) * 18) + 'ms';
    });
  }

  function ensureMap(){
    let map = document.getElementById('inkframe-ui-map');
    if (map) return map;
    map = document.createElement('div');
    map.id = 'inkframe-ui-map';
    ['Create','Adjust','Animate','Studio'].forEach(name => {
      const s = document.createElement('span');
      s.textContent = name;
      s.dataset.section = name;
      map.appendChild(s);
    });
    document.body.appendChild(map);
    return map;
  }

  function updateFocus(rs){
    const open = rs.filter(n => n.classList.contains('open'));
    const active = open.length ? open[open.length - 1] : null;
    document.body.classList.toggle('inkframe-ui-focus', !!active);
    rs.forEach(n => {
      n.classList.toggle('ui-active', n === active);
      n.classList.toggle('ui-muted', !!active && n !== active);
    });
    const activeSection = active ? active.dataset.uiSection : '';
    const map = ensureMap();
    Array.from(map.children).forEach(item => item.classList.toggle('on', item.dataset.section === activeSection));
    return { open, active, activeSection };
  }

  function collectMetrics(rs, focus){
    const sections = {};
    rs.forEach(n => {
      const section = n.dataset.uiSection || classify(labelOf(n)).section;
      sections[section] = sections[section] || { roots: 0, open: 0 };
      sections[section].roots += 1;
      if (n.classList.contains('open')) sections[section].open += 1;
    });
    const childCount = rs.reduce((sum, n) => sum + n.querySelectorAll(':scope > .kids > .kid,:scope > .kids > .kidwrap').length, 0);
    lastMetrics = {
      enabled,
      roots: rs.length,
      openRoots: focus.open.length,
      active: focus.active ? labelOf(focus.active) : 'none',
      activeSection: focus.activeSection || 'none',
      childButtons: childCount,
      sections,
      viewport: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0)
    };
    window.__inkframeUILayoutMetrics = lastMetrics;
    return lastMetrics;
  }

  function layout(){
    if (!enabled) return;
    document.body.classList.add('inkframe-ui-layout');
    markSections();
    const rs = roots();
    sectionSlots(rs);
    rs.forEach(layoutKidsFor);
    const focus = updateFocus(rs);
    collectMetrics(rs, focus);
  }

  function scheduleLayout(){
    if (layoutQueued) return;
    layoutQueued = true;
    const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
    raf(() => { layoutQueued = false; layout(); });
  }

  function reportLines(){
    const m = lastMetrics || window.__inkframeUILayoutMetrics;
    if (!m) return ['UI Layout: n/a'];
    const lines = [
      'UI Layout: ' + (m.enabled ? 'active' : 'disabled'),
      'UI viewport: ' + m.viewport,
      'UI roots: ' + m.roots,
      'UI open roots: ' + m.openRoots,
      'UI active: ' + m.active,
      'UI active section: ' + m.activeSection,
      'UI child buttons: ' + m.childButtons,
    ];
    Object.keys(m.sections || {}).sort().forEach(section => {
      const s = m.sections[section];
      lines.push('UI section ' + section + ': ' + s.roots + ' roots / ' + s.open + ' open');
    });
    return lines;
  }

  function bridgeIntoTesterReport(){
    if (window.__inkframeUILayoutReportBridge) return;
    const circular = window.InkFrameCircularCanvas;
    if (!circular || typeof circular.reportLines !== 'function') return;
    const originalReportLines = circular.reportLines.bind(circular);
    window.__inkframeUILayoutReportBridge = true;
    circular.reportLines = function bridgedCircularAndUILayoutReport(){
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
        lines.push('UI Layout: report error');
      }
      return lines;
    };
  }

  function boot(){
    ensureStyle();
    scheduleLayout();
    const mo = new MutationObserver(scheduleLayout);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', scheduleLayout);
    window.addEventListener('orientationchange', () => setTimeout(scheduleLayout, 220));
    for (let i = 1; i <= 12; i++) setTimeout(scheduleLayout, i * 220);
    for (let i = 1; i <= 10; i++) setTimeout(bridgeIntoTesterReport, i * 250);
    bridgeIntoTesterReport();
  }

  window.InkFrameUILayout = {
    layout: scheduleLayout,
    enable(on){ enabled = on !== false; document.body.classList.toggle('inkframe-ui-layout', enabled); scheduleLayout(); return enabled; },
    sections(){ return roots().map(n => ({ label: labelOf(n), section: n.dataset.uiSection, side: n.dataset.uiSide })); },
    metrics(){ return lastMetrics || window.__inkframeUILayoutMetrics || null; },
    reportLines
  };

  ready(boot);
})();
