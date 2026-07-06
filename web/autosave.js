// InkFrame — IndexedDB autosave module
// -----------------------------------------------------------------------------
// Extracted from index.html so the app can grow toward a proper module layout
// (and, eventually, a TypeScript migration) without turning every file change
// into a merge nightmare.
//
// This file has ZERO globals of its own. It exports a `createAutosave(env)`
// factory that closes over an environment object supplied by the app. That
// keeps the module framework-free and unit-testable (see /tmp/autosave_test).
//
// Environment contract (all required):
//   env.getProjects()        -> array of live project objects
//   env.getActive()          -> { pi, cur, fps, W, H } snapshot of scalars
//   env.setActive({pi,W,H})  -> app is expected to make this project current
//                               (typically calls useProject(pi) + resizes the
//                               <canvas> element to W×H)
//   env.replaceProjects(list) -> splice-in helper; must preserve object identity
//                               of the outer `projects` array so any live
//                               aliases in the app keep working
//   env.newLayer(w,h,name)   -> factory matching the app's layer shape
//   env.newFrame(w,h)        -> factory matching the app's frame shape
//   env.upgradeFrame(v,w,h)  -> lift a legacy raw canvas into a layered frame
//   env.nextLayerId()        -> monotonically-increasing layer id source
//   env.W0, env.H0           -> fallback dimensions when a payload omits them
//
// Public surface returned by createAutosave():
//   { schedule(), flushNow(), restore(payload), loadPayload(), clear(),
//     status() -> {lastSavedAt, savingNow, lastError} }
//
// Payload versions:
//   v1  {v:1, frames:[Blob]}                 -- pre-layers (before 2026-07)
//   v2  {v:2, frames:[{active,layers:[...]}]} -- current layered shape
// Both restore cleanly; v1 frames upgrade to single-layer frames on load.
'use strict';

/**
 * @typedef {Object} AutosaveEnv
 * @property {() => any[]} getProjects
 * @property {() => {pi:number, cur:number, fps:number, W:number, H:number}} getActive
 * @property {(a:{pi:number, W:number, H:number}) => void} setActive
 * @property {(list:any[]) => void} replaceProjects
 * @property {(w:number, h:number, name?:string) => any} newLayer
 * @property {(w:number, h:number) => any} newFrame
 * @property {(v:any, w:number, h:number) => any} upgradeFrame
 * @property {() => number} nextLayerId
 * @property {number} W0
 * @property {number} H0
 */

/**
 * Build an autosave instance bound to the given app environment.
 * @param {AutosaveEnv} env
 */
function createAutosave(env) {
  const DB_NAME = 'inkframe';
  const DB_VER  = 1;
  const STORE   = 'sessions';
  const KEY     = 'current';
  const SAVE_DELAY_MS = 800;

  // ---- IDB helpers (hand-rolled to avoid a `idb` dep) ---------------------
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) { reject(new Error('no idb')); return; }
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }
  async function idbPut(value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); reject(tx.error); };
    });
  }
  async function idbGet() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(KEY);
      rq.onsuccess = () => { db.close(); resolve(rq.result || null); };
      rq.onerror   = () => { db.close(); reject(rq.error); };
    });
  }
  async function idbDel() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); reject(tx.error); };
    });
  }

  // ---- Canvas <-> Blob helpers -------------------------------------------
  // PNG blobs are structured-cloneable and ~4x smaller than raw ImageData
  // (no alpha padding), and Canvas 2D can decode them right back into a
  // fresh <canvas> on restore.
  function frameToBlob(cnv) {
    return new Promise(res => {
      if (cnv && cnv.toBlob) cnv.toBlob(b => res(b), 'image/png');
      else {
        const url = cnv.toDataURL('image/png');
        fetch(url).then(r => r.blob()).then(res).catch(() => res(null));
      }
    });
  }
  function blobToCanvas(blob, w, h) {
    return new Promise(res => {
      if (!blob) { const c = document.createElement('canvas'); c.width = w; c.height = h; res(c); return; }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload  = () => { const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(url); res(c); };
      img.onerror = () => { URL.revokeObjectURL(url); const c = document.createElement('canvas');
        c.width = w; c.height = h; res(c); };
      img.src = url;
    });
  }

  // ---- Serialize ----------------------------------------------------------
  async function serialize() {
    const projects = env.getProjects();
    const a = env.getActive();
    // stamp scalar state onto the currently-active project so restore matches
    const p = projects[a.pi]; if (p) { p.cur = a.cur; p.fps = a.fps; p.w = a.W; p.h = a.H; }
    return {
      v: 2, savedAt: Date.now(), pi: a.pi,
      projects: await Promise.all(projects.map(async P => ({
        name: P.name || 'Canvas', w: P.w, h: P.h, cur: P.cur || 0, fps: P.fps || 12,
        paper: P.paper || '#fff0f3',
        holds: (P.holds || P.frames.map(() => 1)).slice(),
        frames: await Promise.all(P.frames.map(async fr => {
          const F = env.upgradeFrame(fr, P.w, P.h);
          return {
            active: F.active | 0,
            layers: await Promise.all(F.layers.map(async L => ({
              name: L.name, visible: !!L.visible, opacity: +L.opacity,
              blend: L.blend || 'source-over',
              blob: await frameToBlob(L.canvas),
            }))),
          };
        })),
      }))),
    };
  }

  // ---- Restore ------------------------------------------------------------
  async function restore(payload) {
    if (!payload || !payload.projects || !payload.projects.length) return false;
    const restored = [];
    for (const P of payload.projects) {
      const w = P.w || env.W0, h = P.h || env.H0;
      const fr = [];
      for (const item of P.frames) {
        if (item && Array.isArray(item.layers)) {
          // v2 shape
          const layers = await Promise.all(item.layers.map(async sL => ({
            id: env.nextLayerId(),
            name: sL.name || 'Layer',
            visible: sL.visible !== false,
            opacity: typeof sL.opacity === 'number' ? sL.opacity : 1,
            blend: sL.blend || 'source-over',
            canvas: await blobToCanvas(sL.blob, w, h),
          })));
          if (!layers.length) layers.push(env.newLayer(w, h, 'Layer 1'));
          fr.push({ layers, active: Math.min(item.active | 0, layers.length - 1),
                    _comp: null, _compV: -1, _v: 0 });
        } else {
          // v1 shape: item is a raw PNG Blob
          const canvas = await blobToCanvas(item, w, h);
          fr.push({ layers: [{ id: env.nextLayerId(), name: 'Layer 1',
                               visible: true, opacity: 1,
                               blend: 'source-over', canvas }],
                    active: 0, _comp: null, _compV: -1, _v: 0 });
        }
      }
      restored.push({
        frames: fr.length ? fr : [env.newFrame(w, h)],
        holds: (P.holds && P.holds.length === fr.length) ? P.holds.slice() : fr.map(() => 1),
        cur: Math.min(Math.max(0, P.cur | 0), Math.max(0, fr.length - 1)),
        undo: [], redo: [],
        w, h, fps: P.fps || 12, name: P.name || 'Canvas',
        paper: P.paper || '#fff0f3',
      });
    }
    env.replaceProjects(restored);
    const targetPi = Math.min(Math.max(0, payload.pi | 0), restored.length - 1);
    const target = restored[targetPi];
    env.setActive({ pi: targetPi, W: target.w, H: target.h });
    return true;
  }

  // ---- Debounced flush + visibility hooks ---------------------------------
  let scheduled = 0, savingNow = false, lastSavedAt = 0, lastError = null;
  async function flush() {
    if (savingNow) return false;
    savingNow = true;
    try {
      const payload = await serialize();
      await idbPut(payload);
      lastSavedAt = payload.savedAt; lastError = null;
      return true;
    } catch (e) {
      lastError = e; console.warn('[autosave] failed', e);
      return false;
    } finally {
      savingNow = false;
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = setTimeout(() => { scheduled = 0; flush(); }, SAVE_DELAY_MS);
  }
  function flushNow() {
    if (scheduled) { clearTimeout(scheduled); scheduled = 0; }
    return flush();
  }

  // Hide/unload hooks -- both events for maximum coverage across browsers
  // and the Android WebView (which honours pagehide more reliably than
  // beforeunload).
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushNow();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);
  }

  return {
    schedule, flushNow, restore,
    loadPayload: idbGet,
    clear: idbDel,
    status: () => ({ lastSavedAt, savingNow, lastError }),
  };
}

// UMD-lite: expose on window for the WebView, module.exports for Node tests.
if (typeof window !== 'undefined') {
  window.InkFrameAutosave = { createAutosave };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createAutosave };
}
