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
 */
function easeAngle(cur, tgt, k) {
  const tau = 2 * Math.PI;
  const dA = ((((tgt - cur + Math.PI) % tau) + tau) % tau) - Math.PI;
  return cur + dA * k;
}

/**
 * Convert a #rrggbb hex color + alpha into a CSS `rgba(r,g,b,a)` string.
 */
function hexWithAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ============================================================================
// Catmull-Rom (centripetal, alpha 0.5) point sampler.
// ============================================================================

const KNOT_EPSILON = 1e-4;

function knotInterval(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.max(KNOT_EPSILON, Math.pow(dx * dx + dy * dy, 0.25));
}

function interpolateAt(a, b, ta, tb, u) {
  const span = tb - ta;
  if (Math.abs(span) < KNOT_EPSILON) return [a[0], a[1]];
  const wa = (tb - u) / span;
  const wb = (u - ta) / span;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
}

function catmullRom(t, p0, p1, p2, p3) {
  const clampedT = Math.max(0, Math.min(1, t));
  const t0 = 0;
  const t1 = t0 + knotInterval(p0, p1);
  const t2 = t1 + knotInterval(p1, p2);
  const t3 = t2 + knotInterval(p2, p3);
  const u = t1 + (t2 - t1) * clampedT;

  const a1 = interpolateAt(p0, p1, t0, t1, u);
  const a2 = interpolateAt(p1, p2, t1, t2, u);
  const a3 = interpolateAt(p2, p3, t2, t3, u);
  const b1 = interpolateAt(a1, a2, t0, t2, u);
  const b2 = interpolateAt(a2, a3, t1, t3, u);
  return interpolateAt(b1, b2, t1, t2, u);
}

// ============================================================================
// S Pen sample guard + cadence normalization
// ============================================================================
// Android WebView can produce two independent stroke-quality problems:
//
// 1. A single corrupt coordinate jumps hundreds of pixels away and immediately
//    returns, producing a long triangular spike.
// 2. Pointer sampling varies significantly by device. Fixed per-sample easing
//    then gives pressure, nib inertia, tilt, and StreamLine a different effective
//    time constant at 60 Hz, 120 Hz, and 240 Hz.
//
// The pre-engine filter removes isolated teleports and resamples valid pen input
// onto an 8 ms cadence (~125 Hz). Slow devices receive interpolated samples;
// high-rate devices are decimated. Existing paint math therefore sees a stable
// update interval without changing index.html or adding frame latency.
{
  const GUARD_MIN_JUMP = 72;
  const GUARD_RETURN_RATIO = 0.30;
  const GUARD_ARM_RATIO = 3.0;
  const GUARD_HARD_JUMP = 180;
  const GUARD_STEP_MULTIPLIER = 9;
  const GUARD_MAX_DT = 34;

  const RESAMPLE_INTERVAL_MS = 8;
  const RESAMPLE_RESET_GAP_MS = 64;
  const RESAMPLE_MAX_OUTPUT = 12;

  const pointOf = (event) => ({
    x: Number(event && event.clientX),
    y: Number(event && event.clientY),
    t: Number(event && event.timeStamp),
    event,
  });

  const finitePoint = (p) => !!p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y);

  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const sampleTime = (p, fallback) => Number.isFinite(p.t) ? p.t : fallback;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function isPaintPenEvent(event) {
    if (!event || event.pointerType !== 'pen') return false;
    const target = event.target;
    return !!target &&
      (target.id === 'c' || String(target.tagName || '').toUpperCase() === 'CANVAS');
  }

  function isIsolatedPointerSpike(a, b, c, recentStep) {
    if (!finitePoint(a) || !finitePoint(b) || !finitePoint(c)) return false;
    const ab = distance(a, b);
    const bc = distance(b, c);
    const ac = distance(a, c);
    const arm = Math.min(ab, bc);
    const dynamicMin = Math.max(
      GUARD_MIN_JUMP,
      (recentStep || 0) * GUARD_STEP_MULTIPLIER,
    );
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

      if (prev && next &&
          isIsolatedPointerSpike(prev, cur, next, state.recentStep)) {
        state.dropped = (state.dropped || 0) + 1;
        continue;
      }

      if (prev && i === incoming.length - 1) {
        const jump = distance(prev, cur);
        const threshold = Math.max(
          GUARD_MIN_JUMP,
          (state.recentStep || 0) * GUARD_STEP_MULTIPLIER,
        );
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

  function numeric(event, key, fallback) {
    const value = Number(event && event[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpAngle(a, b, t) {
    const tau = Math.PI * 2;
    const delta = ((((b - a + Math.PI) % tau) + tau) % tau) - Math.PI;
    return a + delta * t;
  }

  function interpolatePointerSample(a, b, ratio, timestamp) {
    const t = clamp01(ratio);
    const out = {
      clientX: lerp(numeric(a, 'clientX', 0), numeric(b, 'clientX', 0), t),
      clientY: lerp(numeric(a, 'clientY', 0), numeric(b, 'clientY', 0), t),
      pressure: clamp01(lerp(
        numeric(a, 'pressure', 0.5),
        numeric(b, 'pressure', 0.5),
        t,
      )),
      tangentialPressure: lerp(
        numeric(a, 'tangentialPressure', 0),
        numeric(b, 'tangentialPressure', 0),
        t,
      ),
      tiltX: lerp(numeric(a, 'tiltX', 0), numeric(b, 'tiltX', 0), t),
      tiltY: lerp(numeric(a, 'tiltY', 0), numeric(b, 'tiltY', 0), t),
      twist: lerp(numeric(a, 'twist', 0), numeric(b, 'twist', 0), t),
      width: lerp(numeric(a, 'width', 1), numeric(b, 'width', 1), t),
      height: lerp(numeric(a, 'height', 1), numeric(b, 'height', 1), t),
      timeStamp: timestamp,
      pointerType: b.pointerType || a.pointerType || 'pen',
      pointerId: b.pointerId != null ? b.pointerId : a.pointerId,
      isPrimary: b.isPrimary != null ? b.isPrimary : a.isPrimary,
      buttons: b.buttons != null ? b.buttons : a.buttons,
      button: b.button != null ? b.button : a.button,
      target: b.target || a.target,
      type: b.type || a.type || 'pointermove',
    };

    const altA = numeric(a, 'altitudeAngle', NaN);
    const altB = numeric(b, 'altitudeAngle', NaN);
    if (Number.isFinite(altA) || Number.isFinite(altB)) {
      out.altitudeAngle = lerp(
        Number.isFinite(altA) ? altA : altB,
        Number.isFinite(altB) ? altB : altA,
        t,
      );
    }

    const aziA = numeric(a, 'azimuthAngle', NaN);
    const aziB = numeric(b, 'azimuthAngle', NaN);
    if (Number.isFinite(aziA) || Number.isFinite(aziB)) {
      out.azimuthAngle = lerpAngle(
        Number.isFinite(aziA) ? aziA : aziB,
        Number.isFinite(aziB) ? aziB : aziA,
        t,
      );
    }
    return out;
  }

  /**
   * Resample accepted pointer events onto a stable time grid.
   *
   * The first event is emitted immediately. Subsequent output is spaced at
   * intervalMs. A long pause resets the grid rather than manufacturing many
   * synthetic samples through a stationary dwell.
   */
  function resamplePointerSamples(state, events, intervalMs) {
    const interval = Math.max(2, Number(intervalMs) || RESAMPLE_INTERVAL_MS);
    const output = [];

    for (const event of events || []) {
      const cur = pointOf(event);
      if (!finitePoint(cur)) continue;

      if (!state.resampleInput ||
          !Number.isFinite(state.resampleNextT)) {
        state.resampleInput = cur;
        state.resampleNextT = sampleTime(cur, 0) + interval;
        output.push(event);
        continue;
      }

      const prev = state.resampleInput;
      const prevT = sampleTime(prev, 0);
      const curT = sampleTime(cur, prevT);
      const dt = curT - prevT;

      if (!(dt > 0) || dt > RESAMPLE_RESET_GAP_MS) {
        state.resampleInput = cur;
        state.resampleNextT = curT + interval;
        output.push(event);
        continue;
      }

      let generated = 0;
      while (state.resampleNextT <= curT + 1e-6 &&
             generated < RESAMPLE_MAX_OUTPUT) {
        const ratio = (state.resampleNextT - prevT) / dt;
        output.push(interpolatePointerSample(
          prev.event,
          event,
          ratio,
          state.resampleNextT,
        ));
        state.resampleNextT += interval;
        generated++;
      }

      if (generated >= RESAMPLE_MAX_OUTPUT &&
          state.resampleNextT <= curT) {
        state.resampleNextT = curT + interval;
        output.push(event);
      }
      state.resampleInput = cur;
    }
    return output;
  }

  function isHardPointerJump(state, event) {
    const cur = pointOf(event);
    const prev = state && state.outerLast;
    if (!finitePoint(cur) || !finitePoint(prev)) return false;
    const jump = distance(prev, cur);
    const dynamic = Math.max(
      GUARD_HARD_JUMP,
      (state.outerStep || 0) * GUARD_STEP_MULTIPLIER,
    );
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
    const stats = { dropped: 0, emitted: 0 };
    const stateFor = (event) => {
      const id = event.pointerId == null ? -1 : event.pointerId;
      let state = states.get(id);
      if (!state) {
        state = {
          last: null,
          pending: null,
          recentStep: 0,
          outerLast: null,
          outerStep: 0,
          firstMove: true,
          downEvent: null,
          dropped: 0,
          resampleInput: null,
          resampleNextT: NaN,
        };
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
        resampleInput: null,
        resampleNextT: NaN,
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
        state.outerStep = state.outerStep
          ? state.outerStep * 0.78 + step * 0.22
          : step;
      }
      state.outerLast = cur;
    }, true);

    const wrapped = function getInkFrameCoalescedEvents() {
      const raw = typeof original === 'function'
        ? (original.call(this) || [])
        : [this];
      if (!isPaintPenEvent(this)) return raw;

      const state = stateFor(this);
      const list = Array.from(raw);
      const tail = list.length ? pointOf(list[list.length - 1]) : null;
      const owner = pointOf(this);
      if (!tail || distance(tail, owner) > 0.01) list.push(this);

      if (state.firstMove && state.downEvent) {
        const head = list.length ? pointOf(list[0]) : null;
        if (!head || distance(pointOf(state.downEvent), head) > 0.01) {
          list.unshift(state.downEvent);
        }
        state.firstMove = false;
      }

      const before = state.dropped || 0;
      const filtered = filterPointerSamples(state, list);
      const normalized = resamplePointerSamples(
        state,
        filtered,
        RESAMPLE_INTERVAL_MS,
      );
      stats.dropped += (state.dropped || 0) - before;
      stats.emitted += normalized.length;
      root.__inkframeStylusDrops = stats.dropped;
      root.__inkframeStylusSamples = stats.emitted;
      return normalized;
    };
    wrapped.__inkframeGuard = true;

    try {
      Object.defineProperty(proto, 'getCoalescedEvents', {
        configurable: true,
        writable: true,
        value: wrapped,
      });
    } catch (_) {
      try { proto.getCoalescedEvents = wrapped; } catch (_) { }
    }

    const cleanup = (event) => {
      if (event && event.pointerId != null) states.delete(event.pointerId);
    };
    root.addEventListener('pointerup', cleanup, true);
    root.addEventListener('pointercancel', cleanup, true);
    root.InkFrameStylusGuard = {
      stats: () => ({
        dropped: stats.dropped,
        emitted: stats.emitted,
        intervalMs: RESAMPLE_INTERVAL_MS,
      }),
      reset: () => {
        stats.dropped = 0;
        stats.emitted = 0;
        root.__inkframeStylusDrops = 0;
        root.__inkframeStylusSamples = 0;
      },
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
    interpolatePointerSample,
    resamplePointerSamples,
    isHardPointerJump,
    installPointerSampleGuard,
  };

  if (typeof window !== 'undefined') {
    window.InkFrameBrushMath = _api;
    installPointerSampleGuard(window);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = _api;
}
