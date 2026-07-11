// InkFrame Brush Engine V2 — bounded live tuning and reproducible presets
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const STORAGE_KEY = 'inkframe.brushEngine.v2Tuning.v1';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

  const PRESETS = Object.freeze({
    direct: Object.freeze({
      name: 'Direct',
      positionTimeConstantMs: 4,
      pressureTimeConstantMs: 8,
      spacingScale: 0.90,
      minimumJump: 84,
      speedLimitPxPerMs: 10,
    }),
    balanced: Object.freeze({
      name: 'Balanced',
      positionTimeConstantMs: 8,
      pressureTimeConstantMs: 12,
      spacingScale: 1,
      minimumJump: 72,
      speedLimitPxPerMs: 8,
    }),
    smooth: Object.freeze({
      name: 'Smooth',
      positionTimeConstantMs: 15,
      pressureTimeConstantMs: 18,
      spacingScale: 0.82,
      minimumJump: 64,
      speedLimitPxPerMs: 7,
    }),
  });

  function normalizeTuning(value) {
    const input = value || {};
    const base = PRESETS.balanced;
    return Object.freeze({
      preset: ['direct', 'balanced', 'smooth', 'custom'].includes(input.preset) ? input.preset : 'balanced',
      positionTimeConstantMs: clamp(input.positionTimeConstantMs ?? base.positionTimeConstantMs, 0.5, 40),
      pressureTimeConstantMs: clamp(input.pressureTimeConstantMs ?? base.pressureTimeConstantMs, 0.5, 50),
      spacingScale: clamp(input.spacingScale ?? base.spacingScale, 0.35, 1.75),
      minimumJump: clamp(input.minimumJump ?? base.minimumJump, 24, 220),
      speedLimitPxPerMs: clamp(input.speedLimitPxPerMs ?? base.speedLimitPxPerMs, 1, 20),
    });
  }

  function presetValue(name) {
    const key = Object.prototype.hasOwnProperty.call(PRESETS, name) ? name : 'balanced';
    return normalizeTuning(Object.assign({ preset: key }, PRESETS[key]));
  }

  function tuningFilterOptions(value) {
    const tuning = normalizeTuning(value);
    return {
      positionTimeConstantMs: tuning.positionTimeConstantMs,
      pressureTimeConstantMs: tuning.pressureTimeConstantMs,
      tiltTimeConstantMs: 18,
      angleTimeConstantMs: 18,
      resetGapMs: 80,
    };
  }

  function tuningValidatorOptions(value) {
    const tuning = normalizeTuning(value);
    return {
      minimumJump: tuning.minimumJump,
      speedLimitPxPerMs: tuning.speedLimitPxPerMs,
    };
  }

  function applyTuningToProfile(profile, value) {
    const tuning = normalizeTuning(value);
    return Object.assign({}, profile || {}, {
      spacing: Math.max(0.01, Number(profile && profile.spacing || 0.1) * tuning.spacingScale),
    });
  }

  function createTuningStore(storage) {
    let current = presetValue('balanced');
    const listeners = new Set();

    try {
      const raw = storage && storage.getItem(STORAGE_KEY);
      if (raw) current = normalizeTuning(JSON.parse(raw));
    } catch (_) {}

    function persist() {
      try { if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(current)); }
      catch (_) {}
    }

    function notify() {
      for (const listener of listeners) {
        try { listener(current); } catch (_) {}
      }
    }

    function set(patch) {
      current = normalizeTuning(Object.assign({}, current, patch || {}, { preset: 'custom' }));
      persist();
      notify();
      return current;
    }

    function applyPreset(name) {
      current = presetValue(name);
      persist();
      notify();
      return current;
    }

    function replace(value) {
      current = normalizeTuning(value);
      persist();
      notify();
      return current;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    return {
      snapshot: () => Object.assign({}, current),
      set,
      replace,
      applyPreset,
      reset: () => applyPreset('balanced'),
      subscribe,
    };
  }

  const api = {
    STORAGE_KEY,
    PRESETS,
    normalizeTuning,
    presetValue,
    tuningFilterOptions,
    tuningValidatorOptions,
    applyTuningToProfile,
    createTuningStore,
  };
  Object.assign(ns, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
