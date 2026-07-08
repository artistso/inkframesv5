// InkFrame — Circular Canvas prototype module
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
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
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

  function px(value) { return `${value}px`; }

  function ensureStyle() {
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
      '#inkframe-timeline-ring,#inkframe-timeline-ticks,#inkframe-timeline-major-ticks,#inkframe-timeline-center,#inkframe-playhead-bead{position:absolute;pointer-events:none;opacity:0;transition:opacity .18s ease,left .18s ease,top .18s ease,width .18s ease,height .18s ease}',
      '#inkframe-timeline-ring{border-radius:50%;z-index:11;background:conic-gradient(from -90deg,rgba(255,240,243,.50) 0deg,rgba(187,0,55,.52) var(--inkframe-progress,0deg),rgba(255,240,243,.12) var(--inkframe-progress,0deg),rgba(255,240,243,.08) 360deg);-webkit-mask:radial-gradient(circle,transparent 66%,#000 68%,#000 72%,transparent 75%);mask:radial-gradient(circle,transparent 66%,#000 68%,#000 72%,transparent 75%);filter:drop-shadow(0 0 12px rgba(187,0,55,.30))}',
      '#inkframe-timeline-ticks{border-radius:50%;z-index:12;background:repeating-conic-gradient(from -90deg,rgba(255,255,255,.82) 0deg,rgba(255,255,255,.82) 1.05deg,transparent 1.05deg,transparent var(--inkframe-tick-step,12deg));-webkit-mask:radial-gradient(circle,transparent 69%,#000 70%,#000 73%,transparent 75%);mask:radial-gradient(circle,transparent 69%,#000 70%,#000 73%,transparent 75%);filter:drop-shadow(0 0 5px rgba(255,240,243,.34))}',
      '#inkframe-timeline-major-ticks{border-radius:50%;z-index:13;background:repeating-conic-gradient(from -90deg,rgba(255,240,243,.96) 0deg,rgba(255,240,243,.96) 2.1deg,transparent 2.1deg,transparent var(--inkframe-major-step,45deg));-webkit-mask:radial-gradient(circle,transparent 65%,#000 67%,#000 75%,transparent 78%);mask:radial-gradient(circle,transparent 65%,#000 67%,#000 75%,transparent 78%);filter:drop-shadow(0 0 7px rgba(255,240,243,.42))}',
      '#inkframe-timeline-center{border-radius:50%;z-index:11;border:1px dashed rgba(255,240,243,.16);box-shadow:inset 0 0 22px rgba(255,240,243,.06)}',
      '#inkframe-playhead-bead{z-index:15;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;transition:opacity .18s ease,left .16s ease,top .16s ease,transform .16s ease;background:radial-gradient(circle at 38% 32%,#fff 0%,#fff0f3 22%,#ff7bb5 48%,#bb0037 78%,rgba(42,0,26,.95) 100%);box-shadow:0 0 0 1.5px rgba(255,255,255,.92),0 0 16px rgba(187,0,55,.9),0 6px 14px rgba(20,0,14,.42)}',
      'body.circular-canvas #inkframe-timeline-ring,body.circular-canvas #inkframe-timeline-ticks,body.circular-canvas #inkframe-timeline-major-ticks,body.circular-canvas #inkframe-timeline-center,body.circular-canvas #inkframe-playhead-bead{opacity:1}',
      '#inkframe-circle-toggle{position:fixed;right:12px;bottom:58px;z-index:2147483646;min-width:78px;min-height:38px;padding:9px 12px;border-radius:999px;border:1px solid rgba(255,240,243,.55);background:linear-gradient(160deg,rgba(42,0,26,.92),rgba(187,0,55,.86));color:#fff0f3;font:800 11px/1 system-ui,sans-serif;letter-spacing:.14em;box-shadow:0 8px 26px rgba(20,0,14,.46);touch-action:manipulation}',
      'body.circular-canvas #inkframe-circle-toggle{background:linear-gradient(160deg,rgba(255,240,243,.92),rgba(187,0,55,.92));color:#2a001a}',
      '#inkframe-shape-badge{position:absolute;left:50%;top:-32px;transform:translateX(-50%);z-index:14;pointer-events:none;min-width:132px;text-align:center;padding:5px 10px;border-radius:999px;opacity:0;transition:opacity .18s ease,transform .18s ease;font:850 9px/1 system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:#fff0f3;text-shadow:0 1px 2px rgba(0,0,0,.85);background:rgba(10,0,10,.44);border:1px solid rgba(255,240,243,.20);box-shadow:0 5px 16px rgba(10,0,10,.28),inset 0 1px 0 rgba(255,255,255,.12)}',
      'body.circular-canvas #inkframe-shape-badge{opacity:.86;transform:translateX(-50%) translateY(-2px)}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureBadge() {
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

  function ensureBoardElement(id) {
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

  function slots() {
    return Array.prototype.slice.call(document.querySelectorAll('#frameBoard .frameSlot'));
  }

  function saveSquare(slot) {
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

  function restoreSquareBoard() {
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

  function currentSlotIndex(list) {
    let cur = list.findIndex(slot => slot.classList.contains('cur'));
    if (cur < 0) cur = list.findIndex(slot => slot.classList.contains('sel'));
    if (cur >= 0) {
      lastCurIndex = cur;
      return cur;
    }
    return clamp(0, lastCurIndex, Math.max(0, list.length - 1));
  }

  function visibleCircle(boardRect, canvasRect) {
    const side = Math.min(canvasRect.width, canvasRect.height);
    const left = canvasRect.left - boardRect.left + (canvasRect.width - side) / 2;
    const top = canvasRect.top - boardRect.top + (canvasRect.height - side) / 2;
    return { left, top, side, cx: left + side / 2, cy: top + side / 2, radius: side / 2 };
  }

  function computeOrbit(circle, boardRect, total) {
    const circumference = Math.max(1, Math.PI * 2 * circle.radius);
    const density = total > 144 ? 3.25 : total > 96 ? 2.85 : total > 64 ? 2.45 : total > 40 ? 2.12 : 1.95;
    const idealSlot = clamp(7, Math.floor(circumference / Math.max(total * density, 1)), 18);
    const safeBounds = Math.min(circle.cx, circle.cy, boardRect.width - circle.cx, boardRect.height - circle.cy);
    const availableGap = Math.max(0, safeBounds - circle.radius - idealSlot * 0.55);
    const preferredGap = clamp(4, idealSlot * 0.52, 10);
    const orbitGap = Math.min(Math.max(availableGap * 0.56, 2), preferredGap);
    const orbitRadius = circle.radius + orbitGap + idealSlot * 0.34;
    const ringRadius = Math.max(circle.radius + 1, orbitRadius - idealSlot * 0.28);
    return { ...circle, circumference, idealSlot, orbitRadius, ringRadius, orbitGap };
  }

  function setCircleBox(node, cx, cy, radius) {
    const size = radius * 2;
    setStyle(node, 'left', px(cx - radius));
    setStyle(node, 'top', px(cy - radius));
    setStyle(node, 'width', px(size));
    setStyle(node, 'height', px(size));
  }

  function layoutCircularBoard() {
    if (!document.body.classList.contains('circular-canvas')) return;
    if (layoutRunning) return;
    layoutRunning = true;
    try {
      const board = $('frameBoard'), canvas = $('c');
      if (!board || !canvas) return;
      const badge = ensureBadge();
      const ring = ensureBoardElement('inkframe-timeline-ring');
      const ticks = ensureBoardElement('inkframe-timeline-ticks');
      const majorTicks = ensureBoardElement('inkframe-timeline-major-ticks');
      const center = ensureBoardElement('inkframe-timeline-center');
      const bead = ensureBoardElement('inkframe-playhead-bead');
      const list = slots();
      if (!list.length) return;

      const boardRect = board.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      if (!boardRect.width || !boardRect.height || !canvasRect.width || !canvasRect.height) return;

      const total = list.length;
      const circle = visibleCircle(boardRect, canvasRect);
      const orbit = computeOrbit(circle, boardRect, total);
      const curIndex = currentSlotIndex(list);
      const progressDeg = total > 1 ? ((curIndex + 1) / total) * 360 : 360;
      const tickStep = Math.max(2.4, 360 / Math.min(total, 144));
      const majorEvery = total >= 72 ? 12 : total >= 36 ? 6 : total >= 12 ? 4 : 1;
      const majorStep = Math.max(tickStep * majorEvery, tickStep);
      const beadAngle = (curIndex / total) * Math.PI * 2 - Math.PI / 2;
      const beadRadius = orbit.orbitRadius + Math.max(1, orbit.idealSlot * 0.08);

      [ring, ticks, majorTicks].forEach(node => node && setCircleBox(node, orbit.cx, orbit.cy, orbit.ringRadius));
      if (ring) ring.style.setProperty('--inkframe-progress', `${progressDeg}deg`);
      if (ticks) ticks.style.setProperty('--inkframe-tick-step', `${tickStep}deg`);
      if (majorTicks) majorTicks.style.setProperty('--inkframe-major-step', `${majorStep}deg`);
      if (center) setCircleBox(center, orbit.cx, orbit.cy, orbit.radius);
      if (bead) {
        setStyle(bead, 'left', px(orbit.cx + Math.cos(beadAngle) * beadRadius));
        setStyle(bead, 'top', px(orbit.cy + Math.sin(beadAngle) * beadRadius));
        setStyle(bead, 'transform', `scale(${clamp(0.72, orbit.idealSlot / 15, 1.02).toFixed(2)})`);
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
        setStyle(slot, 'left', px(orbit.cx + Math.cos(angle) * radius));
        setStyle(slot, 'top', px(orbit.cy + Math.sin(angle) * radius));
        setStyle(slot, 'transform', 'translate(-50%,-50%)');
        setStyle(slot, 'width', px(size));
        setStyle(slot, 'height', px(size));
        setStyle(slot, 'zIndex', isCur ? '16' : isSel ? '15' : '13');
        setStyle(slot, 'opacity', isEmpty ? (total > 72 ? '.18' : total > 48 ? '.24' : '.32') : '.92');
      });

      lastFrameTotal = total;
      window.__inkframeCircularMetrics = {
        mode: 'circle',
        frames: total,
        currentFrameSlot: curIndex + 1,
        boardCss: `${Math.round(boardRect.width)}x${Math.round(boardRect.height)}`,
        canvasCss: `${Math.round(canvasRect.width)}x${Math.round(canvasRect.height)}`,
        visibleCircleCss: `${Math.round(circle.side)}x${Math.round(circle.side)}`,
        visibleCircleOffset: `${Math.round(circle.left)},${Math.round(circle.top)}`,
        center: `${Math.round(orbit.cx)},${Math.round(orbit.cy)}`,
        canvasRadius: Math.round(orbit.radius),
        orbitRadius: Math.round(orbit.orbitRadius),
        ringRadius: Math.round(orbit.ringRadius),
        orbitGap: Math.round(orbit.orbitGap),
        slotSize: Math.round(orbit.idealSlot),
        tickStepDeg: Number(tickStep.toFixed(2)),
        majorStepDeg: Number(majorStep.toFixed(2)),
        progressDeg: Number(progressDeg.toFixed(2)),
      };
    } finally {
      layoutRunning = false;
    }
  }

  function circularMetricLines() {
    const metrics = window.__inkframeCircularMetrics;
    if (!metrics) return ['Circle metrics: n/a'];
    return [
      'Circle metrics:',
      `- Mode: ${metrics.mode}`,
      `- Frames: ${metrics.frames}`,
      `- Current frame slot: ${metrics.currentFrameSlot}`,
      `- Board CSS: ${metrics.boardCss}`,
      `- Canvas CSS: ${metrics.canvasCss}`,
      `- Visible circle: ${metrics.visibleCircleCss}`,
      `- Visible circle offset: ${metrics.visibleCircleOffset}`,
      `- Circle center: ${metrics.center}`,
      `- Canvas radius: ${metrics.canvasRadius}`,
      `- Orbit radius: ${metrics.orbitRadius}`,
      `- Ring radius: ${metrics.ringRadius}`,
      `- Orbit gap: ${metrics.orbitGap}`,
      `- Slot size: ${metrics.slotSize}`,
      `- Tick step: ${metrics.tickStepDeg}`,
      `- Major tick step: ${metrics.majorStepDeg}`,
      `- Progress degrees: ${metrics.progressDeg}`,
    ];
  }

  function buildCircularTesterReport() {
    const canvas = $('c');
    return [
      'InkFrame Circular Canvas Tester Report',
      `Generated: ${new Date().toISOString()}`,
      `URL: ${location.href}`,
      `Page title: ${document.title || ''}`,
      `Circle mode active: ${document.body.classList.contains('circular-canvas')}`,
      `Viewport: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
      `Screen: ${screen.width}x${screen.height}`,
      `Canvas element: ${canvas ? `${canvas.width}x${canvas.height}` : 'n/a'}`,
      `User agent: ${navigator.userAgent}`,
      '',
      ...circularMetricLines(),
      '',
      'Test notes:',
      '- What I tapped:',
      '- What happened:',
      '- What I expected:',
      '- Does the orbit sit centered on the visible circle?',
      '- Does timeline UI interfere with drawing?',
    ].join('\n');
  }

  function bindTesterReportEnhancer() {
    const btn = $('inkframe-test-report-btn');
    const bridge = window.InkFrameAndroidBridge;
    if (!btn || !bridge || !bridge.copyTesterReport || btn.dataset.circularMetricsBound === '1') return false;
    btn.dataset.circularMetricsBound = '1';
    btn.addEventListener('click', ev => {
      // Replace the debug wrapper report with geometry-focused circular metrics.
      ev.preventDefault();
      ev.stopImmediatePropagation();
      scheduleLayout(0);
      setTimeout(() => bridge.copyTesterReport(buildCircularTesterReport()), 30);
    }, true);
    return true;
  }

  function insideCircle(ev) {
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
    const rad = side / 2;
    const dx = x - rad;
    const dy = y - rad;
    return (dx * dx + dy * dy) <= (rad * rad);
  }

  function setMode(on) {
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

  function ensureButton() {
    if ($('inkframe-circle-toggle')) return;
    const btn = document.createElement('button');
    btn.id = 'inkframe-circle-toggle';
    btn.type = 'button';
    btn.textContent = 'SQUARE';
    btn.setAttribute('aria-label', 'Toggle circular canvas');
    btn.addEventListener('pointerdown', ev => ev.stopPropagation());
    btn.addEventListener('touchstart', ev => ev.stopPropagation(), { passive: true });
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

  function boot() {
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
      }).observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    watchGeometry();
    window.addEventListener('resize', () => scheduleLayout(70));
    window.addEventListener('orientationchange', () => scheduleLayout(240));
    for (let i = 1; i <= 12; i++) setTimeout(() => scheduleLayout(0), i * 180);
    [250, 800, 1500, 2500, 4000].forEach(ms => setTimeout(bindTesterReportEnhancer, ms));
  }

  window.InkFrameCircularCanvas = {
    scheduleLayout,
    setMode,
    metrics: () => window.__inkframeCircularMetrics || null,
    report: buildCircularTesterReport,
  };

  ready(boot);
})();
