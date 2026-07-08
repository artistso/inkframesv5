// InkFrame — UI layout zones
// -----------------------------------------------------------------------------
// Runtime layout manager for the floating circular controls. It keeps the large
// single-file studio intact while giving the artist clearer sections and spacing.
'use strict';

(function installInkFrameUILayout(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeUILayoutInstalled) return;
  window.__inkframeUILayoutInstalled = true;

  const $ = id => document.getElementById(id);
  const clamp = (min, value, max) => Math.max(min, Math.min(max, value));
  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once:true })
    : fn();

  const SECTIONS = {
    draw: { title:'DRAW', labels:['Tools','Line','Select'], side:'left' },
    style:{ title:'STYLE', labels:['Color','FX','Themes'], side:'right' },
    command:{ title:'COMMAND', labels:['Actions'], side:'right' },
    project:{ title:'PROJECT', labels:['Studio','Gallery'], side:'bottom' },
    animate:{ title:'ANIMATE', labels:['Frames','Layers'], side:'bottom' }
  };

  let layoutQueued = false;
  let layoutOn = true;

  function labelOf(node){
    const lbl = node && node.querySelector && node.querySelector('.orb .lbl, .lbl');
    return lbl ? String(lbl.textContent || '').trim() : '';
  }

  function nodes(){
    return Array.from(document.querySelectorAll('.node')).filter(n => labelOf(n));
  }

  function classify(label){
    for (const [key, section] of Object.entries(SECTIONS)) {
      if (section.labels.includes(label)) return key;
    }
    return 'other';
  }

  function ensureStyle(){
    if ($('inkframe-ui-layout-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-ui-layout-style';
    style.textContent = [
      'body.inkframe-ui-zones .node{transition:transform .24s cubic-bezier(.18,.9,.24,1),opacity .18s ease,filter .18s ease}',
      'body.inkframe-ui-zones .node.ui-zone-managed>.orb{width:54px;height:54px}',
      'body.inkframe-ui-zones .node.ui-zone-managed>.orb .lbl{top:58px;padding:3px 7px;border-radius:999px;background:rgba(10,0,10,.46);border:1px solid rgba(255,240,243,.16);box-shadow:0 4px 12px rgba(10,0,10,.22)}',
      'body.inkframe-ui-zones .node.ui-zone-managed.open>.orb .lbl{opacity:1;transform:translateX(-50%) translateY(-2px);background:rgba(187,0,55,.36)}',
      'body.inkframe-ui-zones .kid{width:44px;height:44px;margin:-22px 0 0 -22px}',
      'body.inkframe-ui-zones .branch.kidwrap{width:44px!important;height:44px!important;margin:-22px 0 0 -22px!important}',
      '.inkframe-ui-section-label{position:fixed;z-index:19;pointer-events:none;min-width:74px;text-align:center;padding:5px 9px;border-radius:999px;border:1px solid rgba(255,240,243,.22);background:rgba(10,0,10,.40);box-shadow:0 7px 20px rgba(10,0,10,.28),inset 0 1px 0 rgba(255,255,255,.10);color:#fff0f3;text-shadow:0 1px 2px rgba(0,0,0,.85);font:850 9px/1 system-ui,sans-serif;letter-spacing:.18em;opacity:.74;transition:left .22s ease,top .22s ease,opacity .16s ease}',
      'body.zen .inkframe-ui-section-label{opacity:.18}',
      'body.inkframe-ui-zones .node.dragging{transition:none!important}',
      '@media (max-width:900px){body.inkframe-ui-zones .node.ui-zone-managed>.orb{width:50px;height:50px}.inkframe-ui-section-label{font-size:8px;min-width:62px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureLabels(){
    let layer = $('inkframe-ui-section-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'inkframe-ui-section-layer';
      document.body.appendChild(layer);
    }
    for (const [key, section] of Object.entries(SECTIONS)) {
      let label = $('inkframe-ui-section-' + key);
      if (!label) {
        label = document.createElement('div');
        label.id = 'inkframe-ui-section-' + key;
        label.className = 'inkframe-ui-section-label';
        label.textContent = section.title;
        layer.appendChild(label);
      }
    }
  }

  function moveNode(node, x, y){
    node.classList.add('ui-zone-managed');
    if (typeof node._setPos === 'function') node._setPos(Math.round(x), Math.round(y));
    else node.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
    if (node.classList.contains('open') && typeof node._relayout === 'function') {
      requestAnimationFrame(() => node._relayout());
    }
  }

  function placeSectionLabel(key, x, y){
    const label = $('inkframe-ui-section-' + key);
    if (!label) return;
    label.style.left = Math.round(x) + 'px';
    label.style.top = Math.round(y) + 'px';
  }

  function layout(){
    if (!layoutOn) return;
    ensureStyle();
    ensureLabels();
    document.body.classList.add('inkframe-ui-zones');

    const all = nodes();
    if (!all.length) return;
    const byLabel = new Map(all.map(n => [labelOf(n), n]));
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const orb = vw < 900 ? 50 : 54;
    const gap = clamp(68, Math.round(vh * 0.105), 132);
    const top = clamp(84, Math.round(vh * 0.12), 150);
    const leftX = clamp(14, Math.round(vw * 0.018), 34);
    const rightX = Math.max(leftX, vw - orb - clamp(22, Math.round(vw * 0.026), 46));
    const bottomY = Math.max(top + gap * 3, vh - orb - clamp(24, Math.round(vh * 0.038), 58));
    const bottomGap = clamp(94, Math.round(vw * 0.105), 178);
    const projectStartX = clamp(24, Math.round(vw * 0.045), 86);
    const animateStartX = clamp(projectStartX + bottomGap * 2.15, Math.round(vw * 0.40), vw - bottomGap * 2.2);

    const draw = ['Tools','Line','Select'];
    const style = ['Color','FX','Themes'];
    const command = ['Actions'];
    const project = ['Studio','Gallery'];
    const animate = ['Frames','Layers'];

    draw.forEach((name, i) => { const n = byLabel.get(name); if (n) moveNode(n, leftX, top + gap * i); });
    style.forEach((name, i) => { const n = byLabel.get(name); if (n) moveNode(n, rightX, top + gap * i); });
    command.forEach((name, i) => { const n = byLabel.get(name); if (n) moveNode(n, rightX, top + gap * (style.length + 0.9 + i)); });
    project.forEach((name, i) => { const n = byLabel.get(name); if (n) moveNode(n, projectStartX + bottomGap * i, bottomY); });
    animate.forEach((name, i) => { const n = byLabel.get(name); if (n) moveNode(n, animateStartX + bottomGap * i, bottomY); });

    placeSectionLabel('draw', leftX - 8, top - 42);
    placeSectionLabel('style', rightX - 16, top - 42);
    placeSectionLabel('command', rightX - 22, top + gap * style.length + 12);
    placeSectionLabel('project', projectStartX + 6, bottomY - 46);
    placeSectionLabel('animate', animateStartX + 2, bottomY - 46);

    window.__inkframeUILayoutMetrics = {
      mode: 'zones',
      viewport: `${vw}x${vh}`,
      managedNodes: all.map(labelOf).filter(Boolean),
      leftX, rightX, top, gap, bottomY, bottomGap,
      sections: Object.fromEntries(Object.entries(SECTIONS).map(([k, v]) => [k, v.labels]))
    };
  }

  function scheduleLayout(delay){
    if (delay) { setTimeout(scheduleLayout, delay); return; }
    if (layoutQueued) return;
    layoutQueued = true;
    const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
    raf(() => { layoutQueued = false; layout(); });
  }

  function boot(){
    scheduleLayout(0);
    for (let i = 1; i <= 12; i++) setTimeout(() => scheduleLayout(0), i * 180);
    window.addEventListener('resize', () => scheduleLayout(80));
    window.addEventListener('orientationchange', () => scheduleLayout(240));
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(mutations => {
        if (mutations.some(m => m.addedNodes && m.addedNodes.length)) scheduleLayout(60);
      }).observe(document.body, { childList:true, subtree:true });
    }
  }

  window.InkFrameUILayout = {
    layout: () => { layoutOn = true; scheduleLayout(0); },
    enabled: value => {
      if (typeof value === 'boolean') layoutOn = value;
      document.body.classList.toggle('inkframe-ui-zones', layoutOn);
      if (layoutOn) scheduleLayout(0);
      return layoutOn;
    },
    metrics: () => window.__inkframeUILayoutMetrics || null
  };

  ready(boot);
})();
