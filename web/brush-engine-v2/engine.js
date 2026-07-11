// InkFrame Brush Engine V2 — composable deterministic stroke pipeline
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});

  function createBrushEngine(options) {
    const config = Object.assign({
      width: 1024,
      height: 768,
      brushId: 'ink',
      profile: null,
      validator: null,
      filter: null,
      arc: null,
      radius: null,
      contact: null,
      onDab: null,
    }, options || {});

    let brushId = config.brushId;
    let profile = ns.resolveProfile(brushId, config.profile);
    let validator = ns.createSampleValidator(Object.assign({ width: config.width, height: config.height }, config.validator || {}));
    let filter = ns.createStrokeFilter(config.filter || {});
    let path = ns.createQuadraticPathBuilder();
    let sampler = ns.createArcSampler(Object.assign({ spacingPx: Math.max(0.35, profile.size * profile.spacing) }, config.arc || {}));
    let radiusGuard = createRadiusGuard(profile);
    let contactGuard = createContactGuard(profile);
    let active = false;
    let validatorStarted = false;
    let lastFiltered = null;
    let lastDabSample = null;
    let strokeSerial = 0;
    let strokeDabIndex = 0;
    const totals = { strokes: 0, rawSamples: 0, acceptedSamples: 0, dabs: 0 };

    function createRadiusGuard(nextProfile) {
      if (!ns.createRadiusContinuityGuard) {
        return { apply: dab => dab, reset: () => {}, stats: () => ({ enabled:false, processed:0, clamped:0 }) };
      }
      return ns.createRadiusContinuityGuard(Object.assign({
        enabled: nextProfile.radiusMode === 'guarded',
        size: nextProfile.size,
      }, config.radius || {}));
    }

    function createContactGuard(nextProfile) {
      if (!ns.createContactBoundaryGuard) {
        return {
          begin: sample => [sample],
          move: sample => [sample],
          end: sample => sample ? [sample] : [],
          reset: () => {},
          snapshot: () => ({ mode:'raw', unavailable:true }),
        };
      }
      return ns.createContactBoundaryGuard(Object.assign({
        mode: nextProfile.contactMode === 'strict' ? 'strict' : 'raw',
      }, config.contact || {}));
    }

    function setBrush(nextBrushId, overrides) {
      if (active) throw new Error('cannot change brush during an active stroke');
      brushId = nextBrushId || 'ink';
      profile = ns.resolveProfile(brushId, overrides);
      sampler.setSpacing(Math.max(0.35, profile.size * profile.spacing));
      radiusGuard = createRadiusGuard(profile);
      contactGuard = createContactGuard(profile);
      return profile;
    }

    function emitSamples(samples, output) {
      for (const sample of samples) {
        if (lastDabSample
          && Math.hypot(sample.x - lastDabSample.x, sample.y - lastDabSample.y) < 1e-6
          && Math.abs(sample.time - lastDabSample.time) < 1e-6) continue;
        const rawDab = ns.dabFromSample(sample, brushId, profile, {
          strokeId: strokeSerial,
          strokeIndex: strokeDabIndex,
          strokeStart: strokeDabIndex === 0,
        });
        const dab = radiusGuard.apply(rawDab);
        output.push(dab);
        lastDabSample = sample;
        strokeDabIndex++;
        totals.dabs++;
        if (typeof config.onDab === 'function') config.onDab(dab);
      }
    }

    function processAccepted(samples, output) {
      for (const sample of samples) {
        totals.acceptedSamples++;
        const filtered = !lastFiltered ? filter.begin(sample) : filter.update(sample);
        if (!lastFiltered) {
          path.begin(filtered);
          emitSamples(sampler.begin(filtered), output);
        } else {
          const segments = path.push(filtered);
          for (const segment of segments) emitSamples(sampler.sampleSegment(segment), output);
        }
        lastFiltered = filtered;
      }
    }

    function feedBoundarySamples(samples, output) {
      for (const sample of samples || []) {
        const accepted = validatorStarted ? validator.push(sample) : validator.begin(sample);
        validatorStarted = true;
        processAccepted(accepted, output);
      }
    }

    function begin(raw) {
      if (active) throw new Error('stroke already active');
      active = true;
      totals.strokes++;
      totals.rawSamples++;
      strokeSerial++;
      strokeDabIndex = 0;
      validatorStarted = false;
      lastFiltered = null;
      lastDabSample = null;
      path.reset();
      sampler.reset();
      radiusGuard.reset();
      contactGuard.reset();
      sampler.setSpacing(Math.max(0.35, profile.size * profile.spacing));
      const sample = ns.normalizeSample(raw, 0);
      const output = [];
      feedBoundarySamples(contactGuard.begin(sample), output);
      return output;
    }

    function move(raw) {
      if (!active) throw new Error('stroke is not active');
      totals.rawSamples++;
      const output = [];
      const sample = ns.normalizeSample(raw, lastFiltered ? lastFiltered.time : 0);
      feedBoundarySamples(contactGuard.move(sample), output);
      return output;
    }

    function end(raw) {
      if (!active) return [];
      const output = [];
      let sample = null;
      if (raw) {
        totals.rawSamples++;
        sample = ns.normalizeSample(raw, lastFiltered ? lastFiltered.time : 0);
      }
      feedBoundarySamples(contactGuard.end(sample), output);
      if (validatorStarted) processAccepted(validator.finish({ acceptHeld: false }), output);
      if (lastFiltered) {
        for (const segment of path.finish()) emitSamples(sampler.sampleSegment(segment), output);
        emitSamples(sampler.finish(lastFiltered), output);
      }
      active = false;
      return output;
    }

    function reset() {
      active = false;
      validatorStarted = false;
      lastFiltered = null;
      lastDabSample = null;
      strokeDabIndex = 0;
      path.reset();
      sampler.reset();
      radiusGuard.reset();
      contactGuard.reset();
    }

    function stats() {
      return Object.assign({}, totals, {
        active,
        brushId,
        validator: validator.snapshot(),
        radius: radiusGuard.stats(),
        contact: contactGuard.snapshot(),
      });
    }

    return {
      begin, move, end, reset, setBrush, stats,
      isActive: () => active,
      profile: () => profile,
      brushId: () => brushId,
    };
  }

  Object.assign(ns, { createBrushEngine });
  if (typeof module !== 'undefined' && module.exports) module.exports = { createBrushEngine };
})(typeof globalThis !== 'undefined' ? globalThis : this);
