// InkFrame — Circular Canvas module
// -----------------------------------------------------------------------------
// Browser/WebView-only feature module. It keeps the circular canvas/timeline
// prototype out of brush-math.js so the brush engine can remain pure and
// testable.
'use strict';

(function installCircularCanvas(){
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
  let debugOn = false;

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
      'body.inkframe-compact-timeline:not(.circular-canvas) #frameBoard .frameSlot{width:13px!important;height:13px!important;opacity:.54!important;border-radius:999px!important;transition:width .16s ease,height .16s ease,opacity .16s ease,box-shadow .16s ease!important}',
      'body.inkframe-compact-timeline:not(.circular-canvas) #frameBoard .frameSlot.filled{opacity:.72!important}',
      'body.inkframe-compact-timeline:not(.circular-canvas) #frameBoard .frameSlot.cur,body.inkframe-compact-timeline:not(.circular-canvas) #frameBoard .frameSlot.sel{width:17px!important;height:17px!important;opacity:.94!important;box-shadow:0 0 0 1px rgba(255,255,255,.72),0 0 12px rgba(187,0,55,.62)!important}',
      'body.circular-canvas #frameGlass{border-radius:999px!important;padding:18px!important;box-shadow:0 16px 62px rgba(20,0,14,.66),inset 0 1px 0 rgba(255,240,243,.40),0 0 0 1px rgba(255,240,243,.20)!important}',
      'body.circular-canvas #frameGlass:before{content:"";position:absolute;inset:11px;border-radius:50%;pointer-events:none;z-index:12;border:1px solid rgba(255,240,243,.46);box-shadow:inset 0 0 20px rgba(255,240,243,.18),0 0 28px rgba(187,0,55,.28)}',
      'body.circular-canvas canvas#c{border-radius:50%!important;clip-path:circle(50% at 50% 50%)!important}',
      'body.circular-canvas .frameSlot{border-radius:50%!important;transition:left .18s ease,top .18s ease,width .18s ease,height .18s ease,transform .12s ease,opacity .16s ease!important}',
      'body.circular-canvas .frameSlot.empty{opacity:.30!important}',
      'body.circular-canvas .frameSlot.filled{opacity:.86!important}',
      'body.circular-canvas .frameSlot.cur{opacity:1!important;box-shadow:0 0 0 1.5px rgba(255,255,255,.94),0 0 16px rgba(187,0,55,.82),inset 0 1px 0 rgba(255,240,243,.84)!important}',
      '#inkframe-timeline-ring{position:absolute;pointer-events:none;border-radius:50%;z-index:11;opacity:0;transition:opacity .18s ease,left .18s ease,top .18s ease,width .18s ease,height .18s ease;background:conic-gradient(from -90deg,rgba(255,240,243,.50) 0deg,rgba(187,0,55,.52) var(--inkframe-progress,0deg),rgba(255,240,243,.12) var(--inkframe-progress,0deg),rgba(255,240,243,.08) 360deg);-webkit-mask:radial-gradient(circle,transparent 66%,#000 68%,#000 72%,transparent 75%);mask:radial-gradient(circle,transparent 66%,#000 68%,#000 72%,transparent 75%);filter:drop-shadow(0 0 12px rgba(187,0,55,.30))}',
      '#inkframe-timeline-ticks{position:absolute;pointer-events:none;border-radius:50%;z-index:12;opacity:0;transition:opacity .18s ease,left .18s ease,top .18s ease,width .18s ease,height .18s ease;background:repeating-conic-gradient(from -90deg,rgba(255,255,255,.82) 0deg,rgba(255,255,255,.82) 1.05deg,transparent 1.05deg,transparent var(--inkframe-tick-step,12deg));-webkit-mask:radial-gradient(circle,transparent 69%,#000 70%,#000 73%,transparent 75%);mask:radial-gradient(circle,transparent 69%,#000 70%,#000 73%,transparent 75%);filter:drop-shadow(0 0 5px rgba(255,240,243,.34))}',
      '#inkframe-timeline-major-ticks{position:absolute;pointer-events:none;border-radius:50%;z-index:13;opacity:0;transition:opacity .18s ease,left .18s ease,top .18s ease,width .18s ease,height .18s ease;background:repeating-conic-gradient(from -90deg,rgba(255,240,243,.96) 0deg,rgba(255,240,243,.96) 2.1deg,transparent 2.1deg,transparent var(--inkframe-major-step,45deg));-webkit-mask:radial-gradient(circle,transparent 65%,#000 67%,#000 75%,transparent 78%);mask:radial-gradient(circle,transparent 65%,#000 67%,#000 75%,transparent 78%);filter:drop-shadow(0 0 7px rgba(255,240,243,.42))}',
      '#inkframe-timeline-center{position:absolute;pointer-events:none;border-radius:50%;z-index:11;opacity:0;transition:opacity .18s ease,left .18s ease,top .18s ease,width .18s ease,height .18s ease;border:1px dashed rgba(255,240,243,.16);box-shadow:inset 0 0 22px rgba(255,240,243,.06)}',
      '#inkframe-playhead-bead{position:absolute;pointer-events:none;z-index:15;opacity:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;transition:opacity .18s ease,left .16s ease,top .16s ease,transform .16s ease;background:radial-gradient(circle at 38% 32%,#fff 0%,#fff0f3 22%,#ff7bb5 48%,#bb0037 78%,rgba(42,0,26,.95) 100%);box-shadow:0 0 0 1.5px rgba(255,255,255,.92),0 0 16px rgba(187,0,55,.9),0 6px 14px rgba(20,0,14,.42)}',
      'body.circular-canvas #inkframe-timeline-ring,body.circular-canvas #inkframe-timeline-ticks,body.circular-canvas #inkframe-timeline-major-ticks,body.circular-canvas #inkframe-timeline-center,body.circular-canvas #inkframe-playhead-bead{opacity:1}',
      '#inkframe-circle-toggle{position:fixed;right:12px;bottom:58px;z-index:2147483646;min-width:78px;min-height:38px;padding:9px 12px;border-radius:999px;border:1px solid rgba(255,240,243,.55);background:linear-gradient(160deg,rgba(42,0,26,.92),rgba(187,0,55,.86));color:#fff0f3;font:800 11px/1 system-ui,sans-serif;letter-spacing:.14em;box-shadow:0 8px 26px rgba(20,0,14,.46);touch-action:manipulation}',
      'body.circular-canvas #inkframe-circle-toggle{background:linear-gradient(160deg,rgba(255,240,243,.92),rgba(187,0,55,.92));color:#2a001a}',
      '#inkframe-shape-badge{position:absolute;left:50%;top:-32px;transform:translateX(-50%);z-index:14;pointer-events:none;min-width:132px;text-align:center;padding:5px 10px;border-radius:999px;opacity:0;transition:opacity .18s ease,transform .18s ease;font:850 9px/1 system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:#fff0f3;text-shadow:0 1px 2px rgba(0,0,0,.85);background:rgba(10,0,10,.44);border:1px solid rgba(255,240,243,.20);box-shadow:0 5px 16px rgba(10,0,10,.28),inset 0 1px 0 rgba(255,255,255,.12)}',
      'body.circular-canvas #inkframe-shape-badge{opacity:.86;transform:translateX(-50%) translateY(-2px)}',
      '#inkframe-circular-debug{position:absolute;inset:0;z-index:2147483000;pointer-events:none;display:none;font:800 9px/1.2 system-ui,sans-serif;color:#fff}',
      'body.inkframe-circular-debug #inkframe-circular-debug{display:block}',
      '#inkframe-circular-debug .dbg{position:absolute;box-sizing:border-box;border-radius:50%;mix-blend-mode:screen}',
      '#inkframe-circular-debug .dbg-circle{border:2px solid rgba(0,255,255,.95);box-shadow:0 0 12px rgba(0,255,255,.55)}',
      '#inkframe-circular-debug .dbg-orbit{border:1px dashed rgba(255,255,0,.95);box-shadow:0 0 10px rgba(255,255,0,.42)}',
      '#inkframe-circular-debug .dbg-ring{border:1px solid rgba(0,255,100,.90);box-shadow:0 0 8px rgba(0,255,100,.38)}',
      '#inkframe-circular-debug .dbg-center{position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px rgba(187,0,55,.9),0 0 14px rgba(255,255,255,.9)}',
      '#inkframe-circular-debug .dbg-label{position:absolute;left:8px;top:8px;max-width:260px;padding:7px 9px;border-radius:10px;background:rgba(10,0,10,.72);border:1px solid rgba(255,240,243,.32);box-shadow:0 6px 18px rgba(0,0,0,.35);white-space:pre-line;text-shadow:0 1px 2px #000}'
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
    const board = $('frameBoard');
    if (!board) return null;
    let node = $(id);
    if (!node) {
      node = document.createElement('div');
      node.id = id;
      board.insertBefore(node, board.firstChild);
    } else if (node.parentElement !== board) {
      board.insertBefore(node, board.firstChild);
    }
    return node;
  }

  function slots(){ return Array.prototype.slice.call(document.querySelectorAll('#frameBoard .frameSlot')); }

  function ensureDebugLayer(){
    const board = $('frameBoard');
    if (!board) return null;
    let layer = $('inkframe-circular-debug');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'inkframe-circular-debug';
      ['circle','orbit','ring'].forEach(name => {
        const box = document.createElement('div');
        box.className = 'dbg dbg-' + name;
        box.dataset.name = name;
        layer.appendChild(box);
      });
      const center = document.createElement('div');
      center.className = 'dbg-center';
      layer.appendChild(center);
      const label = document.createElement('div');
      label.className = 'dbg-label';
      layer.appendChild(label);
      board.appendChild(layer);
    } else if (layer.parentElement !== board) {
      board.appendChild(layer);
    }
    return layer;
  }

  function positionCircleBox(node, cx, cy, radius) {
    if (!node) return;
    const size = radius * 2;
    setStyle(node, 'left', (cx - radius) + 'px');
    setStyle(node, 'top', (cy - radius) + 'px');
    setStyle(node, 'width', size + 'px');
    setStyle(node, 'height', size + 'px');
  }

  function updateDebugLayer(orbit, circle, metrics) {
    if (!debugOn) return;
    const layer = ensureDebugLayer();
    if (!layer) return;
    positionCircleBox(layer.querySelector('.dbg-circle'), circle.cx, circle.cy, orbit.canvasRadius);
    positionCircleBox(layer.querySelector('.dbg-orbit'), orbit.cx, orbit.cy, orbit.orbitRadius);
    positionCircleBox(layer.querySelector('.dbg-ring'), orbit.cx, orbit.cy, orbit.ringRadius);
    const center = layer.querySelector('.dbg-center');
    if (center) {
      setStyle(center, 'left', orbit.cx + 'px');
      setStyle(center, 'top', orbit.cy + 'px');
    }
    const label = layer.querySelector('.dbg-label');
    if (label) {
      label.textContent = [
        'Circular debug',
        'anchor: ' + metrics.anchorLayer,
        'canvas: ' + metrics.canvasCss,
        'visible: ' + metrics.visibleCircleCss,
        'center: ' + Math.round(orbit.cx) + ',' + Math.round(orbit.cy),
        'orbit/ring: ' + metrics.orbitRadius + '/' + metrics.ringRadius,
        'slot: ' + metrics.slotSize,
        'frames: ' + metrics.frames + ' cur ' + metrics.currentFrameSlot
      ].join('\n');
    }
  }

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

  function visibleCircleRect(canvasRect, boardRect) {
    const side = Math.min(canvasRect.width, canvasRect.height);
    const left = canvasRect.left - boardRect.left + (canvasRect.width - side) / 2;
    const top = canvasRect.top - boardRect.top + (canvasRect.height - side) / 2;
    return { left, top, width: side, height: side, cx: left + side / 2, cy: top + side / 2, radius: side / 2 };
  }

  function computeOrbit(circle, boardRect, total){
    const canvasRadius = circle.radius;
    const circumference = Math.max(1, Math.PI * 2 * canvasRadius);
    const density = total > 144 ? 3.25 : total > 96 ? 2.85 : total > 64 ? 2.45 : total > 40 ? 2.12 : 1.95;
    const idealSlot = clamp(7, Math.floor(circumference / Math.max(total * density, 1)), 18);
    const safeBounds = Math.min(circle.cx, circle.cy, boardRect.width - circle.cx, boardRect.height - circle.cy);
    const availableGap = Math.max(0, safeBounds - canvasRadius - idealSlot * 0.55);
    const preferredGap = clamp(4, idealSlot * 0.52, 10);
    const orbitGap = Math.min(Math.max(availableGap * 0.56, 2), preferredGap);
    const orbitRadius = canvasRadius + orbitGap + idealSlot * 0.34;
    const ringRadius = Math.max(canvasRadius + 1, orbitRadius - idealSlot * 0.28);
    return { cx: circle.cx, cy: circle.cy, canvasRadius, circumference, idealSlot, orbitRadius, ringRadius, orbitGap };
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

      const boardRect = board.getBoundingClientRect();
      const cRect = canvas.getBoundingClientRect();
      if (!boardRect.width || !boardRect.height || !cRect.width || !cRect.height) return;

      const circle = visibleCircleRect(cRect, boardRect);
      const total = list.length;
      const orbit = computeOrbit(circle, boardRect, total);
      const curIndex = currentSlotIndex(list);
      const progressDeg = total > 1 ? ((curIndex + 1) / total) * 360 : 360;
      const tickStep = Math.max(2.4, 360 / Math.min(total, 144));
      const majorEvery = total >= 72 ? 12 : total >= 36 ? 6 : total >= 12 ? 4 : 1;
      const majorStep = Math.max(tickStep * majorEvery, tickStep);
      const orbitSize = orbit.ringRadius * 2;
      const centerSize = orbit.canvasRadius * 2;
      const beadAngle = (curIndex / total) * Math.PI * 2 - Math.PI / 2;
      const beadRadius = orbit.orbitRadius + Math.max(1, orbit.idealSlot * 0.08);

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
        setStyle(bead, 'transform', 'scale(' + clamp(0.72, orbit.idealSlot / 15, 1.02).toFixed(2) + ')');
      }
      if (badge) badge.textContent = `Circle · ${total} frames · ${Math.round(orbit.idealSlot)}px`;

      list.forEach((slot, i) => {
        saveSquare(slot);
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const isCur = slot.classList.contains('cur');
        const isSel = slot.classList.contains('sel');
        const isEmpty = slot.classList.contains('empty');
        const scale = isCur ? 1.22 : isSel ? 1.08 : 1;
        const size = Math.round(orbit.idealSlot * scale);
        const microOrbit = isCur ? Math.max(1, orbit.idealSlot * 0.08) : isEmpty ? -Math.max(1, orbit.idealSlot * 0.06) : 0;
        const radius = orbit.orbitRadius + microOrbit;
        setStyle(slot, 'left', (orbit.cx + Math.cos(angle) * radius) + 'px');
        setStyle(slot, 'top', (orbit.cy + Math.sin(angle) * radius) + 'px');
        setStyle(slot, 'transform', 'translate(-50%,-50%)');
        setStyle(slot, 'width', size + 'px');
        setStyle(slot, 'height', size + 'px');
        setStyle(slot, 'zIndex', isCur ? '16' : isSel ? '15' : '13');
        setStyle(slot, 'opacity', isEmpty ? (total > 72 ? '.18' : total > 48 ? '.24' : '.32') : '.92');
      });

      lastFrameTotal = total;
      const metrics = {
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
        canvasCss: Math.round(cRect.width) + 'x' + Math.round(cRect.height),
        visibleCircleCss: Math.round(circle.width) + 'x' + Math.round(circle.height),
        anchorLayer: '#frameBoard',
        debug: debugOn
      };
      window.__inkframeCircularMetrics = metrics;
      window.timelineFrames = Array.from({ length: total }, (_, i) => i + 1);
      window.currentFrame = curIndex + 1;
      updateDebugLayer(orbit, circle, metrics);
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
    const side = Math.min(r.width, r.height);
    const left = (r.width - side) / 2;
    const top = (r.height - side) / 2;
    const x = ev.clientX - r.left - left;
    const y = ev.clientY - r.top - top;
    const cx = side / 2, cy = side / 2, rad = side / 2;
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

  function setDebug(on) {
    debugOn = !!on;
    document.body.classList.toggle('inkframe-circular-debug', debugOn);
    if (debugOn) ensureDebugLayer();
    scheduleLayout(0);
    return debugOn;
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
    const fg = $('frameGlass'), canvas = $('c'), board = $('frameBoard');
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => scheduleLayout(70));
      if (fg) ro.observe(fg);
      if (canvas) ro.observe(canvas);
      if (board) ro.observe(board);
    }
  }

  function boot(){
    ensureStyle();
    ensureButton();
    document.body.classList.add('inkframe-compact-timeline');
    let saved = true;
    try {
      const stored = localStorage.getItem(KEY);
      saved = stored === null ? true : stored === '1';
    } catch (_) {}
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

  window.InkFrameCircularCanvas = {
    scheduleLayout,
    debug: setDebug,
    metrics: () => window.__inkframeCircularMetrics || null,
    reportLines: () => {
      const m = window.__inkframeCircularMetrics;
      if (!m) return ['Circular Canvas: inactive'];
      return [
        'Circular Canvas: active',
        'Circular anchor: ' + m.anchorLayer,
        'Circular debug: ' + (m.debug ? 'on' : 'off'),
        'Visible circle: ' + m.visibleCircleCss,
        'Canvas CSS: ' + m.canvasCss,
        'Frames: ' + m.frames,
        'Current slot: ' + m.currentFrameSlot,
        'Canvas radius: ' + m.canvasRadius,
        'Orbit radius: ' + m.orbitRadius,
        'Ring radius: ' + m.ringRadius,
        'Orbit gap: ' + m.orbitGap,
        'Slot size: ' + m.slotSize,
        'Tick step: ' + m.tickStepDeg,
        'Major tick step: ' + m.majorStepDeg,
        'Progress deg: ' + m.progressDeg,
      ];
    }
  };

  ready(boot);
})();
