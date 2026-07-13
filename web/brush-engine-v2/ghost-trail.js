// InkFrame Brush Engine V2 — display-only accepted-sample Ghost Trail
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
  const managers = typeof WeakMap === 'function' ? new WeakMap() : null;
  let sessionSerial = 0;

  function normalizeGhostOptions(value) {
    const input = value || {};
    const mode = input.mode === 'comet' || input.mode === 'echo' ? input.mode : 'off';
    return Object.freeze({
      mode,
      intensity: clamp(input.intensity ?? 0.65, 0, 1),
      durationMs: clamp(input.durationMs ?? 380, 80, 1200),
      widthScale: clamp(input.widthScale ?? 1.3, 0.5, 2.5),
      maxPoints: Math.round(clamp(input.maxPoints ?? 4096, 64, 8192)),
    });
  }

  function ghostGapLimit(from, to) {
    const radius = Math.max(0.05, Number(from && from.radius) || 0, Number(to && to.radius) || 0);
    const elapsed = Math.max(0, Math.min(250, (Number(to && to.time) || 0) - (Number(from && from.time) || 0)));
    return Math.max(24, radius * 8, elapsed * 2.5);
  }

  function ghostEnvelope(ageMs, durationMs, mode) {
    const life = clamp(1 - ageMs / Math.max(1, durationMs), 0, 1);
    if (mode === 'echo') return life * life * (0.72 + 0.28 * Math.sin(life * Math.PI));
    return life * life;
  }

  function buildGhostSegments(points, now) {
    const segments = [];
    for (let index = 1; index < points.length; index++) {
      const from = points[index - 1];
      const to = points[index];
      if (!from || !to
        || from.sessionId !== to.sessionId
        || from.strokeId !== to.strokeId
        || to.strokeStart) continue;
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      if (!(distance > 1e-7) || distance > ghostGapLimit(from, to)) continue;
      const options = to.options;
      const age = Math.max(0, now - (from.born + to.born) * 0.5);
      if (age >= options.durationMs) continue;
      const envelope = ghostEnvelope(age, options.durationMs, options.mode);
      const radius = Math.max(0.05, (from.radius + to.radius) * 0.5);
      segments.push(Object.freeze({
        from,
        to,
        age,
        distance,
        radius,
        width: radius * 2 * options.widthScale,
        alpha: clamp(options.intensity * envelope, 0, 1),
        mode: options.mode,
        color: to.color,
        brushId: to.brushId,
      }));
    }
    return segments;
  }

  function createOverlay(target) {
    const doc = target && target.ownerDocument || root.document;
    if (!doc || !doc.createElement || !doc.body) return null;
    const overlay = doc.createElement('canvas');
    overlay.className = 'inkframe-v2-ghost-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position:'fixed',
      left:'0px',
      top:'0px',
      width:'0px',
      height:'0px',
      zIndex:'99996',
      pointerEvents:'none',
      touchAction:'none',
      opacity:'1',
      mixBlendMode:'screen',
      display:'none',
    });
    doc.body.appendChild(overlay);
    return overlay;
  }

  function createManager(target) {
    const overlay = createOverlay(target);
    const context = overlay && overlay.getContext ? overlay.getContext('2d') : null;
    let points = [];
    let frame = 0;
    let renderedFrames = 0;
    let acceptedPoints = 0;
    let rejectedPoints = 0;
    let activeSessions = 0;

    const raf = typeof root.requestAnimationFrame === 'function'
      ? callback => root.requestAnimationFrame(callback)
      : callback => root.setTimeout(() => callback(Date.now()), 16);
    const cancel = typeof root.cancelAnimationFrame === 'function'
      ? id => root.cancelAnimationFrame(id)
      : id => root.clearTimeout(id);
    const clock = () => root.performance && typeof root.performance.now === 'function'
      ? root.performance.now()
      : Date.now();

    function syncOverlay() {
      if (!overlay || !target || typeof target.getBoundingClientRect !== 'function') return false;
      const rect = target.getBoundingClientRect();
      const width = Math.max(1, Number(target.width) || Math.round(rect.width) || 1);
      const height = Math.max(1, Number(target.height) || Math.round(rect.height) || 1);
      if (overlay.width !== width) overlay.width = width;
      if (overlay.height !== height) overlay.height = height;
      overlay.style.left = (Number(rect.left) || 0) + 'px';
      overlay.style.top = (Number(rect.top) || 0) + 'px';
      overlay.style.width = Math.max(0, Number(rect.width) || 0) + 'px';
      overlay.style.height = Math.max(0, Number(rect.height) || 0) + 'px';
      return true;
    }

    function drawLine(segment, widthScale, alphaScale) {
      if (!context || !(segment.alpha > 0)) return;
      context.save();
      context.globalCompositeOperation = 'screen';
      context.globalAlpha = clamp(segment.alpha * alphaScale, 0, 1);
      context.strokeStyle = segment.color;
      context.lineWidth = Math.max(0.1, segment.width * widthScale);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(segment.from.x, segment.from.y);
      context.lineTo(segment.to.x, segment.to.y);
      context.stroke();
      context.restore();
    }

    function render() {
      frame = 0;
      const now = clock();
      let maximumDuration = 0;
      for (const point of points) maximumDuration = Math.max(maximumDuration, point.options.durationMs);
      points = points.filter(point => now - point.born < maximumDuration);
      if (!context || !overlay || !syncOverlay()) return;
      context.clearRect(0, 0, overlay.width, overlay.height);
      const segments = buildGhostSegments(points, now);
      if (!segments.length) {
        overlay.style.display = 'none';
        return;
      }
      overlay.style.display = 'block';
      for (const segment of segments) {
        if (segment.mode === 'echo') {
          drawLine(segment, 2.8, 0.10);
          drawLine(segment, 1.8, 0.20);
          drawLine(segment, 1.0, 0.52);
        } else {
          drawLine(segment, 2.2, 0.14);
          drawLine(segment, 1.0, 0.62);
        }
      }
      renderedFrames++;
      frame = raf(render);
    }

    function schedule() {
      if (!frame && points.length) frame = raf(render);
    }

    function begin(options, metadata) {
      const config = normalizeGhostOptions(options);
      const sessionId = ++sessionSerial;
      const color = String(metadata && metadata.color || '#fff0f3');
      const brushId = String(metadata && metadata.brushId || 'ink');
      let ended = false;
      let lastStrokeId = null;
      activeSessions++;

      function push(dabs) {
        if (ended || config.mode === 'off' || !(config.intensity > 0)) return 0;
        const now = clock();
        let added = 0;
        for (const dab of dabs || []) {
          const x = Number(dab && dab.x);
          const y = Number(dab && dab.y);
          const radius = Number(dab && dab.radius);
          if (!Number.isFinite(x) || !Number.isFinite(y) || !(radius > 0)) {
            rejectedPoints++;
            continue;
          }
          const strokeId = Number(dab.strokeId) || 0;
          points.push(Object.freeze({
            sessionId,
            strokeId,
            strokeStart: !!dab.strokeStart || lastStrokeId !== null && strokeId !== lastStrokeId,
            x,
            y,
            radius,
            time: Number(dab.time) || 0,
            born: now,
            color: brushId === 'eraser' ? '#fff0f3' : color,
            brushId,
            options: config,
          }));
          lastStrokeId = strokeId;
          acceptedPoints++;
          added++;
        }
        if (points.length > config.maxPoints) points.splice(0, points.length - config.maxPoints);
        schedule();
        return added;
      }

      function end() {
        if (ended) return false;
        ended = true;
        activeSessions = Math.max(0, activeSessions - 1);
        schedule();
        return true;
      }

      return Object.freeze({
        push,
        end,
        clear: () => { points = points.filter(point => point.sessionId !== sessionId); schedule(); },
        options: config,
        sessionId,
      });
    }

    function clear() {
      points = [];
      if (frame) cancel(frame);
      frame = 0;
      if (context && overlay) context.clearRect(0, 0, overlay.width, overlay.height);
      if (overlay) overlay.style.display = 'none';
    }

    function stats() {
      return Object.freeze({
        points: points.length,
        acceptedPoints,
        rejectedPoints,
        renderedFrames,
        activeSessions,
        overlayAvailable: !!(overlay && context),
      });
    }

    return Object.freeze({ begin, clear, stats, overlay:() => overlay });
  }

  function managerFor(target) {
    if (!target) return null;
    if (!managers) return createManager(target);
    let manager = managers.get(target);
    if (!manager) {
      manager = createManager(target);
      managers.set(target, manager);
    }
    return manager;
  }

  function createGhostTrailSession(target, options, metadata) {
    const manager = managerFor(target);
    if (!manager) {
      return Object.freeze({ push:() => 0, end:() => false, clear:() => {}, options:normalizeGhostOptions({mode:'off'}), sessionId:0 });
    }
    return manager.begin(options, metadata);
  }

  const api = {
    normalizeGhostOptions,
    ghostGapLimit,
    ghostEnvelope,
    buildGhostSegments,
    createGhostTrailSession,
    ghostTrailManagerFor:managerFor,
  };
  Object.assign(ns, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
