// Colour washes: thin pigment, wet edges, soft blobs. Canvas here has no
// reliable blur filter, so softness is built from stacked gradients instead.
import { clamp, lerp, noise1, fbm2, boil, TAU } from './math.mjs';
import { C, rgba, mix } from './palette.mjs';
import { tracePath, resample, thin } from './ink.mjs';

// filled wash inside a closed polyline, with uneven pigment and a wet edge
export function wash(g, pts, o = {}) {
  const color = o.color || C.grass;
  const alpha = o.alpha ?? 0.35;
  const sm = resample(pts, o.step ?? 14, true);
  const t = o.t ?? 0;
  if (o.texture === false) {
    tracePath(g, sm, true);
    g.fillStyle = rgba(color, alpha);
    g.globalAlpha *= o.layerAlpha ?? 1;
    g.fill();
    return;
  }
  g.save();
  tracePath(g, sm, true);
  g.clip();
  // base
  g.fillStyle = rgba(color, alpha);
  g.globalAlpha *= o.layerAlpha ?? 1;
  g.fill();
  // pigment unevenness: a few very soft blobs of the same hue
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const w = maxX - minX, h = maxY - minY;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const blobs = o.blobs ?? 4;
  for (let i = 0; i < blobs; i++) {
    const r = (noise1(i * 7.3 + (o.seed ?? 2), o.seed ?? 2) * 0.5 + 0.35) * Math.max(w, h) * 0.62;
    const bx = minX + noise1(i * 11.1 + 4.2, (o.seed ?? 2) + 1) * w;
    const by = minY + noise1(i * 5.9 + 9.1, (o.seed ?? 2) + 2) * h;
    const grd = g.createRadialGradient(bx, by, 0, bx, by, r);
    const darker = noise1(i * 3.1, o.seed ?? 2) > 0.5;
    const hue = darker ? mix(color, C.ink, 0.16) : mix(color, C.paper, 0.22);
    grd.addColorStop(0, rgba(hue, 0.20 * (alpha / 0.35)));
    grd.addColorStop(1, rgba(hue, 0));
    g.fillStyle = grd;
    g.fillRect(bx - r, by - r, r * 2, r * 2);
  }
  g.restore();
  // wet edge: pigment collects at the boundary
  if (o.edge !== false) {
    tracePath(g, sm, true);
    g.strokeStyle = rgba(mix(color, C.ink, 0.3), (o.edgeAlpha ?? 0.30) * (alpha / 0.35));
    g.lineWidth = o.edgeW ?? 2.2;
    g.save();
    g.globalAlpha *= o.layerAlpha ?? 1;
    g.stroke();
    g.restore();
  }
}

// soft organic blob (foliage, hills, shadows on paper). No hard outline.
export function blob(g, cx, cy, rx, ry, o = {}) {
  const color = o.color || C.grass;
  const alpha = o.alpha ?? 0.3;
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  const inner = o.inner ? mix(color, o.inner, 0.5) : color;
  grd.addColorStop(0, rgba(inner, alpha));
  grd.addColorStop(0.62, rgba(mix(color, C.paper, 0.1), alpha * 0.78));
  grd.addColorStop(1, rgba(color, 0));
  g.save();
  if (o.clip) {
    tracePath(g, resample(o.clip, 12, true), true);
    g.clip();
  }
  g.globalAlpha *= o.layerAlpha ?? 1;
  g.save();
  g.translate(cx, cy);
  g.scale(1, ry / Math.max(1e-6, rx));
  g.translate(-cx, -cy);
  g.fillStyle = grd;
  g.fillRect(cx - rx, cy - rx, rx * 2, rx * 2);
  g.restore();
  g.restore();
}

// irregular soft-edged patch: layered gradients inside a noisy ellipse
export function softPatch(g, cx, cy, rx, ry, o = {}) {
  const color = o.color || C.grass;
  const alpha = o.alpha ?? 0.3;
  const rings = o.rings ?? 3;
  for (let i = rings - 1; i >= 0; i--) {
    const f = 1 - i / (rings + 0.6);
    const px = cx + (noise1(i * 3.1 + (o.seed ?? 1), o.seed ?? 1) - 0.5) * rx * 0.34;
    const py = cy + (noise1(i * 5.7 + (o.seed ?? 1), (o.seed ?? 1) + 1) - 0.5) * ry * 0.34;
    const grd = g.createRadialGradient(px, py, 0, px, py, Math.max(rx, ry) * f);
    const hue = i === 0 ? mix(color, C.paper, 0.18) : color;
    grd.addColorStop(0, rgba(hue, alpha / rings * 1.9));
    grd.addColorStop(0.55, rgba(hue, alpha / rings * 0.9));
    grd.addColorStop(1, rgba(hue, 0));
    g.save();
    g.translate(px, py);
    g.scale(1, ry / Math.max(1e-6, rx));
    g.translate(-px, -py);
    g.fillStyle = grd;
    g.fillRect(px - rx * f, py - rx * f, rx * f * 2, rx * f * 2);
    g.restore();
  }
}

// contact shadow on the ground: wide, soft, slightly warm
export function contactShadow(g, x, y, rx, alpha = 0.22, squash = 0.24) {
  const grd = g.createRadialGradient(x, y, 0, x, y, rx);
  grd.addColorStop(0, rgba(C.shadow, alpha));
  grd.addColorStop(0.5, rgba(C.shadow, alpha * 0.45));
  grd.addColorStop(1, rgba(C.shadow, 0));
  g.save();
  g.translate(x, y);
  g.scale(1, squash);
  g.translate(-x, -y);
  g.fillStyle = grd;
  g.fillRect(x - rx, y - rx, rx * 2, rx * 2);
  g.restore();
}

// vertical or angled gradient sweep across a rect, used for sky / haze
export function gradRect(g, x, y, w, h, stops, o = {}) {
  const gx0 = o.x0 ?? x, gy0 = o.y0 ?? y, gx1 = o.x1 ?? x, gy1 = o.y1 ?? y + h;
  const grd = g.createLinearGradient(gx0, gy0, gx1, gy1);
  for (const [pos, col] of stops) grd.addColorStop(pos, col);
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
}

// paper-tone veil used to push a distant layer back in depth
export function haze(g, x, y, w, h, amount = 0.35, color = C.paper) {
  g.fillStyle = rgba(color, amount);
  g.fillRect(x, y, w, h);
}

// dry brush texture inside a shape: short broken strokes of a slightly
// different value, reads as dry pigment on rough paper
export function dryBrush(g, pts, o = {}) {
  const sm = resample(pts, 20, true);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of sm) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  g.save();
  tracePath(g, sm, true);
  g.clip();
  const n = o.count ?? 26;
  const seed = o.seed ?? 4;
  for (let i = 0; i < n; i++) {
    const x = lerp(minX, maxX, noise1(i * 2.7 + seed, seed));
    const y = lerp(minY, maxY, noise1(i * 4.3 + seed * 2, seed + 1));
    const len = (maxX - minX) * (0.08 + 0.15 * noise1(i * 1.3, seed + 2));
    const ang = (o.angle ?? -0.1) + (noise1(i * 5.1, seed + 3) - 0.5) * 0.3;
    thin(g, [[x - Math.cos(ang) * len, y - Math.sin(ang) * len], [x + Math.cos(ang) * len, y + Math.sin(ang) * len]], {
      w: (o.w ?? 3) * (0.5 + noise1(i * 8.1, seed + 4)), color: o.color || C.paper, alpha: (o.alpha ?? 0.25) * (0.5 + noise1(i * 6.7, seed + 5)), seed: i + seed,
    });
  }
  g.restore();
}
