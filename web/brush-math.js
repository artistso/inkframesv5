// InkFrame — brush-engine math helpers
'use strict';

const GRAIN_SIZE = 256;

function buildGrain(size, rand) {
  const N = size || GRAIN_SIZE;
  const r = rand || Math.random;
  const raw = new Float32Array(N * N);
  for (let i = 0; i < raw.length; i++) raw[i] = r();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          s += raw[(((y + dy) + N) % N) * N + (((x + dx) + N) % N)];
      out[y * N + x] = (s / 9) * 0.6 + raw[y * N + x] * 0.4;
    }
  }
  return out;
}

function sampleGrain(grain, x, y, size) {
  const N = size || GRAIN_SIZE;
  const ix = (((x | 0) % N) + N) % N;
  const iy = (((y | 0) % N) + N) % N;
  return grain[iy * N + ix];
}

function easeAngle(cur, tgt, k) {
  let dA = ((tgt - cur + Math.PI) % (2 * Math.PI)) - Math.PI;
  return cur + dA * k;
}

function hexWithAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function catmullRom(t, p0, p1, p2, p3) {
  const tt = t * t, ttt = tt * t;
  const b0 = -0.5 * ttt + tt - 0.5 * t;
  const b1 = 1.5 * ttt - 2.5 * tt + 1;
  const b2 = -1.5 * ttt + 2.0 * tt + 0.5 * t;
  const b3 = 0.5 * ttt - 0.5 * tt;
  return [
    b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
    b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
  ];
}

{
  const _api = { GRAIN_SIZE, buildGrain, sampleGrain, easeAngle, hexWithAlpha, catmullRom };
  if (typeof window !== 'undefined') window.InkFrameBrushMath = _api;
  if (typeof module !== 'undefined' && module.exports) module.exports = _api;
}

// Circular Canvas v5 prototype. Runs only in real browsers/WebView, not Node/jsdom smoke.
(function installCircularCanvasPrototype(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeCircularCanvasPrototype) return;
  window.__inkframeCircularCanvasPrototype = true;

  const KEY = 'inkframe.circularCanvas.v1';
  const $ = id => document.getElementById(id);
  const clamp = (min, value, max) => Math.max(min, Math.min(max, value));
  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once:true })
    : fn();

  let layoutQueued = false;
  let layoutRunning = false;
  let layoutTimer = 0;
  let lastCurIndex = 0;
  let lastFrameTotal = 0;

  function scheduleLayout(delay) {
    if (layoutRunning) return;
    if (delay && delay > 0) {
      clearTimeout(layoutTimer);
      layoutTimer = setTimeout(() => scheduleLayout(0), delay);
      return;
    }
    if (layoutQueued) return;
    layoutQueued = true;
    const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
    raf(() => {
      layoutQueued = false;
      layoutCircularBoard();
    });
  }

  function setStyle(node, prop, value) {
    if (!node || node.style[prop] === value) return;
    node.style[prop] = value;
  }

  function ensureStyle(){
    if ($('inkframe-circular-canvas-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-circular-canvas-style';
    style.textContent = [
      'body.circular-canvas #frameGlass{border-radius:999px!important;padding:22px!important;box-shadow:0 18px 76px rgba(20,0,14,.72),inset 0 1px 0 rgba(255,240,243,.46),0 0 0 1px rgba(255,240,243,.24)!important}',
      'body.circular-canvas #frameGlass:before{content:"";position:absolute;inset:10px;border-radius:50%;pointer-events:none;z-index:12;border:1px solid rgba(255,240,243,.58);box-shadow:inset 0 0 28px rgba(255,240,243,.24),0 0 38px rgba(187,0,55,.36)}',
      'body.circular-canvas canvas#c{border-radius:50%!important;clip-path:circle(50% at 50% 50%)!important}',
      'body.circular-canvas .frameSlot{border-radius:50%!important;transition:left .18s ease,top .18s ease,width .18s ease,height .18s ease,transform .12s ease,opacity .16s ease!important}',
      'body.circular-canvas .frameSlot.empty{opacity:.34!important}',
      'body.circular-canvas .frameSlot.filled{opacity:.96!important}',
      'body.circular-canvas .frameSlot.cur{opacity:1!important;box-shadow:0 0 0 2px rgba(255,255,255,.98),0 0 22px rgba(187,0,55,.92),inset 0 1px 0 rgba(255,240,243,.9)!important}',
      '#inkframe-timeline-ring{position:absolute;pointer-events:none;border-radius:50%;z-index:11;opacity:0;transition:opacity .18s ease,left .18s ease,top .18s ease,width .18s ease,height .18s ease;background:conic-gradient(from -90deg,rgba(255,240,243,.58) 0deg,rgba(187,0,55,.58) var(--inkframe-progress,0deg),rgba(255,240,243,.16) var(--inkframe-progress,0deg),rgba(255,240,243,.11) 360deg);-webkit-mask:radial-gradient(circle,transparent 61%,#000 64%,#000 73%,transparent 77%);mask:radial-gradient(circle,transparent 61%,#000 64%,#000 73%,transparent 77%);filter:drop-shadow(0 0 16px rgba(187,0,55,.36))}',
      '#inkframe-timeline-ticks{position:absolute;pointer-events:none;border-radius:50%;z-index:12;opacity:0;transition:opacity .18s ease,left .18s ease,top .18s ease,width .18s ease,height .18s ease;background:repeating-conic-gradient(from -90deg,rgba(255,255,255,.76) 0deg,rgba(255,255,255,.76) 1.35deg,transparent 1.35deg,transparent var(--inkframe-tick-step,12deg));-webkit-mask:radial-gradient(circle,transparent 66%,#000 68%,#000 74%,transparent 77%);mask:radial-gradient(circle,transparent 66%,#000 68%,#000 74%,transparent 77%);filter:drop-shadow(0 0 6px rgba(255,240,243,.38))}',
      '#inkframe-timeline-major-ticks{position:absolute;pointer-events:none;border-radius:50%;z-index:13;opacity:0;transition:opacity .18s ease,left .18s ease,top .18s ease,width .18s ease,height .18s ease;background:repeating-conic-gradient(from -90deg,rgba(255,240,243,.95) 0deg,rgba(255,240,243,.95) 2.6deg,transparent 2.6deg,transparent var(--inkframe-major-step,45deg));-webkit-mask:radial-gradient(circle,transparent 63%,#000 66%,#000 77%,transparent 80%);mask:radial-gradient(circle,transparent 63%,#000 66%,#000 77%,transparent 80%);filter:drop-shadow(0 0 9px rgba(255,240,243,.48))}',
      '#inkframe-timeline-center{position:absolute;pointer-events:none;border-radius:50%;z-index:11;opacity:0;transition:opacity .18s ease,left .18s ease,top .18s ease,width .18s ease,height .18s ease;border:1px dashed rgba(255,240,243,.22);box-shadow:inset 0 0 30px rgba(255,240,243,.08)}',
      '#inkframe-playhead-bead{position:absolute;pointer-events:none;z-index:15;opacity:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;transition:opacity .18s ease,left .16s ease,top .16s ease,transform .16s ease;background:radial-gradient(circle at 38% 32%,#fff 0%,#fff0f3 22%,#ff7bb5 48%,#bb0037 78%,rgba(42,0,26,.95) 100%);box-shadow:0 0 0 2px rgba(255,255,255,.94),0 0 20px rgba(187,0,55,.98),0 8px 18px rgba(20,0,14,.45)}',
      'body.circular-canvas #inkframe-timeline-ring,body.circular-canvas #inkframe-timeline-ticks,body.circular-canvas #inkframe-timeline-major-ticks,body.circular-canvas #inkframe-timeline-center,body.circular-canvas #inkframe-playhead-bead{opacity:1}',
      '#inkframe-circle-toggle{position:fixed;right:12px;bottom:58px;z-index:2147483646;min-width:78px;min-height:38px;padding:9px 12px;border-radius:999px;border:1px solid rgba(255,240,243,.55);background:linear-gradient(160deg,rgba(42,0,26,.92),rgba(187,0,55,.86));color:#fff0f3;font:800 11px/1 system-ui,sans-serif;letter-spacing:.14em;box-shadow:0 8px 26px rgba(20,0,14,.46);touch-action:manipulation}',
      'body.circular-canvas #inkframe-circle-toggle{background:linear-gradient(160deg,rgba(255,240,243,.92),rgba(187,0,55,.92));color:#2a001a}',
      '#inkframe-shape-badge{position:absolute;left:50%;top:-38px;transform:translateX(-50%);z-index:14;pointer-events:none;min-width:150px;text-align:center;padding:6px 12px;border-radius:999px;opacity:0;transition:opacity .18s ease,transform .18s ease;font:850 10px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#fff0f3;text-shadow:0 1px 2px rgba(0,0,0,.85);background:rgba(10,0,10,.50);border:1px solid rgba(255,240,243,.24);box-shadow:0 6px 20px rgba(10,0,10,.32),inset 0 1px 0 rgba(255,255,255,.15)}',
      'body.circular-canvas #inkframe-shape-badge{opacity:1;transform:translateX(-50%) translateY(-2px)}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureBadge(){
    const fg = $('frameGlass');
    if (!fg) return null;
    let badge = $('inkframe-shape-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'inkframe-shape-badge';
      fg.appendChild(badge);
    }
    return badge;
  }

  function ensureOrbitElement(id){
    const fg = $('frameGlass');
    if (!fg) return null;
    let node = $(id);
    if (!node) {
      node = document.createElement('div');
      node.id = id;
      fg.insertBefore(node, fg.firstChild);
    }
    return node;
  }

  function slots(){ return Array.prototype.slice.call(document.querySelectorAll('#frameBoard .frameSlot')); }

  function saveSquare(slot){
    if (slot.dataset.circleSaved === '1') return;
    slot.dataset.circleSaved = '1';
    slot.dataset.squareLeft = slot.style.left || '';
    slot.dataset.squareTop = slot.style.top || '';
    slot.dataset.squareTransform = slot.style.transform || '';
    slot.dataset.squareWidth = slot.style.width || '';
    slot.dataset.squareHeight = slot.style.height || '';
    slot.dataset.squareOpacity = slot.style.opacity || '';
    slot.dataset.squareZIndex = slot.style.zIndex || '';
  }

  function restoreSquareBoard(){
    slots().forEach(slot => {
      if (slot.dataset.circleSaved !== '1') return;
      setStyle(slot, 'left', slot.dataset.squareLeft || '');
      setStyle(slot, 'top', slot.dataset.squareTop || '');
      setStyle(slot, 'transform', slot.dataset.squareTransform || '');
      setStyle(slot, 'width', slot.dataset.squareWidth || '');
      setStyle(slot, 'height', slot.dataset.squareHeight || '');
      setStyle(slot, 'opacity', slot.dataset.squareOpacity || '');
      setStyle(slot, 'zIndex', slot.dataset.squareZIndex || '');
      delete slot.dataset.circleSaved;
    });
    const badge = $('inkframe-shape-badge');
    if (badge) badge.textContent = '';
    window.__inkframeCircularMetrics = null;
  }

  function currentSlotIndex(list){
    let cur = list.findIndex(slot => slot.classList.contains('cur'));
    if (cur < 0) cur = list.findIndex(slot => slot.classList.contains('sel'));
    if (cur >= 0) {
      lastCurIndex = cur;
      return cur;
    }
    return clamp(0, lastCurIndex, Math.max(0, list.length - 1));
  }

  function computeOrbit(cRect, fgRect, total){
    const cx = cRect.left - fgRect.left + cRect.width / 2;
    const cy = cRect.top - fgRect.top + cRect.height / 2;
    const canvasRadius = Math.min(cRect.width, cRect.height) / 2;
    const circumference = Math.max(1, Math.PI * 2 * canvasRadius);
    const density = total > 144 ? 2.9 : total > 96 ? 2.5 : total > 64 ? 2.2 : total > 40 ? 1.95 : 1.72;
    const idealSlot = clamp(9, Math.floor(circumference / Math.max(total * density, 1)), 25);
    const safeBounds = Math.min(cx, cy, fgRect.width - cx, fgRect.height - cy);
    const availableGap = Math.max(0, safeBounds - canvasRadius - idealSlot * 0.65);
    const preferredGap = clamp(9, idealSlot * 0.86, 18);
    const orbitGap = Math.min(Math.max(availableGap * 0.72, 3), preferredGap);
    const orbitRadius = canvasRadius + orbitGap + idealSlot * 0.52;
    const ringRadius = Math.max(canvasRadius + 2, orbitRadius - idealSlot * 0.24);
    return { cx, cy, canvasRadius, circumference, idealSlot, orbitRadius, ringRadius, orbitGap };
  }

  function layoutCircularBoard(){
    if (!document.body.classList.contains('circular-canvas')) return;
    if (layoutRunning) return;
    layoutRunning = true;
    try {
      const board = $('frameBoard'), fg = $('frameGlass'), canvas = $('c');
      if (!board || !fg || !canvas) return;
      const badge = ensureBadge();
      const ring = ensureOrbitElement('inkframe-timeline-ring');
      const ticks = ensureOrbitElement('inkframe-timeline-ticks');
      const majorTicks = ensureOrbitElement('inkframe-timeline-major-ticks');
      const center = ensureOrbitElement('inkframe-timeline-center');
      const bead = ensureOrbitElement('inkframe-playhead-bead');
      const list = slots();
      if (!list.length) return;

      const fgRect = fg.getBoundingClientRect();
      const cRect = canvas.getBoundingClientRect();
      if (!fgRect.width || !fgRect.height || !cRect.width || !cRect.height) return;

      const total = list.length;
      const orbit = computeOrbit(cRect, fgRect, total);
      const curIndex = currentSlotIndex(list);
      const progressDeg = total > 1 ? ((curIndex + 1) / total) * 360 : 360;
      const tickStep = Math.max(2.4, 360 / Math.min(total, 144));
      const majorEvery = total >= 72 ? 12 : total >= 36 ? 6 : total >= 12 ? 4 : 1;
      const majorStep = Math.max(tickStep * majorEvery, tickStep);
      const orbitSize = orbit.ringRadius * 2;
      const centerSize = orbit.canvasRadius * 2;
      const beadAngle = (curIndex / total) * Math.PI * 2 - Math.PI / 2;
      const beadRadius = orbit.orbitRadius + Math.max(2, orbit.idealSlot * 0.14);

      [ring, ticks, majorTicks].forEach(node => {
        if (!node) return;
        setStyle(node, 'left', (orbit.cx - orbit.ringRadius) + 'px');
        setStyle(node, 'top', (orbit.cy - orbit.ringRadius) + 'px');
        setStyle(node, 'width', orbitSize + 'px');
        setStyle(node, 'height', orbitSize + 'px');
      });
      if (ring) ring.style.setProperty('--inkframe-progress', progressDeg + 'deg');
      if (ticks) ticks.style.setProperty('--inkframe-tick-step', tickStep + 'deg');
      if (majorTicks) majorTicks.style.setProperty('--inkframe-major-step', majorStep + 'deg');
      if (center) {
        setStyle(center, 'left', (orbit.cx - orbit.canvasRadius) + 'px');
        setStyle(center, 'top', (orbit.cy - orbit.canvasRadius) + 'px');
        setStyle(center, 'width', centerSize + 'px');
        setStyle(center, 'height', centerSize + 'px');
      }
      if (bead) {
        setStyle(bead, 'left', (orbit.cx + Math.cos(beadAngle) * beadRadius) + 'px');
        setStyle(bead, 'top', (orbit.cy + Math.sin(beadAngle) * beadRadius) + 'px');
        setStyle(bead, 'transform', 'scale(' + clamp(0.82, orbit.idealSlot / 18, 1.16).toFixed(2) + ')');
      }
      if (badge) badge.textContent = `Circular · ${total} frames · ${Math.round(orbit.idealSlot)}px orbit`;

      list.forEach((slot, i) => {
        saveSquare(slot);
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const isCur = slot.classList.contains('cur');
        const isSel = slot.classList.contains('sel');
        const isEmpty = slot.classList.contains('empty');
        const scale = isCur ? 1.34 : isSel ? 1.16 : 1;
        const size = Math.round(orbit.idealSlot * scale);
        const microOrbit = isCur ? Math.max(2, orbit.idealSlot * 0.12) : isEmpty ? -Math.max(1, orbit.idealSlot * 0.08) : 0;
        const radius = orbit.orbitRadius + microOrbit;
        setStyle(slot, 'left', (orbit.cx + Math.cos(angle) * radius) + 'px');
        setStyle(slot, 'top', (orbit.cy + Math.sin(angle) * radius) + 'px');
        setStyle(slot, 'transform', 'translate(-50%,-50%)');
        setStyle(slot, 'width', size + 'px');
        setStyle(slot, 'height', size + 'px');
        setStyle(slot, 'zIndex', isCur ? '16' : isSel ? '15' : '13');
        setStyle(slot, 'opacity', isEmpty ? (total > 72 ? '.20' : total > 48 ? '.26' : '.36') : '1');
      });

      lastFrameTotal = total;
      window.__inkframeCircularMetrics = {
        mode: 'circle',
        frames: total,
        currentFrameSlot: curIndex + 1,
        canvasRadius: Math.round(orbit.canvasRadius),
        orbitRadius: Math.round(orbit.orbitRadius),
        ringRadius: Math.round(orbit.ringRadius),
        orbitGap: Math.round(orbit.orbitGap),
        slotSize: Math.round(orbit.idealSlot),
        tickStepDeg: Number(tickStep.toFixed(2)),
        majorStepDeg: Number(majorStep.toFixed(2)),
        progressDeg: Number(progressDeg.toFixed(2)),
        canvasCss: Math.round(cRect.width) + 'x' + Math.round(cRect.height)
      };
    } finally {
      layoutRunning = false;
    }
  }

  function insideCircle(ev){
    if (!document.body.classList.contains('circular-canvas')) return true;
    const canvas = $('c');
    if (!canvas || ev.target !== canvas) return true;
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return true;
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    const cx = r.width / 2, cy = r.height / 2, rad = Math.min(r.width, r.height) / 2;
    const dx = x - cx, dy = y - cy;
    return (dx * dx + dy * dy) <= (rad * rad);
  }

  function setMode(on){
    document.body.classList.toggle('circular-canvas', !!on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {}
    const btn = $('inkframe-circle-toggle');
    if (btn) {
      btn.textContent = on ? 'CIRCLE' : 'SQUARE';
      btn.setAttribute('aria-pressed', String(!!on));
      btn.title = on ? 'Circular canvas on' : 'Square canvas on';
    }
    if (on) scheduleLayout(0); else restoreSquareBoard();
  }

  function ensureButton(){
    if ($('inkframe-circle-toggle')) return;
    const btn = document.createElement('button');
    btn.id = 'inkframe-circle-toggle';
    btn.type = 'button';
    btn.textContent = 'SQUARE';
    btn.setAttribute('aria-label', 'Toggle circular canvas');
    btn.addEventListener('pointerdown', ev => ev.stopPropagation());
    btn.addEventListener('touchstart', ev => ev.stopPropagation(), { passive:true });
    btn.addEventListener('click', ev => {
      ev.preventDefault(); ev.stopPropagation();
      setMode(!document.body.classList.contains('circular-canvas'));
    });
    document.body.appendChild(btn);
  }

  function watchGeometry() {
    const fg = $('frameGlass'), canvas = $('c');
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => scheduleLayout(70));
      if (fg) ro.observe(fg);
      if (canvas) ro.observe(canvas);
    }
  }

  function boot(){
    ensureStyle();
    ensureButton();
    let saved = false;
    try { saved = localStorage.getItem(KEY) === '1'; } catch (_) {}
    setMode(saved);
    document.addEventListener('pointerdown', ev => { if (!insideCircle(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);
    document.addEventListener('pointermove', ev => { if (!insideCircle(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);
    const board = $('frameBoard');
    if (board && typeof MutationObserver !== 'undefined') {
      new MutationObserver(mutations => {
        const meaningful = mutations.some(m => m.type === 'childList' || (m.type === 'attributes' && m.attributeName === 'class'));
        if (meaningful) scheduleLayout(lastFrameTotal ? 90 : 20);
      }).observe(board, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
    }
    watchGeometry();
    window.addEventListener('resize', () => scheduleLayout(70));
    window.addEventListener('orientationchange', () => scheduleLayout(240));
    for (let i = 1; i <= 12; i++) setTimeout(() => scheduleLayout(0), i * 180);
  }

  ready(boot);
})();
