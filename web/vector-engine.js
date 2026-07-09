// InkFrame — Vector Path Engine Core
// -----------------------------------------------------------------------------
// Portable vector geometry primitives for editable strokes and future SVG/native
// rendering. Mirrors the Kotlin VectorEngine shape: points, cubic Béziers,
// simplification, Catmull-Rom conversion, snapping, symmetry, outlines, bounds.
'use strict';

(function installInkFrameVectorEngine(root){
  const VERSION = 'v0.1.0-vector-path-core';
  const EPSILON = 1e-5;
  const clamp = (min, value, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const finite = value => Number.isFinite(Number(value));

  function vec(x, y){ return Object.freeze({ x: Number(x) || 0, y: Number(y) || 0 }); }
  function add(a, b){ return vec(a.x + b.x, a.y + b.y); }
  function sub(a, b){ return vec(a.x - b.x, a.y - b.y); }
  function mul(a, s){ return vec(a.x * s, a.y * s); }
  function div(a, s){ return vec(a.x / s, a.y / s); }
  function length(a){ return Math.hypot(a.x, a.y); }
  function distance(a, b){ return length(sub(a, b)); }
  function normalized(a){ const len = length(a); return len < EPSILON ? vec(0, 0) : div(a, len); }
  function cross(a, b){ return a.x * b.y - a.y * b.x; }
  function leftNormal(a){ return vec(-a.y, a.x); }
  function lerp(a, b, t){ return add(a, mul(sub(b, a), clamp(0, t, 1))); }
  function mirrorX(p, cx){ return vec(cx * 2 - p.x, p.y); }
  function mirrorY(p, cy){ return vec(p.x, cy * 2 - p.y); }

  function bounds(points){
    if (!points || !points.length) return Object.freeze({ minX:0, minY:0, maxX:0, maxY:0, width:0, height:0, center:vec(0,0) });
    let minX = points[0].x, minY = points[0].y, maxX = points[0].x, maxY = points[0].y;
    points.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
    return Object.freeze({ minX, minY, maxX, maxY, width:maxX-minX, height:maxY-minY, center:vec((minX+maxX)/2, (minY+maxY)/2) });
  }

  function cleanPoints(points){
    const out = [];
    (points || []).forEach(raw => {
      if (!raw || !finite(raw.x) || !finite(raw.y)) return;
      const p = vec(raw.x, raw.y);
      if (!out.length || distance(p, out[out.length - 1]) > 0.05) out.push(p);
    });
    return out;
  }

  function perpendicularDistance(p, a, b){
    const ab = sub(b, a);
    const len = length(ab);
    if (len < EPSILON) return distance(p, a);
    return Math.abs(cross(sub(p, a), ab)) / len;
  }

  function simplify(points, tolerance){
    const pts = cleanPoints(points);
    const tol = Math.max(0, Number(tolerance) || 0);
    if (pts.length <= 2 || tol <= 0) return pts;
    function rdp(slice){
      if (slice.length <= 2) return slice;
      const start = slice[0], end = slice[slice.length - 1];
      let maxDistance = -1, index = -1;
      for (let i = 1; i < slice.length - 1; i++) {
        const d = perpendicularDistance(slice[i], start, end);
        if (d > maxDistance) { maxDistance = d; index = i; }
      }
      if (maxDistance > tol && index > 0) return rdp(slice.slice(0, index + 1)).slice(0, -1).concat(rdp(slice.slice(index)));
      return [start, end];
    }
    return rdp(pts);
  }

  function getLooped(points, index, closed){
    if (!points.length) return null;
    if (!closed && (index < 0 || index >= points.length)) return null;
    return points[((index % points.length) + points.length) % points.length];
  }

  function catmullRomToCubics(points, opts){
    const pts = cleanPoints(points);
    const closed = !!(opts && opts.closed);
    const tension = clamp(0, opts && opts.tension == null ? 1 : opts.tension, 2);
    if (pts.length < 2) return [];
    const out = [];
    const count = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i++) {
      const p0 = getLooped(pts, i - 1, closed) || pts[i];
      const p1 = getLooped(pts, i, closed) || pts[i];
      const p2 = getLooped(pts, i + 1, closed) || pts[Math.min(i + 1, pts.length - 1)];
      const p3 = getLooped(pts, i + 2, closed) || p2;
      out.push(Object.freeze({
        start: p1,
        control1: add(p1, mul(sub(p2, p0), tension / 6)),
        control2: sub(p2, mul(sub(p3, p1), tension / 6)),
        end: p2,
      }));
    }
    return out;
  }

  function anchorsFromCubics(cubics, fallback){
    if (!cubics || !cubics.length) return (fallback || []).map(p => Object.freeze({ point:p, handleIn:null, handleOut:null, kind:'corner' }));
    const anchors = [Object.freeze({ point:cubics[0].start, handleIn:null, handleOut:cubics[0].control1, kind:'smooth' })];
    cubics.forEach((c, i) => anchors.push(Object.freeze({ point:c.end, handleIn:c.control2, handleOut:cubics[i + 1] ? cubics[i + 1].control1 : null, kind:'smooth' })));
    return anchors;
  }

  function sampleCubic(c, t){
    const u = clamp(0, t, 1);
    const inv = 1 - u;
    return add(add(mul(c.start, inv*inv*inv), mul(c.control1, 3*inv*inv*u)), add(mul(c.control2, 3*inv*u*u), mul(c.end, u*u*u)));
  }

  function sampleCubics(cubics, step){
    const safeStep = clamp(0.01, step == null ? 0.08 : step, 1);
    const perSegment = Math.max(1, Math.min(512, Math.ceil(1 / safeStep)));
    const out = [];
    (cubics || []).forEach((c, index) => {
      if (index === 0) out.push(c.start);
      for (let i = 1; i <= perSegment; i++) out.push(sampleCubic(c, i / perSegment));
    });
    return cleanPoints(out);
  }

  function outlinePolyline(points, width){
    const pts = cleanPoints(points);
    const half = Math.max(0, Number(width) || 0) / 2;
    if (!pts.length) return Object.freeze({ left:[], right:[], polygon:[] });
    if (pts.length === 1 || half <= EPSILON) return Object.freeze({ left:pts, right:pts, polygon:pts.concat(pts.slice().reverse()) });
    const left = [], right = [];
    pts.forEach((p, i) => {
      const prev = pts[i - 1] || p;
      const next = pts[i + 1] || p;
      const normal = leftNormal(normalized(sub(next, prev)));
      left.push(add(p, mul(normal, half)));
      right.push(sub(p, mul(normal, half)));
    });
    return Object.freeze({ left, right, polygon:left.concat(right.slice().reverse()) });
  }

  function snapPoint(point, previous, config){
    const cfg = { mode:'none', gridSize:16, angleStepDegrees:15, origin:vec(0,0), ...(config || {}) };
    let out = vec(point.x, point.y);
    if (cfg.mode === 'grid' || cfg.mode === 'gridAndAngle') {
      const grid = Math.max(EPSILON, Number(cfg.gridSize) || 16);
      out = vec(cfg.origin.x + Math.round((out.x - cfg.origin.x) / grid) * grid, cfg.origin.y + Math.round((out.y - cfg.origin.y) / grid) * grid);
    }
    if ((cfg.mode === 'angle' || cfg.mode === 'gridAndAngle') && previous) {
      const delta = sub(out, previous);
      const len = length(delta);
      if (len > EPSILON) {
        const step = clamp(1, cfg.angleStepDegrees || 15, 90) * Math.PI / 180;
        const snapped = Math.round(Math.atan2(delta.y, delta.x) / step) * step;
        out = add(previous, mul(vec(Math.cos(snapped), Math.sin(snapped)), len));
      }
    }
    return out;
  }

  function symmetryCopies(points, mode, center){
    const pts = cleanPoints(points);
    const c = center || vec(0,0);
    if (mode === 'horizontal') return [pts, pts.map(p => mirrorY(p, c.y))];
    if (mode === 'vertical') return [pts, pts.map(p => mirrorX(p, c.x))];
    if (mode === 'quad') return [pts, pts.map(p => mirrorX(p, c.x)), pts.map(p => mirrorY(p, c.y)), pts.map(p => mirrorY(mirrorX(p, c.x), c.y))];
    return [pts];
  }

  function fmt(value){
    return String(Math.round(value * 1000) / 1000).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function svgPathData(cubics, closed){
    if (!cubics || !cubics.length) return '';
    let d = `M ${fmt(cubics[0].start.x)} ${fmt(cubics[0].start.y)}`;
    cubics.forEach(c => { d += ` C ${fmt(c.control1.x)} ${fmt(c.control1.y)}, ${fmt(c.control2.x)} ${fmt(c.control2.y)}, ${fmt(c.end.x)} ${fmt(c.end.y)}`; });
    if (closed) d += ' Z';
    return d;
  }

  function planVectorStroke(rawPoints, options){
    const opts = { simplificationTolerance:1.25, closed:false, strokeWidth:4, sampleStep:0.08, ...(options || {}) };
    const raw = cleanPoints(rawPoints);
    const simplified = simplify(raw, opts.simplificationTolerance);
    const cubics = catmullRomToCubics(simplified, { closed:opts.closed, tension:opts.tension == null ? 1 : opts.tension });
    const anchors = anchorsFromCubics(cubics, simplified);
    const samples = sampleCubics(cubics, opts.sampleStep);
    const renderSamples = samples.length ? samples : simplified;
    const outline = outlinePolyline(renderSamples, opts.strokeWidth);
    const b = bounds(renderSamples.concat(outline.polygon));
    return Object.freeze({ rawPoints:raw, simplifiedPoints:simplified, anchors, cubics, samples:renderSamples, outline, bounds:b, svgPathData:svgPathData(cubics, opts.closed) });
  }

  const api = Object.freeze({
    VERSION,
    vec,
    add,
    sub,
    mul,
    length,
    distance,
    normalized,
    bounds,
    simplify,
    catmullRomToCubics,
    anchorsFromCubics,
    sampleCubic,
    sampleCubics,
    outlinePolyline,
    snapPoint,
    symmetryCopies,
    svgPathData,
    planVectorStroke,
  });

  if (root && typeof root === 'object') root.InkFrameVectorEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
