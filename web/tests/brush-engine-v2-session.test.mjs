// InkFrame Brush Engine V2 — live session continuity regression tests
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const source = readFileSync(resolve(root, 'brush-engine-v2/session.js'), 'utf8');

function makeTarget() {
  const listeners = new Map();
  return {
    hidden: false,
    addEventListener(type, listener) {
      const list = listeners.get(type) || [];
      list.push(listener);
      listeners.set(type, list);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
  };
}

function pen(pointerId, x, y, timeStamp, extra = {}) {
  return Object.assign({
    pointerId,
    pointerType: 'pen',
    clientX: x,
    clientY: y,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    width: 1,
    height: 1,
    altitudeAngle: Math.PI / 2,
    azimuthAngle: 0,
    buttons: 1,
    button: -1,
    timeStamp,
    type: 'pointermove',
    preventDefault() {},
  }, extra);
}

function makeHarness() {
  const document = makeTarget();
  const windowTarget = makeTarget();
  const calls = [];
  let active = false;
  const adapter = {
    begin(event) {
      calls.push({ kind: 'begin', event });
      active = true;
      return true;
    },
    move(event) {
      calls.push({ kind: 'move', event });
      return active;
    },
    end(event) {
      if (!active) return false;
      calls.push({ kind: 'end', event });
      active = false;
      return true;
    },
    isActive: () => active,
  };
  const sandbox = {
    console,
    Date,
    Math,
    Number,
    Object,
    module: { exports: {} },
    exports: {},
    document,
    InkFrameBrushV2Adapter: adapter,
    performance: { now: () => 999 },
    addEventListener: windowTarget.addEventListener.bind(windowTarget),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'session.js' });
  return { adapter, calls, document, windowTarget };
}

// A second physical pen-down after a missed pointerup must close the stale stroke
// at its last known coordinate and then start a clean stroke at the new coordinate.
{
  const h = makeHarness();
  h.adapter.begin(pen(7, 40, 50, 0, { type:'pointerdown' }), {});
  h.adapter.move(pen(7, 80, 90, 8));
  h.adapter.begin(pen(7, 700, 500, 100, { type:'pointerdown' }), {});

  assert.equal(h.calls.length, 4);
  assert.equal(h.calls[0].kind, 'begin');
  assert.equal(h.calls[1].kind, 'move');
  assert.equal(h.calls[2].kind, 'end');
  assert.equal(h.calls[3].kind, 'begin');
  assert.equal(h.calls[2].event.type, 'implicit-pointerdown');
  assert.equal(h.calls[2].event.clientX, 80, 'stale stroke must end at its last move, not the new down point');
  assert.equal(h.calls[2].event.clientY, 90);
  assert.equal(h.calls[3].event.clientX, 700);
  assert.equal(h.adapter.sessionStats().restartedOnPointerDown, 1);
  assert.equal(h.adapter.isActive(), true);
}

// A normal end clears remembered coordinates and does not create an implicit end
// before the following stroke.
{
  const h = makeHarness();
  h.adapter.begin(pen(2, 10, 10, 0, { type:'pointerdown' }), {});
  h.adapter.move(pen(2, 20, 20, 8));
  h.adapter.end(pen(2, 22, 22, 12, { type:'pointerup', pressure:0, buttons:0 }));
  h.adapter.begin(pen(2, 300, 300, 20, { type:'pointerdown' }), {});
  assert.equal(h.calls.filter(call => call.kind === 'end').length, 1);
  assert.equal(h.adapter.sessionStats().restartedOnPointerDown, 0);
}

// Lost pointer capture closes only the owning stylus session.
{
  const h = makeHarness();
  h.adapter.begin(pen(4, 30, 30, 0, { type:'pointerdown' }), {});
  h.adapter.move(pen(4, 42, 45, 8));
  h.document.dispatch('lostpointercapture', { pointerId:99 });
  assert.equal(h.adapter.isActive(), true);
  h.document.dispatch('lostpointercapture', { pointerId:4 });
  assert.equal(h.adapter.isActive(), false);
  const end = h.calls.find(call => call.kind === 'end');
  assert.equal(end.event.type, 'lostpointercapture');
  assert.equal(end.event.clientX, 42);
  assert.equal(h.adapter.sessionStats().lostCaptureEnds, 1);
}

// App lifecycle interruption cannot leave a stroke armed for the next contact.
{
  const h = makeHarness();
  h.adapter.begin(pen(5, 60, 70, 0, { type:'pointerdown' }), {});
  h.windowTarget.dispatch('blur');
  assert.equal(h.adapter.isActive(), false);
  assert.equal(h.adapter.sessionStats().blurEnds, 1);

  h.adapter.begin(pen(5, 90, 100, 20, { type:'pointerdown' }), {});
  h.document.hidden = true;
  h.document.dispatch('visibilitychange');
  assert.equal(h.adapter.isActive(), false);
  assert.equal(h.adapter.sessionStats().hiddenEnds, 1);
}

// Lifecycle termination must resolve the current adapter.end implementation so
// wrappers installed later can flush queued input and finalize their own state.
{
  const h = makeHarness();
  const sessionEnd = h.adapter.end;
  let downstreamEnds = 0;
  h.adapter.end = function(event) {
    downstreamEnds++;
    return sessionEnd.call(h.adapter, event);
  };

  h.adapter.begin(pen(6, 15, 25, 0, { type:'pointerdown' }), {});
  h.adapter.move(pen(6, 35, 45, 8));
  h.windowTarget.dispatch('blur');

  assert.equal(downstreamEnds, 1, 'blur must pass through wrappers installed after session continuity');
  assert.equal(h.adapter.isActive(), false);
  assert.equal(h.calls.at(-1).kind, 'end');
  assert.equal(h.calls.at(-1).event.type, 'window-blur');
}

console.log('✅ Brush Engine V2 session continuity tests passed');
