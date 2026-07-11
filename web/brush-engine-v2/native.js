// InkFrame Brush Engine V2 — native Android pen diagnostics attachment
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return null; }
  }

  function readNativeTrace() {
    const bridge = root.InkFrameNativePenBridge;
    if (!bridge || typeof bridge.snapshotJson !== 'function') {
      return { available:false, reason:'native-bridge-unavailable' };
    }
    try {
      const parsed = JSON.parse(String(bridge.snapshotJson() || '{}'));
      parsed.available = true;
      return parsed;
    } catch (error) {
      return {
        available:true,
        parseError:String(error && error.message || error),
      };
    }
  }

  function readWebInputTrace() {
    const input = root.InkFrameBrushV2InputBridge;
    if (!input) return { available:false, reason:'input-bridge-unavailable' };
    try {
      if (typeof input.traceSnapshot === 'function') {
        return Object.assign({ available:true }, clone(input.traceSnapshot()) || {});
      }
      if (typeof input.stats === 'function') {
        return { available:true, stats:clone(input.stats()) };
      }
    } catch (error) {
      return { available:true, readError:String(error && error.message || error) };
    }
    return { available:false, reason:'input-trace-unavailable' };
  }

  function attachNativeDiagnostics(trace) {
    if (!trace || typeof trace !== 'object') return trace;
    const metadata = trace.metadata || (trace.metadata = {});
    metadata.nativePen = readNativeTrace();
    metadata.sanitizedWebInput = readWebInputTrace();
    metadata.inputComparison = {
      schema:1,
      capturedAt:new Date().toISOString(),
      webViewport:{
        width:Number(root.innerWidth) || 0,
        height:Number(root.innerHeight) || 0,
        devicePixelRatio:Number(root.devicePixelRatio) || 1,
      },
    };
    return trace;
  }

  const originalFactory = ns.createTraceRecorder;
  if (typeof originalFactory === 'function' && !originalFactory.__nativeDiagnosticsWrapped) {
    const wrappedFactory = function(metadata) {
      const recorder = originalFactory(metadata);
      if (!recorder || typeof recorder.snapshot !== 'function') return recorder;
      const originalSnapshot = recorder.snapshot;
      recorder.snapshot = function() {
        return attachNativeDiagnostics(originalSnapshot.call(recorder));
      };
      return recorder;
    };
    wrappedFactory.__nativeDiagnosticsWrapped = true;
    wrappedFactory.__originalFactory = originalFactory;
    ns.createTraceRecorder = wrappedFactory;
  }

  Object.assign(ns, {
    attachNativeDiagnostics,
    readNativePenTrace:readNativeTrace,
    readSanitizedWebInputTrace:readWebInputTrace,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { attachNativeDiagnostics, readNativeTrace, readWebInputTrace };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
