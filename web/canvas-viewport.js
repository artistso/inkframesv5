// InkFrame — Stable Canvas Viewport
// -----------------------------------------------------------------------------
// Adds an explicit navigation mode without stealing the existing painter's input.
// NAV off: current touch/pen drawing behaviour is unchanged.
// NAV on: touch pans/pinches, while pen input continues to reach the canvas.
'use strict';

(function installInkFrameCanvasViewport(root){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (root.__inkframeCanvasViewportInstalled) return;
  root.__inkframeCanvasViewportInstalled = true;

  const VERSION = 'v1-nav-pan-pinch';
  const NAV_KEY = 'inkframe.viewport.nav.v1';
  const VIEW_KEY = 'inkframe.viewport.state.v1';
  const MIN_ZOOM = 0.45;
  const MAX_ZOOM = 4.0;
  const active = new Map();
  let nav = readNav();
  let view = readView();
  let gesture = null;
  let navButton = null;
  let resetButton = null;
  let metrics = null;

  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once:true })
    : fn();
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

  function readNav(){
    try { return localStorage.getItem(NAV_KEY) === '1'; } catch (_) { return false; }
  }
  function readView(){
    try {
      const p = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.zoom)) {
        return { x:p.x, y:p.y, zoom:clamp(p.zoom, MIN_ZOOM, MAX_ZOOM) };
      }
    } catch (_) {}
    return { x:0, y:0, zoom:1 };
  }
  function save(){
    try {
      localStorage.setItem(NAV_KEY, nav ? '1' : '0');
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch (_) {}
  }

  function ensureStyle(){
    if (document.getElementById('inkframe-canvas-viewport-style')) return;
    const style = document.createElement('style');
    style.id = 'inkframe-canvas-viewport-style';
    style.textContent = [
      'body.inkframe-viewport #frameGlass{transform-origin:0 0!important;transform:translate3d(var(--inkframe-view-x,0px),var(--inkframe-view-y,0px),0) scale(var(--inkframe-view-zoom,1))!important;will-change:transform!important}',
      'body.inkframe-nav-mode #frameGlass{cursor:grab!important}',
      'body.inkframe-nav-mode.inkframe-nav-active #frameGlass{cursor:grabbing!important}',
      '#inkframe-viewport-nav[aria-pressed="true"]{background:rgba(187,0,55,.46)!important;border-color:rgba(255,240,243,.68)!important}',
      '#inkframe-viewport-reset{opacity:.84}',
      'body.inkframe-ui-dock-collapsed #inkframe-viewport-nav,body.inkframe-ui-dock-collapsed #inkframe-viewport-reset{display:none!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function dock(){ return document.getElementById('inkframe-ui-classic-plus-dock'); }
  function ensureControls(){
    const d = dock();
    if (!d) return false;
    if (!navButton) {
      navButton = document.createElement('button');
      navButton.id = 'inkframe-viewport-nav';
      navButton.type = 'button';
      navButton.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        setNav(!nav);
      });
      d.appendChild(navButton);
    }
    if (!resetButton) {
      resetButton = document.createElement('button');
      resetButton.id = 'inkframe-viewport-reset';
      resetButton.type = 'button';
      resetButton.textContent = 'FIT';
      resetButton.title = 'Reset canvas pan and zoom';
      resetButton.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation(); resetView();
      });
      d.appendChild(resetButton);
    }
    sync();
    return true;
  }

  function applyView(){
    document.body.classList.add('inkframe-viewport');
    document.documentElement.style.setProperty('--inkframe-view-x', view.x.toFixed(2)+'px');
    document.documentElement.style.setProperty('--inkframe-view-y', view.y.toFixed(2)+'px');
    document.documentElement.style.setProperty('--inkframe-view-zoom', view.zoom.toFixed(4));
    save();
  }
  function sync(){
    document.body.classList.toggle('inkframe-nav-mode', nav);
    if (navButton) {
      navButton.textContent = nav ? 'NAV ON' : 'NAV';
      navButton.setAttribute('aria-pressed', String(nav));
      navButton.title = nav ? 'Finger navigation active; pen still draws' : 'Enable finger pan and pinch zoom';
    }
    applyView();
  }
  function setNav(value){
    nav = !!value;
    active.clear(); gesture = null;
    document.body.classList.remove('inkframe-nav-active');
    sync(); collectMetrics();
  }
  function setView(next){
    view = {
      x: Number.isFinite(next.x) ? next.x : view.x,
      y: Number.isFinite(next.y) ? next.y : view.y,
      zoom: clamp(Number.isFinite(next.zoom) ? next.zoom : view.zoom, MIN_ZOOM, MAX_ZOOM)
    };
    applyView(); collectMetrics();
  }
  function resetView(){ setView({x:0,y:0,zoom:1}); }

  function points(){ return Array.from(active.values()); }
  function centroid(ps){
    const n = Math.max(1, ps.length);
    return { x:ps.reduce((s,p)=>s+p.x,0)/n, y:ps.reduce((s,p)=>s+p.y,0)/n };
  }
  function distance(a,b){ return Math.hypot(b.x-a.x,b.y-a.y); }
  function startGesture(){
    const ps = points();
    if (!ps.length) { gesture=null; return; }
    const c = centroid(ps);
    gesture = {
      count:ps.length, cx:c.x, cy:c.y,
      dist:ps.length>1 ? Math.max(1,distance(ps[0],ps[1])) : 1,
      x:view.x, y:view.y, zoom:view.zoom
    };
    document.body.classList.add('inkframe-nav-active');
  }
  function updateGesture(){
    if (!gesture) startGesture();
    const ps = points();
    if (!gesture || !ps.length) return;
    if (ps.length !== gesture.count) { startGesture(); return; }
    const c = centroid(ps);
    if (ps.length === 1) {
      setView({ x:gesture.x + c.x-gesture.cx, y:gesture.y + c.y-gesture.cy, zoom:gesture.zoom });
      return;
    }
    const ratio = Math.max(.05, distance(ps[0],ps[1]) / gesture.dist);
    const nextZoom = clamp(gesture.zoom * ratio, MIN_ZOOM, MAX_ZOOM);
    // Keep the gesture centroid visually anchored while zoom changes.
    const localX = (gesture.cx - gesture.x) / gesture.zoom;
    const localY = (gesture.cy - gesture.y) / gesture.zoom;
    setView({ x:c.x-localX*nextZoom, y:c.y-localY*nextZoom, zoom:nextZoom });
  }

  function isNavTouch(ev){ return nav && ev.pointerType === 'touch'; }
  function installGestures(){
    if (root.__inkframeCanvasViewportGestures) return;
    root.__inkframeCanvasViewportGestures = true;
    document.addEventListener('pointerdown', ev => {
      if (!isNavTouch(ev)) return;
      const stage = ev.target && ev.target.closest ? ev.target.closest('#stage,#frameGlass,canvas#c') : null;
      if (!stage) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      active.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      startGesture();
      try { ev.target.setPointerCapture && ev.target.setPointerCapture(ev.pointerId); } catch (_) {}
    }, true);
    document.addEventListener('pointermove', ev => {
      if (!active.has(ev.pointerId)) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      active.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      updateGesture();
    }, true);
    const end = ev => {
      if (!active.has(ev.pointerId)) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      active.delete(ev.pointerId);
      if (active.size) startGesture();
      else { gesture=null; document.body.classList.remove('inkframe-nav-active'); collectMetrics(); }
    };
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);

    // Mouse/trackpad zoom is always available over the canvas; Ctrl is not required.
    document.addEventListener('wheel', ev => {
      const target = ev.target && ev.target.closest ? ev.target.closest('#frameGlass,canvas#c') : null;
      if (!target) return;
      ev.preventDefault();
      const factor = Math.exp(-ev.deltaY * 0.0015);
      const nextZoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const localX = (ev.clientX-view.x)/view.zoom;
      const localY = (ev.clientY-view.y)/view.zoom;
      setView({x:ev.clientX-localX*nextZoom,y:ev.clientY-localY*nextZoom,zoom:nextZoom});
    }, {capture:true, passive:false});
  }

  function collectMetrics(){
    metrics = {
      active:true, version:VERSION, nav, zoom:view.zoom, x:view.x, y:view.y,
      controls:!!navButton && !!resetButton,
      navButton:!!document.getElementById('inkframe-viewport-nav'),
      resetButton:!!document.getElementById('inkframe-viewport-reset'),
      gestureGate:!!root.__inkframeCanvasViewportGestures,
    };
    root.__inkframeCanvasViewportMetrics = metrics;
    return metrics;
  }
  function apply(){
    ensureStyle(); ensureControls(); installGestures(); sync(); return collectMetrics();
  }
  function reportLines(){
    const m = metrics || collectMetrics();
    return [
      'Canvas Viewport: active',
      'Canvas Viewport version: '+m.version,
      'Canvas Viewport nav: '+(m.nav?'yes':'no'),
      'Canvas Viewport zoom: '+m.zoom.toFixed(3),
      'Canvas Viewport controls: '+(m.controls?'yes':'no'),
      'Canvas Viewport gesture gate: '+(m.gestureGate?'yes':'no')
    ];
  }

  root.InkFrameCanvasViewport = {apply,setNav,setView,resetView,metrics(){return metrics||collectMetrics();},reportLines};
  ready(()=>{ apply(); setTimeout(apply,140); setTimeout(apply,420); });
})(typeof window !== 'undefined' ? window : globalThis);
