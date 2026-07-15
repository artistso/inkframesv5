// InkFrame Brush Engine V2 — debug-only on-device performance diagnostics
'use strict';

(function(root){
  const build = root.InkFrameBuild || {};
  const enabled = () => !!build.diagnostics && build.traceTools !== false;
  const adapter = () => root.InkFrameBrushV2Adapter || null;
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const integer = value => Math.max(0, Math.round(finite(value)));
  const percent = value => `${Math.max(0, Math.min(100, finite(value))).toFixed(1)}%`;
  const COUNTERS = [
    'frames','queuedEvents','processedEvents','compactedEvents','liveRenders',
    'stampHits','stampMisses','stampFallbacks','paintedDabs','ribbonLines',
  ];

  let card = null;
  let fields = null;
  let statusNode = null;
  let baseline = null;
  let timer = 0;

  function performanceSnapshot() {
    const api = adapter();
    const value = api && typeof api.performanceStats === 'function' ? api.performanceStats() : {};
    return Object.assign({}, value || {});
  }

  function capture() {
    const api = adapter();
    const performance = performanceSnapshot();
    const input = root.InkFrameBrushV2InputBridge && typeof root.InkFrameBrushV2InputBridge.stats === 'function'
      ? root.InkFrameBrushV2InputBridge.stats() : {};
    const session = api && typeof api.sessionStats === 'function' ? api.sessionStats() : {};
    const ghost = api && typeof api.ghostTrailStats === 'function' ? api.ghostTrailStats() : {};
    return Object.freeze({
      capturedAt: new Date().toISOString(),
      build: Object.freeze({
        variant: String(build.variant || 'unknown'),
        diagnostics: !!build.diagnostics,
        defaultBrushEngine: String(build.defaultBrushEngine || 'unknown'),
      }),
      performance: Object.freeze(Object.assign({}, performance)),
      input: Object.freeze(Object.assign({}, input || {})),
      session: Object.freeze(Object.assign({}, session || {})),
      ghost: Object.freeze(Object.assign({}, ghost || {})),
    });
  }

  function counterDelta(current, start) {
    const output = Object.assign({}, current || {});
    for (const key of COUNTERS) output[key] = Math.max(0, finite(current && current[key]) - finite(start && start[key]));
    return output;
  }

  function formatStats(snapshot, start) {
    const current = snapshot && snapshot.performance || {};
    const performance = counterDelta(current, start && start.performance);
    const frames = integer(performance.frames);
    const processed = integer(performance.processedEvents);
    const stampHits = integer(performance.stampHits);
    const stampMisses = integer(performance.stampMisses);
    const stampTotal = stampHits + stampMisses;
    return Object.freeze({
      active: !!current.active,
      queue: String(integer(current.queued)),
      queuedEvents: String(integer(performance.queuedEvents)),
      processedEvents: String(processed),
      frames: String(frames),
      eventsPerFrame: frames ? (processed / frames).toFixed(2) : '0.00',
      compactedEvents: String(integer(performance.compactedEvents)),
      liveRenders: String(integer(performance.liveRenders)),
      stampHitRate: stampTotal ? percent(stampHits * 100 / stampTotal) : '—',
      stampCache: `${integer(current.stampCacheSize)} / 96`,
      paintedDabs: String(integer(performance.paintedDabs)),
      ribbonLines: String(integer(performance.ribbonLines)),
      framePolicy: `${integer(current.maxEventsPerFrame)} events / ${finite(current.frameBudgetMs).toFixed(1)} ms`,
      status: integer(performance.compactedEvents) > 0
        ? 'Backlog compacted'
        : (current.active ? 'Drawing — display paused' : 'No queue compaction'),
    });
  }

  function addMetric(grid, key, label) {
    const item = root.document.createElement('div');
    item.className = 'inkframe-v2-perf-metric';
    const name = root.document.createElement('span');
    name.textContent = label;
    const value = root.document.createElement('strong');
    value.dataset.perfMetric = key;
    value.textContent = '—';
    item.append(name, value);
    grid.appendChild(item);
    return value;
  }

  function render(snapshot) {
    if (!card || !fields) return false;
    const formatted = formatStats(snapshot || capture(), baseline);
    for (const [key, node] of Object.entries(fields)) node.textContent = formatted[key] || '—';
    statusNode.textContent = formatted.status;
    statusNode.dataset.state = formatted.compactedEvents !== '0' ? 'warning' : (formatted.active ? 'active' : 'ok');
    card.dataset.active = String(formatted.active);
    card.dataset.compacted = formatted.compactedEvents;
    return true;
  }

  function setBaseline() {
    baseline = capture();
    render(baseline);
    return baseline;
  }

  async function copySnapshot() {
    const value = capture();
    const payload = JSON.stringify({ baseline, snapshot:value }, null, 2);
    try {
      if (root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === 'function') {
        await root.navigator.clipboard.writeText(payload);
        statusNode.textContent = 'Snapshot copied';
        return true;
      }
    } catch (_) {}
    statusNode.textContent = 'Clipboard unavailable';
    return false;
  }

  function install() {
    if (!enabled() || !root.document) return false;
    if (card && card.isConnected) return true;
    const primary = root.document.querySelector('#inkframe-v2-lab-section-diagnostics .inkframe-v2-lab-primary');
    if (!primary) return false;

    const style = root.document.createElement('style');
    style.textContent = `
      #inkframe-v2-performance-diagnostics{opacity:1;margin-top:2px}
      .inkframe-v2-perf-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .inkframe-v2-perf-head strong{font-size:13px;letter-spacing:.025em}
      .inkframe-v2-perf-status{padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.08);font-size:10px;white-space:nowrap}
      .inkframe-v2-perf-status[data-state="ok"]{background:rgba(40,190,120,.15);color:#bdf5d4}
      .inkframe-v2-perf-status[data-state="warning"]{background:rgba(255,160,40,.18);color:#ffe0ac}
      .inkframe-v2-perf-status[data-state="active"]{background:rgba(90,150,255,.16);color:#cfe0ff}
      .inkframe-v2-perf-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      .inkframe-v2-perf-metric{min-width:0;padding:9px;border-radius:10px;background:rgba(255,255,255,.035)}
      .inkframe-v2-perf-metric span{display:block;opacity:.58;font-size:9px;text-transform:uppercase;letter-spacing:.055em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .inkframe-v2-perf-metric strong{display:block;margin-top:4px;font:760 13px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .inkframe-v2-perf-actions{display:flex;gap:7px;margin-top:10px}
      .inkframe-v2-perf-actions button{min-height:38px;flex:1;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(255,255,255,.07);color:#fff;font:700 10px/1 system-ui,sans-serif}
      .inkframe-v2-perf-note{margin:9px 0 0;opacity:.58;font-size:10px;line-height:1.4}
      @media(max-width:760px){.inkframe-v2-perf-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    root.document.head.appendChild(style);

    card = root.document.createElement('section');
    card.id = 'inkframe-v2-performance-diagnostics';
    card.className = 'inkframe-v2-diag-card';
    const head = root.document.createElement('div');
    head.className = 'inkframe-v2-perf-head';
    const title = root.document.createElement('strong');
    title.textContent = 'S Pen performance';
    statusNode = root.document.createElement('span');
    statusNode.className = 'inkframe-v2-perf-status';
    statusNode.textContent = 'Initializing';
    head.append(title, statusNode);

    const grid = root.document.createElement('div');
    grid.className = 'inkframe-v2-perf-grid';
    fields = {
      queue:addMetric(grid,'queue','Queue now'),
      queuedEvents:addMetric(grid,'queuedEvents','Moves queued'),
      processedEvents:addMetric(grid,'processedEvents','Moves processed'),
      frames:addMetric(grid,'frames','Flush frames'),
      eventsPerFrame:addMetric(grid,'eventsPerFrame','Events / frame'),
      compactedEvents:addMetric(grid,'compactedEvents','Compacted'),
      liveRenders:addMetric(grid,'liveRenders','Live composites'),
      stampHitRate:addMetric(grid,'stampHitRate','Stamp hit rate'),
      stampCache:addMetric(grid,'stampCache','Stamp cache'),
      paintedDabs:addMetric(grid,'paintedDabs','Painted dabs'),
      ribbonLines:addMetric(grid,'ribbonLines','Ribbon lines'),
      framePolicy:addMetric(grid,'framePolicy','Frame policy'),
    };

    const actions = root.document.createElement('div');
    actions.className = 'inkframe-v2-perf-actions';
    const baselineButton = root.document.createElement('button');
    baselineButton.type = 'button';
    baselineButton.textContent = 'Set test baseline';
    baselineButton.addEventListener('click', setBaseline);
    const copyButton = root.document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = 'Copy JSON snapshot';
    copyButton.addEventListener('click', copySnapshot);
    actions.append(baselineButton, copyButton);

    const note = root.document.createElement('p');
    note.className = 'inkframe-v2-perf-note';
    note.textContent = 'Display refresh pauses during active strokes so diagnostics do not compete with S Pen input. Set a baseline immediately before each Original/V2 comparison.';
    card.append(head, grid, actions, note);
    primary.appendChild(card);
    setBaseline();
    return true;
  }

  function visible() {
    if (!card || !card.isConnected) return false;
    const section = card.closest && card.closest('.inkframe-v2-lab-section');
    const lab = root.document && root.document.getElementById('inkframe-v2-tuning');
    return !!section && !section.hidden && !!lab && !lab.hidden;
  }

  function tick() {
    timer = 0;
    if (!card || !card.isConnected) install();
    const stats = performanceSnapshot();
    if (visible() && !stats.active) render(capture());
    timer = root.setTimeout(tick, 350);
  }

  const api = Object.freeze({ enabled, capture, counterDelta, formatStats, install, render, setBaseline, copySnapshot });
  root.InkFrameBrushV2PerformanceUI = api;
  if (enabled() && root.document) {
    const start = () => {
      if (!install()) return void root.setTimeout(start, 0);
      if (!timer) timer = root.setTimeout(tick, 350);
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
    else start();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
