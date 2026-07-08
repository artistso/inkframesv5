// InkFrame — Circular Timeline Scrubber
// -----------------------------------------------------------------------------
// Adds a pointer-friendly scrub zone over the Circular Canvas timeline. This is a
// thin interaction layer: it does not own frame state. It computes the closest
// filled frame from the circular ring angle, then dispatches normal frame-slot
// pointer events so InkFrame's native timeline logic remains authoritative.
'use strict';

(function installCircularTimelineScrubber(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return;
  if (window.__inkframeCircularTimelineScrubber) return;
  window.__inkframeCircularTimelineScrubber = true;

  let queued = false;
  let scrubbing = false;
  let lastIndex = -1;
  let lastMetrics = null;

  const $ = id => document.getElementById(id);
  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function ensureStyle(){
    if ($('inkframe-circular-scrubber-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-circular-scrubber-style';
    style.textContent = [
      '#inkframe-timeline-scrubber-zone{position:absolute;z-index:14;border-radius:50%;pointer-events:none;opacity:0;touch-action:none;transition:opacity .16s ease,left .16s ease,top .16s ease,width .16s ease,height .16s ease}',
      'body.circular-canvas #inkframe-timeline-scrubber-zone{pointer-events:auto}',
      'body.circular-canvas #inkframe-timeline-scrubber-zone::before{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(from -90deg,rgba(255,240,243,.26),rgba(187,0,55,.30),rgba(255,240,243,.18));-webkit-mask:radial-gradient(circle,transparent 62%,#000 66%,#000 78%,transparent 82%);mask:radial-gradient(circle,transparent 62%,#000 66%,#000 78%,transparent 82%);opacity:.0;transition:opacity .16s ease;filter:drop-shadow(0 0 12px rgba(187,0,55,.20))}',
      'body.circular-canvas.scrubbing-timeline #inkframe-timeline-scrubber-zone::before{opacity:.78}',
      'body.circular-canvas.scrubbing-timeline #inkframe-playhead-bead{filter:drop-shadow(0 0 18px rgba(255,240,243,.88));transform:scale(1.24)!important}',
      '#inkframe-scrub-hud{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:18;pointer-events:none;min-width:96px;text-align:center;padding:6px 10px;border-radius:999px;background:rgba(10,0,10,.46);border:1px solid rgba(255,240,243,.22);box-shadow:0 8px 24px rgba(10,0,10,.30),inset 0 1px 0 rgba(255,255,255,.12);font:900 10px/1 system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:#fff0f3;text-shadow:0 1px 2px #000;opacity:0;transition:opacity .14s ease,transform .14s ease}',
      'body.circular-canvas.scrubbing-timeline #inkframe-scrub-hud{opacity:.90;transform:translate(-50%,-50%) scale(1.02)}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function filledSlots(){
    return Array.from(document.querySelectorAll('#frameBoard .frameSlot.filled'));
  }

  function ensureZone(){
    const board = $('frameBoard');
    if (!board) return null;
    let zone = $('inkframe-timeline-scrubber-zone');
    if (!zone) {
      zone = document.createElement('div');
      zone.id = 'inkframe-timeline-scrubber-zone';
      board.appendChild(zone);
      wireZone(zone);
    } else if (zone.parentElement !== board) {
      board.appendChild(zone);
    }
    let hud = $('inkframe-scrub-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'inkframe-scrub-hud';
      hud.textContent = 'Frame 1';
      board.appendChild(hud);
    } else if (hud.parentElement !== board) {
      board.appendChild(hud);
    }
    return zone;
  }

  function positionZone(){
    if (!document.body.classList.contains('circular-canvas')) return;
    const ring = $('inkframe-timeline-ring');
    const board = $('frameBoard');
    const zone = ensureZone();
    const hud = $('inkframe-scrub-hud');
    if (!ring || !board || !zone) return;
    const rr = ring.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    if (!rr.width || !rr.height || !br.width || !br.height) return;
    zone.style.left = (rr.left - br.left) + 'px';
    zone.style.top = (rr.top - br.top) + 'px';
    zone.style.width = rr.width + 'px';
    zone.style.height = rr.height + 'px';
    if (hud) {
      hud.style.left = (rr.left - br.left + rr.width / 2) + 'px';
      hud.style.top = (rr.top - br.top + rr.height / 2) + 'px';
    }
  }

  function indexFromEvent(ev){
    const zone = $('inkframe-timeline-scrubber-zone');
    const slots = filledSlots();
    if (!zone || !slots.length) return -1;
    const r = zone.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = ev.clientX - cx;
    const dy = ev.clientY - cy;
    const minRing = Math.min(r.width, r.height) * 0.26;
    if ((dx * dx + dy * dy) < (minRing * minRing)) return -1;
    const normalized = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    return Math.max(0, Math.min(slots.length - 1, Math.round((normalized / (Math.PI * 2)) * slots.length) % slots.length));
  }

  function dispatchSlot(slot, type, ev){
    const rect = slot.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    let event;
    try {
      event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: ev && ev.pointerId || 1,
        pointerType: ev && ev.pointerType || 'touch',
        isPrimary: true,
        clientX,
        clientY,
        buttons: type === 'pointerup' ? 0 : 1
      });
    } catch (_) {
      event = new MouseEvent(type === 'pointerup' ? 'mouseup' : 'mousedown', { bubbles: true, cancelable: true, clientX, clientY });
    }
    slot.dispatchEvent(event);
  }

  function activateIndex(index, ev){
    const slots = filledSlots();
    const slot = slots[index];
    if (!slot || index === lastIndex) return;
    lastIndex = index;
    dispatchSlot(slot, 'pointerdown', ev);
    dispatchSlot(slot, 'pointerup', ev);
    const hud = $('inkframe-scrub-hud');
    if (hud) hud.textContent = 'Frame ' + (index + 1);
    lastMetrics = { active: true, lastFrame: index + 1, filledFrames: slots.length, dispatch: 'frameSlot pointerdown/up' };
    window.__inkframeCircularScrubberMetrics = lastMetrics;
    if (window.InkFrameCircularCanvas && typeof window.InkFrameCircularCanvas.scheduleLayout === 'function') {
      window.InkFrameCircularCanvas.scheduleLayout(20);
    }
  }

  function scrubFromEvent(ev){
    const idx = indexFromEvent(ev);
    if (idx < 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    activateIndex(idx, ev);
  }

  function wireZone(zone){
    zone.addEventListener('pointerdown', ev => {
      if (!document.body.classList.contains('circular-canvas')) return;
      scrubbing = true;
      lastIndex = -1;
      document.body.classList.add('scrubbing-timeline');
      try { zone.setPointerCapture(ev.pointerId); } catch (_) {}
      scrubFromEvent(ev);
    });
    zone.addEventListener('pointermove', ev => {
      if (!scrubbing) return;
      scrubFromEvent(ev);
    });
    function stop(ev){
      if (!scrubbing) return;
      scrubFromEvent(ev);
      scrubbing = false;
      document.body.classList.remove('scrubbing-timeline');
      try { zone.releasePointerCapture(ev.pointerId); } catch (_) {}
      setTimeout(schedule, 30);
    }
    zone.addEventListener('pointerup', stop);
    zone.addEventListener('pointercancel', stop);
    zone.addEventListener('lostpointercapture', () => {
      scrubbing = false;
      document.body.classList.remove('scrubbing-timeline');
    });
  }

  function schedule(){
    if (queued) return;
    queued = true;
    const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
    raf(() => {
      queued = false;
      ensureStyle();
      positionZone();
    });
  }

  function reportLines(){
    const m = lastMetrics || window.__inkframeCircularScrubberMetrics;
    if (!m) return ['Circular Scrubber: ready'];
    return [
      'Circular Scrubber: active',
      'Circular scrubber last frame: ' + m.lastFrame,
      'Circular scrubber filled frames: ' + m.filledFrames,
      'Circular scrubber dispatch: ' + m.dispatch
    ];
  }

  function bridgeIntoTesterReport(){
    if (window.__inkframeCircularScrubberReportBridge) return;
    const circular = window.InkFrameCircularCanvas;
    if (!circular || typeof circular.reportLines !== 'function') return;
    const originalReportLines = circular.reportLines.bind(circular);
    window.__inkframeCircularScrubberReportBridge = true;
    circular.reportLines = function bridgedCircularScrubberReport(){
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
        lines.push('Circular Scrubber: report error');
      }
      return lines;
    };
  }

  function boot(){
    ensureStyle();
    schedule();
    const board = $('frameBoard') || document.body;
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(schedule).observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', () => setTimeout(schedule, 220));
    for (let i = 1; i <= 12; i++) setTimeout(schedule, i * 200);
    for (let i = 1; i <= 10; i++) setTimeout(bridgeIntoTesterReport, i * 250);
    bridgeIntoTesterReport();
  }

  window.InkFrameCircularScrubber = {
    layout: schedule,
    metrics(){ return lastMetrics || window.__inkframeCircularScrubberMetrics || null; },
    reportLines
  };

  ready(boot);
})();
