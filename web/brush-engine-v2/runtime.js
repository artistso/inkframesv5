// InkFrame Brush Engine V2 — build-variant runtime policy
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const config = Object.freeze(Object.assign({
    variant:'debug',
    diagnostics:true,
    traceTools:true,
    defaultBrushEngine:'v2',
  }, root.InkFrameBuild || {}));
  const MODE_KEY = 'inkframe.brushEngine.abMode.v1';

  function compactRecorderFactory(originalFactory) {
    return function compactTraceRecorder(metadata) {
      let started = false;
      let lastTime = 0;
      const createdAt = new Date().toISOString();

      function normalize(raw) {
        if (!ns.normalizeSample) return raw || null;
        const sample = ns.normalizeSample(raw, lastTime);
        lastTime = Number(sample && sample.time) || lastTime;
        return sample;
      }

      return {
        begin(raw) {
          started = true;
          return normalize(raw);
        },
        move(raw) {
          if (!started) throw new Error('trace must begin before move');
          return normalize(raw);
        },
        end(raw) {
          if (!started) throw new Error('trace must begin before end');
          const sample = raw ? normalize(raw) : null;
          started = false;
          return sample;
        },
        snapshot() {
          return {
            format:'inkframe-brush-trace',
            version:Number(ns.TRACE_VERSION) || 1,
            createdAt,
            metadata:Object.assign({}, metadata || {}, { diagnostics:false }),
            samples:[],
          };
        },
        toJSON(space) {
          return JSON.stringify(this.snapshot(), null, space == null ? 0 : space);
        },
        __compact:true,
        __originalFactory:originalFactory,
      };
    };
  }

  if (!config.diagnostics && typeof ns.createTraceRecorder === 'function') {
    const original = ns.createTraceRecorder;
    if (!original.__inkframeCompactWrapped) {
      const compact = compactRecorderFactory(original);
      compact.__inkframeCompactWrapped = true;
      ns.createTraceRecorder = compact;
    }
  }

  function safeStoredMode() {
    try {
      const value = root.localStorage && root.localStorage.getItem(MODE_KEY);
      return value === 'v2' || value === 'original' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function applyDefaultEngine(adapter) {
    if (!adapter || typeof adapter.setMode !== 'function') return;
    if (safeStoredMode()) return;
    adapter.setMode(config.defaultBrushEngine === 'original' ? 'original' : 'v2');
  }

  function trimProductionPanel() {
    if (config.traceTools || !root.document) return;
    const panel = root.document.getElementById('inkframe-v2-ab');
    if (!panel) return;
    for (const button of Array.from(panel.querySelectorAll('button'))) {
      const label = String(button.textContent || '').trim();
      if (label === 'Import trace' || label === 'Replay' || label === 'Export trace') button.remove();
    }
    for (const input of Array.from(panel.querySelectorAll('input[type="file"]'))) input.remove();
    const status = root.document.getElementById('inkframe-v2-status');
    if (status) status.remove();
    panel.setAttribute('data-runtime', 'production');
  }

  function applyRuntimePolicy(attempt) {
    const adapter = root.InkFrameBrushV2Adapter;
    const panel = root.document && root.document.getElementById('inkframe-v2-ab');
    if ((!adapter || !panel) && attempt < 20) {
      root.setTimeout(() => applyRuntimePolicy(attempt + 1), 0);
      return;
    }
    applyDefaultEngine(adapter);
    trimProductionPanel();
  }

  function scheduleRuntimePolicy() {
    if (!root.document) return;
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', () => root.setTimeout(() => applyRuntimePolicy(0), 0), { once:true });
    } else {
      root.setTimeout(() => applyRuntimePolicy(0), 0);
    }
  }

  ns.buildConfig = config;
  ns.applyDefaultEngine = applyDefaultEngine;
  ns.applyRuntimePolicy = () => applyRuntimePolicy(0);
  scheduleRuntimePolicy();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { config, compactRecorderFactory, applyDefaultEngine };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
