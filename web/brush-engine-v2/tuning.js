// InkFrame Brush Engine V2 — bounded live tuning and reproducible presets
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const STORAGE_KEY = 'inkframe.brushEngine.v2Tuning.v4';
  const PREVIOUS_STORAGE_KEY = 'inkframe.brushEngine.v2Tuning.v3';
  const ADAPTIVE_STORAGE_KEY = 'inkframe.brushEngine.v2Tuning.v2';
  const LEGACY_STORAGE_KEY = 'inkframe.brushEngine.v2Tuning.v1';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

  const PRESETS = Object.freeze({
    direct: Object.freeze({
      name: 'Direct',
      stabilizerMode: 'adaptive',
      stabilizerStrength: 25,
      cornerMode: 'preserve',
      cornerStrength: 80,
      ghostMode: 'comet',
      ghostIntensity: 45,
      ghostDurationMs: 260,
      ghostWidthPercent: 115,
      positionTimeConstantMs: 4,
      pressureTimeConstantMs: 8,
      spacingScale: 0.90,
      minimumJump: 84,
      speedLimitPxPerMs: 10,
      coverageMode: 'ribbon',
      radiusMode: 'guarded',
      contactMode: 'strict',
    }),
    balanced: Object.freeze({
      name: 'Balanced',
      stabilizerMode: 'adaptive',
      stabilizerStrength: 55,
      cornerMode: 'preserve',
      cornerStrength: 70,
      ghostMode: 'comet',
      ghostIntensity: 65,
      ghostDurationMs: 380,
      ghostWidthPercent: 130,
      positionTimeConstantMs: 8,
      pressureTimeConstantMs: 12,
      spacingScale: 1,
      minimumJump: 72,
      speedLimitPxPerMs: 8,
      coverageMode: 'ribbon',
      radiusMode: 'guarded',
      contactMode: 'strict',
    }),
    smooth: Object.freeze({
      name: 'Smooth',
      stabilizerMode: 'adaptive',
      stabilizerStrength: 80,
      cornerMode: 'preserve',
      cornerStrength: 55,
      ghostMode: 'echo',
      ghostIntensity: 76,
      ghostDurationMs: 560,
      ghostWidthPercent: 150,
      positionTimeConstantMs: 15,
      pressureTimeConstantMs: 18,
      spacingScale: 0.82,
      minimumJump: 64,
      speedLimitPxPerMs: 7,
      coverageMode: 'ribbon',
      radiusMode: 'guarded',
      contactMode: 'strict',
    }),
  });

  function normalizeCoverageMode(value) {
    return value === 'dabs' ? 'dabs' : 'ribbon';
  }

  function normalizeRadiusMode(value) {
    return value === 'raw' ? 'raw' : 'guarded';
  }

  function normalizeContactMode(value) {
    return value === 'strict' ? 'strict' : 'raw';
  }

  function normalizeStabilizerMode(value) {
    return value === 'adaptive' ? 'adaptive' : 'fixed';
  }

  function normalizeCornerMode(value) {
    return value === 'preserve' ? 'preserve' : 'smooth';
  }

  function normalizeGhostMode(value) {
    if (value === 'comet' || value === 'echo') return value;
    return 'off';
  }

  function normalizeTuning(value) {
    const input = value || {};
    const base = PRESETS.balanced;
    const hasStabilizerMode = Object.prototype.hasOwnProperty.call(input, 'stabilizerMode');
    const hasCornerMode = Object.prototype.hasOwnProperty.call(input, 'cornerMode');
    const hasGhostMode = Object.prototype.hasOwnProperty.call(input, 'ghostMode');
    return Object.freeze({
      preset: ['direct', 'balanced', 'smooth', 'custom'].includes(input.preset) ? input.preset : 'balanced',
      // Missing fields identify older traces/settings. Preserve their exact filter
      // behavior and keep the new display-only trail disabled until selected.
      stabilizerMode: normalizeStabilizerMode(hasStabilizerMode ? input.stabilizerMode : 'fixed'),
      stabilizerStrength: clamp(input.stabilizerStrength ?? base.stabilizerStrength, 0, 200),
      cornerMode: normalizeCornerMode(hasCornerMode ? input.cornerMode : 'smooth'),
      cornerStrength: clamp(input.cornerStrength ?? base.cornerStrength, 0, 100),
      ghostMode: normalizeGhostMode(hasGhostMode ? input.ghostMode : 'off'),
      ghostIntensity: clamp(input.ghostIntensity ?? base.ghostIntensity, 0, 100),
      ghostDurationMs: clamp(input.ghostDurationMs ?? base.ghostDurationMs, 80, 1200),
      ghostWidthPercent: clamp(input.ghostWidthPercent ?? base.ghostWidthPercent, 50, 250),
      positionTimeConstantMs: clamp(input.positionTimeConstantMs ?? base.positionTimeConstantMs, 0.5, 40),
      pressureTimeConstantMs: clamp(input.pressureTimeConstantMs ?? base.pressureTimeConstantMs, 0.5, 50),
      spacingScale: clamp(input.spacingScale ?? base.spacingScale, 0.35, 1.75),
      minimumJump: clamp(input.minimumJump ?? base.minimumJump, 24, 220),
      speedLimitPxPerMs: clamp(input.speedLimitPxPerMs ?? base.speedLimitPxPerMs, 1, 20),
      coverageMode: normalizeCoverageMode(input.coverageMode ?? base.coverageMode),
      radiusMode: normalizeRadiusMode(input.radiusMode ?? base.radiusMode),
      contactMode: normalizeContactMode(input.contactMode ?? base.contactMode),
    });
  }

  function presetValue(name) {
    const key = Object.prototype.hasOwnProperty.call(PRESETS, name) ? name : 'balanced';
    return normalizeTuning(Object.assign({ preset: key }, PRESETS[key]));
  }

  // Strength 0..100 retains the exact v3 coefficient mapping. The 101..200
  // Studio range extends slow-detail hold while keeping every coefficient bounded
  // and preserving a finite fast-motion release.
  function adaptivePositionOptions(tuning) {
    const raw = clamp(tuning.stabilizerStrength, 0, 200);
    const classic = Math.min(raw, 100) / 100;
    const studio = Math.max(0, raw - 100) / 100;
    return {
      positionSlowTimeConstantMs: 5 + 24 * classic + 31 * studio,
      positionFastTimeConstantMs: 1.5 + 4 * classic + 1.5 * studio,
      stabilizerSpeedStartPxPerMs: 0.08 + 0.12 * (1 - classic) - 0.04 * studio,
      stabilizerSpeedEndPxPerMs: 2.2 + 3.2 * classic + 2.1 * studio,
      speedSmoothingTimeConstantMs: 10 + 24 * classic + 16 * studio,
    };
  }

  function cornerPositionOptions(tuning) {
    return {
      cornerMode: tuning.cornerMode,
      cornerStrength: clamp(tuning.cornerStrength, 0, 100) / 100,
      cornerStartRadians: Math.PI / 10,
      cornerEndRadians: Math.PI * 0.72,
      cornerTimeConstantMs: 1.75,
      cornerMinimumSegmentPx: 0.75,
    };
  }

  function tuningGhostOptions(value) {
    const tuning = normalizeTuning(value);
    return Object.freeze({
      mode: tuning.ghostMode,
      intensity: tuning.ghostIntensity / 100,
      durationMs: tuning.ghostDurationMs,
      widthScale: tuning.ghostWidthPercent / 100,
    });
  }

  function tuningFilterOptions(value) {
    const tuning = normalizeTuning(value);
    return Object.assign({
      stabilizerMode: tuning.stabilizerMode,
      positionTimeConstantMs: tuning.positionTimeConstantMs,
      pressureTimeConstantMs: tuning.pressureTimeConstantMs,
      tiltTimeConstantMs: 18,
      angleTimeConstantMs: 18,
      resetGapMs: 80,
    }, adaptivePositionOptions(tuning), cornerPositionOptions(tuning));
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
      coverage: tuning.coverageMode,
      radiusMode: tuning.radiusMode,
      contactMode: tuning.contactMode,
    });
  }

  function createTuningStore(storage) {
    let current = presetValue('balanced');
    const listeners = new Set();
    let migrated = false;

    try {
      const raw = storage && storage.getItem(STORAGE_KEY);
      if (raw) current = normalizeTuning(JSON.parse(raw));
      else {
        const previous = storage && storage.getItem(PREVIOUS_STORAGE_KEY);
        if (previous) {
          current = normalizeTuning(Object.assign({}, JSON.parse(previous), {
            preset:'custom',
            ghostMode:'off',
          }));
          migrated = true;
        } else {
          const adaptive = storage && storage.getItem(ADAPTIVE_STORAGE_KEY);
          if (adaptive) {
            current = normalizeTuning(Object.assign({}, JSON.parse(adaptive), {
              preset:'custom',
              cornerMode:'smooth',
              ghostMode:'off',
            }));
            migrated = true;
          } else {
            const legacy = storage && storage.getItem(LEGACY_STORAGE_KEY);
            if (legacy) {
              current = normalizeTuning(Object.assign({}, JSON.parse(legacy), {
                preset:'custom',
                stabilizerMode:'fixed',
                cornerMode:'smooth',
                ghostMode:'off',
              }));
              migrated = true;
            }
          }
        }
      }
    } catch (_) {}

    function persist() {
      try { if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(current)); }
      catch (_) {}
    }

    if (migrated) persist();

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
    PREVIOUS_STORAGE_KEY,
    ADAPTIVE_STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    PRESETS,
    normalizeCoverageMode,
    normalizeRadiusMode,
    normalizeContactMode,
    normalizeStabilizerMode,
    normalizeCornerMode,
    normalizeGhostMode,
    normalizeTuning,
    presetValue,
    adaptivePositionOptions,
    cornerPositionOptions,
    tuningGhostOptions,
    tuningFilterOptions,
    tuningValidatorOptions,
    applyTuningToProfile,
    createTuningStore,
  };
  Object.assign(ns, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
