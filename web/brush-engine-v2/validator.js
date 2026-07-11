// InkFrame Brush Engine V2 — sample validation, spike quarantine, and discontinuity segmentation
'use strict';

(function(root){
  const ns = root.InkFrameBrushV2 || (root.InkFrameBrushV2 = {});
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function createSampleValidator(options) {
    const config = Object.assign({
      width: 1024,
      height: 768,
      boundsPadding: 96,
      minimumJump: 72,
      speedLimitPxPerMs: 8,
      recentStepMultiplier: 8,
      returnRatio: 0.30,
      timestampTolerance: 0.25,
      segmentBreakMinimum: 180,
      segmentBreakFraction: 0.16,
      segmentBreakSpeedPxPerMs: 14,
      segmentBreakStepMultiplier: 12,
      partialReturnRatio: 0.45,
    }, options || {});
    const diagonal = Math.hypot(config.width, config.height);
    let last = null;
    let pending = null;
    let recentStep = 0;
    const stats = {
      accepted: 0,
      dropped: 0,
      held: 0,
      breaks: 0,
      reasons: Object.create(null),
      breakReasons: Object.create(null),
    };

    const reason = name => {
      stats.dropped++;
      stats.reasons[name] = (stats.reasons[name] || 0) + 1;
    };

    const markBreak = name => {
      stats.breaks++;
      stats.breakReasons[name] = (stats.breakReasons[name] || 0) + 1;
    };

    function result(samples, breakBefore, breakReason) {
      return {
        samples,
        breakBefore: !!breakBefore,
        breakReason: breakReason || null,
      };
    }

    function inBounds(sample) {
      const p = config.boundsPadding;
      return sample.x >= -p && sample.y >= -p
        && sample.x <= config.width + p && sample.y <= config.height + p;
    }

    function jumpLimit(a, b) {
      const dt = Math.max(1, b.time - a.time);
      return Math.max(
        config.minimumJump,
        recentStep * config.recentStepMultiplier,
        dt * config.speedLimitPxPerMs
      );
    }

    function segmentBreakLimit(a, b) {
      const dt = Math.max(1, b.time - a.time);
      return Math.max(
        config.segmentBreakMinimum,
        diagonal * config.segmentBreakFraction,
        recentStep * config.segmentBreakStepMultiplier,
        dt * config.segmentBreakSpeedPxPerMs
      );
    }

    function basicCheck(sample, reference) {
      if (!ns.isFiniteSample || !ns.isFiniteSample(sample)) return 'non-finite';
      if (!inBounds(sample)) return 'out-of-bounds';
      if (reference && sample.time < reference.time - config.timestampTolerance) return 'timestamp-regression';
      return null;
    }

    function commit(sample, output) {
      if (last) {
        const step = distance(last, sample);
        recentStep = recentStep ? recentStep * 0.82 + step * 0.18 : step;
      }
      last = sample;
      stats.accepted++;
      output.push(sample);
    }

    function restartAt(sample, output) {
      last = null;
      recentStep = 0;
      commit(sample, output);
    }

    function hold(sample) {
      pending = sample;
      stats.held++;
    }

    function queueOrCommit(sample, output) {
      if (!last) {
        commit(sample, output);
        return;
      }
      if (distance(last, sample) > jumpLimit(last, sample)) hold(sample);
      else commit(sample, output);
    }

    function isolatedSpike(a, b, c) {
      const ab = distance(a, b);
      const bc = distance(b, c);
      const ac = distance(a, c);
      const arm = Math.min(ab, bc);
      if (arm < jumpLimit(a, b)) return false;
      if (Math.max(ab, bc) > arm * 3) return false;
      return ac <= Math.max(12, arm * config.returnRatio);
    }

    function returnedTowardAnchor(a, b, c) {
      const ab = distance(a, b);
      const bc = distance(b, c);
      const ac = distance(a, c);
      return ac < bc
        && ac <= Math.max(jumpLimit(a, c), ab * config.partialReturnRatio);
    }

    function beginDetailed(sample) {
      last = null;
      pending = null;
      recentStep = 0;
      stats.accepted = 0;
      stats.dropped = 0;
      stats.held = 0;
      stats.breaks = 0;
      stats.reasons = Object.create(null);
      stats.breakReasons = Object.create(null);
      const output = [];
      const failure = basicCheck(sample, null);
      if (failure) reason(failure); else commit(sample, output);
      return result(output, false, null);
    }

    function pushDetailed(sample) {
      const output = [];
      const failure = basicCheck(sample, pending || last);
      if (failure) {
        reason(failure);
        return result(output, false, null);
      }
      if (!last) {
        commit(sample, output);
        return result(output, false, null);
      }

      if (pending) {
        const held = pending;
        pending = null;

        // A large out-and-back excursion is an isolated coordinate spike. The held
        // coordinate never becomes paintable geometry.
        if (isolatedSpike(last, held, sample) || returnedTowardAnchor(last, held, sample)) {
          reason('isolated-spike');
          queueOrCommit(sample, output);
          return result(output, false, null);
        }

        const gap = distance(last, held);
        if (gap > segmentBreakLimit(last, held)) {
          // Two successive samples confirmed that the input moved to a different
          // coordinate region. Accept the new region, but explicitly sever the
          // geometric path before it so no line can bridge the gap.
          markBreak('confirmed-discontinuity');
          restartAt(held, output);
          queueOrCommit(sample, output);
          return result(output, true, 'confirmed-discontinuity');
        }

        // The jump was below the discontinuity threshold and subsequent motion did
        // not return toward the anchor, so preserve it as legitimate fast motion.
        commit(held, output);
        queueOrCommit(sample, output);
        return result(output, false, null);
      }

      if (distance(last, sample) > jumpLimit(last, sample)) hold(sample);
      else commit(sample, output);
      return result(output, false, null);
    }

    function finishDetailed(options) {
      const output = [];
      const acceptHeld = !!(options && options.acceptHeld);
      if (pending) {
        if (acceptHeld && distance(last, pending) <= segmentBreakLimit(last, pending)) commit(pending, output);
        else reason('unconfirmed-terminal-jump');
        pending = null;
      }
      return result(output, false, null);
    }

    function snapshot() {
      return {
        accepted: stats.accepted,
        dropped: stats.dropped,
        held: stats.held,
        breaks: stats.breaks,
        reasons: Object.assign({}, stats.reasons),
        breakReasons: Object.assign({}, stats.breakReasons),
        pending: !!pending,
      };
    }

    function begin(sample) { return beginDetailed(sample).samples; }
    function push(sample) { return pushDetailed(sample).samples; }
    function finish(options) { return finishDetailed(options).samples; }

    return {
      begin, push, finish,
      beginDetailed, pushDetailed, finishDetailed,
      snapshot,
      config: Object.freeze(Object.assign({}, config)),
    };
  }

  Object.assign(ns, { createSampleValidator });
  if (typeof module !== 'undefined' && module.exports) module.exports = { createSampleValidator };
})(typeof globalThis !== 'undefined' ? globalThis : this);
