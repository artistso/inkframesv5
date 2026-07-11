// InkFrame — brush-engine math helpers
// -----------------------------------------------------------------------------
// Pure math used by the paint engine. No DOM or canvas dependencies are required
// for the exported helpers, so they remain unit-testable in Node. In a browser,
// this module also installs a narrow S Pen input guard before the paint engine
// starts listening for pointer events.
'use strict';

// ============================================================================
// Paper grain -- a value-noise field the dry-media brushes (pencil / marker)
// bite into. Tiled at GW=256 so repeat passes reveal the same tooth (like
// graphite catching on paper fibres).
// ============================================================================

/** Default grain field size in pixels; tiled. */
const GRAIN_SIZE = 256;

/**
 * Build a fresh grain field. Returns a Float32Array of length `size*size`
 * with values in [0, 1]. Blur-soft clumps + fine raw fibre mixed 60/40.
 *
 * @param {number} [size]  side length in px (default 256)
 * @param {() => number} [rand]  RNG (default Math.random); accept an override
 *                                so tests get deterministic output.
 * @returns {Float32Array}
 */
function buildGrain(size, rand) {
  const N = size || GRAIN_SIZE;
  const r = rand || Math.random;
  const raw = new Float32Array(N * N);
  for (let i = 0; i < raw.length; i++) raw[i] = r();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // 3x3 box blur, wrapped
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          s += raw[(((y + dy) + N) % N) * N + (((x + dx) + N) % N)];
      out[y * N + x] = (s / 9) * 0.6 + raw[y * N + x] * 0.4;
    }
  }
  return out;
}

/**
 * Sample the tiled grain field at canvas-space (x, y). Returns [0, 1].
 * @param {Float32Array} grain
 * @param {number} x
 * @param {number} y
 * @param {number} [size]
 * @returns {number}
 */
function sampleGrain(grain, x, y, size) {
  const N = size || GRAIN_SIZE;
  const ix = (((x | 0) % N) + N) % N;
  const iy = (((y | 0) % N) + N) % N;
  return grain[iy * N + ix];
}

// ============================================================================
// Angle + colour utilities
// ============================================================================

/**
 * Shortest-path angle ease (handles the -PI..PI wrap so a swivelling nib never
 * spins the long way round). k in [0, 1]; typical values 0.15..0.35.
 * @param {number} cur   current angle in radians
 * @param {number} tgt   target angle in radians
 * @param {number} k     lerp amount
 * @returns {number}     eased angle in radians
 */
function easeAngle(cur, tgt, k) {
  const tau = 2 * Math.PI;
  // JavaScript's % is a signed remainder, not a mathematical modulo. Normalize
  // twice so crossing -PI/PI always chooses the short rotation direction.
  const dA = ((((tgt - cur + Math.PI) % tau) + tau) % tau) - Math.PI;
  return cur + dA * k;
}

/**
 * Convert a #rrggbb hex color + alpha into a CSS `rgba(r,g,b,a)` string.
 * @param {string} hex  '#RRGGBB'
 * @param {number} a    alpha 0..1
 * @returns {string}
 */
function hexWithAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ============================================================================
// Catmull-Rom (centripetal, alpha 0.5) point sampler.
// Feeds the smooth stroke path -- pushSample() in index.html accumulates a
// rolling 4-sample window and this function paints the segment between p1
// and p2 as a curve rather than a straight line.
// ============================================================================

const KNOT_EPSILON = 1e-4;

/** Return a centripetal knot interval. */
function knotInterval(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.max(KNOT_EPSILON, Math.pow(dx * dx + dy * dy, 0.25));
}

/** Linear interpolation evaluated on an arbitrary knot interval. */
function interpolateAt(a, b, ta, tb, u) {
  const span = tb - ta;
  if (Math.abs(span) < KNOT_EPSILON) return [a[0], a[1]];
  const wa = (tb - u) / span;
  const wb = (u - ta) / span;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
}

/**
 * Evaluate the Catmull-Rom segment through (p1, p2) using true centripetal
 * parameterization. Unlike the old uniform polynomial basis, this respects
 * the physical distance between stylus samples, preventing loops, hooks, and
 * corner overshoot when Android delivers events at uneven spacing.
 */
function catmullRom(t, p0, p1, p2, p3) {
  const clampedT = Math.max(0, Math.min(1, t));
  const t0 = 0;
  const t1 = t0 + knotInterval(p0, p1);
  const t2 = t1 + knotInterval(p1, p2);
  const t3 = t2 + knotInterval(p2, p3);
  const u = t1 + (t2 - t1) * clampedT;

  // Barry-Goldman evaluation of the non-uniform Catmull-Rom spline.
  const a1 = interpolateAt(p0, p1, t0, t1, u);
  const a2 = interpolateAt(p1, p2, t1, t2, u);
  const a3 = interpolateAt(p2, p3, t2, t3, u);
  const b1 = interpolateAt(a1, a2, t0, t2, u);
  const b2 = interpolateAt(a2, a3, t1, t3, u);
  return interpolateAt(b1, b2, t1, t2, u);
}

// ============================================================================
// S Pen sample guard
// ============================================================================
// Some Android WebView / S Pen combinations occasionally emit one coordinate
// hundreds of pixels away and then immediately return to the real stroke. The
// paint engine correctly interpolates what it receives, so that single corrupt
// point becomes the long triangular spike seen in tablet field tests.
//
// The guard operates before smoothing and spline interpolation:
//   * hard teleports in top-level pointermove events are swallowed;
//   * coalesced samples use one-sample quarantine, so a large jump is accepted
//     when the following sample confirms continued motion, but discarded when
//     the next sample returns to the previous path;
//   * the pointerdown sample is prepended to the first batch, resetting the
//     engine's raw-direction history between strokes without changing index.html.
//
// It is deliberately pen+canvas only. Mouse, touch, UI controls, and selection
// gestures retain their native event stream.
{
  const GUARD_MIN_JUMP = 72;
  const GUARD_RETURN_RATIO = 0.30;
  const GUARD_ARM_RATIO = 3.0;
  const GUARD_HARD_JUMP = 180;
  const GUARD_STEP_MULTIPLIER = 9;
  const GUARD_MAX_DT = 34;

  const pointOf = (event) => ({
    x: Number(event && event.clientX),
    y: Number(event && event.clientY),
    t: Number(event && event.timeStamp),
    event,
  });

  const finitePoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const sampleTime = (p, fallback) => Number.isFinite(p.t) ? p.t : fallback;

  function isPaintPenEvent(event) {
    if (!event || event.pointerType !== 'pen') return false;
    const target = event.target;
    return !!target && (target.id === 'c' || String(target.tagName || '').toUpperCase() === 'CANVAS');
  }

  function isIsolatedPointerSpike(a, b, c, recentStep) {
    if (!finitePoint(a) || !finitePoint(b) || !finitePoint(c)) return false;
    const ab = distance(a, b);
    const bc = distance(b, c);
    const ac = distance(a, c);
    const arm = Math.min(ab, bc);
    const dynamicMin = Math.max(GUARD_MIN_JUMP, (recentStep || 0) * GUARD_STEP_MULTIPLIER);
    if (arm < dynamicMin) return false;
    if (Math.max(ab, bc) > arm * GUARD_ARM_RATIO) return false;
    return ac <= Math.max(12, arm * GUARD_RETURN_RATIO);
  }

  function filterPointerSamples(state, events) {
    const accepted = [];
    const incoming = [];
    if (state.pending) incoming.push(state.pending);
    for (const event of events || []) incoming.push(pointOf(event));
    state.pending = null;

    for (let i = 0; i < incoming.length; i++) {
      const cur = incoming[i];
      if (!finitePoint(cur)) {
        state.dropped = (state.dropped || 0) + 1;
        continue;
      }
      const prev = state.last;
      const next = incoming[i + 1];

      if (prev && next && isIsolatedPointerSpike(prev, cur, next, state.recentStep)) {
        state.dropped = (state.dropped || 0) + 1;
        continue;
      }

      if (prev && i === incoming.length - 1) {
        const jump = distance(prev, cur);
        const threshold = Math.max(GUARD_MIN_JUMP, (state.recentStep || 0) * GUARD_STEP_MULTIPLIER);
        const dt = Math.max(0, sampleTime(cur, 0) - sampleTime(prev, 0));
        if (jump >= threshold && (!dt || dt <= GUARD_MAX_DT)) {
          state.pending = cur;
          continue;
        }
      }

      if (prev) {
        const step = distance(prev, cur);
        state.recentStep = state.recentStep
          ? state.recentStep * 0.78 + step * 0.22
          : step;
      }
      state.last = cur;
      accepted.push(cur.event);
    }
    return accepted;
  }

  function isHardPointerJump(state, event) {
    const cur = pointOf(event);
    const prev = state && state.outerLast;
    if (!finitePoint(cur) || !finitePoint(prev)) return false;
    const jump = distance(prev, cur);
    const dynamic = Math.max(GUARD_HARD_JUMP, (state.outerStep || 0) * GUARD_STEP_MULTIPLIER);
    const dt = Math.max(0, sampleTime(cur, 0) - sampleTime(prev, 0));
    return jump >= dynamic && (!dt || dt <= GUARD_MAX_DT);
  }

  function installPointerSampleGuard(root) {
    const PointerEventCtor = root && root.PointerEvent;
    if (!PointerEventCtor || !PointerEventCtor.prototype) return false;
    const proto = PointerEventCtor.prototype;
    const original = proto.getCoalescedEvents;
    if (typeof original === 'function' && original.__inkframeGuard) return false;

    const states = new Map();
    const stats = { dropped: 0 };
    const stateFor = (event) => {
      const id = event.pointerId == null ? -1 : event.pointerId;
      let state = states.get(id);
      if (!state) {
        state = { last: null, pending: null, recentStep: 0, outerLast: null, outerStep: 0, firstMove: true, downEvent: null, dropped: 0 };
        states.set(id, state);
      }
      return state;
    };

    root.addEventListener('pointerdown', (event) => {
      if (!isPaintPenEvent(event)) return;
      const p = pointOf(event);
      states.set(event.pointerId, {
        last: p,
        pending: null,
        recentStep: 0,
        outerLast: p,
        outerStep: 0,
        firstMove: true,
        downEvent: event,
        dropped: 0,
      });
    }, true);

    root.addEventListener('pointermove', (event) => {
      if (!isPaintPenEvent(event)) return;
      const state = stateFor(event);
      if (isHardPointerJump(state, event)) {
        state.dropped++;
        stats.dropped++;
        root.__inkframeStylusDrops = stats.dropped;
        event.stopImmediatePropagation();
        return;
      }
      const cur = pointOf(event);
      if (finitePoint(state.outerLast)) {
        const step = distance(state.outerLast, cur);
        state.outerStep = state.outerStep ? state.outerStep * 0.78 + step * 0.22 : step;
      }
      state.outerLast = cur;
    }, true);

    const wrapped = function getInkFrameCoalescedEvents() {
      const raw = typeof original === 'function' ? (original.call(this) || []) : [this];
      if (!isPaintPenEvent(this)) return raw;
      const state = stateFor(this);
      const list = Array.from(raw);
      const tail = list.length ? pointOf(list[list.length - 1]) : null;
      const owner = pointOf(this);
      if (!tail || distance(tail, owner) > 0.01) list.push(this);

      if (state.firstMove && state.downEvent) {
        const head = list.length ? pointOf(list[0]) : null;
        if (!head || distance(pointOf(state.downEvent), head) > 0.01) list.unshift(state.downEvent);
        state.firstMove = false;
      }

      const before = state.dropped || 0;
      const filtered = filterPointerSamples(state, list);
      stats.dropped += (state.dropped || 0) - before;
      root.__inkframeStylusDrops = stats.dropped;
      return filtered;
    };
    wrapped.__inkframeGuard = true;

    if (typeof original === 'function') {
      try {
        Object.defineProperty(proto, 'getCoalescedEvents', {
          configurable: true,
          writable: true,
          value: wrapped,
        });
      } catch (_) {
        try { proto.getCoalescedEvents = wrapped; } catch (_) { }
      }
    }

    const cleanup = (event) => {
      if (event && event.pointerId != null) states.delete(event.pointerId);
    };
    root.addEventListener('pointerup', cleanup, true);
    root.addEventListener('pointercancel', cleanup, true);
    root.InkFrameStylusGuard = {
      stats: () => ({ dropped: stats.dropped }),
      reset: () => { stats.dropped = 0; root.__inkframeStylusDrops = 0; },
    };
    return true;
  }

  const _api = {
    GRAIN_SIZE,
    buildGrain,
    sampleGrain,
    easeAngle,
    hexWithAlpha,
    catmullRom,
    isIsolatedPointerSpike,
    filterPointerSamples,
    isHardPointerJump,
    installPointerSampleGuard,
  };
  if (typeof window !== 'undefined') {
    window.InkFrameBrushMath = _api;
    installPointerSampleGuard(window);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = _api;
}
