// InkFrame — Stylus-Safe Canvas Navigation
// -----------------------------------------------------------------------------
// Viewport-only pan and zoom around the existing square canvas. This module never
// edits document pixels or the painter's internal display scale.
//
// Drawing mode:
//   • one pen/finger keeps the existing painter behaviour
//   • an intentional two-finger gesture pans and pinch-zooms the viewport
//   • once two-finger navigation activates, those touches cannot resume painting
//   • S Pen activity blocks touch navigation so palm contacts stay harmless
//
// Hand mode:
//   • one pointer pans after a small dead zone
//   • two pointers pan + anchored pinch zoom
//   • Space-drag and middle mouse use the same gesture path
'use strict';

(function installInkFrameCanvasNavigation(root, factory){
  const api = factory(root);
  if (root) root.InkFrameCanvasNavigation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildCanvasNavigation(root){
  const VERSION = 'v3-fluid-touch-navigation';
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 5;
  const SAFE_MARGIN = 54;
  const PAN_DEADZONE = 4;
  const PINCH_DEADZONE = 0.025;
  const STORAGE_KEY = 'inkframe.canvas.navigation.v2';
  const SAVE_DELAY_MS = 120;

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
  let dimensionObserver = null;
  let saveTimer = 0;
  let stateRestored = false;
  let canvasSizeKey = '';

  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let navMode = false;
  let spaceHeld = false;

  const touches = new Map();
  const activePens = new Set();
  const handPointers = new Map();
  const suppressedTouches = new Set();
  let normalGesture = null;
  let normalGestureRAF = 0;
  let handGesture = null;

  let metrics = {
    active:false,
    version:VERSION,
    wrapperPresent:false,
    navTogglePresent:false,
    fitPresent:false,
    zoomDisplayPresent:false,
    navMode:false,
    zoom:1,
    panX:0,
    panY:0,
    wheelZooms:0,
    handPans:0,
    handPinches:0,
    touchPanFrames:0,
    touchPinchFrames:0,
    touchGestureActivations:0,
    suppressedTouchMoves:0,
    gestureRebases:0,
    deadzoneBlocks:0,
    fitCount:0,
    projectFitCount:0,
    resetCount:0,
    persistence:false,
    restored:false,
    saveCount:0,
    dimensionWatch:false,
  };

  function midpoint(points){
    const list = Array.from(points.values ? points.values() : points);
    if (!list.length) return { x:0, y:0 };
    let x = 0, y = 0;
    for (const point of list) { x += finite(point && point.x, 0); y += finite(point && point.y, 0); }
    return { x:x/list.length, y:y/list.length };
  }

  function distance(points){
    const list = Array.from(points.values ? points.values() : points);
    if (list.length < 2) return 0;
    return Math.hypot(
      finite(list[0] && list[0].x, 0) - finite(list[1] && list[1].x, 0),
      finite(list[0] && list[0].y, 0) - finite(list[1] && list[1].y, 0)
    );
  }

  function gestureScale(startDistance, currentDistance){
    const start = finite(startDistance, 0);
    const current = finite(currentDistance, 0);
    if (start < 1 || current < 1) return 1;
    return current / start;
  }

  function gestureExceeded(startCenter, currentCenter, startDistance, currentDistance){
    const move = Math.hypot(
      finite(currentCenter && currentCenter.x, 0) - finite(startCenter && startCenter.x, 0),
      finite(currentCenter && currentCenter.y, 0) - finite(startCenter && startCenter.y, 0)
    );
    const scale = gestureScale(startDistance, currentDistance);
    const pinch = Math.abs(scale - 1);
    return move >= PAN_DEADZONE || pinch >= PINCH_DEADZONE;
  }

  function anchorCoordinates(rect, point){
    const width = Math.max(0.0001, finite(rect && rect.width, 1));
    const height = Math.max(0.0001, finite(rect && rect.height, 1));
    return {
      u:(finite(point && point.x, 0)-finite(rect && rect.left, 0))/width,
      v:(finite(point && point.y, 0)-finite(rect && rect.top, 0))/height,
    };
  }

  function anchorCorrection(rect, anchor, desiredPoint){
    return {
      x:finite(desiredPoint && desiredPoint.x, 0) - (
        finite(rect && rect.left, 0) + finite(anchor && anchor.u, 0.5) * Math.max(0.0001, finite(rect && rect.width, 1))
      ),
      y:finite(desiredPoint && desiredPoint.y, 0) - (
        finite(rect && rect.top, 0) + finite(anchor && anchor.v, 0.5) * Math.max(0.0001, finite(rect && rect.height, 1))
      ),
    };
  }

  function savedState(){ return { panX, panY, zoom, navMode, savedAt:Date.now() }; }

  function persistNow(){
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState()));
      metrics.persistence = true;
      metrics.saveCount++;
      root.__inkframeCanvasNavigationMetrics = { ...metrics };
      return true;
    } catch (_) {
      metrics.persistence = false;
      return false;
    }
  }

  function schedulePersist(){
    if (!installed || typeof root.setTimeout !== 'function') return;
    if (saveTimer) root.clearTimeout(saveTimer);
    saveTimer = root.setTimeout(() => { saveTimer = 0; persistNow(); }, SAVE_DELAY_MS);
  }

  function restoreState(){
    if (stateRestored) return false;
    stateRestored = true;
    try {
      const raw = root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const value = JSON.parse(raw);
      panX = finite(value.panX, 0);
      panY = finite(value.panY, 0);
      zoom = clamp(finite(value.zoom, 1), MIN_ZOOM, MAX_ZOOM);
      navMode = !!value.navMode;
      metrics.persistence = true;
      metrics.restored = true;
      return true;
    } catch (_) { return false; }
  }

  function clearSavedState(){
    try { root.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    metrics.restored = false;
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
    metrics.dimensionWatch = !!dimensionObserver;
    root.__inkframeCanvasNavigationMetrics = { ...metrics };
    return { ...metrics };
  }

  function writeTransform(options){
    ensureTransformRule();
    const value = `translate3d(${panX.toFixed(2)}px,${panY.toFixed(2)}px,0) scale(${zoom.toFixed(5)})`;
    if (transformRule && transformRule.style) transformRule.style.transform = value;
    else if (viewport) viewport.style.transform = value;
    if (zoomButton) {
      zoomButton.textContent = Math.round(zoom*100) + '%';
      zoomButton.title = 'Viewport zoom. Tap to reset navigation to 100%.';
    }
    updateMetrics();
    if (!options || options.persist !== false) schedulePersist();
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
    return canvas && canvas.getBoundingClientRect
      ? canvas.getBoundingClientRect()
      : { left:0, top:0, width:1, height:1, right:1, bottom:1 };
  }

  function clampView(){
    if (!canvas || typeof root.innerWidth === 'undefined') return;
    let rect = canvasRect();
    let dx = 0, dy = 0;
    if (rect.right < SAFE_MARGIN) dx = SAFE_MARGIN - rect.right;
    else if (rect.left > root.innerWidth - SAFE_MARGIN) dx = root.innerWidth - SAFE_MARGIN - rect.left;
    if (rect.bottom < SAFE_MARGIN) dy = SAFE_MARGIN - rect.bottom;
    else if (rect.top > root.innerHeight - SAFE_MARGIN) dy = root.innerHeight - SAFE_MARGIN - rect.top;
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
    const anchor = anchorCoordinates(before, { x:clientX, y:clientY });
    zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    writeTransform({ persist:false });
    const correction = anchorCorrection(canvasRect(), anchor, { x:clientX, y:clientY });
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

  function fitView(options){
    if (!canvas || !stage) return;
    panX = 0; panY = 0; zoom = 1;
    writeTransform({ persist:false });
    const rect = canvasRect();
    const stageRect = stage.getBoundingClientRect
      ? stage.getBoundingClientRect()
      : { width:root.innerWidth, height:root.innerHeight };
    const availW = Math.max(120, finite(stageRect.width, root.innerWidth)-96);
    const availH = Math.max(120, finite(stageRect.height, root.innerHeight)-132);
    zoom = clamp(Math.min(availW/Math.max(1, rect.width), availH/Math.max(1, rect.height)), MIN_ZOOM, 2.5);
    panX = 0; panY = 0;
    metrics.fitCount++;
    if (options && options.projectChange) metrics.projectFitCount++;
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
      navButton.title = navMode
        ? 'Hand mode active. Drag to pan; pinch to zoom.'
        : 'Hand mode. Pan without drawing.';
    }
    handPointers.clear();
    handGesture = null;
    updateMetrics();
    schedulePersist();
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
    writeTransform({ persist:false });
  }

  function insideViewport(target){
    return !!(viewport && target && (target === viewport || viewport.contains(target)));
  }

  function newGestureState(points){
    const center = midpoint(points);
    const dist = distance(points);
    const rect = canvasRect();
    return {
      startPanX:panX,
      startPanY:panY,
      startZoom:zoom,
      startCenter:center,
      startDistance:dist,
      startRect:rect,
      anchor:anchorCoordinates(rect, center),
      activated:false,
    };
  }

  function applyGesture(state, points, kind){
    if (!state || !points.size) return false;
    const center = midpoint(points);
    const dist = distance(points);
    if (!state.activated && !gestureExceeded(state.startCenter, center, state.startDistance, dist)) {
      metrics.deadzoneBlocks++;
      updateMetrics();
      return false;
    }
    if (!state.activated) state.activated = true;

    if (points.size < 2) {
      panX = state.startPanX + (center.x-state.startCenter.x);
      panY = state.startPanY + (center.y-state.startCenter.y);
      if (kind === 'hand') metrics.handPans++;
      else metrics.touchPanFrames++;
      writeTransform();
      clampView();
      return true;
    }

    zoom = clamp(state.startZoom*gestureScale(state.startDistance, dist), MIN_ZOOM, MAX_ZOOM);
    panX = state.startPanX;
    panY = state.startPanY;
    writeTransform({ persist:false });
    const correction = anchorCorrection(canvasRect(), state.anchor, center);
    panX += correction.x;
    panY += correction.y;
    if (kind === 'hand') metrics.handPinches++;
    else {
      metrics.touchPinchFrames++;
      metrics.touchPanFrames++;
    }
    writeTransform();
    clampView();
    return true;
  }

  function beginHandGesture(event){
    handPointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
    handGesture = newGestureState(handPointers);
    metrics.gestureRebases++;
    try { viewport.setPointerCapture && viewport.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function moveHandGesture(event){
    if (!handPointers.has(event.pointerId) || !handGesture) return;
    handPointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
    const active = applyGesture(handGesture, handPointers, 'hand');
    document.body.classList.toggle('inkframe-canvas-panning', !!active);
  }

  function rebaseHandGesture(){
    if (!handPointers.size) {
      handGesture = null;
      document.body.classList.remove('inkframe-canvas-panning');
      persistNow();
      return;
    }
    handGesture = newGestureState(handPointers);
    metrics.gestureRebases++;
  }

  function activateNormalGesture(){
    if (!normalGesture || normalGesture.activated) return;
    normalGesture.activated = true;
    for (const id of touches.keys()) suppressedTouches.add(id);
    metrics.touchGestureActivations++;
  }

  function scheduleNormalGesture(){
    if (normalGestureRAF || touches.size < 2 || activePens.size) return;
    normalGestureRAF = root.requestAnimationFrame(() => {
      normalGestureRAF = 0;
      if (touches.size < 2 || activePens.size || !normalGesture || !normalGesture.activated) return;
      applyGesture(normalGesture, touches, 'touch');
    });
  }

  function onPointerDown(event){
    if (!insideViewport(event.target)) return;
    if (event.pointerType === 'pen') activePens.add(event.pointerId);
    if (event.pointerType === 'touch') touches.set(event.pointerId, { x:event.clientX, y:event.clientY });

    const handRequested = navMode || spaceHeld || event.button === 1;
    if (!handRequested) {
      if (touches.size >= 2 && !activePens.size) {
        normalGesture = newGestureState(touches);
        metrics.gestureRebases++;
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    beginHandGesture(event);
  }

  function onPointerMove(event){
    if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x:event.clientX, y:event.clientY });
      if (!navMode && touches.size >= 2 && !activePens.size) {
        if (!normalGesture) {
          normalGesture = newGestureState(touches);
          metrics.gestureRebases++;
        }
        const center = midpoint(touches);
        const dist = distance(touches);
        if (!normalGesture.activated && gestureExceeded(normalGesture.startCenter, center, normalGesture.startDistance, dist)) {
          activateNormalGesture();
        }
        if (normalGesture.activated) {
          event.preventDefault();
          event.stopPropagation();
          metrics.suppressedTouchMoves++;
          scheduleNormalGesture();
          return;
        }
      }
      if (suppressedTouches.has(event.pointerId)) {
        event.preventDefault();
        event.stopPropagation();
        metrics.suppressedTouchMoves++;
        updateMetrics();
        return;
      }
    }

    if (!handPointers.has(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    moveHandGesture(event);
  }

  function onPointerEnd(event){
    if (event.pointerType === 'pen') activePens.delete(event.pointerId);
    if (event.pointerType === 'touch') {
      touches.delete(event.pointerId);
      suppressedTouches.delete(event.pointerId);
      if (touches.size < 2) {
        if (normalGesture && normalGesture.activated) persistNow();
        normalGesture = null;
      } else if (normalGesture) {
        normalGesture = newGestureState(touches);
        normalGesture.activated = true;
        metrics.gestureRebases++;
      }
    }
    if (!handPointers.has(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    handPointers.delete(event.pointerId);
    rebaseHandGesture();
  }

  function onWheel(event){
    if (!insideViewport(event.target)) return;
    event.preventDefault();
    const factor = Math.exp(-finite(event.deltaY, 0)*0.0015);
    metrics.wheelZooms++;
    zoomAt(event.clientX, event.clientY, zoom*factor);
  }

  function currentCanvasSizeKey(){
    return canvas ? `${finite(canvas.width,0)}x${finite(canvas.height,0)}` : '';
  }

  function installDimensionWatch(){
    if (dimensionObserver || typeof MutationObserver === 'undefined' || !canvas) return;
    canvasSizeKey = currentCanvasSizeKey();
    dimensionObserver = new MutationObserver(() => {
      root.requestAnimationFrame(() => {
        const next = currentCanvasSizeKey();
        if (next && next !== canvasSizeKey) {
          canvasSizeKey = next;
          fitView({ projectChange:true });
        } else {
          clampView();
          schedulePersist();
        }
      });
    });
    dimensionObserver.observe(canvas, { attributes:true, attributeFilter:['width','height'] });
    metrics.dimensionWatch = true;
  }

  function clearInteractions(){
    spaceHeld = false;
    handPointers.clear();
    touches.clear();
    activePens.clear();
    suppressedTouches.clear();
    handGesture = null;
    normalGesture = null;
    document.body.classList.remove('inkframe-canvas-panning');
  }

  function install(){
    if (installed || typeof document === 'undefined') return updateMetrics();
    stage = document.getElementById('stage');
    frame = document.getElementById('frameGlass');
    canvas = document.getElementById('c');
    if (!stage || !frame || !canvas) return updateMetrics();

    restoreState();
    ensureViewport();
    installed = true;
    metrics.active = true;
    ensureControls();

    stage.addEventListener('pointerdown', onPointerDown, true);
    stage.addEventListener('pointermove', onPointerMove, true);
    stage.addEventListener('pointerup', onPointerEnd, true);
    stage.addEventListener('pointercancel', onPointerEnd, true);
    stage.addEventListener('wheel', onWheel, { capture:true, passive:false });

    root.addEventListener('keydown', event => {
      if (event.code !== 'Space' || (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName || ''))) return;
      spaceHeld = true;
    }, true);
    root.addEventListener('keyup', event => { if (event.code === 'Space') spaceHeld = false; }, true);
    root.addEventListener('blur', () => { clearInteractions(); persistNow(); });
    root.addEventListener('resize', () => root.requestAnimationFrame(clampView));
    root.addEventListener('pagehide', persistNow);
    document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });

    installDimensionWatch();
    writeTransform({ persist:false });
    setNavMode(navMode);
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
      'Canvas Navigation zoom: ' + Math.round(m.zoom*100) + '%',
      'Canvas Navigation pan: ' + Math.round(m.panX) + ',' + Math.round(m.panY),
      'Canvas Navigation persistence: ' + (m.persistence ? 'yes' : 'no'),
      'Canvas Navigation restored: ' + (m.restored ? 'yes' : 'no'),
      'Canvas Navigation dimension watch: ' + (m.dimensionWatch ? 'yes' : 'no'),
      'Canvas Navigation deadzone blocks: ' + m.deadzoneBlocks,
      'Canvas Navigation touch activations: ' + m.touchGestureActivations,
      'Canvas Navigation suppressed touch moves: ' + m.suppressedTouchMoves,
      'Canvas Navigation gesture rebases: ' + m.gestureRebases,
      'Canvas Navigation wheel zooms: ' + m.wheelZooms,
      'Canvas Navigation hand pans: ' + m.handPans,
      'Canvas Navigation hand pinches: ' + m.handPinches,
      'Canvas Navigation touch pan frames: ' + m.touchPanFrames,
      'Canvas Navigation touch pinch frames: ' + m.touchPinchFrames,
      'Canvas Navigation project fits: ' + m.projectFitCount,
    ];
  }

  const api = {
    VERSION,
    MIN_ZOOM,
    MAX_ZOOM,
    PAN_DEADZONE,
    PINCH_DEADZONE,
    STORAGE_KEY,
    midpoint,
    distance,
    gestureScale,
    gestureExceeded,
    anchorCoordinates,
    anchorCorrection,
    install,
    setView,
    setNavMode,
    zoomAt,
    fitView,
    resetView,
    clampView,
    persistNow,
    restoreState,
    clearSavedState,
    metrics:updateMetrics,
    reportLines,
  };

  if (typeof document !== 'undefined') {
    const boot = () => {
      install();
      root.setTimeout(() => { ensureControls(); updateMetrics(); }, 160);
      root.setTimeout(() => { ensureControls(); updateMetrics(); }, 520);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
    else boot();
  }
  return api;
});