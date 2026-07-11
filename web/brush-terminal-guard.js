// InkFrame — Brush Terminal Guard
// -----------------------------------------------------------------------------
// The legacy painter creates fast-lift taper by manufacturing new dabs *ahead*
// of the final physical stylus sample. On broad or calligraphic nibs that can
// become a long triangular needle. This guard temporarily neutralizes only that
// synthetic forward extension during pointer-up, then restores the artist's
// Brush Lab Taper Out setting immediately afterward. Natural pressure taper and
// the saved brush profile remain unchanged.
'use strict';

(function installInkFrameBrushTerminalGuard(root, factory){
  const api = factory(root);
  if (root) root.InkFrameBrushTerminalGuard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildBrushTerminalGuard(root){
  const VERSION = 'v1-no-forward-needle';
  let installed = false;
  let canvas = null;
  let taperControl = null;
  const activePointers = new Set();
  let metrics = {
    active:false,
    version:VERSION,
    canvasPresent:false,
    taperControlPresent:false,
    guardedEnds:0,
    restoredSettings:0,
    lastOriginalTaper:0,
    activePointers:0,
  };

  function updateMetrics(){
    metrics.active = installed;
    metrics.canvasPresent = !!canvas;
    metrics.taperControlPresent = !!taperControl;
    metrics.activePointers = activePointers.size;
    root.__inkframeBrushTerminalGuardMetrics = { ...metrics };
    return { ...metrics };
  }

  function emitInput(el){
    if (!el) return;
    const EventCtor = root.Event || Event;
    el.dispatchEvent(new EventCtor('input', { bubbles:true }));
  }

  function onPointerDown(event){
    if (!event || event.isPrimary === false) return;
    if (event.pointerType !== 'pen' && event.pointerType !== 'touch' && event.pointerType !== 'mouse') return;
    activePointers.add(event.pointerId);
    updateMetrics();
  }

  function guardPointerEnd(event){
    if (!event || !activePointers.has(event.pointerId)) return false;
    activePointers.delete(event.pointerId);
    taperControl = taperControl || (typeof document !== 'undefined' ? document.getElementById('blabTout') : null);
    const original = Number(taperControl && taperControl.value);
    if (!taperControl || !Number.isFinite(original) || original <= 0) {
      updateMetrics();
      return false;
    }

    metrics.guardedEnds++;
    metrics.lastOriginalTaper = original;
    taperControl.dataset.inkframeTerminalGuard = '1';
    taperControl.value = '0';
    emitInput(taperControl);

    const restore = () => {
      // Restore only our temporary zero. If the artist changed the control in
      // the meantime, never overwrite the newer value.
      if (taperControl && taperControl.dataset.inkframeTerminalGuard === '1') {
        if (Number(taperControl.value) === 0) {
          taperControl.value = String(original);
          emitInput(taperControl);
          metrics.restoredSettings++;
        }
        delete taperControl.dataset.inkframeTerminalGuard;
      }
      updateMetrics();
    };
    if (typeof root.setTimeout === 'function') root.setTimeout(restore, 0);
    else restore();
    updateMetrics();
    return true;
  }

  function install(){
    if (installed || typeof document === 'undefined') return updateMetrics();
    canvas = document.getElementById('c');
    taperControl = document.getElementById('blabTout');
    if (!canvas || !taperControl) return updateMetrics();
    installed = true;
    metrics.active = true;
    canvas.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointerup', guardPointerEnd, true);
    root.addEventListener('pointercancel', guardPointerEnd, true);
    return updateMetrics();
  }

  function reportLines(){
    const m = updateMetrics();
    return [
      'Brush Terminal Guard: ' + (m.active ? 'active' : 'inactive'),
      'Brush Terminal Guard version: ' + VERSION,
      'Brush Terminal Guard canvas: ' + (m.canvasPresent ? 'yes' : 'no'),
      'Brush Terminal Guard taper control: ' + (m.taperControlPresent ? 'yes' : 'no'),
      'Brush Terminal Guard protected endings: ' + m.guardedEnds,
      'Brush Terminal Guard restored settings: ' + m.restoredSettings,
      'Brush Terminal Guard last taper: ' + m.lastOriginalTaper,
    ];
  }

  const api = {
    VERSION,
    install,
    guardPointerEnd,
    metrics:updateMetrics,
    reportLines,
  };

  if (typeof document !== 'undefined') {
    const boot = () => install();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
    else boot();
  }
  return api;
});
