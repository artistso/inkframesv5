// InkFrame Brush Engine V2 — live A/B adapter, tuning, and trace replay
// -----------------------------------------------------------------------------
// The APK staging step injects explicit calls into the original pointer handlers.
// This module does not modify PointerEvent, EventTarget, or Canvas prototypes.
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
  let tuneButton = null;
  let replayButton = null;
  let importButton = null;
  let exportButton = null;
  let importInput = null;
  let statusNode = null;
  let tuningPanel = null;
  let presetSelect = null;
  const tuningInputs = Object.create(null);
  const tuningStore = ns.createTuningStore
    ? ns.createTuningStore(safeStorage())
    : createFallbackTuningStore();

  function safeStorage() {
    try { return root.localStorage || null; } catch (_) { return null; }
  }

  function createFallbackTuningStore() {
    let value = {
      preset: 'balanced', positionTimeConstantMs: 8, pressureTimeConstantMs: 12,
      spacingScale: 1, minimumJump: 72, speedLimitPxPerMs: 8,
    };
    return {
      snapshot: () => Object.assign({}, value),
      set: patch => (value = Object.assign({}, value, patch || {}, { preset:'custom' })),
      replace: next => (value = Object.assign({}, value, next || {})),
      applyPreset: () => Object.assign({}, value),
      reset: () => Object.assign({}, value),
      subscribe: () => () => {},
    };
  }

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
  function currentTuning() { return tuningStore.snapshot(); }

  function setMode(next) {
    const resolved = next === 'v2' ? 'v2' : 'original';
    if (active) return false;
    mode = resolved;
    writeMode(mode);
    updatePanel();
    return true;
  }

  function setTuning(patch) {
    if (active) return false;
    tuningStore.set(patch || {});
    updatePanel();
    return true;
  }

  function setTuningPreset(name) {
    if (active) return false;
    tuningStore.applyPreset(name);
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

  function tunedProfile(baseProfile, tuning) {
    return ns.applyTuningToProfile
      ? ns.applyTuningToProfile(baseProfile, tuning)
      : Object.assign({}, baseProfile);
  }

  function filterOptions(tuning) {
    return ns.tuningFilterOptions ? ns.tuningFilterOptions(tuning) : {
      positionTimeConstantMs: tuning.positionTimeConstantMs,
      pressureTimeConstantMs: tuning.pressureTimeConstantMs,
    };
  }

  function validatorOptions(tuning) {
    return ns.tuningValidatorOptions ? ns.tuningValidatorOptions(tuning) : {
      minimumJump: tuning.minimumJump,
      speedLimitPxPerMs: tuning.speedLimitPxPerMs,
    };
  }

  function makeEngine(env, brushId, profile, tuning) {
    return ns.createBrushEngine({
      width: env.width,
      height: env.height,
      brushId,
      profile,
      filter: filterOptions(tuning),
      validator: validatorOptions(tuning),
    });
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

  function paintDabs(stroke, dabs, colorOverride) {
    if (!stroke || !dabs || !dabs.length) return;
    const env = stroke.env;
    const color = colorOverride || env.color;
    for (const dab of dabs) {
      ns.paintRoundDab(env.layerCtx, dab, color);
      if (stroke.brushId !== 'eraser') ns.paintRoundDab(env.mainCtx, dab, color);
    }
    if (stroke.brushId === 'eraser' && typeof env.renderLive === 'function') env.renderLive();
  }

  function begin(event, env) {
    if (!env || !shouldHandle(env.brushId, event)) return false;
    if (active) return true;
    if (!ns.createBrushEngine || !ns.createTraceRecorder || !ns.paintRoundDab) return false;

    try {
      event.preventDefault();
      const tuning = currentTuning();
      const baseProfile = makeProfile(env);
      const profile = tunedProfile(baseProfile, tuning);
      const engine = makeEngine(env, env.brushId, profile, tuning);
      const recorder = ns.createTraceRecorder({
        engine: 'v2-reference',
        brushId: env.brushId,
        profile,
        baseProfile,
        tuning,
        color: env.color,
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
        tuning,
        rawSamples: 1,
      };
      if (env.canvas && env.canvas.setPointerCapture) {
        try { env.canvas.setPointerCapture(event.pointerId); } catch (_) {}
      }
      recorder.begin(sample);
      paintDabs(active, engine.begin(sample));
      setStatus('V2 drawing · ' + env.brushId + ' · ' + tuning.preset);
      updatePanel();
      return true;
    } catch (error) {
      const failed = active;
      active = null;
      if (failed && failed.env && typeof failed.env.abort === 'function') failed.env.abort(failed.snapshot);
      setStatus('V2 start failed · ' + (error && error.message || error));
      updatePanel();
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
      updatePanel();
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
      updatePanel();
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

  function loadTrace(input) {
    if (active || !ns.parseTrace) return false;
    try {
      const parsed = ns.parseTrace(input);
      lastTrace = JSON.parse(JSON.stringify(parsed));
      setStatus('Trace loaded · ' + lastTrace.samples.length + ' samples');
      updatePanel();
      return true;
    } catch (error) {
      setStatus('Trace import failed · ' + (error && error.message || error));
      return false;
    }
  }

  function importTraceFile(file) {
    if (!file || typeof root.FileReader !== 'function') return false;
    const reader = new root.FileReader();
    reader.onload = () => loadTrace(String(reader.result || ''));
    reader.onerror = () => setStatus('Trace import failed · file read error');
    reader.readAsText(file);
    return true;
  }

  function replayLastTrace() {
    if (active || !lastTrace || !ns.replayTrace || !ns.parseTrace) return false;
    const factory = root.InkFrameBrushV2Environment;
    if (typeof factory !== 'function') {
      setStatus('Replay unavailable · canvas bridge missing');
      return false;
    }

    let env = null;
    let snapshot = null;
    try {
      const trace = ns.parseTrace(lastTrace);
      const metadata = trace.metadata || {};
      const brushId = metadata.brushId || 'ink';
      if (!isSupportedBrush(brushId)) throw new Error('trace brush is not supported');
      env = factory();
      if (!env) throw new Error('active canvas unavailable');
      const sourceCanvas = metadata.canvas || {};
      if (sourceCanvas.width && sourceCanvas.height
        && (Number(sourceCanvas.width) !== Number(env.width) || Number(sourceCanvas.height) !== Number(env.height))) {
        throw new Error('trace canvas size does not match current project');
      }

      snapshot = typeof env.snapshot === 'function' ? env.snapshot() : null;
      const tuning = metadata.tuning
        ? (ns.normalizeTuning ? ns.normalizeTuning(metadata.tuning) : metadata.tuning)
        : currentTuning();
      const baseProfile = metadata.profile || makeProfile(Object.assign({}, env, { brushId }));
      const profile = metadata.tuning ? baseProfile : tunedProfile(baseProfile, tuning);
      const engine = makeEngine(env, brushId, profile, tuning);
      const dabs = ns.replayTrace(engine, trace);
      paintDabs({ env, brushId }, dabs, metadata.color || env.color);
      if (typeof env.commit === 'function') env.commit(snapshot);
      setStatus('Replay · ' + brushId + ' · ' + dabs.length + ' dabs · ' + tuning.preset);
      return true;
    } catch (error) {
      if (env && typeof env.abort === 'function') env.abort(snapshot);
      setStatus('Replay failed · ' + (error && error.message || error));
      return false;
    } finally {
      updatePanel();
    }
  }

  function setStatus(text) {
    if (statusNode) statusNode.textContent = String(text || '');
  }

  function tuningLabel(value) {
    const key = value && value.preset || 'custom';
    if (ns.PRESETS && ns.PRESETS[key]) return ns.PRESETS[key].name;
    return key === 'custom' ? 'Custom' : key;
  }

  function syncTuningControls() {
    const value = currentTuning();
    if (presetSelect) presetSelect.value = value.preset;
    const map = {
      positionTimeConstantMs: value.positionTimeConstantMs,
      pressureTimeConstantMs: value.pressureTimeConstantMs,
      spacingScale: Math.round(value.spacingScale * 100),
      minimumJump: value.minimumJump,
    };
    for (const [key, number] of Object.entries(map)) {
      const pair = tuningInputs[key];
      if (!pair) continue;
      pair.input.value = String(number);
      pair.value.textContent = key === 'spacingScale' ? number + '%' : String(Math.round(number));
      pair.input.disabled = !!active;
    }
  }

  function updatePanel() {
    if (!panel) return;
    const tuning = currentTuning();
    modeButton.textContent = mode === 'v2' ? 'Engine · V2' : 'Engine · Original';
    modeButton.classList.toggle('on', mode === 'v2');
    tuneButton.textContent = 'Tune · ' + tuningLabel(tuning);
    modeButton.disabled = !!active;
    tuneButton.disabled = !!active;
    replayButton.disabled = !!active || !lastTrace;
    importButton.disabled = !!active;
    exportButton.disabled = !lastTrace;
    if (presetSelect) presetSelect.disabled = !!active;
    syncTuningControls();
    if (!active && !statusNode.textContent) {
      statusNode.textContent = mode === 'v2' ? 'V2 handles S Pen ink + eraser' : 'Original v0.1.1 active';
    }
  }

  function addTuningRow(container, key, label, min, max, step) {
    const row = root.document.createElement('label');
    row.className = 'inkframe-v2-tune-row';
    const name = root.document.createElement('span');
    name.textContent = label;
    const input = root.document.createElement('input');
    input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step);
    const value = root.document.createElement('output');
    input.addEventListener('input', () => {
      const raw = Number(input.value);
      const patch = {};
      patch[key] = key === 'spacingScale' ? raw / 100 : raw;
      setTuning(patch);
    });
    row.append(name, input, value);
    container.appendChild(row);
    tuningInputs[key] = { input, value };
  }

  function installPanel() {
    if (!root.document || root.document.getElementById('inkframe-v2-ab')) return false;
    const style = root.document.createElement('style');
    style.textContent = `
      #inkframe-v2-ab{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:100000;display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid rgba(255,255,255,.28);border-radius:16px;background:rgba(24,8,20,.82);backdrop-filter:blur(12px);box-shadow:0 5px 22px rgba(0,0,0,.28);font:600 11px/1.15 system-ui,sans-serif;color:#fff;max-width:min(96vw,980px)}
      #inkframe-v2-ab button,#inkframe-v2-ab select{border:1px solid rgba(255,255,255,.25);border-radius:12px;background:rgba(255,255,255,.10);color:#fff;padding:6px 8px;font:inherit;white-space:nowrap}
      #inkframe-v2-ab button.on{background:#bb0037;border-color:#ffb2c8}
      #inkframe-v2-ab button:disabled,#inkframe-v2-ab select:disabled{opacity:.42}
      #inkframe-v2-status{min-width:150px;max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.86}
      #inkframe-v2-tuning{position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:99999;width:min(92vw,560px);padding:12px;border:1px solid rgba(255,255,255,.25);border-radius:16px;background:rgba(24,8,20,.92);color:#fff;font:600 12px/1.2 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.34)}
      #inkframe-v2-tuning[hidden]{display:none}
      #inkframe-v2-tuning .inkframe-v2-tune-head{display:flex;gap:8px;align-items:center;margin-bottom:8px}
      #inkframe-v2-tuning select{flex:1}
      .inkframe-v2-tune-row{display:grid;grid-template-columns:110px 1fr 45px;align-items:center;gap:8px;margin:8px 0}
      .inkframe-v2-tune-row input{width:100%}
      .inkframe-v2-tune-row output{text-align:right;font-variant-numeric:tabular-nums}
      @media(max-width:760px){#inkframe-v2-status{display:none}#inkframe-v2-ab{gap:4px;padding:5px}#inkframe-v2-ab button{padding:6px}.inkframe-v2-tune-row{grid-template-columns:90px 1fr 40px}}
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

    tuneButton = root.document.createElement('button');
    tuneButton.type = 'button';
    tuneButton.addEventListener('click', () => { tuningPanel.hidden = !tuningPanel.hidden; });

    importButton = root.document.createElement('button');
    importButton.type = 'button'; importButton.textContent = 'Import trace';
    importButton.addEventListener('click', () => importInput.click());
    importInput = root.document.createElement('input');
    importInput.type = 'file'; importInput.accept = '.json,application/json'; importInput.hidden = true;
    importInput.addEventListener('change', () => {
      const file = importInput.files && importInput.files[0];
      if (file) importTraceFile(file);
      importInput.value = '';
    });

    replayButton = root.document.createElement('button');
    replayButton.type = 'button'; replayButton.textContent = 'Replay';
    replayButton.addEventListener('click', replayLastTrace);

    exportButton = root.document.createElement('button');
    exportButton.type = 'button'; exportButton.textContent = 'Export trace';
    exportButton.addEventListener('click', exportLastTrace);

    statusNode = root.document.createElement('span');
    statusNode.id = 'inkframe-v2-status';
    panel.append(modeButton, tuneButton, importButton, replayButton, exportButton, statusNode, importInput);
    root.document.body.appendChild(panel);

    tuningPanel = root.document.createElement('div');
    tuningPanel.id = 'inkframe-v2-tuning';
    tuningPanel.hidden = true;
    const head = root.document.createElement('div');
    head.className = 'inkframe-v2-tune-head';
    const title = root.document.createElement('strong'); title.textContent = 'V2 stroke tuning';
    presetSelect = root.document.createElement('select');
    for (const [value, label] of [['direct','Direct'],['balanced','Balanced'],['smooth','Smooth'],['custom','Custom']]) {
      const option = root.document.createElement('option'); option.value = value; option.textContent = label; presetSelect.appendChild(option);
    }
    presetSelect.addEventListener('change', () => {
      if (presetSelect.value !== 'custom') setTuningPreset(presetSelect.value);
    });
    const reset = root.document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset';
    reset.addEventListener('click', () => setTuningPreset('balanced'));
    head.append(title, presetSelect, reset);
    tuningPanel.appendChild(head);
    addTuningRow(tuningPanel, 'positionTimeConstantMs', 'Position lag', 1, 30, 1);
    addTuningRow(tuningPanel, 'pressureTimeConstantMs', 'Pressure lag', 1, 40, 1);
    addTuningRow(tuningPanel, 'spacingScale', 'Dab spacing', 40, 160, 1);
    addTuningRow(tuningPanel, 'minimumJump', 'Spike gate', 32, 180, 2);
    root.document.body.appendChild(tuningPanel);

    tuningStore.subscribe(() => updatePanel());
    updatePanel();
    setStatus(mode === 'v2' ? 'V2 handles S Pen ink + eraser' : 'Original v0.1.1 active');
    return true;
  }

  const api = {
    currentMode,
    currentTuning,
    setMode,
    setTuning,
    setTuningPreset,
    isSupportedBrush,
    shouldHandle,
    makeProfile,
    begin,
    move,
    end,
    loadTrace,
    replayLastTrace,
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
