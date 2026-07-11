// InkFrame Brush Engine V2 — sample validation and isolated-spike quarantine
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
      hardJumpFraction: 0.45,
      timestampTolerance: 0.25,
    }, options || {});
    const diagonal = Math.hypot(config.width, config.height);
    let last = null;
    let pending = null;
    let recentStep = 0;
    const stats = { accepted: 0, dropped: 0, held: 0, reasons: Object.create(null) };

    const reason = name => {
      stats.dropped++;
      stats.reasons[name] = (stats.reasons[name] || 0) + 1;
    };

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

    function hardJumpLimit() {
      return Math.max(config.minimumJump * 2.5, diagonal * config.hardJumpFraction);
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

    function isolatedSpike(a, b, c) {
      const ab = distance(a, b);
      const bc = distance(b, c);
      const ac = distance(a, c);
      const arm = Math.min(ab, bc);
      if (arm < jumpLimit(a, b)) return false;
      if (Math.max(ab, bc) > arm * 3) return false;
      return ac <= Math.max(12, arm * config.returnRatio);
    }

    function begin(sample) {
      last = null;
      pending = null;
      recentStep = 0;
      stats.accepted = 0;
      stats.dropped = 0;
      stats.held = 0;
      stats.reasons = Object.create(null);
      const output = [];
      const failure = basicCheck(sample, null);
      if (failure) reason(failure); else commit(sample, output);
      return output;
    }

    function push(sample) {
      const output = [];
      const failure = basicCheck(sample, pending || last);
      if (failure) {
        reason(failure);
        return output;
      }
      if (!last) {
        commit(sample, output);
        return output;
      }

      if (pending) {
        const held = pending;
        pending = null;
        if (isolatedSpike(last, held, sample)) {
          reason('isolated-spike');
          const followFailure = basicCheck(sample, last);
          if (!followFailure) {
            if (distance(last, sample) > jumpLimit(last, sample)) {
              pending = sample;
              stats.held++;
            } else commit(sample, output);
          }
          return output;
        }

        // The next point continued the motion, so the held point was legitimate.
        commit(held, output);
        if (distance(last, sample) > jumpLimit(last, sample)) {
          if (distance(last, sample) >= hardJumpLimit()) reason('hard-jump');
          else { pending = sample; stats.held++; }
        } else commit(sample, output);
        return output;
      }

      const jump = distance(last, sample);
      if (jump >= hardJumpLimit()) {
        reason('hard-jump');
      } else if (jump > jumpLimit(last, sample)) {
        pending = sample;
        stats.held++;
      } else {
        commit(sample, output);
      }
      return output;
    }

    function finish(options) {
      const output = [];
      const acceptHeld = !!(options && options.acceptHeld);
      if (pending) {
        if (acceptHeld && distance(last, pending) < hardJumpLimit()) commit(pending, output);
        else reason('unconfirmed-terminal-jump');
        pending = null;
      }
      return output;
    }

    function snapshot() {
      return {
        accepted: stats.accepted,
        dropped: stats.dropped,
        held: stats.held,
        reasons: Object.assign({}, stats.reasons),
        pending: !!pending,
      };
    }

    return { begin, push, finish, snapshot, config: Object.freeze(Object.assign({}, config)) };
  }

  Object.assign(ns, { createSampleValidator });
  if (typeof module !== 'undefined' && module.exports) module.exports = { createSampleValidator };
})(typeof globalThis !== 'undefined' ? globalThis : this);
