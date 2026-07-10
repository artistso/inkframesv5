// InkFrame — Stylus-Safe Canvas Navigation
// -----------------------------------------------------------------------------
// Adds viewport navigation around the existing square canvas without taking
// ownership of document pixels or the painter's internal display scale.
//
// Normal drawing mode:
//   • one pen/finger continues to draw through the existing painter
//   • two fingers keep the existing pinch-scale and add anchored panning
//   • mouse wheel / trackpad zooms around the cursor
//
// Hand mode:
//   • one pointer pans
//   • two pointers pan + zoom
//   • drawing events are intercepted before they reach the canvas
'use strict';

(function installInkFrameCanvasNavigation(root, factory){
  const api = factory(root);
  if (root) root.InkFrameCanvasNavigation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildCanvasNavigation(root){
  const VERSION = 'v1-anchored-pan-zoom';
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 5;
  const SAFE_MARGIN = 54;

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  let installed = false;
  let stage = null;
  let canvas = null;
  let frame = null;
  let viewport = null;
  let navButton = null;
  let fitButton = null;
  let zoomButton = null;
  let transformRule = null;

  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let navMode = false;
  let spaceHeld = false;

  const touches = new Map();
  const activePens = new Set();
  const handPointers = new Map();
  let normalGesture = null;
  let normalGestureRAF = 0;
  let handGesture = null;

  let metrics = {
    active: false,
    version: VERSION,
    wrapperPresent: false,
    navTogglePresent: false,
    fitPresent: false,
    zoomDisplayPresent: false,
    navMode: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    wheelZooms: 0,
    handPans: 0,
    handPinches: 0,
    touchPanFrames: 0,
    fitCount: 0,
    resetCount: 0,
  };

  function midpoint(points){
    const list = Array.from(points.values ? points.values() : points);
    if (!list.length) return { x: 0, y: 0 };
    let x = 0, y = 0;
    for (const point of list) { x += point.x; y += point.y; }
    return { x: x / list.length, y: y / list.length };
  }

  function distance(points){
    const list = Array.from(points.values ? points.values() : points);
    if (list.length < 2) return 0;
    return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
  }

  function anchorCoordinates(rect, point){
    const width = Math.max(0.0001, finite(rect && rect.width, 1));
    const height = Math.max(0.0001, finite(rect && rect.height, 1));
    return {
      u: (finite(point && point.x, 0) - finite(rect && rect.left, 0)) / width,
      v: (finite(point && point.y, 0) - finite(rect && rect.top, 0)) / height,
    };
  }

  function anchorCorrection(rect, anchor, desiredPoint){
    return {
      x: finite(desiredPoint && desiredPoint.x, 0) - (finite(rect && rect.left, 0) + finite(anchor && anchor.u, 0.5) * Math.max(0.0001, finite(rect && rect.width, 1))),
      y: finite(desiredPoint && desiredPoint.y, 0) - (finite(rect && rect.top, 0) + finite(anchor && anchor.v, 0.5) * Math.max(0.0001, finite(rect && rect.height, 1))),
    };
  }

  function ensureTransformRule(){
    if (transformRule || typeof document === 'undefined') return;
    let style = document.getElementById('inkframe-canvas-navigation-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'inkframe-canvas-navigation-style';
      style.textContent = [
        '#inkframe-canvas-viewport{position:relative;display:block;transform-origin:50% 50%;will-change:transform;touch-action:none}',
        'body.inkframe-canvas-hand #inkframe-canvas-viewport{cursor:grab}',
        'body.inkframe-canvas-hand.inkframe-canvas-panning #inkframe-canvas-viewport{cursor:grabbing}',
        '#inkframe-canvas-nav-toggle[aria-pressed="true"]{background:rgba(187,0,55,.46)!important;border-color:rgba(255,240,243,.64)!important}',
        '#inkframe-canvas-zoom-display{min-width:48px}',
      ].join('\n');
      document.head.appendChild(style);
    }
    try {
      const sheet = style.sheet;
      if (sheet) {
        for (const rule of Array.from(sheet.cssRules || [])) {
          if (rule.selectorText === '#inkframe-canvas-viewport') { transformRule = rule; break; }
        }
      }
    } catch (_) {}
  }

  function ensureViewport(){
    if (!stage || !frame) return null;
    viewport = document.getElementById('inkframe-canvas-viewport');
    if (!viewport) {
      viewport = document.createElement('div');
      viewport.id = 'inkframe-canvas-viewport';
      stage.insertBefore(viewport, frame);
      viewport.appendChild(frame);
    } else if (frame.parentElement !== viewport) {
      viewport.appendChild(frame);
    }
    ensureTransformRule();
    return viewport;
  }

  function updateMetrics(){
    metrics.active = installed;
    metrics.wrapperPresent = !!viewport;
    metrics.navTogglePresent = !!document.getElementById('inkframe-canvas-nav-toggle');
    metrics.fitPresent = !!document.getElementById('inkframe-canvas-fit');
    metrics.zoomDisplayPresent = !!document.getElementById('inkframe-canvas-zoom-display');
    metrics.navMode = navMode;
    metrics.zoom = zoom;
    metrics.panX = panX;
    metrics.panY = panY;
    root.__inkframeCanvasNavigationMetrics = { ...metrics };
    return { ...metrics };
  }

  function writeTransform(){
    ensureTransformRule();
    const value = `translate3d(${panX.toFixed(2)}px,${panY.toFixed(2)}px,0) scale(${zoom.toFixed(5)})`;
    if (transformRule && transformRule.style) transformRule.style.transform = value;
    else if (viewport) viewport.style.transform = value;
    if (zoomButton) {
      zoomButton.textContent = Math.round(zoom * 100) + '%';
      zoomButton.title = 'Viewport zoom. Tap to reset navigation to 100%.';
    }
    updateMetrics();
  }

  function setView(next){
    const value = next || {};
    panX = finite(value.panX, panX);
    panY = finite(value.panY, panY);
    zoom = clamp(finite(value.zoom, zoom), MIN_ZOOM, MAX_ZOOM);
    writeTransform();
    return updateMetrics();
  }

  function canvasRect(){
    return canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left:0, top:0, width:1, height:1, right:1, bottom:1 };
  }

  function clampView(){
    if (!canvas || typeof window === 'undefined') return;
    let rect = canvasRect();
    let dx = 0, dy = 0;
    if (rect.right < SAFE_MARGIN) dx = SAFE_MARGIN - rect.right;
    else if (rect.left > window.innerWidth - SAFE_MARGIN) dx = window.innerWidth - SAFE_MARGIN - rect.left;
    if (rect.bottom < SAFE_MARGIN) dy = SAFE_MARGIN - rect.bottom;
    else if (rect.top > window.innerHeight - SAFE_MARGIN) dy = window.innerHeight - SAFE_MARGIN - rect.top;
    if (dx || dy) {
      panX += dx; panY += dy;
      writeTransform();
      rect = canvasRect();
    }
    return rect;
  }

  function zoomAt(clientX, clientY, nextZoom){
    if (!canvas) return;
    const before = canvasRect();
    const anchor = anchorCoordinates(before, { x: clientX, y: clientY });
    zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    writeTransform();
    const after = canvasRect();
    const correction = anchorCorrection(after, anchor, { x: clientX, y: clientY });
    panX += correction.x;
    panY += correction.y;
    writeTransform();
    clampView();
  }

  function resetView(){
    panX = 0; panY = 0; zoom = 1;
    metrics.resetCount++;
    writeTransform();
  }

  function fitView(){
    if (!canvas || !stage) return;
    panX = 0; panY = 0; zoom = 1;
    writeTransform();
    const rect = canvasRect();
    const stageRect = stage.getBoundingClientRect ? stage.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    const availW = Math.max(120, finite(stageRect.width, window.innerWidth) - 96);
    const availH = Math.max(120, finite(stageRect.height, window.innerHeight) - 132);
    zoom = clamp(Math.min(availW / Math.max(1, rect.width), availH / Math.max(1, rect.height)), MIN_ZOOM, 2.5);
    panX = 0; panY = 0;
    metrics.fitCount++;
    writeTransform();
    clampView();
  }

  function setNavMode(value){
    navMode = !!value;
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('inkframe-canvas-hand', navMode);
      if (!navMode) document.body.classList.remove('inkframe-canvas-panning');
    }
    if (navButton) {
      navButton.textContent = navMode ? 'HAND ON' : 'HAND';
      navButton.setAttribute('aria-pressed', String(navMode));
      navButton.title = navMode ? 'Hand mode active. Drag the canvas; tap to return to drawing.' : 'Hand mode. Pan without drawing.';
    }
    handPointers.clear(); handGesture = null;
    updateMetrics();
  }

  function ensureControls(){
    const dock = document.getElementById('inkframe-ui-classic-plus-dock');
    if (!dock) return;
    navButton = document.getElementById('inkframe-canvas-nav-toggle');
    if (!navButton) {
      navButton = document.createElement('button');
      navButton.id = 'inkframe-canvas-nav-toggle';
      navButton.type = 'button';
      navButton.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation(); setNavMode(!navMode);
      });
      dock.appendChild(navButton);
    }
    fitButton = document.getElementById('inkframe-canvas-fit');
    if (!fitButton) {
      fitButton = document.createElement('button');
      fitButton.id = 'inkframe-canvas-fit';
      fitButton.type = 'button';
      fitButton.textContent = 'FIT';
      fitButton.title = 'Fit the canvas into the available workspace.';
      fitButton.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation(); fitView();
      });
      dock.appendChild(fitButton);
    }
    zoomButton = document.getElementById('inkframe-canvas-zoom-display');
    if (!zoomButton) {
      zoomButton = document.createElement('button');
      zoomButton.id = 'inkframe-canvas-zoom-display';
      zoomButton.type = 'button';
      zoomButton.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation(); resetView();
      });
      dock.appendChild(zoomButton);
    }
    setNavMode(navMode);
    writeTransform();
  }

  function insideViewport(target){
    return !!(viewport && target && (target === viewport || viewport.contains(target)));
  }

  function beginHandGesture(event){
    handPointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
    const center = midpoint(handPointers);
    handGesture = {
      startPanX: panX,
      startPanY: panY,
      startZoom: zoom,
      startCenter: center,
      startDistance: distance(handPointers),
      startRect: canvasRect(),
      anchor: anchorCoordinates(canvasRect(), center),
    };
    try { viewport.setPointerCapture && viewport.setPointerCapture(event.pointerId); } catch (_) {}
    document.body.classList.add('inkframe-canvas-panning');
  }

  function moveHandGesture(event){
    if (!handPointers.has(event.pointerId) || !handGesture) return;
    handPointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
    const center = midpoint(handPointers);
    if (handPointers.size < 2) {
      panX = handGesture.startPanX + (center.x - handGesture.startCenter.x);
      panY = handGesture.startPanY + (center.y - handGesture.startCenter.y);
      metrics.handPans++;
      writeTransform(); clampView();
      return;
    }

    const dist = Math.max(1, distance(handPointers));
    const base = Math.max(1, handGesture.startDistance || dist);
    zoom = clamp(handGesture.startZoom * (dist / base), MIN_ZOOM, MAX_ZOOM);
    panX = handGesture.startPanX;
    panY = handGesture.startPanY;
    writeTransform();
    const correction = anchorCorrection(canvasRect(), handGesture.anchor, center);
    panX += correction.x;
    panY += correction.y;
    metrics.handPinches++;
    writeTransform(); clampView();
  }

  function rebaseHandGesture(){
    if (!handPointers.size) { handGesture = null; document.body.classList.remove('inkframe-canvas-panning'); return; }
    const center = midpoint(handPointers);
    handGesture = {
      startPanX: panX,
      startPanY: panY,
      startZoom: zoom,
      startCenter: center,
      startDistance: distance(handPointers),
      startRect: canvasRect(),
      anchor: anchorCoordinates(canvasRect(), center),
    };
  }

  function scheduleNormalGesture(){
    if (normalGestureRAF || touches.size < 2 || activePens.size) return;
    normalGestureRAF = requestAnimationFrame(() => {
      normalGestureRAF = 0;
      if (touches.size < 2 || activePens.size) { normalGesture = null; return; }
      const center = midpoint(touches);
      if (!normalGesture) {
        normalGesture = { center, rect: canvasRect() };
        return;
      }
      const anchor = anchorCoordinates(normalGesture.rect, normalGesture.center);
      const correction = anchorCorrection(canvasRect(), anchor, center);
      panX += correction.x;
      panY += correction.y;
      metrics.touchPanFrames++;
      writeTransform(); clampView();
      normalGesture = { center, rect: canvasRect() };
    });
  }

  function onPointerDown(event){
    if (!insideViewport(event.target)) return;
    if (event.pointerType === 'pen') activePens.add(event.pointerId);
    if (event.pointerType === 'touch') touches.set(event.pointerId, { x:event.clientX, y:event.clientY });

    const handRequested = navMode || spaceHeld || event.button === 1;
    if (!handRequested) {
      if (touches.size >= 2 && !activePens.size) normalGesture = { center: midpoint(touches), rect: canvasRect() };
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    beginHandGesture(event);
  }

  function onPointerMove(event){
    if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x:event.clientX, y:event.clientY });
      if (!navMode && touches.size >= 2) scheduleNormalGesture();
    }
    if (!handPointers.has(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    moveHandGesture(event);
  }

  function onPointerEnd(event){
    if (event.pointerType === 'pen') activePens.delete(event.pointerId);
    if (event.pointerType === 'touch') touches.delete(event.pointerId);
    if (touches.size < 2) normalGesture = null;
    if (!handPointers.has(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    handPointers.delete(event.pointerId);
    rebaseHandGesture();
  }

  function onWheel(event){
    if (!insideViewport(event.target)) return;
    event.preventDefault();
    const factor = Math.exp(-finite(event.deltaY, 0) * 0.0015);
    metrics.wheelZooms++;
    zoomAt(event.clientX, event.clientY, zoom * factor);
  }

  function install(){
    if (installed || typeof document === 'undefined') return updateMetrics();
    stage = document.getElementById('stage');
    frame = document.getElementById('frameGlass');
    canvas = document.getElementById('c');
    if (!stage || !frame || !canvas) return updateMetrics();

    ensureViewport();
    ensureControls();
    installed = true;
    metrics.active = true;

    stage.addEventListener('pointerdown', onPointerDown, true);
    stage.addEventListener('pointermove', onPointerMove, true);
    stage.addEventListener('pointerup', onPointerEnd, true);
    stage.addEventListener('pointercancel', onPointerEnd, true);
    stage.addEventListener('wheel', onWheel, { capture:true, passive:false });

    window.addEventListener('keydown', event => {
      if (event.code !== 'Space' || (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName || ''))) return;
      spaceHeld = true;
    }, true);
    window.addEventListener('keyup', event => { if (event.code === 'Space') spaceHeld = false; }, true);
    window.addEventListener('blur', () => {
      spaceHeld = false; handPointers.clear(); touches.clear(); activePens.clear(); handGesture = null; normalGesture = null;
      document.body.classList.remove('inkframe-canvas-panning');
    });
    window.addEventListener('resize', () => requestAnimationFrame(clampView));

    writeTransform();
    return updateMetrics();
  }

  function reportLines(){
    const m = updateMetrics();
    return [
      'Canvas Navigation: ' + (m.active ? 'active' : 'inactive'),
      'Canvas Navigation version: ' + VERSION,
      'Canvas Navigation wrapper: ' + (m.wrapperPresent ? 'yes' : 'no'),
      'Canvas Navigation hand toggle: ' + (m.navTogglePresent ? 'yes' : 'no'),
      'Canvas Navigation fit: ' + (m.fitPresent ? 'yes' : 'no'),
      'Canvas Navigation zoom display: ' + (m.zoomDisplayPresent ? 'yes' : 'no'),
      'Canvas Navigation hand mode: ' + (m.navMode ? 'yes' : 'no'),
      'Canvas Navigation zoom: ' + Math.round(m.zoom * 100) + '%',
      'Canvas Navigation pan: ' + Math.round(m.panX) + ',' + Math.round(m.panY),
      'Canvas Navigation wheel zooms: ' + m.wheelZooms,
      'Canvas Navigation hand pans: ' + m.handPans,
      'Canvas Navigation hand pinches: ' + m.handPinches,
      'Canvas Navigation touch pan frames: ' + m.touchPanFrames,
    ];
  }

  const api = {
    VERSION,
    MIN_ZOOM,
    MAX_ZOOM,
    midpoint,
    distance,
    anchorCoordinates,
    anchorCorrection,
    install,
    setView,
    setNavMode,
    zoomAt,
    fitView,
    resetView,
    clampView,
    metrics: updateMetrics,
    reportLines,
  };

  if (typeof document !== 'undefined') {
    const boot = () => {
      install();
      setTimeout(() => { ensureControls(); updateMetrics(); }, 160);
      setTimeout(() => { ensureControls(); updateMetrics(); }, 520);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
    else boot();
  }
  return api;
});
