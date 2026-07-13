// InkFrame Brush Engine V2 — deterministic trace recording and replay
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const TRACE_VERSION = 1;

  function createTraceRecorder(metadata) {
    const trace = {
      format: 'inkframe-brush-trace',
      version: TRACE_VERSION,
      createdAt: new Date().toISOString(),
      metadata: Object.assign({}, metadata || {}),
      samples: [],
    };
    let started = false;

    function record(phase, raw) {
      const sample = ns.normalizeSample(raw, trace.samples.length ? trace.samples[trace.samples.length - 1].time : 0);
      trace.samples.push(Object.freeze(Object.assign({ phase }, sample)));
      return sample;
    }

    return {
      begin(raw) { started = true; return record('begin', raw); },
      move(raw) { if (!started) throw new Error('trace must begin before move'); return record('move', raw); },
      end(raw) {
        if (!started) throw new Error('trace must begin before end');
        const sample = raw ? record('end', raw) : null;
        started = false;
        return sample;
      },
      snapshot() { return JSON.parse(JSON.stringify(trace)); },
      toJSON(space) { return JSON.stringify(trace, null, space == null ? 2 : space); },
    };
  }

  function parseTrace(input) {
    const value = typeof input === 'string' ? JSON.parse(input) : input;
    if (!value || value.format !== 'inkframe-brush-trace' || value.version !== TRACE_VERSION || !Array.isArray(value.samples)) {
      throw new Error('unsupported InkFrame brush trace');
    }
    return value;
  }

  function replayTrace(engine, input) {
    const trace = parseTrace(input);
    const output = [];
    for (const sample of trace.samples) {
      if (sample.phase === 'begin') output.push(...engine.begin(sample));
      else if (sample.phase === 'move') output.push(...engine.move(sample));
      else if (sample.phase === 'end') output.push(...engine.end(sample));
    }
    if (engine.isActive && engine.isActive()) output.push(...engine.end());
    return output;
  }

  Object.assign(ns, { TRACE_VERSION, createTraceRecorder, parseTrace, replayTrace });
  if (typeof module !== 'undefined' && module.exports) module.exports = { TRACE_VERSION, createTraceRecorder, parseTrace, replayTrace };
})(typeof globalThis !== 'undefined' ? globalThis : this);
