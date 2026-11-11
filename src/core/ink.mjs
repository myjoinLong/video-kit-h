// Ink and line work. Every stroke is a pure function of its geometry plus the
// boil bucket, so the same frame always draws identically and joints never drift.
import { clamp, lerp, noise1, boil, smooth, TAU } from './math.mjs';
import { C, rgba } from './palette.mjs';

// ---------------------------------------------------------------- sampling
// Catmull-Rom resample to even arc spacing. Keeps the drawn curve smooth even
// when the caller only supplies a few control points. Sharp corners duplicate
// their control point so the spline cannot overshoot a straight edge.
export function resample(pts, step = 6, closed = false) {
  if (pts.length < 2) return pts.slice();
  const cornerK = (a, b, c) => {
    const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d > 0.9;
  };
  let src;
  if (closed) {
    src = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      src.push(p);
      if (n > 3 && cornerK(pts[(i - 1 + n) % n], p, pts[(i + 1) % n])) src.push(p);
    }
    src.push(src[0]);
  } else {
    src = pts.slice();
  }
  const out = [];
  for (let i = 0; i < src.length - 1; i++) {
    const p0 = src[i - 1] || src[i];
    const p1 = src[i];
    const p2 = src[i + 1];
    const p3 = src[i + 2] || p2;
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(segLen / step));
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const u2 = u * u, u3 = u2 * u;
      const cx = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3);
      const cy = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
      out.push([cx, cy]);
    }
  }
  if (closed) out.push(out[0].slice());
  else out.push(src[src.length - 1].slice());
  return out;
}

// smooth path: quadratics through segment midpoints
export function tracePath(g, pts, closed = false) {
  const n = pts.length;
  if (n === 0) return;
  g.beginPath();
  if (n === 1) {
    g.moveTo(pts[0][0], pts[0][1]);
    return;
  }
  if (n === 2) {
    g.moveTo(pts[0][0], pts[0][1]);
    g.lineTo(pts[1][0], pts[1][1]);
    return;
  }
  if (closed) {
    const start = [(pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2];
    g.moveTo(start[0], start[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    g.closePath();
    return;
  }
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  g.quadraticCurveTo(pts[n - 2][0], pts[n - 2][1], pts[n - 1][0], pts[n - 1][1]);
}

// ------------------------------------------------------------ cheap strokes
// Fine detail (grass, reeds, rope fibres). Jitter is applied at control points
// only, so this stays fast enough to run hundreds of times per frame.
export function thin(g, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  const t = o.t ?? 0;
  const seed = o.seed ?? 7;
  const amp = o.wobble ?? 0.0;
  const b = o.boilOn === false ? 0 : boil(t) * 1.7;
  const drawn = amp > 0
    ? pts.map((p, i) => {
      const n = noise1(i * 0.83 + seed * 3.1 + b, seed | 0) - 0.5;
      return [p[0] + n * amp, p[1] + n * amp * 0.6];
    })
    : pts;
  tracePath(g, drawn, !!o.closed);
  g.strokeStyle = o.color || C.ink;
  g.lineWidth = o.w ?? 1.6;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (o.dash) g.setLineDash(o.dash);
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.stroke();
  g.restore();
  if (o.dash) g.setLineDash([]);
}

// -------------------------------------------------------------- brush ribbon
// Tapered, pressure-modulated ink ribbon with 12 fps line boil. `pin` keeps
// both endpoints perfectly still so contacts, joints and anchors never wobble.
export function brush(g, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  const t = o.t ?? 0;
  const seed = o.seed ?? 11;
  const step = o.step ?? Math.max(3, (o.w ?? 6) * 0.55);
  const sm = resample(pts, step, !!o.closed);
  const n = sm.length;
  if (n < 2) return;

  // arc length lookup
  const arc = new Float64Array(n);
  for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
  const total = arc[n - 1] || 1;

  const b = o.boilOn === false ? 0 : boil(t);
  const wob = (o.wobble ?? 1.0) * (o.closed ? 0.7 : 1);
  const sB = (seed | 0) * 13.7;
  const wBase = o.w ?? 6;
  const taperIn = o.taperIn ?? (o.closed ? 0 : 0.22);
  const taperOut = o.taperOut ?? (o.closed ? 0 : 0.3);
  const pressed = o.pressure ?? 0.34;

  const leftSide = new Array(n);
  const rightSide = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = sm[i];
    const pPrev = sm[i > 0 ? i - 1 : 0];
    const pNext = sm[i < n - 1 ? i + 1 : n - 1];
    let tx = pNext[0] - pPrev[0], ty = pNext[1] - pPrev[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const s = arc[i] / total;
    // pressure noise: two octaves give an uneven reed-pen feel
    const pr = 1 + pressed * ((noise1(arc[i] * 0.045 + sB, seed | 0) - 0.5) * 2 + (noise1(arc[i] * 0.19 + sB * 2, (seed + 5) | 0) - 0.5));
    let taper = 1;
    if (!o.closed) {
      if (s < taperIn) taper *= smooth(s / (taperIn || 1e-6));
      if (s > 1 - taperOut) taper *= smooth((1 - s) / (taperOut || 1e-6));
    }
    // pin the ends: ramp the wobble off near s=0 and s=1
    let pinW = 1;
    if (o.pin !== false && !o.closed) {
      const pinK = o.pinK ?? 0.06;
      pinW = smooth(clamp(s / pinK)) * smooth(clamp((1 - s) / pinK));
    }
    const off = wob > 0 ? (noise1(arc[i] * 0.035 + 91.3 + b * 4.7, (seed + 3) | 0) - 0.5) * 2 * wob * pinW : 0;
    const hw = Math.max(0.12, (wBase * pr * taper) / 2);
    const cx = p[0] + nx * off, cy = p[1] + ny * off;
    leftSide[i] = [cx + nx * hw, cy + ny * hw];
    rightSide[i] = [cx - nx * hw, cy - ny * hw];
  }

  g.beginPath();
  g.moveTo(leftSide[0][0], leftSide[0][1]);
  for (let i = 1; i < n - 1; i++) {
    const p = leftSide[i], q = leftSide[i + 1];
    g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  g.lineTo(leftSide[n - 1][0], leftSide[n - 1][1]);
  for (let i = n - 1; i > 0; i--) {
    const p = rightSide[i], q = rightSide[i - 1];
    g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  g.lineTo(rightSide[0][0], rightSide[0][1]);
  g.closePath();
  g.fillStyle = o.color || C.ink;
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.fill();
  g.restore();
}

// A contour that hugs a filled shape: same ribbon but no taper and a little
// wider, drawn slightly outside the wash so the ink reads as an outline.
export function contour(g, pts, o = {}) {
  brush(g, pts, { taperIn: 0, taperOut: 0, closed: true, wobble: (o.wobble ?? 1) * 0.85, ...o });
}

// Ink under-painting: broad flat shape with no line, used as the darkest shadow
// value before washes go on top.
export function inkFill(g, pts, color, alpha = 1, wobble = 0.6, t = 0, seed = 3) {
  const sm = resample(pts, 10, true);
  const b = boil(t) * 1.9;
  const drawn = sm.map((p, i) => {
    const n1 = noise1(i * 0.5 + seed * 7.7 + b, seed | 0) - 0.5;
    const n2 = noise1(i * 0.5 + seed * 3.3 + b * 1.3, (seed + 9) | 0) - 0.5;
    return [p[0] + n1 * wobble * 2, p[1] + n2 * wobble * 2];
  });
  tracePath(g, drawn, true);
  g.fillStyle = color;
  g.save();
  g.globalAlpha *= alpha;
  g.fill();
  g.restore();
}

// hatch: parallel hand strokes clipped to a shape, for cloth shading
export function hatch(g, pts, o = {}) {
  g.save();
  tracePath(g, resample(pts, 12, true), true);
  g.clip();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const ang = o.angle ?? -1.15;
  const gap = o.gap ?? 7;
  const len = Math.hypot(maxX - minX, maxY - minY) * 1.3;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  const count = Math.ceil(len / gap);
  g.strokeStyle = o.color || C.ink;
  g.lineWidth = o.w ?? 1.5;
  g.globalAlpha *= o.alpha ?? 0.28;
  g.lineCap = 'round';
  for (let i = -count; i <= count; i++) {
    const off = i * gap + (noise1(i * 3.7 + (o.seed ?? 1), o.seed ?? 1) - 0.5) * gap * 0.5;
    const bx = cx + nx * off, by = cy + ny * off;
    const l = len * (0.18 + 0.34 * noise1(i * 1.7 + (o.seed ?? 1) * 5, (o.seed ?? 1) + 3));
    const sgn = i % 2 === 0 ? 1 : -1;
    g.beginPath();
    g.moveTo(bx - dx * l * sgn, by - dy * l * sgn);
    g.lineTo(bx + dx * l * sgn, by + dy * l * sgn);
    g.stroke();
  }
  g.restore();
}

// Straight-edged polygon (wood, stone, paper): real corners, no rounding.
// tracePath() smooths through segment midpoints, which turns long thin quads
// into leaf shapes - boards and posts must use this instead.
export function poly(g, pts, o = {}) {
  if (!pts || pts.length < 3) return;
  const t = o.t ?? 0;
  const amp = o.wobble ?? 0;
  const seed = o.seed ?? 3;
  const b = boil(t) * 1.9;
  const use = amp > 0
    ? pts.map((p, i) => [
      p[0] + (noise1(i * 1.7 + seed * 3.1 + b, seed | 0) - 0.5) * amp * 2,
      p[1] + (noise1(i * 2.3 + seed * 5.7 + b, (seed | 0) + 2) - 0.5) * amp * 2,
    ])
    : pts;
  g.beginPath();
  g.moveTo(use[0][0], use[0][1]);
  for (let i = 1; i < use.length; i++) g.lineTo(use[i][0], use[i][1]);
  g.closePath();
  if (o.fillColor) {
    g.save();
    if (o.alpha != null) g.globalAlpha *= o.alpha;
    g.fillStyle = o.fillColor;
    g.fill();
    g.restore();
  }
  if (o.ink) {
    g.save();
    if (o.inkAlpha != null) g.globalAlpha *= o.inkAlpha;
    g.strokeStyle = o.ink;
    g.lineWidth = o.w ?? 2.2;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
    g.restore();
  }
}
// ------------------------------------------------------- ribbon geometry
// Outline polygon for a variable-width path. Returned as points so the caller
// can fill it, clip it, or take a subsection of its edge to ink.
// widths: per-control-point half width (same length as pts)
export function ribbonPoly(pts, widths, step = 5, closed = false) {
  const sm = resample(pts, step, closed);
  const n = sm.length;
  // width index mapping by normalised arc position
  const arc = new Float64Array(n);
  for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
  const total = arc[n - 1] || 1;
  const wAt = (s) => {
    const f = s * (widths.length - 1);
    const i = Math.floor(f);
    const k = f - i;
    const a = widths[Math.min(widths.length - 1, Math.max(0, i))];
    const b = widths[Math.min(widths.length - 1, Math.max(0, i + 1))];
    return lerp(a, b, k);
  };
  const left = new Array(n), right = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = sm[i];
    const pPrev = sm[i > 0 ? i - 1 : 0];
    const pNext = sm[i < n - 1 ? i + 1 : n - 1];
    let tx = pNext[0] - pPrev[0], ty = pNext[1] - pPrev[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const hw = wAt(arc[i] / total);
    left[i] = [p[0] - ty * hw, p[1] + tx * hw];
    right[i] = [p[0] + ty * hw, p[1] - tx * hw];
  }
  return left.concat(right.reverse());
}

// fill a closed polygon with an optional wash look
export function fillPoly(g, poly, color, alpha = 1) {
  if (!poly || poly.length < 3) return;
  tracePath(g, poly, true);
  g.fillStyle = color;
  if (alpha === 1) { g.fill(); return; }
  g.save();
  g.globalAlpha *= alpha;
  g.fill();
  g.restore();
}

// ink one run of a polygon edge, from parameter a to b (0..1 along the outline)
export function edgeInk(g, poly, a, b, o = {}) {
  const n = poly.length;
  const i0 = Math.round(clamp(a) * (n - 1));
  const i1 = Math.round(clamp(b) * (n - 1));
  const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
  const seg = poly.slice(lo, hi + 1);
  if (seg.length < 2) return;
  brush(g, seg, o);
}

// big sweeping dry-brush stroke used for sky and ground washes
export function sweep(g, pts, o = {}) {
  const sm = resample(pts, o.step ?? 16, !!o.closed);
  brush(g, sm, { ...o, pressure: o.pressure ?? 0.5, wobble: o.wobble ?? 1.4, taperIn: o.taperIn ?? 0.08, taperOut: o.taperOut ?? 0.16 });
}
