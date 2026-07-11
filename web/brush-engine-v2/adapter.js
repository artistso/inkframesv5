// InkFrame Brush Engine V2 — live A/B adapter for tablet evaluation
// -----------------------------------------------------------------------------
// This module does not monkey-patch PointerEvent, EventTarget, or Canvas. The APK
// staging step injects three explicit calls into the original brush handlers.
// Original v0.1.1 remains the default and unsupported brushes always fall back.
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const MODE_KEY = 'inkframe.brushEngine.abMode.v1';
  const SUPPORTED = new Set(['ink', 'eraser']);

  let mode = readMode();
  let active = null;
  let lastTrace = null;
  let panel = null;
  let modeButton = null;
  let exportButton = null;
  let statusNode = null;

  function readMode() {
    try { return root.localStorage && root.localStorage.getItem(MODE_KEY) === 'v2' ? 'v2' : 'original'; }
    catch (_) { return 'original'; }
  }

  function writeMode(value) {
    try { if (root.localStorage) root.localStorage.setItem(MODE_KEY, value); }
    catch (_) {}
  }

  function isSupportedBrush(brushId) {
    return SUPPORTED.has(String(brushId || ''));
  }

  function currentMode() { return mode; }

  function setMode(next) {
    const resolved = next === 'v2' ? 'v2' : 'original';
    if (active) return false;
    mode = resolved;
    writeMode(mode);
    updatePanel();
    return true;
  }

  function shouldHandle(brushId, event) {
    return mode === 'v2'
      && isSupportedBrush(brushId)
      && !!event
      && event.pointerType === 'pen';
  }

  function makeProfile(env) {
    const input = env && env.profile || {};
    return {
      size: input.size,
      minSize: input.minSize,
      opacity: input.opacity,
      spacing: input.spacing,
      hardness: input.hardness,
      response: input.response,
      composite: env && env.brushId === 'eraser' ? 'destination-out' : 'source-over',
    };
  }

  function eventSamples(event, env) {
    let list = [];
    try {
      if (event && typeof event.getCoalescedEvents === 'function') list = Array.from(event.getCoalescedEvents() || []);
    } catch (_) {}
    if (!list.length) list = [event];
    else if (list[list.length - 1] !== event) {
      const tail = list[list.length - 1];
      if (!tail || tail.timeStamp !== event.timeStamp || tail.clientX !== event.clientX || tail.clientY !== event.clientY) list.push(event);
    }
    return list.map(item => env.toSample(item));
  }

  function paintDabs(stroke, dabs) {
    if (!stroke || !dabs || !dabs.length) return;
    const env = stroke.env;
    for (const dab of dabs) {
      ns.paintRoundDab(env.layerCtx, dab, env.color);
      if (stroke.brushId !== 'eraser') ns.paintRoundDab(env.mainCtx, dab, env.color);
    }
    if (stroke.brushId === 'eraser' && typeof env.renderLive === 'function') env.renderLive();
  }

  function begin(event, env) {
    if (!env || !shouldHandle(env.brushId, event)) return false;
    if (active) return true;
    if (!ns.createBrushEngine || !ns.createTraceRecorder || !ns.paintRoundDab) return false;

    try {
      event.preventDefault();
      const profile = makeProfile(env);
      const engine = ns.createBrushEngine({
        width: env.width,
        height: env.height,
        brushId: env.brushId,
        profile,
      });
      const recorder = ns.createTraceRecorder({
        engine: 'v2-reference',
        brushId: env.brushId,
        profile,
        canvas: { width: env.width, height: env.height },
        devicePixelRatio: Number(root.devicePixelRatio) || 1,
        userAgent: root.navigator ? root.navigator.userAgent : '',
      });
      const sample = env.toSample(event);
      const snapshot = typeof env.snapshot === 'function' ? env.snapshot() : null;
      active = {
        pointerId: event.pointerId,
        brushId: env.brushId,
        env,
        engine,
        recorder,
        snapshot,
        rawSamples: 1,
      };
      if (env.canvas && env.canvas.setPointerCapture) {
        try { env.canvas.setPointerCapture(event.pointerId); } catch (_) {}
      }
      recorder.begin(sample);
      paintDabs(active, engine.begin(sample));
      setStatus('V2 drawing · ' + env.brushId);
      return true;
    } catch (error) {
      const failed = active;
      active = null;
      if (failed && failed.env && typeof failed.env.abort === 'function') failed.env.abort(failed.snapshot);
      setStatus('V2 start failed · ' + (error && error.message || error));
      return false;
    }
  }

  function move(event) {
    if (!active || !event || event.pointerId !== active.pointerId) return false;
    event.preventDefault();
    try {
      const samples = eventSamples(event, active.env);
      for (const sample of samples) {
        active.rawSamples++;
        active.recorder.move(sample);
        paintDabs(active, active.engine.move(sample));
      }
      return true;
    } catch (error) {
      const failed = active;
      active = null;
      if (failed.env && typeof failed.env.abort === 'function') failed.env.abort(failed.snapshot);
      setStatus('V2 stroke aborted · ' + (error && error.message || error));
      return true;
    }
  }

  function end(event) {
    if (!active || !event || (event.pointerId != null && event.pointerId !== active.pointerId)) return false;
    event.preventDefault();
    const stroke = active;
    active = null;
    try {
      const sample = stroke.env.toSample(event);
      stroke.rawSamples++;
      stroke.recorder.end(sample);
      paintDabs(stroke, stroke.engine.end(sample));
      const trace = stroke.recorder.snapshot();
      trace.metadata.engineStats = stroke.engine.stats();
      trace.metadata.rawSamplesObserved = stroke.rawSamples;
      trace.metadata.eventType = event.type || 'pointerup';
      lastTrace = trace;
      if (typeof stroke.env.finishUi === 'function') stroke.env.finishUi();
      if (typeof stroke.env.commit === 'function') stroke.env.commit(stroke.snapshot);
      const stats = trace.metadata.engineStats;
      setStatus('V2 · ' + stroke.brushId + ' · ' + stats.acceptedSamples + ' accepted · ' + stats.validator.dropped + ' dropped · ' + stats.dabs + ' dabs');
      updatePanel();
      return true;
    } catch (error) {
      if (typeof stroke.env.abort === 'function') stroke.env.abort(stroke.snapshot);
      setStatus('V2 finish failed · ' + (error && error.message || error));
      return true;
    }
  }

  function traceFilename(trace) {
    const brush = trace && trace.metadata && trace.metadata.brushId || 'stroke';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return 'inkframe-' + brush + '-trace-' + stamp + '.json';
  }

  function exportLastTrace() {
    if (!lastTrace || !root.document || typeof root.Blob !== 'function') return false;
    const blob = new root.Blob([JSON.stringify(lastTrace, null, 2)], { type: 'application/json' });
    const url = root.URL.createObjectURL(blob);
    const anchor = root.document.createElement('a');
    anchor.href = url;
    anchor.download = traceFilename(lastTrace);
    anchor.style.display = 'none';
    root.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    setStatus('Trace exported · ' + lastTrace.samples.length + ' samples');
    return true;
  }

  function setStatus(text) {
    if (statusNode) statusNode.textContent = String(text || '');
  }

  function updatePanel() {
    if (!panel) return;
    modeButton.textContent = mode === 'v2' ? 'Engine · V2' : 'Engine · Original';
    modeButton.classList.toggle('on', mode === 'v2');
    modeButton.disabled = !!active;
    exportButton.disabled = !lastTrace;
    if (!active && !statusNode.textContent) {
      statusNode.textContent = mode === 'v2' ? 'V2 handles S Pen ink + eraser' : 'Original v0.1.1 active';
    }
  }

  function installPanel() {
    if (!root.document || root.document.getElementById('inkframe-v2-ab')) return false;
    const style = root.document.createElement('style');
    style.textContent = `
      #inkframe-v2-ab{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:100000;display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid rgba(255,255,255,.28);border-radius:16px;background:rgba(24,8,20,.78);backdrop-filter:blur(12px);box-shadow:0 5px 22px rgba(0,0,0,.28);font:600 11px/1.15 system-ui,sans-serif;color:#fff;max-width:min(92vw,720px)}
      #inkframe-v2-ab button{border:1px solid rgba(255,255,255,.25);border-radius:12px;background:rgba(255,255,255,.10);color:#fff;padding:6px 9px;font:inherit;white-space:nowrap}
      #inkframe-v2-ab button.on{background:#bb0037;border-color:#ffb2c8}
      #inkframe-v2-ab button:disabled{opacity:.42}
      #inkframe-v2-status{min-width:180px;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.86}
      @media(max-width:700px){#inkframe-v2-status{display:none}}
    `;
    root.document.head.appendChild(style);

    panel = root.document.createElement('div');
    panel.id = 'inkframe-v2-ab';
    modeButton = root.document.createElement('button');
    modeButton.type = 'button';
    modeButton.addEventListener('click', () => {
      if (!setMode(mode === 'v2' ? 'original' : 'v2')) setStatus('Finish the current stroke before switching engines');
      else setStatus(mode === 'v2' ? 'V2 handles S Pen ink + eraser' : 'Original v0.1.1 active');
    });
    exportButton = root.document.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = 'Export trace';
    exportButton.addEventListener('click', exportLastTrace);
    statusNode = root.document.createElement('span');
    statusNode.id = 'inkframe-v2-status';
    panel.append(modeButton, exportButton, statusNode);
    root.document.body.appendChild(panel);
    updatePanel();
    setStatus(mode === 'v2' ? 'V2 handles S Pen ink + eraser' : 'Original v0.1.1 active');
    return true;
  }

  const api = {
    currentMode,
    setMode,
    isSupportedBrush,
    shouldHandle,
    makeProfile,
    begin,
    move,
    end,
    exportLastTrace,
    lastTrace: () => lastTrace ? JSON.parse(JSON.stringify(lastTrace)) : null,
    isActive: () => !!active,
    installPanel,
  };

  root.InkFrameBrushV2Adapter = api;
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', installPanel, { once: true });
    else installPanel();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
