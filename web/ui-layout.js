// InkFrame — UI section layout module
// -----------------------------------------------------------------------------
// Browser/WebView-only layout stabilizer for the floating node UI. This does not
// own the studio state; it reads the existing DOM nodes and adds clearer section
// grouping, safer spacing, focus state, and organic child-button fan expansion.
// Root node placement is initial-only so artists can still drag controls; manual
// icon positions are remembered across sessions.
'use strict';

(function installInkFrameUILayout(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeUILayoutInstalled) return;
  window.__inkframeUILayoutInstalled = true;

  const ROOT_GAP = 112;
  const EDGE = 18;
  const PHI = 1.618033988749895;
  const POS_KEY = 'inkframe.ui.rootPositions.v1';
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  let layoutQueued = false;
  let enabled = true;
  let lastMetrics = null;
  let rootPlacementApplied = false;
  let savedRootPositionsApplied = false;
  let dragWatch = null;

  function ensureStyle(){
    if (document.getElementById('inkframe-ui-layout-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-ui-layout-style';
    style.textContent = [
      'body.inkframe-ui-layout .node{transition:transform .22s cubic-bezier(.2,.9,.22,1),opacity .18s ease,filter .18s ease}',
      'body.inkframe-ui-layout .node.dragging,body.inkframe-ui-layout .node[data-ui-manual="1"]{transition:opacity .18s ease,filter .18s ease!important}',
      'body.inkframe-ui-layout .orb{width:54px;height:54px}',
      'body.inkframe-ui-layout .orb .lbl{top:58px;font-size:9px;letter-spacing:.13em;padding:0;background:transparent!important;border:0!important;box-shadow:none!important;text-shadow:0 1px 2px #000,0 0 9px rgba(0,0,0,.66)}',
      'body.inkframe-ui-layout .node[data-ui-section]::before{display:none!important;content:none!important}',
      'body.inkframe-ui-focus .node.ui-muted{opacity:.42;filter:saturate(.72) brightness(.82)}',
      'body.inkframe-ui-focus .node.ui-active{opacity:1;filter:saturate(1.08) brightness(1.08);z-index:34!important}',
      'body.inkframe-ui-focus .node.ui-active > .orb{box-shadow:0 0 0 1.5px rgba(255,240,243,.68),0 0 22px rgba(187,0,55,.55),inset 0 1px 0 rgba(255,240,243,.52)!important}',
      'body.inkframe-ui-layout .kids{z-index:40}',
      'body.inkframe-ui-layout .kid,body.inkframe-ui-layout .branch{width:44px;height:44px;margin:-22px 0 0 -22px}',
      'body.inkframe-ui-layout .kid .glyph svg{width:20px;height:20px}',
      'body.inkframe-ui-layout .kid .glyph{font-size:16px}',
      'body.inkframe-ui-layout .kid .sub{font-size:8px;letter-spacing:.08em;max-width:60px;line-height:1.05;text-align:center;background:transparent!important;border:0!important;box-shadow:none!important;text-shadow:0 1px 2px #000,0 0 9px rgba(0,0,0,.62)}',
      'body.inkframe-ui-layout .node.open > .kids > .kid,body.inkframe-ui-layout .branch.open > .kids > .kid{transform:translate(var(--dx,0),var(--dy,0)) scale(var(--ui-scale,1))}',
      'body.inkframe-ui-layout .node.open > .kids > .kidwrap{transform:translate(var(--dx,0),var(--dy,0)) scale(var(--ui-scale,1))}',
      'body.inkframe-ui-layout .kid.on{box-shadow:0 0 0 1.5px rgba(255,255,255,.9),0 0 18px rgba(187,0,55,.70),inset 0 1px 0 rgba(255,240,243,.64)!important}',
      '#inkframe-ui-map{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:18;pointer-events:none;display:flex;gap:7px;padding:5px 8px;border-radius:999px;background:rgba(10,0,10,.22);border:1px solid rgba(255,240,243,.10);box-shadow:0 5px 16px rgba(10,0,10,.14);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:.58;transition:opacity .18s ease,background .18s ease,border-color .18s ease}',
      '#inkframe-ui-map span{font:850 8px/1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#fff0f3;text-shadow:0 1px 2px #000;opacity:.54;padding:2px 4px;border-radius:999px;transition:opacity .18s ease,background .18s ease}',
      '#inkframe-ui-map span.on{opacity:1;background:rgba(187,0,55,.28)}',
      'body.inkframe-ui-focus #inkframe-ui-map{opacity:.76;background:rgba(10,0,10,.30);border-color:rgba(255,240,243,.16)}',
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

  function nodeKey(node){
    return (node.dataset.uiLabel || labelOf(node) || 'node').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function clampRootPosition(x, y){
    const w = window.innerWidth || 1400;
    const h = window.innerHeight || 900;
    return {
      x: Math.max(6, Math.min(w - 64, Number(x) || 0)),
      y: Math.max(6, Math.min(h - 64, Number(y) || 0))
    };
  }

  function setNodePos(node, x, y){
    const p = clampRootPosition(x, y);
    node.style.transform = `translate3d(${Math.round(p.x)}px,${Math.round(p.y)}px,0)`;
  }

  function readNodePos(node){
    const t = node.style.transform || '';
    const m = t.match(/translate3d\(([-0-9.]+)px,\s*([-0-9.]+)px/i) || t.match(/translate\(([-0-9.]+)px,\s*([-0-9.]+)px/i);
    if (!m) return null;
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return clampRootPosition(x, y);
  }

  function loadSavedPositions(){
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.nodes ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function saveRootPositions(){
    try {
      const data = { version: 1, viewport: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0), nodes: {} };
      roots().forEach(node => {
        const pos = readNodePos(node);
        const key = nodeKey(node);
        if (pos && key) data.nodes[key] = pos;
      });
      localStorage.setItem(POS_KEY, JSON.stringify(data));
      savedRootPositionsApplied = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearSavedPositions(){
    try { localStorage.removeItem(POS_KEY); } catch (_) {}
    savedRootPositionsApplied = false;
  }

  function applySavedPositions(rs){
    const saved = loadSavedPositions();
    if (!saved || !saved.nodes) return false;
    let applied = 0;
    rs.forEach(node => {
      const pos = saved.nodes[nodeKey(node)];
      if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.y))) return;
      setNodePos(node, pos.x, pos.y);
      node.dataset.uiManual = '1';
      applied++;
    });
    savedRootPositionsApplied = applied > 0;
    return applied > 0;
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
    const margin = 48;
    const minX = margin - cx;
    const maxX = (window.innerWidth || 1400) - margin - cx;
    const minY = margin - cy;
    const maxY = (window.innerHeight || 900) - margin - cy;
    return {
      dx: Math.max(minX, Math.min(maxX, dx)),
      dy: Math.max(minY, Math.min(maxY, dy))
    };
  }

  function outwardBaseAngle(node){
    const side = node.dataset.uiSide || classify(labelOf(node)).side;
    if (side === 'left') return 0;
    if (side === 'right') return Math.PI;
    if (side === 'bottom') return -Math.PI / 2;
    if (side === 'top') return Math.PI / 2;
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(cy - (window.innerHeight || 900) / 2, cx - (window.innerWidth || 1400) / 2);
  }

  function layoutKidsFor(node){
    if (!node.classList.contains('open')) return;
    const kidsWrap = node.querySelector(':scope > .kids');
    const orb = node.querySelector(':scope > .orb');
    if (!kidsWrap || !orb) return;
    const kids = Array.from(kidsWrap.children).filter(k => !k._pinned);
    const n = kids.length;
    if (!n) return;

    // Restore the original organic fan feel: buttons spiral/fan outward from the
    // orb instead of forming a rigid grid. Radius still grows with count, and a
    // viewport clamp keeps the fan usable near edges.
    const kidDiameter = kids.reduce((m, k) => Math.max(m, k.getBoundingClientRect().width || 44), 44);
    const need = kidDiameter + (n > 10 ? 16 : 20);
    const spread = Math.min(Math.PI * 1.22, 0.46 * n + 0.58);
    const step = n > 1 ? spread / (n - 1) : 0;
    const safeStep = Math.max(step, 0.28);
    let radius = n > 1 ? need / (2 * Math.sin(safeStep / 2)) : kidDiameter + 58;
    radius = Math.max(radius, 82);
    radius = Math.min(radius, 118 + 34 * Math.log(n + 1) * PHI);
    const base = outwardBaseAngle(node);
    const spiralBreathe = Math.min(34, Math.max(8, radius * 0.12));

    kids.forEach((kid, i) => {
      const centered = i - (n - 1) / 2;
      const angle = base + centered * step;
      const ring = Math.floor(i / 9);
      const breathe = ((i % 3) - 1) * spiralBreathe * 0.42;
      const r = radius + ring * (kidDiameter * 0.72) + breathe;
      const clamped = clampChildToViewport(node, Math.cos(angle) * r, Math.sin(angle) * r);
      kid.style.setProperty('--dx', clamped.dx.toFixed(1) + 'px');
      kid.style.setProperty('--dy', clamped.dy.toFixed(1) + 'px');
      kid.style.setProperty('--ui-scale', n > 12 ? '.88' : n > 8 ? '.94' : '1');
      kid.style.transitionDelay = (Math.min(i, 18) * 22) + 'ms';
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
    const manualRoots = rs.filter(n => n.dataset.uiManual === '1').length;
    lastMetrics = {
      enabled,
      rootPlacementApplied,
      savedRootPositionsApplied,
      roots: rs.length,
      manualRoots,
      openRoots: focus.open.length,
      active: focus.active ? labelOf(focus.active) : 'none',
      activeSection: focus.activeSection || 'none',
      childButtons: childCount,
      childLayout: 'organic-fan',
      labelBackplates: 'off',
      sections,
      viewport: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0)
    };
    window.__inkframeUILayoutMetrics = lastMetrics;
    return lastMetrics;
  }

  function anyRootDragging(rs){
    return rs.some(n => n.classList.contains('dragging'));
  }

  function layout(){
    if (!enabled) return;
    document.body.classList.add('inkframe-ui-layout');
    markSections();
    const rs = roots();
    if (!anyRootDragging(rs)) {
      if (!rootPlacementApplied && rs.length) {
        if (!applySavedPositions(rs)) sectionSlots(rs);
        rootPlacementApplied = true;
      }
      rs.forEach(layoutKidsFor);
    }
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
      'UI root placement applied: ' + (m.rootPlacementApplied ? 'yes' : 'no'),
      'UI saved root positions: ' + (m.savedRootPositionsApplied ? 'yes' : 'no'),
      'UI child layout: ' + (m.childLayout || 'n/a'),
      'UI label backplates: ' + (m.labelBackplates || 'n/a'),
      'UI viewport: ' + m.viewport,
      'UI roots: ' + m.roots,
      'UI manual roots: ' + m.manualRoots,
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

  function installDragRespect(){
    document.addEventListener('pointerdown', ev => {
      const orb = ev.target && ev.target.closest ? ev.target.closest('.node > .orb') : null;
      if (!orb) return;
      const node = orb.parentElement;
      if (!node) return;
      dragWatch = { node, x: ev.clientX, y: ev.clientY, moved: false };
    }, true);
    document.addEventListener('pointermove', ev => {
      if (!dragWatch || dragWatch.moved) return;
      if (Math.hypot(ev.clientX - dragWatch.x, ev.clientY - dragWatch.y) > 8) {
        dragWatch.moved = true;
        dragWatch.node.dataset.uiManual = '1';
      }
    }, true);
    ['pointerup','pointercancel'].forEach(type => document.addEventListener(type, () => {
      if (dragWatch && dragWatch.moved) {
        setTimeout(() => {
          saveRootPositions();
          scheduleLayout();
        }, 120);
      }
      dragWatch = null;
    }, true));
  }

  function resetPositions(){
    roots().forEach(n => delete n.dataset.uiManual);
    clearSavedPositions();
    rootPlacementApplied = false;
    scheduleLayout();
    return true;
  }

  function boot(){
    ensureStyle();
    installDragRespect();
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
    resetPositions,
    savePositions: saveRootPositions,
    enable(on){ enabled = on !== false; document.body.classList.toggle('inkframe-ui-layout', enabled); scheduleLayout(); return enabled; },
    sections(){ return roots().map(n => ({ label: labelOf(n), section: n.dataset.uiSection, side: n.dataset.uiSide, manual: n.dataset.uiManual === '1' })); },
    metrics(){ return lastMetrics || window.__inkframeUILayoutMetrics || null; },
    reportLines
  };

  ready(boot);
})();
