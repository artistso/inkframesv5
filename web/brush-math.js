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

// Circular Canvas v2 prototype. This runs only in real browsers/WebView, not Node/jsdom smoke.
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

  function ensureStyle(){
    if ($('inkframe-circular-canvas-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-circular-canvas-style';
    style.textContent = [
      'body.circular-canvas #frameGlass{border-radius:999px!important;padding:20px!important;box-shadow:0 18px 72px rgba(20,0,14,.70),inset 0 1px 0 rgba(255,240,243,.44),0 0 0 1px rgba(255,240,243,.22)!important}',
      'body.circular-canvas #frameGlass:before{content:"";position:absolute;inset:9px;border-radius:50%;pointer-events:none;z-index:12;border:1px solid rgba(255,240,243,.50);box-shadow:inset 0 0 24px rgba(255,240,243,.20),0 0 32px rgba(187,0,55,.28)}',
      'body.circular-canvas canvas#c{border-radius:50%!important;clip-path:circle(50% at 50% 50%)!important}',
      'body.circular-canvas .frameSlot{border-radius:50%!important;transition:left .18s ease,top .18s ease,width .18s ease,height .18s ease,transform .12s ease,opacity .16s ease!important}',
      'body.circular-canvas .frameSlot.empty{opacity:.30!important}',
      'body.circular-canvas .frameSlot.filled{opacity:.92!important}',
      'body.circular-canvas .frameSlot.cur{opacity:1!important;box-shadow:0 0 0 2px rgba(255,255,255,.95),0 0 18px rgba(187,0,55,.85),inset 0 1px 0 rgba(255,240,243,.85)!important}',
      '#inkframe-timeline-ring{position:absolute;pointer-events:none;border-radius:50%;z-index:11;opacity:0;transition:opacity .18s ease,left .18s ease,top .18s ease,width .18s ease,height .18s ease;background:conic-gradient(from -90deg,rgba(255,240,243,.48) 0deg,rgba(187,0,55,.45) var(--inkframe-progress,0deg),rgba(255,240,243,.10) var(--inkframe-progress,0deg),rgba(255,240,243,.08) 360deg);-webkit-mask:radial-gradient(circle,transparent 66%,#000 68%,#000 72%,transparent 74%);mask:radial-gradient(circle,transparent 66%,#000 68%,#000 72%,transparent 74%);filter:drop-shadow(0 0 12px rgba(187,0,55,.28))}',
      'body.circular-canvas #inkframe-timeline-ring{opacity:1}',
      '#inkframe-circle-toggle{position:fixed;right:12px;bottom:58px;z-index:2147483646;min-width:78px;min-height:38px;padding:9px 12px;border-radius:999px;border:1px solid rgba(255,240,243,.55);background:linear-gradient(160deg,rgba(42,0,26,.92),rgba(187,0,55,.86));color:#fff0f3;font:800 11px/1 system-ui,sans-serif;letter-spacing:.14em;box-shadow:0 8px 26px rgba(20,0,14,.46);touch-action:manipulation}',
      'body.circular-canvas #inkframe-circle-toggle{background:linear-gradient(160deg,rgba(255,240,243,.92),rgba(187,0,55,.92));color:#2a001a}',
      '#inkframe-shape-badge{position:absolute;left:50%;top:-36px;transform:translateX(-50%);z-index:14;pointer-events:none;min-width:132px;text-align:center;padding:6px 12px;border-radius:999px;opacity:0;transition:opacity .18s ease,transform .18s ease;font:850 10px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#fff0f3;text-shadow:0 1px 2px rgba(0,0,0,.85);background:rgba(10,0,10,.50);border:1px solid rgba(255,240,243,.24);box-shadow:0 6px 20px rgba(10,0,10,.32),inset 0 1px 0 rgba(255,255,255,.15)}',
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
      badge.textContent = 'Circular Canvas';
      fg.appendChild(badge);
    }
    return badge;
  }

  function ensureRing(){
    const fg = $('frameGlass');
    if (!fg) return null;
    let ring = $('inkframe-timeline-ring');
    if (!ring) {
      ring = document.createElement('div');
      ring.id = 'inkframe-timeline-ring';
      fg.insertBefore(ring, fg.firstChild);
    }
    return ring;
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
  }

  function restoreSquareBoard(){
    slots().forEach(slot => {
      if (slot.dataset.circleSaved !== '1') return;
      slot.style.left = slot.dataset.squareLeft || '';
      slot.style.top = slot.dataset.squareTop || '';
      slot.style.transform = slot.dataset.squareTransform || '';
      slot.style.width = slot.dataset.squareWidth || '';
      slot.style.height = slot.dataset.squareHeight || '';
      slot.style.opacity = slot.dataset.squareOpacity || '';
      delete slot.dataset.circleSaved;
    });
  }

  function currentSlotIndex(list){
    let cur = list.findIndex(slot => slot.classList.contains('cur'));
    if (cur >= 0) return cur;
    cur = list.findIndex(slot => slot.classList.contains('sel'));
    return cur >= 0 ? cur : 0;
  }

  function layoutCircularBoard(){
    if (!document.body.classList.contains('circular-canvas')) return;
    const board = $('frameBoard'), fg = $('frameGlass'), canvas = $('c');
    if (!board || !fg || !canvas) return;
    ensureBadge();
    const ring = ensureRing();
    const list = slots();
    if (!list.length) return;

    const fgRect = fg.getBoundingClientRect();
    const cRect = canvas.getBoundingClientRect();
    if (!fgRect.width || !fgRect.height || !cRect.width || !cRect.height) return;

    const cx = cRect.left - fgRect.left + cRect.width / 2;
    const cy = cRect.top - fgRect.top + cRect.height / 2;
    const canvasRadius = Math.min(cRect.width, cRect.height) / 2;
    const total = list.length;
    const circumference = Math.max(1, Math.PI * 2 * canvasRadius);
    const idealSlot = clamp(12, Math.floor(circumference / Math.max(total * 1.85, 1)), 24);
    const orbitGap = clamp(8, idealSlot * 0.72, 18);
    const orbitRadius = canvasRadius + idealSlot / 2 + orbitGap;
    const orbitSize = orbitRadius * 2;
    const curIndex = currentSlotIndex(list);
    const progressDeg = total > 1 ? ((curIndex + 1) / total) * 360 : 360;

    if (ring) {
      ring.style.left = (cx - orbitRadius) + 'px';
      ring.style.top = (cy - orbitRadius) + 'px';
      ring.style.width = orbitSize + 'px';
      ring.style.height = orbitSize + 'px';
      ring.style.setProperty('--inkframe-progress', progressDeg + 'deg');
    }

    list.forEach((slot, i) => {
      saveSquare(slot);
      const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
      const isCur = slot.classList.contains('cur');
      const isSel = slot.classList.contains('sel');
      const isEmpty = slot.classList.contains('empty');
      const scale = isCur ? 1.34 : isSel ? 1.16 : 1;
      const size = Math.round(idealSlot * scale);
      const microOrbit = isCur ? 2 : isEmpty ? -1 : 0;
      const r = orbitRadius + microOrbit;
      slot.style.left = (cx + Math.cos(angle) * r) + 'px';
      slot.style.top = (cy + Math.sin(angle) * r) + 'px';
      slot.style.transform = 'translate(-50%,-50%)';
      slot.style.width = size + 'px';
      slot.style.height = size + 'px';
      if (isEmpty) slot.style.opacity = total > 48 ? '.22' : '.32';
      else slot.style.opacity = '1';
    });
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
    if (on) layoutCircularBoard(); else restoreSquareBoard();
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

  function boot(){
    ensureStyle();
    ensureButton();
    let saved = false;
    try { saved = localStorage.getItem(KEY) === '1'; } catch (_) {}
    setMode(saved);
    document.addEventListener('pointerdown', ev => { if (!insideCircle(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);
    document.addEventListener('pointermove', ev => { if (!insideCircle(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);
    const board = $('frameBoard');
    if (board && typeof MutationObserver !== 'undefined') new MutationObserver(layoutCircularBoard).observe(board, { childList:true, subtree:true, attributes:true, attributeFilter:['class','style'] });
    window.addEventListener('resize', () => setTimeout(layoutCircularBoard, 60));
    for (let i = 1; i <= 10; i++) setTimeout(layoutCircularBoard, i * 220);
  }

  ready(boot);
})();
