// InkFrame — UI icon polish module
// -----------------------------------------------------------------------------
// Visual semantics layer for the floating icon UI. This module does not move
// controls and does not own tool behavior; it annotates existing icons so artists
// can read intent faster: create/export/timing/layers/danger/toggle/branch/dial.
'use strict';

(function installInkFrameUIIconPolish(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeUIIconPolishInstalled) return;
  window.__inkframeUIIconPolishInstalled = true;

  const TAXONOMY_VERSION = 'v1-semantic-icon-affordances';
  const ROOT_META = {
    tools:   { section: 'Draw', role: 'Brushes' },
    color:   { section: 'Draw', role: 'Color & Size' },
    line:    { section: 'Draw', role: 'Linework' },
    select:  { section: 'Edit', role: 'Selection' },
    actions: { section: 'Edit', role: 'Undo & Canvas' },
    fx:      { section: 'Edit', role: 'Effects' },
    frames:  { section: 'Animate', role: 'Timeline' },
    layers:  { section: 'Layers', role: 'Layer Stack' },
    studio:  { section: 'Studio', role: 'Project' },
    project: { section: 'Studio', role: 'Project' },
    gallery: { section: 'Studio', role: 'Gallery' },
    themes:  { section: 'Studio', role: 'Theme' },
    theme:   { section: 'Studio', role: 'Theme' },
    help:    { section: 'Studio', role: 'Help' }
  };
  const LABEL_ALIASES = {
    'h+': 'Hold +',
    'h−': 'Hold −',
    'h-': 'Hold −',
    rev: 'Reverse',
    ping: 'Ping-Pong',
    twos: 'On 2s',
    dup: 'Duplicate',
    del: 'Delete',
    flat: 'Flatten',
    'l·op': 'Layer Opacity',
    'l-op': 'Layer Opacity',
    'o·depth': 'Onion Depth',
    'o-depth': 'Onion Depth',
    ghost: 'Onion Ghost',
    mblur: 'Motion Blur',
    rect: 'Rectangle',
    sel: 'Select'
  };

  let queued = false;
  let lastMetrics = null;

  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function normalize(value){
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9·+−-]+/g, '').replace(/^-|-$/g, '');
  }

  function rootLabel(node){
    const lbl = node.querySelector(':scope > .orb .lbl');
    return (lbl && lbl.textContent ? lbl.textContent.trim() : '').replace(/\s+/g, ' ');
  }

  function roots(){
    return $$('.node').filter(node => node.querySelector(':scope > .orb .lbl'));
  }

  function rootInfo(node){
    const label = rootLabel(node);
    const existingSection = node.dataset.uiSection;
    const existingRole = node.dataset.uiRole;
    const meta = ROOT_META[normalize(label)] || {};
    return {
      label,
      section: existingSection || meta.section || 'Draw',
      role: existingRole || meta.role || 'Tool'
    };
  }

  function childText(kid){
    const sub = kid.querySelector('.sub');
    const glyph = kid.querySelector('.glyph');
    return (sub && sub.textContent ? sub.textContent : glyph && glyph.textContent ? glyph.textContent : '').trim();
  }

  function classifyChild(kid, root){
    const info = rootInfo(root);
    const raw = childText(kid);
    const key = normalize(raw);
    if (kid.classList.contains('dial')) return 'dial';
    if (kid.closest('.branch') || kid.classList.contains('branch') || ['list','stack'].includes(key)) return 'branch';
    if (['delete','del','clear','none','flatten','flat'].includes(key)) return 'danger';
    if (['gif','video','export'].includes(key)) return 'export';
    if (['add','duplicate','dup','import','custom'].includes(key)) return 'create';
    if (['undo','redo','copy','deselect','rectangle','rect','lasso','select'].includes(key)) return 'edit';
    if (['fps','hold','hold+','hold−','hold-','on-2s','twos','reverse','rev','ping-pong','ping','loop','onion','onion-depth','onion-ghost','ghost','blur','motion-blur','dissolve'].includes(key)) return 'timing';
    if (['show','blend','normal','merge','up','down','layer-opacity','l·op','l-op'].includes(key) || info.section === 'Layers') return 'layer';
    if (['dropper','copy','loop','onion','show'].includes(key)) return 'toggle';
    return 'tool';
  }

  function expandLabel(sub){
    if (!sub) return false;
    if (!sub.dataset.uiIconPolishOriginal) sub.dataset.uiIconPolishOriginal = sub.textContent || '';
    const original = sub.dataset.uiIconPolishOriginal || '';
    const alias = LABEL_ALIASES[normalize(original)];
    if (alias && sub.textContent !== alias) {
      sub.textContent = alias;
      return true;
    }
    return false;
  }

  function ensureStyle(){
    if (document.getElementById('inkframe-ui-icon-polish-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-ui-icon-polish-style';
    style.textContent = [
      'body.inkframe-icon-polish .kid{position:absolute;isolation:isolate}',
      'body.inkframe-icon-polish .kid::after{content:"";position:absolute;inset:-3px;border-radius:999px;pointer-events:none;opacity:.30;box-shadow:0 0 0 1px var(--kid-semantic,rgba(255,240,243,.24));transition:opacity .16s ease,box-shadow .16s ease}',
      'body.inkframe-icon-polish .kid.on::after{opacity:.78;box-shadow:0 0 0 1.5px var(--kid-semantic,rgba(255,240,243,.64)),0 0 18px var(--kid-semantic,rgba(255,240,243,.42))}',
      'body.inkframe-icon-polish .kid.ui-kind-danger{--kid-semantic:rgba(255,80,110,.78)}',
      'body.inkframe-icon-polish .kid.ui-kind-export{--kid-semantic:rgba(95,210,255,.74)}',
      'body.inkframe-icon-polish .kid.ui-kind-create{--kid-semantic:rgba(145,255,195,.68)}',
      'body.inkframe-icon-polish .kid.ui-kind-edit{--kid-semantic:rgba(255,190,120,.58)}',
      'body.inkframe-icon-polish .kid.ui-kind-timing{--kid-semantic:rgba(180,210,255,.64)}',
      'body.inkframe-icon-polish .kid.ui-kind-layer{--kid-semantic:rgba(170,255,220,.64)}',
      'body.inkframe-icon-polish .kid.ui-kind-toggle{--kid-semantic:rgba(255,130,215,.62)}',
      'body.inkframe-icon-polish .kid.ui-kind-branch{--kid-semantic:rgba(255,240,180,.62)}',
      'body.inkframe-icon-polish .kid.ui-kind-dial{--kid-semantic:rgba(255,240,243,.68)}',
      'body.inkframe-icon-polish .kid.ui-kind-branch::after{inset:-5px;border:1px dashed var(--kid-semantic,rgba(255,240,180,.62));box-shadow:none}',
      'body.inkframe-icon-polish .kid.ui-kind-dial::after{inset:-5px;opacity:.48;box-shadow:0 0 0 1px var(--kid-semantic),inset 0 0 18px rgba(255,240,243,.10)}',
      'body.inkframe-icon-polish .kid.ui-kind-danger .sub{text-shadow:0 1px 2px #000,0 0 10px rgba(255,80,110,.55)}',
      'body.inkframe-icon-polish .kid.ui-kind-export .sub{text-shadow:0 1px 2px #000,0 0 10px rgba(95,210,255,.42)}',
      '#inkframe-ui-context{position:fixed;left:50%;top:34px;transform:translateX(-50%);z-index:19;pointer-events:none;max-width:min(520px,70vw);padding:5px 10px;border-radius:999px;background:rgba(10,0,10,.22);border:1px solid rgba(255,240,243,.12);box-shadow:0 5px 16px rgba(10,0,10,.14);font:800 9px/1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#fff0f3;text-shadow:0 1px 2px #000;opacity:0;transition:opacity .16s ease,transform .16s ease;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      'body.inkframe-ui-focus #inkframe-ui-context{opacity:.72;transform:translateX(-50%) translateY(2px)}',
      'body.zen #inkframe-ui-context{opacity:0!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function annotateRoot(root){
    const info = rootInfo(root);
    root.dataset.iconPolishSection = info.section;
    root.dataset.iconPolishRole = info.role;
    const label = info.label || 'Icon';
    root.title = [info.section, info.role, label].filter(Boolean).join(' · ');
    return info;
  }

  function annotateChild(kid, root){
    const sub = kid.querySelector('.sub');
    const changed = expandLabel(sub);
    const kind = classifyChild(kid, root);
    const allKinds = ['danger','export','create','edit','timing','layer','toggle','branch','dial','tool'];
    allKinds.forEach(k => kid.classList.toggle('ui-kind-' + k, k === kind));
    kid.dataset.uiIconKind = kind;
    const info = rootInfo(root);
    const label = childText(kid) || 'Tool';
    kid.title = [info.section, info.role, label].filter(Boolean).join(' · ');
    return { kind, labelChanged: changed };
  }

  function ensureContext(){
    let node = document.getElementById('inkframe-ui-context');
    if (!node) {
      node = document.createElement('div');
      node.id = 'inkframe-ui-context';
      document.body.appendChild(node);
    }
    return node;
  }

  function updateContext(rs){
    const open = rs.filter(n => n.classList.contains('open'));
    const active = open.length ? open[open.length - 1] : null;
    const context = ensureContext();
    if (!active) {
      context.textContent = '';
      return;
    }
    const info = rootInfo(active);
    context.textContent = [info.section, info.role, info.label].filter(Boolean).join(' · ');
  }

  function runPolish(){
    ensureStyle();
    document.body.classList.add('inkframe-icon-polish');
    const rs = roots();
    const kinds = {};
    let labelsChanged = 0;
    rs.forEach(root => {
      annotateRoot(root);
      root.querySelectorAll(':scope > .kids .kid').forEach(kid => {
        const result = annotateChild(kid, root);
        kinds[result.kind] = (kinds[result.kind] || 0) + 1;
        if (result.labelChanged) labelsChanged += 1;
      });
    });
    updateContext(rs);
    lastMetrics = {
      active: true,
      taxonomy: TAXONOMY_VERSION,
      roots: rs.length,
      labelsChanged,
      kinds
    };
    window.__inkframeUIIconPolishMetrics = lastMetrics;
  }

  function schedulePolish(){
    if (queued) return;
    queued = true;
    const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
    raf(() => { queued = false; runPolish(); });
  }

  function reportLines(){
    const m = lastMetrics || window.__inkframeUIIconPolishMetrics;
    if (!m) return ['UI Icon Polish: n/a'];
    const lines = [
      'UI Icon Polish: active',
      'UI icon taxonomy: ' + m.taxonomy,
      'UI icon roots: ' + m.roots,
      'UI icon labels expanded: ' + m.labelsChanged,
    ];
    Object.keys(m.kinds || {}).sort().forEach(kind => {
      lines.push('UI icon kind ' + kind + ': ' + m.kinds[kind]);
    });
    return lines;
  }

  function bridgeIntoTesterReport(){
    if (window.__inkframeUIIconPolishReportBridge) return;
    const circular = window.InkFrameCircularCanvas;
    if (!circular || typeof circular.reportLines !== 'function') return;
    const originalReportLines = circular.reportLines.bind(circular);
    window.__inkframeUIIconPolishReportBridge = true;
    circular.reportLines = function bridgedIconPolishReport(){
      let lines = [];
      try {
        const original = originalReportLines();
        if (Array.isArray(original)) lines = lines.concat(original.map(String));
      } catch (e) {
        lines.push('Circular/UI Layout: report error');
      }
      try {
        lines = lines.concat(reportLines().map(String));
      } catch (e) {
        lines.push('UI Icon Polish: report error');
      }
      return lines;
    };
  }

  function boot(){
    schedulePolish();
    const mo = new MutationObserver(schedulePolish);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', schedulePolish);
    window.addEventListener('orientationchange', () => setTimeout(schedulePolish, 220));
    for (let i = 1; i <= 12; i++) setTimeout(schedulePolish, i * 220);
    for (let i = 1; i <= 10; i++) setTimeout(bridgeIntoTesterReport, i * 250);
    bridgeIntoTesterReport();
  }

  window.InkFrameUIIconPolish = {
    polish: schedulePolish,
    metrics(){ return lastMetrics || window.__inkframeUIIconPolishMetrics || null; },
    reportLines
  };

  ready(boot);
})();
